"use server";

import { z } from "zod";
import { formAction } from "@/lib/actions.server";
import { MAX_IMPORT_BYTES } from "@/lib/import/user-csv";
import { commitImport, previewImport, type ImportPreview } from "@/lib/services/user-import";
import type { IssuedCredential } from "@/lib/services/users";

const importSchema = z.object({
  kind: z.enum(["students", "faculty"], "Choose what to import"),
  csv: z.string().min(1, "Choose a CSV file").max(MAX_IMPORT_BYTES, "File is too large"),
});

export type ImportResult =
  { stage: "preview"; preview: ImportPreview } | { stage: "done"; credentials: IssuedCredential[] };

const manage = {
  permission: "users:manage",
  schema: importSchema,
  sensitiveFields: ["csv"],
} as const;

export const previewImportAction = formAction<typeof importSchema, ImportResult>(
  manage,
  async ({ kind, csv }) => ({
    ok: true,
    data: { stage: "preview", preview: await previewImport(kind, csv) },
  }),
);

export const commitImportAction = formAction<typeof importSchema, ImportResult>(
  manage,
  async ({ kind, csv }, admin) => ({
    ok: true,
    data: { stage: "done", credentials: await commitImport(kind, csv, admin.id) },
  }),
);
