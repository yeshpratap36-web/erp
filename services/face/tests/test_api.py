"""
API tests. Real-face tests need a photo of one person at FACE_TEST_IMAGE (not committed —
biometric data stays out of the repo); they are skipped when it isn't set.
"""

import os

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
AUTH = {"Authorization": f"Bearer {os.environ['FACE_SERVICE_TOKEN']}"}


def png(image: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", image)
    assert ok
    return buf.tobytes()


def post(path: str, data: bytes, headers=AUTH):
    return client.post(path, files={"image": ("photo.png", data, "image/png")}, headers=headers)


def test_health():
    body = client.get("/health").json()
    assert body["ok"] is True and body["dimensions"] == 128


def test_requires_token():
    assert post("/v1/embed-single", b"x", headers={}).status_code == 401
    assert post("/v1/embed-single", b"x", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_rejects_non_images():
    res = post("/v1/embed-single", b"definitely not an image")
    assert res.status_code == 422 and res.json()["error"] == "invalid_image"


def test_reports_no_face():
    blank = np.full((480, 640, 3), 200, dtype=np.uint8)
    res = post("/v1/embed-single", png(blank))
    assert res.status_code == 422 and res.json()["error"] == "no_face"
    assert post("/v1/embed-all", png(blank)).json()["faces"] == []


FACE = os.environ.get("FACE_TEST_IMAGE")


@pytest.mark.skipif(not FACE, reason="FACE_TEST_IMAGE not set")
def test_single_face_embedding_is_normalized_and_stable():
    data = open(FACE, "rb").read()
    a = post("/v1/embed-single", data).json()["face"]
    emb = np.array(a["embedding"])
    assert emb.shape == (128,) and abs(np.linalg.norm(emb) - 1) < 1e-6

    # A slightly rotated + rescaled copy of the same photo must still match strongly.
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    h, w = image.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), 8, 0.9)
    variant = cv2.warpAffine(image, m, (w, h), borderMode=cv2.BORDER_REFLECT)
    b = post("/v1/embed-single", png(variant)).json()["face"]
    assert float(np.dot(emb, np.array(b["embedding"]))) > 0.6


@pytest.mark.skipif(not FACE, reason="FACE_TEST_IMAGE not set")
def test_tiny_face_is_rejected():
    image = cv2.imread(FACE)
    small = cv2.resize(image, None, fx=0.15, fy=0.15)
    canvas = np.full((900, 900, 3), 180, dtype=np.uint8)
    canvas[: small.shape[0], : small.shape[1]] = small
    res = post("/v1/embed-single", png(canvas))
    assert res.status_code == 422 and res.json()["error"] in {"face_too_small", "no_face"}
