import "server-only";
import { z } from "zod";
import {
  FaceQualityError,
  type FaceDetection,
  type FaceRecognitionProvider,
} from "@/lib/face/provider";

const DIMENSIONS = 128;

const detectionSchema = z.object({
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  score: z.number(),
  embedding: z.array(z.number().finite()).length(DIMENSIONS),
  quality: z.object({ sharpness: z.number(), brightness: z.number() }),
});
const singleSchema = z.object({ model: z.string(), face: detectionSchema });
const allSchema = z.object({ model: z.string(), faces: z.array(detectionSchema) });
const errorSchema = z.object({ error: z.string(), message: z.string() });

/** Client for services/face (YuNet + SFace). */
export class OpenCvFaceService implements FaceRecognitionProvider {
  readonly modelName = "opencv-sface-2021dec+yunet-2023mar";
  readonly dimensions = DIMENSIONS;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async call<T>(path: string, image: Blob, schema: z.ZodType<T>): Promise<T> {
    const form = new FormData();
    form.append("image", image, "photo");
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new Error("Face service is unreachable", { cause: err });
    }
    const body: unknown = await res.json().catch(() => null);
    if (res.status === 422) {
      const parsed = errorSchema.safeParse(body);
      if (parsed.success) throw new FaceQualityError(parsed.data.error, parsed.data.message);
    }
    if (!res.ok) throw new Error(`Face service error ${res.status}`);
    return schema.parse(body);
  }

  async embedSingle(image: Blob): Promise<FaceDetection> {
    return (await this.call("/v1/embed-single", image, singleSchema)).face;
  }

  async embedAll(image: Blob): Promise<FaceDetection[]> {
    return (await this.call("/v1/embed-all", image, allSchema)).faces;
  }
}
