/**
 * Face fixtures built at test time from public-domain images (NASA portraits via scikit-image
 * and Wikimedia Commons). Downloaded once into the OS temp dir — biometric images are never
 * committed to the repo. Returns null when offline so face tests can skip cleanly.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { FACE_SERVICE_URL } from "./env";

const SOURCES = {
  collins: "https://gitlab.com/scikit-image/data/-/raw/master/astronaut.png",
  armstrong:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Neil_Armstrong_pose.jpg?width=800",
  aldrin: "https://commons.wikimedia.org/wiki/Special:FilePath/Buzz_Aldrin.jpg?width=800",
} as const;
export type Person = keyof typeof SOURCES;

const CACHE = path.join(tmpdir(), "college-erp-e2e-faces");

async function download(person: Person): Promise<Buffer | null> {
  const file = path.join(CACHE, `${person}.img`);
  try {
    return await readFile(file);
  } catch {
    try {
      const res = await fetch(SOURCES[person], {
        headers: { "User-Agent": "college-erp-e2e/1.0" },
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(CACHE, { recursive: true });
      await writeFile(file, buf);
      return buf;
    } catch {
      return null;
    }
  }
}

export async function faceServiceUp() {
  try {
    return (await fetch(`${FACE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

const dataUrl = (buf: Buffer) => `data:image/*;base64,${buf.toString("base64")}`;

/**
 * Composes images in the browser's canvas (no image library needed in Node).
 * Each source is scaled to `height` px tall and placed side by side on a plain background.
 */
async function compose(page: Page, images: Buffer[], height: number): Promise<Buffer> {
  await page.setContent("<!doctype html><title>fixture</title>");
  const base64 = await page.evaluate(
    async ({ urls, height }) => {
      const imgs = await Promise.all(
        urls.map(
          (src) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = src;
            }),
        ),
      );
      const widths = imgs.map((i) => Math.round((i.naturalWidth / i.naturalHeight) * height));
      const gap = 80;
      const canvas = document.createElement("canvas");
      canvas.width = widths.reduce((a, b) => a + b + gap, gap);
      canvas.height = height + 2 * gap;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#cdc8be";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      let x = gap;
      imgs.forEach((img, i) => {
        ctx.drawImage(img, x, gap, widths[i], height);
        x += widths[i] + gap;
      });
      return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
    },
    { urls: images.map(dataUrl), height },
  );
  return Buffer.from(base64, "base64");
}

export type FaceFixtures = {
  /** Single-person enrollment photo (upscaled so the face is comfortably large). */
  enrollment: (person: Person) => Promise<Buffer>;
  /** Group photo of the given people. */
  classroom: (people: Person[]) => Promise<Buffer>;
};

export async function loadFaceFixtures(page: Page): Promise<FaceFixtures | null> {
  if (!(await faceServiceUp())) return null;
  const entries = await Promise.all(
    (Object.keys(SOURCES) as Person[]).map(async (p) => [p, await download(p)] as const),
  );
  if (entries.some(([, buf]) => !buf)) return null;
  const images = Object.fromEntries(entries) as Record<Person, Buffer>;
  return {
    enrollment: (person) => compose(page, [images[person]], 1000),
    classroom: (people) =>
      compose(
        page,
        people.map((p) => images[p]),
        700,
      ),
  };
}
