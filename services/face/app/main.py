"""
Internal face-recognition service. Stateless: it never stores images or embeddings.
Only the Next.js backend calls it (shared bearer token); it must not be exposed publicly.
"""

from __future__ import annotations

import hmac
import os
from dataclasses import asdict
from typing import Annotated

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .engine import MODEL_NAME, FaceEngine, FaceError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
TOKEN = os.environ.get("FACE_SERVICE_TOKEN", "")
if len(TOKEN) < 32:
    raise RuntimeError("FACE_SERVICE_TOKEN must be set (at least 32 characters)")

app = FastAPI(title="College ERP face service", docs_url=None, redoc_url=None, openapi_url=None)
engine = FaceEngine()


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    expected = f"Bearer {TOKEN}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


async def read_image(file: UploadFile) -> bytes:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="image_too_large")
    if not data:
        raise HTTPException(status_code=400, detail="empty_image")
    return data


@app.exception_handler(FaceError)
async def face_error_handler(_request, exc: FaceError):
    return JSONResponse(status_code=422, content={"error": exc.code, "message": exc.message})


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME, "dimensions": 128}


@app.post("/v1/embed-single", dependencies=[Depends(require_token)])
async def embed_single(image: UploadFile = File(...)):
    face = engine.embed_single(await read_image(image))
    return {"model": MODEL_NAME, "face": asdict(face)}


@app.post("/v1/embed-all", dependencies=[Depends(require_token)])
async def embed_all(image: UploadFile = File(...)):
    faces = engine.embed_all(await read_image(image))
    return {"model": MODEL_NAME, "faces": [asdict(f) for f in faces]}
