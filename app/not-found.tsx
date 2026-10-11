import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md flex-1 space-y-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Go to your home page
      </Link>
    </main>
  );
}
