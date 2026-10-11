import { afterEach, describe, expect, it, vi } from "vitest";
import { consentSections, consentVersion } from "@/lib/biometrics/consent";
import { OpenCvFaceService } from "@/lib/face/opencv-service";
import { FaceQualityError } from "@/lib/face/provider";

const service = new OpenCvFaceService("http://face.test", "t".repeat(40));
const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
const unit = Array.from({ length: 128 }, (_, i) => (i === 0 ? 1 : 0));
const face = {
  box: [1, 2, 3, 4],
  score: 0.9,
  embedding: unit,
  quality: { sharpness: 100, brightness: 120 },
};

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("OpenCvFaceService", () => {
  it("sends the bearer token and returns the parsed face", async () => {
    const fetch = mockFetch(200, { model: "m", face });
    await expect(service.embedSingle(image)).resolves.toEqual(face);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://face.test/v1/embed-single");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${"t".repeat(40)}`);
  });

  it("maps 422 responses to a user-facing FaceQualityError", async () => {
    mockFetch(422, { error: "too_blurry", message: "The photo is blurry." });
    const err = await service.embedSingle(image).catch((e) => e);
    expect(err).toBeInstanceOf(FaceQualityError);
    expect(err).toMatchObject({ code: "too_blurry", message: "The photo is blurry." });
  });

  it("rejects embeddings of the wrong size", async () => {
    mockFetch(200, { model: "m", face: { ...face, embedding: unit.slice(0, 64) } });
    await expect(service.embedSingle(image)).rejects.not.toBeInstanceOf(FaceQualityError);
  });

  it("treats other failures as service errors, not user errors", async () => {
    mockFetch(500, { detail: "boom" });
    await expect(service.embedAll(image)).rejects.toThrow("Face service error 500");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("ECONNREFUSED"))),
    );
    await expect(service.embedAll(image)).rejects.toThrow("unreachable");
  });
});

describe("consent text", () => {
  it("states the retention policy that is actually configured, and versions it", () => {
    const retention = (deletes: boolean) =>
      consentSections(deletes).find((s) => s.title === "How long we keep it")!.body;
    expect(retention(true)).toMatch(/deleted as soon as/);
    expect(retention(false)).toMatch(/stored privately/);
    expect(consentVersion(true)).not.toBe(consentVersion(false));
  });
});
