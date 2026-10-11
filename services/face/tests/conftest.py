import os

# The app refuses to start without a token; tests use a fixed one.
os.environ.setdefault("FACE_SERVICE_TOKEN", "test-token-" + "x" * 32)
