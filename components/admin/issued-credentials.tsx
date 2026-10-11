"use client";

import { useState } from "react";
import { CopyIcon, DownloadIcon, KeyRoundIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/lib/csv";

export type Credential = { loginId: string; name: string; tempPassword: string };

/**
 * Temporary passwords, shown exactly once. They live only in this component's memory:
 * nothing is persisted, and navigating away discards them.
 */
export function IssuedCredentials({ credentials }: { credentials: Credential[] }) {
  const [copied, setCopied] = useState(false);
  const single = credentials.length === 1 ? credentials[0] : null;

  const download = () => {
    const csv = toCsv(
      credentials.map((c) => ({
        login_id: c.loginId,
        name: c.name,
        temporary_password: c.tempPassword,
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "temporary-passwords.csv",
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Alert
      data-testid="issued-credentials"
      className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30"
    >
      <KeyRoundIcon />
      <AlertTitle>
        {single ? "Temporary password" : `${credentials.length} temporary passwords`} — shown only
        once
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Share securely. The user must change it at first sign-in.</p>
        {single ? (
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="rounded border bg-background px-2 py-1 font-mono text-base"
              data-testid="temp-password"
            >
              {single.loginId} / {single.tempPassword}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(single.tempPassword);
                setCopied(true);
              }}
            >
              <CopyIcon /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={download}>
            <DownloadIcon /> Download CSV
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
