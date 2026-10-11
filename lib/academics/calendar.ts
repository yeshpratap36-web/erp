/**
 * Default academic calendar used by the seed and demo scripts: the year runs July–June,
 * the odd term July–December and the even term January–June, so "today" is always in a term.
 */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

export function academicYearFor(today: Date, offsetYears = 0) {
  const month = today.getUTCMonth() + 1;
  const start = (month >= 7 ? today.getUTCFullYear() : today.getUTCFullYear() - 1) + offsetYears;
  const name = `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  return {
    name,
    startDate: utc(start, 7, 1),
    endDate: utc(start + 1, 6, 30),
    odd: {
      name: `Odd Semester ${name}`,
      term: "ODD" as const,
      startDate: utc(start, 7, 1),
      endDate: utc(start, 12, 31),
    },
    even: {
      name: `Even Semester ${name}`,
      term: "EVEN" as const,
      startDate: utc(start + 1, 1, 1),
      endDate: utc(start + 1, 6, 30),
    },
    currentTerm: (month >= 7 ? "ODD" : "EVEN") as "ODD" | "EVEN",
    /** Fixed-date national holidays; movable festivals are left for admins to add. */
    holidays: [
      { date: utc(start, 8, 15), name: "Independence Day" },
      { date: utc(start, 10, 2), name: "Gandhi Jayanti" },
      { date: utc(start, 12, 25), name: "Christmas" },
      { date: utc(start + 1, 1, 26), name: "Republic Day" },
    ],
  };
}
