FROM python:3.12-slim

# Model files from OpenCV Zoo, verified by checksum (YuNet: MIT, SFace: Apache-2.0).
ARG ZOO=https://github.com/opencv/opencv_zoo/raw/main/models
ADD ${ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx /app/models/
ADD ${ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx /app/models/
RUN cd /app/models && printf '%s\n' \
      "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4  face_detection_yunet_2023mar.onnx" \
      "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79  face_recognition_sface_2021dec.onnx" \
    | sha256sum -c -

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

RUN useradd --system --uid 10001 face && chown -R face /app
USER face
ENV FACE_MODEL_DIR=/app/models
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
