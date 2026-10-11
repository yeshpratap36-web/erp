"""
Face detection + embedding with OpenCV Zoo models:
  - YuNet (MIT) detects faces and 5 landmarks.
  - SFace (Apache-2.0) embeds a landmark-aligned 112x112 crop into a 128-d vector.
Embeddings are L2-normalized, so cosine similarity == dot product.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import cv2
import numpy as np

MODEL_DIR = os.environ.get("FACE_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "models"))
DETECTOR_PATH = os.path.join(MODEL_DIR, "face_detection_yunet_2023mar.onnx")
RECOGNIZER_PATH = os.path.join(MODEL_DIR, "face_recognition_sface_2021dec.onnx")
MODEL_NAME = "opencv-sface-2021dec+yunet-2023mar"

# Detection confidence below this is ignored entirely.
DETECT_SCORE = 0.8
# Enrollment quality gates (single-face photos).
MIN_FACE_PX = 80           # face box side in the original image (SFace aligns to 112×112)
MIN_SHARPNESS = 60.0       # variance of Laplacian on the aligned crop
MIN_BRIGHTNESS = 50.0      # mean grey level of the aligned crop (0-255)
MAX_BRIGHTNESS = 215.0
# Images are downscaled so the longest side is at most this many pixels before detection.
MAX_SINGLE_SIDE = 1280
MAX_GROUP_SIDE = 2560


class FaceError(Exception):
    """A user-correctable problem with the photo (shown to the user)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class DetectedFace:
    box: list[float]          # x, y, w, h in original-image pixels
    score: float
    embedding: list[float]
    quality: dict[str, float]


class FaceEngine:
    def __init__(self) -> None:
        for path in (DETECTOR_PATH, RECOGNIZER_PATH):
            if not os.path.isfile(path):
                raise RuntimeError(f"Model file missing: {path}")
        self.detector = cv2.FaceDetectorYN.create(DETECTOR_PATH, "", (320, 320), DETECT_SCORE, 0.3, 5000)
        self.recognizer = cv2.FaceRecognizerSF.create(RECOGNIZER_PATH, "")

    # ── helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def decode(data: bytes) -> np.ndarray:
        image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise FaceError("invalid_image", "The file is not a readable image.")
        return image

    @staticmethod
    def _downscale(image: np.ndarray, max_side: int) -> tuple[np.ndarray, float]:
        h, w = image.shape[:2]
        scale = min(1.0, max_side / max(h, w))
        if scale < 1.0:
            image = cv2.resize(image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
        return image, scale

    def _detect(self, image: np.ndarray) -> np.ndarray:
        h, w = image.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(image)
        return faces if faces is not None else np.empty((0, 15), dtype=np.float32)

    def _embed(self, image: np.ndarray, face_row: np.ndarray) -> tuple[list[float], np.ndarray]:
        aligned = self.recognizer.alignCrop(image, face_row)
        feature = self.recognizer.feature(aligned).flatten().astype(np.float64)
        norm = np.linalg.norm(feature)
        if norm == 0:
            raise FaceError("embedding_failed", "Could not process this face. Try another photo.")
        return (feature / norm).tolist(), aligned

    @staticmethod
    def _quality(aligned: np.ndarray) -> dict[str, float]:
        grey = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
        return {
            "sharpness": float(cv2.Laplacian(grey, cv2.CV_64F).var()),
            "brightness": float(grey.mean()),
        }

    # ── public API ───────────────────────────────────────────────────────────

    def embed_single(self, data: bytes) -> DetectedFace:
        """Enrollment: exactly one clear, well-lit, large-enough face."""
        image, scale = self._downscale(self.decode(data), MAX_SINGLE_SIDE)
        faces = self._detect(image)
        if len(faces) == 0:
            raise FaceError("no_face", "No face found. Face the camera in good light.")
        if len(faces) > 1:
            raise FaceError("multiple_faces", "More than one face found. Make sure only you are in the photo.")

        row = faces[0]
        box = row[:4] / scale
        if min(box[2], box[3]) < MIN_FACE_PX:
            raise FaceError("face_too_small", "Your face is too small in the photo. Move closer to the camera.")

        embedding, aligned = self._embed(image, row)
        quality = self._quality(aligned)
        if quality["sharpness"] < MIN_SHARPNESS:
            raise FaceError("too_blurry", "The photo is blurry. Hold still and try again.")
        if quality["brightness"] < MIN_BRIGHTNESS:
            raise FaceError("too_dark", "The photo is too dark. Find better light.")
        if quality["brightness"] > MAX_BRIGHTNESS:
            raise FaceError("too_bright", "The photo is overexposed. Avoid strong light behind or on you.")

        return DetectedFace(box=[float(v) for v in box], score=float(row[14]), embedding=embedding, quality=quality)

    def embed_all(self, data: bytes) -> list[DetectedFace]:
        """Classroom photos: every detected face (no quality gate; the matcher decides)."""
        image, scale = self._downscale(self.decode(data), MAX_GROUP_SIDE)
        out: list[DetectedFace] = []
        for row in self._detect(image):
            embedding, aligned = self._embed(image, row)
            out.append(
                DetectedFace(
                    box=[float(v) for v in row[:4] / scale],
                    score=float(row[14]),
                    embedding=embedding,
                    quality=self._quality(aligned),
                )
            )
        return out
