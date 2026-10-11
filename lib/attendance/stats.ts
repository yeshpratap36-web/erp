/**
 * Attendance math. PRESENT and LATE count as attended; EXCUSED classes are left out of
 * the total entirely (they neither help nor hurt); ABSENT counts against.
 */

export type AttendanceTally = { attended: number; total: number };

export function tally(
  statuses: Iterable<"PRESENT" | "ABSENT" | "LATE" | "EXCUSED">,
): AttendanceTally {
  let attended = 0;
  let total = 0;
  for (const s of statuses) {
    if (s === "EXCUSED") continue;
    total++;
    if (s === "PRESENT" || s === "LATE") attended++;
  }
  return { attended, total };
}

/** Percentage rounded to one decimal; null when no classes have been held. */
export function percentage({ attended, total }: AttendanceTally): number | null {
  return total === 0 ? null : Math.round((attended / total) * 1000) / 10;
}

/**
 * Consecutive classes the student must attend to reach `threshold` percent.
 * Solves (attended + x) / (total + x) >= t for the smallest whole x.
 */
export function classesNeeded({ attended, total }: AttendanceTally, threshold: number): number {
  const t = threshold / 100;
  if (total === 0 || attended / total >= t) return 0;
  if (t >= 1) return Number.POSITIVE_INFINITY;
  return Math.ceil((t * total - attended) / (1 - t) - 1e-9);
}

/** Classes the student can still miss while staying at or above `threshold` percent. */
export function classesCanMiss({ attended, total }: AttendanceTally, threshold: number): number {
  const t = threshold / 100;
  if (t <= 0) return Number.POSITIVE_INFINITY;
  // attended / (total + y) >= t  →  y <= attended / t - total
  return Math.max(0, Math.floor(attended / t - total + 1e-9));
}

export function addTallies(tallies: AttendanceTally[]): AttendanceTally {
  return tallies.reduce(
    (acc, t) => ({ attended: acc.attended + t.attended, total: acc.total + t.total }),
    {
      attended: 0,
      total: 0,
    },
  );
}
