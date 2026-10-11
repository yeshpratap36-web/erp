import "server-only";
import { env } from "@/lib/env";
import { OpenCvFaceService } from "@/lib/face/opencv-service";
import type { FaceRecognitionProvider } from "@/lib/face/provider";

let provider: FaceRecognitionProvider | undefined;

/** The configured face recognition provider (single place to swap implementations). */
export function getFaceProvider(): FaceRecognitionProvider {
  return (provider ??= new OpenCvFaceService(env.FACE_SERVICE_URL, env.FACE_SERVICE_TOKEN));
}
