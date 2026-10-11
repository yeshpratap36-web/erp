import { Suspense } from "react";
import { db } from "@/lib/db";

// Temporary landing page for Phase 1 — replaced by the login flow in Phase 2.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">College ERP</h1>
        <p className="text-sm text-muted-foreground">
          Scaffold is running. Sign-in arrives in Phase 2.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking database…</p>}>
        <DbStatus />
      </Suspense>
    </main>
  );
}

async function getDbCounts() {
  try {
    const [users, slots] = await Promise.all([db.user.count(), db.timetableSlot.count()]);
    return { users, slots };
  } catch {
    return null;
  }
}

async function DbStatus() {
  const counts = await getDbCounts();
  if (!counts) {
    return (
      <p className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
        Database unreachable. Is <code>docker-compose up -d</code> running?
      </p>
    );
  }
  return (
    <p className="rounded-md border px-3 py-2 text-sm">
      Database connected · {counts.users} users · {counts.slots} timetable slots
    </p>
  );
}
