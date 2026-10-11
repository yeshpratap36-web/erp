/**
 * Face recognition behind one interface so the engine can be swapped (e.g. for AWS
 * Rekognition) without touching app logic. Embeddings from different models are not
 * comparable — switching providers requires re-enrollment.
 */

export type FaceDetection = {
  /** x, y, width, height in original-image pixels. */
  box: [number, number, number, number];
  /** Detector confidence, 0–1. */
  score: number;
  /** L2-normalized embedding (cosine similarity == dot product). */
  embedding: number[];
  quality: { sharpness: number; brightness: number };
};

/** A problem the user can fix by retaking the photo; `message` is safe to show. */
export class FaceQualityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FaceQualityError";
  }
}

export interface FaceRecognitionProvider {
  readonly modelName: string;
  readonly dimensions: number;
  /** Enrollment photo: exactly one good-quality face, else FaceQualityError. */
  embedSingle(image: Blob): Promise<FaceDetection>;
  /** Group photo: every detected face (may be empty). */
  embedAll(image: Blob): Promise<FaceDetection[]>;
}
