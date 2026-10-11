"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon, CheckIcon, UploadIcon } from "lucide-react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FaceAngle } from "@/generated/prisma/enums";
import type { ActionState } from "@/lib/actions";
import type { ApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

const STEPS: { angle: FaceAngle; label: string; instruction: string }[] = [
  {
    angle: "FRONT",
    label: "Front",
    instruction: "Look straight at the camera with your face inside the oval.",
  },
  {
    angle: "LEFT",
    label: "Left",
    instruction: "Turn your head slightly to your left (about 20°). Keep both eyes visible.",
  },
  {
    angle: "RIGHT",
    label: "Right",
    instruction: "Turn your head slightly to your right (about 20°). Keep both eyes visible.",
  },
  { angle: "UP", label: "Up", instruction: "Tilt your chin up slightly." },
  { angle: "DOWN", label: "Down", instruction: "Tilt your chin down slightly." },
];

const MAX_SIDE = 1600;

/** Re-encode to JPEG with the longest side ≤ MAX_SIDE (smaller uploads, EXIF stripped). */
async function toJpeg(
  source: CanvasImageSource & { width: number; height: number },
): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.92),
  );
}

export function FaceEnrollment({
  initialCompleted,
  finishAction,
}: {
  initialCompleted: FaceAngle[];
  finishAction: (state: ActionState) => Promise<ActionState>;
}) {
  const [completed, setCompleted] = useState<Set<FaceAngle>>(new Set(initialCompleted));
  const [current, setCurrent] = useState<FaceAngle>(
    STEPS.find((s) => !initialCompleted.includes(s.angle))?.angle ?? "FRONT",
  );
  const [previews, setPreviews] = useState<Partial<Record<FaceAngle, string>>>({});
  const [error, setError] = useState<string | null>(null);
  /** After all five are done, tapping a photo reopens capture for that angle. */
  const [retaking, setRetaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraState, setCameraState] = useState<"off" | "starting" | "on" | "unavailable">("off");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [finishState, finish] = useActionState(finishAction, {});

  const step = STEPS.find((s) => s.angle === current)!;
  const allDone = STEPS.every((s) => completed.has(s.angle));
  const showCapture = !allDone || retaking;

  /** Release the camera hardware (safe in effect cleanup: no state updates). */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  function stopCamera() {
    releaseStream();
    setCameraState((s) => (s === "unavailable" ? s : "off"));
  }

  // Object URLs of local previews, revoked when the component unmounts.
  const objectUrls = useRef<string[]>([]);
  useEffect(
    () => () => {
      releaseStream();
      objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [releaseStream],
  );

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      // Browsers only allow the camera on https:// (or localhost).
      setCameraState("unavailable");
      return;
    }
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("on");
    } catch {
      setCameraState("unavailable");
    }
  }

  async function upload(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("angle", step.angle);
      form.append("image", blob, `${step.angle.toLowerCase()}.jpg`);
      const res = await fetch("/api/onboarding/face", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as ApiResponse<{
        completed: FaceAngle[];
      }> | null;
      if (!body?.ok) {
        setError(body?.message ?? "Something went wrong. Please try again.");
        return;
      }
      const done = new Set(body.data.completed);
      setCompleted(done);
      const url = URL.createObjectURL(blob);
      objectUrls.current.push(url);
      setPreviews((p) => ({ ...p, [step.angle]: url }));
      const next = STEPS.find((s) => !done.has(s.angle));
      if (next) {
        setCurrent(next.angle);
      } else {
        // All five done: close capture and turn the camera off.
        setRetaking(false);
        stopCamera();
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    await upload(await toJpeg(canvas));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      await upload(await toJpeg(bitmap));
      bitmap.close();
    } catch {
      setError("That file couldn't be read as an image.");
    }
  }

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-5 gap-2" aria-label="Photos">
        {STEPS.map((s) => {
          const done = completed.has(s.angle);
          return (
            <li key={s.angle}>
              <button
                type="button"
                onClick={() => {
                  setCurrent(s.angle);
                  setError(null);
                  if (allDone) setRetaking(true);
                }}
                aria-current={s.angle === current ? "step" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-lg border p-1.5 text-xs",
                  s.angle === current && "border-primary ring-2 ring-primary/30",
                )}
              >
                <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-muted">
                  {previews[s.angle] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                    <img src={previews[s.angle]} alt="" className="h-full w-full object-cover" />
                  ) : done ? (
                    <CheckIcon className="size-5" />
                  ) : null}
                  {done && (
                    <span className="absolute right-0.5 bottom-0.5 rounded-full bg-primary p-0.5 text-primary-foreground">
                      <CheckIcon className="size-3" />
                    </span>
                  )}
                </span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {showCapture && (
        <div className="space-y-3">
          <p className="font-medium" aria-live="polite">
            {step.label}: {step.instruction}
          </p>

          <div
            className={cn(
              "relative aspect-[4/3] overflow-hidden rounded-xl bg-muted",
              cameraState !== "on" && cameraState !== "starting" && "hidden",
            )}
          >
            {/* Mirrored like a mirror, which makes "turn left" intuitive; the capture itself isn't mirrored. */}
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full -scale-x-100 object-cover"
            />
            <svg
              viewBox="0 0 400 300"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden
            >
              <defs>
                <mask id="oval">
                  <rect width="400" height="300" fill="white" />
                  <ellipse cx="200" cy="145" rx="78" ry="105" fill="black" />
                </mask>
              </defs>
              <rect width="400" height="300" fill="black" opacity="0.45" mask="url(#oval)" />
              <ellipse
                cx="200"
                cy="145"
                rx="78"
                ry="105"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            </svg>
          </div>

          {error && (
            <Alert variant="destructive" data-testid="face-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {cameraState === "unavailable" && (
            <p className="text-sm text-muted-foreground">
              The camera isn&apos;t available here. Use <strong>Take or upload a photo</strong>{" "}
              instead.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {cameraState === "on" ? (
              <Button type="button" onClick={capture} disabled={busy}>
                <CameraIcon /> {busy ? "Checking…" : "Capture"}
              </Button>
            ) : (
              cameraState !== "unavailable" && (
                <Button type="button" onClick={startCamera} disabled={cameraState === "starting"}>
                  <CameraIcon /> {cameraState === "starting" ? "Starting camera…" : "Use camera"}
                </Button>
              )
            )}
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-input px-2.5 py-1.5 text-sm hover:bg-muted",
                busy && "pointer-events-none opacity-50",
              )}
            >
              <UploadIcon className="size-4" />
              {busy && cameraState !== "on" ? "Checking…" : "Take or upload a photo"}
              {/* capture="user" opens the front camera on phones, which also works over plain http. */}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="user"
                className="sr-only"
                data-testid="face-file"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      )}

      {allDone && !retaking && (
        <form action={finish} className="space-y-3">
          <p className="text-sm">
            All five photos are done. You can tap any photo above to retake it.
          </p>
          {finishState.error && (
            <Alert variant="destructive">
              <AlertDescription>{finishState.error}</AlertDescription>
            </Alert>
          )}
          <SubmitButton className="w-full" pendingLabel="Finishing…">
            Finish enrollment
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
