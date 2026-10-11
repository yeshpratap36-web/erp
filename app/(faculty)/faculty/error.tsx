"use client";

import { ErrorView } from "@/components/layout/error-view";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView digest={error.digest} reset={reset} home="/faculty" />;
}
