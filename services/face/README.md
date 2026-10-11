# Face service

Internal, stateless HTTP service used by the Next.js backend for face detection and embeddings.

- Detector: [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) (MIT)
- Recognizer: [SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface) (Apache-2.0), 128-d embeddings, L2-normalized

| Endpoint                | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `GET /health`           | Liveness + model name                                         |
| `POST /v1/embed-single` | Enrollment photo: exactly one good-quality face → 1 embedding |
| `POST /v1/embed-all`    | Classroom photo: every face → embeddings + boxes              |

All `/v1/*` calls need `Authorization: Bearer $FACE_SERVICE_TOKEN`. User-correctable problems
return `422 {"error": code, "message": ...}` (`no_face`, `multiple_faces`, `face_too_small`,
`too_blurry`, `too_dark`, `too_bright`, `invalid_image`).

Run with docker-compose from the repo root (`pnpm services:up`). Tests:
`cd services/face && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && FACE_MODEL_DIR=… .venv/bin/pytest`.
