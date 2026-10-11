"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Shared body for error boundaries. Never shows error details to users (only the digest for support). */
export function ErrorView({
  digest,
  reset,
  home = "/",
}: {
  digest?: string;
  reset: () => void;
  home?: string;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        The page couldn&apos;t be loaded. Please try again. If it keeps happening, contact the
        college office
        {digest ? (
          <>
            {" "}
            and mention reference <code className="text-foreground">{digest}</code>
          </>
        ) : null}
        .
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href={home}>Go home</Link>
        </Button>
      </div>
    </div>
  );
}
