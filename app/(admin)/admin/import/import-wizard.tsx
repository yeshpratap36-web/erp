"use client";

import { useActionState, useState } from "react";
import { DownloadIcon } from "lucide-react";
import { IssuedCredentials } from "@/components/admin/issued-credentials";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionState } from "@/lib/actions";
import { toCsv } from "@/lib/csv";
import type { IMPORT_COLUMNS, ImportKind } from "@/lib/import/user-csv";
import { commitImportAction, previewImportAction, type ImportResult } from "./actions";

type Columns = typeof IMPORT_COLUMNS;

function downloadTemplate(kind: ImportKind, columns: Columns) {
  const cols = columns[kind];
  const csv = toCsv(
    [Object.fromEntries(cols.map((c) => [c.name, c.example]))],
    cols.map((c) => c.name),
  );
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  Object.assign(document.createElement("a"), {
    href: url,
    download: `${kind}-template.csv`,
  }).click();
  URL.revokeObjectURL(url);
}

/**
 * 1. Pick a CSV → read in the browser → preview (server validates every row).
 * 2. If there are no errors, confirm → the server re-validates and creates all accounts.
 * 3. Temporary passwords are shown once for download.
 */
export function ImportWizard({ columns }: { columns: Columns }) {
  const [kind, setKind] = useState<ImportKind>("students");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  // What the last preview was made from. Compared client-side because browsers normalize
  // line endings in submitted form fields, so the server never sees the exact same string.
  const [previewedFor, setPreviewedFor] = useState<{ csv: string; kind: ImportKind } | null>(null);
  const [preview, previewAction, previewing] = useActionState(
    previewImportAction,
    {} as ActionState<ImportResult>,
  );
  const [commit, commitAction, committing] = useActionState(
    commitImportAction,
    {} as ActionState<ImportResult>,
  );

  const done = commit.ok && commit.data?.stage === "done" ? commit.data : null;
  const shown = preview.ok && preview.data?.stage === "preview" ? preview.data : null;
  // A preview is only valid for the exact file + kind it was made from.
  const current = shown && previewedFor?.csv === csv && previewedFor.kind === kind ? shown : null;

  if (done) {
    return (
      <div className="space-y-4">
        <IssuedCredentials credentials={done.credentials} />
        <p className="text-sm">{done.credentials.length} accounts created.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Import another file
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form
        action={(formData: FormData) => {
          setPreviewedFor({ csv, kind });
          previewAction(formData);
        }}
        className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
      >
        <div className="grid gap-2">
          <Label htmlFor="kind">Account type</Label>
          <NativeSelect
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ImportKind)}
            className="w-full"
          >
            <NativeSelectOption value="students">Students</NativeSelectOption>
            <NativeSelectOption value="faculty">Faculty</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="file">CSV file</Label>
          <Input
            id="file"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setFileName(file?.name ?? "");
              setCsv(file ? await file.text() : "");
            }}
          />
        </div>
        <input type="hidden" name="csv" value={csv} />
        <div className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          <p>
            Columns:{" "}
            {columns[kind].map((c, i) => (
              <span key={c.name}>
                {i > 0 && ", "}
                <code>{c.name}</code>
                {!c.required && " (optional)"}
              </span>
            ))}
            . Max 1,000 rows.
          </p>
          {kind === "students" && (
            <p>Sections are matched within the current term by program, semester and name.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={!csv || previewing}>
            {previewing ? "Checking…" : "Preview"}
          </Button>
          <Button type="button" variant="outline" onClick={() => downloadTemplate(kind, columns)}>
            <DownloadIcon /> Template
          </Button>
        </div>
        {preview.error && <p className="text-sm text-destructive sm:col-span-2">{preview.error}</p>}
        {preview.fieldErrors?.csv && (
          <p className="text-sm text-destructive sm:col-span-2">{preview.fieldErrors.csv[0]}</p>
        )}
      </form>

      {current && (
        <div className="space-y-4">
          {current.preview.fileErrors.length > 0 ? (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {current.preview.fileErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div
                className="flex flex-wrap items-center gap-2 text-sm"
                data-testid="import-summary"
              >
                <span className="font-medium">{fileName}</span>
                <Badge variant="secondary">{current.preview.validCount} valid</Badge>
                {current.preview.errorCount > 0 && (
                  <Badge variant="destructive">{current.preview.errorCount} with errors</Badge>
                )}
              </div>
              <PreviewTable kind={kind} columns={columns} rows={current.preview.rows} />
              {current.preview.errorCount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Fix the highlighted rows in your file and preview again.
                </p>
              ) : (
                <form action={commitAction} className="space-y-2">
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="csv" value={csv} />
                  <Button type="submit" disabled={committing}>
                    {committing
                      ? "Creating accounts…"
                      : `Create ${current.preview.validCount} accounts`}
                  </Button>
                  {commit.error && <p className="text-sm text-destructive">{commit.error}</p>}
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewTable({
  kind,
  columns,
  rows,
}: {
  kind: ImportKind;
  columns: Columns;
  rows: { row: number; values: Record<string, string>; errors: string[] }[];
}) {
  const cols = columns[kind].map((c) => c.name);
  return (
    <div className="max-h-[28rem] overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Row</TableHead>
            {cols.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
            <TableHead>Problems</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.row} className={r.errors.length ? "bg-destructive/5" : undefined}>
              <TableCell>{r.row}</TableCell>
              {cols.map((c) => (
                <TableCell key={c}>{r.values[c]}</TableCell>
              ))}
              <TableCell className="text-xs text-destructive">
                {r.errors.join("; ") || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
