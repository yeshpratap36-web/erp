"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ImagePlusIcon } from "lucide-react";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { ActionState } from "@/lib/actions";
import type { ApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ReviewPhoto = {
  id: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  error: string | null;
  faceCount: number | null;
  stored: boolean;
  faces: {
    id: string;
    box: [number, number, number, number];
    status: "MATCHED" | "UNCERTAIN" | "UNMATCHED";
    similarity: number | null;
    rollNumber: string | null;
  }[];
};

const BOX_COLOR = {
  MATCHED: "border-emerald-500",
  UNCERTAIN: "border-amber-500",
  UNMATCHED: "border-red-500",
};

/**
 * Uploads classroom photos and shows detection results. The server never sends photos back:
 * boxes are drawn over the copies still in this browser (lost on reload — results remain).
 */
export function PhotoUploader({
  sessionId,
  photos,
  canUpload,
  retryAction,
}: {
  sessionId: string;
  photos: ReviewPhoto[];
  canUpload: boolean;
  retryAction: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [previews, setPreviews] = useState<
    Record<string, { url: string; width: number; height: number }>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("photos", f));
      const before = new Set(photos.map((p) => p.id));
      const res = await fetch(`/api/faculty/sessions/${sessionId}/photos`, {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => null)) as ApiResponse<{ queued: number }> | null;
      if (!body?.ok) {
        setError(body?.message ?? "Upload failed. Please try again.");
        return;
      }
      // Keep local previews keyed by the new photo ids (matched by upload order after refresh).
      const local = await Promise.all(
        files.map(async (f) => {
          const url = URL.createObjectURL(f);
          urls.current.push(url);
          const bitmap = await createImageBitmap(f);
          const size = { width: bitmap.width, height: bitmap.height };
          bitmap.close();
          return { url, ...size };
        }),
      );
      pendingPreviews.current = { before, local };
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // After refresh, attach local previews to the newly created photo ids.
  const pendingPreviews = useRef<{
    before: Set<string>;
    local: { url: string; width: number; height: number }[];
  } | null>(null);
  useEffect(() => {
    const pending = pendingPreviews.current;
    if (!pending) return;
    const fresh = photos.filter((p) => !pending.before.has(p.id));
    if (fresh.length < pending.local.length) return;
    pendingPreviews.current = null;
    setPreviews((prev) => {
      const next = { ...prev };
      fresh.slice(-pending.local.length).forEach((p, i) => (next[p.id] = pending.local[i]));
      return next;
    });
  }, [photos]);

  return (
    <div className="space-y-3">
      {canUpload && (
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center text-sm hover:bg-muted/50",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <ImagePlusIcon className="size-6 text-muted-foreground" />
          <span className="font-medium">{busy ? "Uploading…" : "Add classroom photos"}</span>
          <span className="text-xs text-muted-foreground">
            1–3 photos at a time · whole class visible, faces toward camera
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            data-testid="classroom-photos"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])].slice(0, 3);
              e.target.value = "";
              void upload(files);
            }}
          />
        </label>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {photos.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {photos.map((photo, i) => {
            const preview = previews[photo.id];
            const counts = {
              matched: photo.faces.filter((f) => f.status === "MATCHED").length,
              uncertain: photo.faces.filter((f) => f.status === "UNCERTAIN").length,
              unmatched: photo.faces.filter((f) => f.status === "UNMATCHED").length,
            };
            return (
              <li
                key={photo.id}
                className="space-y-2 rounded-xl border p-2"
                data-testid="photo-card"
              >
                {preview ? (
                  <div className="relative overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                    <img
                      src={preview.url}
                      alt={`Classroom photo ${i + 1}`}
                      className="block w-full"
                    />
                    {photo.faces.map((f) => (
                      <div
                        key={f.id}
                        className={cn("absolute rounded-sm border-2", BOX_COLOR[f.status])}
                        style={{
                          left: `${(f.box[0] / preview.width) * 100}%`,
                          top: `${(f.box[1] / preview.height) * 100}%`,
                          width: `${(f.box[2] / preview.width) * 100}%`,
                          height: `${(f.box[3] / preview.height) * 100}%`,
                        }}
                        title={
                          f.rollNumber
                            ? `${f.rollNumber} (${f.similarity?.toFixed(2)})`
                            : "Not recognized"
                        }
                      >
                        {f.rollNumber && (
                          <span className="absolute -top-5 left-0 rounded bg-black/70 px-1 text-[10px] whitespace-nowrap text-white">
                            {f.rollNumber}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                    Photo {i + 1}
                    {!photo.stored && " · deleted after confirmation"}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {photo.status === "DONE" ? (
                    <>
                      <Badge variant="secondary">{photo.faceCount} faces</Badge>
                      <Badge className="bg-emerald-600">{counts.matched} matched</Badge>
                      {counts.uncertain > 0 && (
                        <Badge className="bg-amber-500">{counts.uncertain} uncertain</Badge>
                      )}
                      {counts.unmatched > 0 && (
                        <Badge variant="destructive">{counts.unmatched} unknown</Badge>
                      )}
                    </>
                  ) : photo.status === "FAILED" ? (
                    <span className="text-destructive">{photo.error}</span>
                  ) : (
                    <Badge variant="outline">Processing…</Badge>
                  )}
                </div>
                {photo.status === "FAILED" && photo.stored && (
                  <ConfirmAction
                    action={retryAction}
                    fields={{ photoId: photo.id, sessionId }}
                    label="Retry"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
