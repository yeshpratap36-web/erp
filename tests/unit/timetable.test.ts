import { describe, expect, it } from "vitest";
import {
  dateRangesOverlap,
  findBookingClashes,
  findSlotClashes,
  type WeeklySlot,
} from "@/lib/timetable/clash";
import { expandOccurrences, type SessionInput, type SlotInput } from "@/lib/timetable/occurrences";
import { isoWeekday, minutesToHHMM, nowIn, parseDateKey, parseHHMM, startOfWeek } from "@/lib/time";

const d = (s: string) => parseDateKey(s)!;

describe("time helpers", () => {
  it("formats and parses times of day", () => {
    expect(minutesToHHMM(570)).toBe("09:30");
    expect(parseHHMM("09:30")).toBe(570);
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("9:30")).toBeNull();
  });

  it("parses only real calendar dates", () => {
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-10-12")?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("uses ISO weekdays (Mon=1 … Sun=7)", () => {
    expect(isoWeekday(d("2026-10-12"))).toBe(1); // Monday
    expect(isoWeekday(d("2026-10-18"))).toBe(7); // Sunday
    expect(startOfWeek(d("2026-10-18")).toISOString().slice(0, 10)).toBe("2026-10-12");
  });

  it("computes the local date in the institution timezone", () => {
    // 20:00 UTC on Oct 11 is 01:30 on Oct 12 in India.
    const now = nowIn("Asia/Kolkata", new Date("2026-10-11T20:00:00Z"));
    expect(now.date.toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(now.minute).toBe(90);
  });
});

const slot = (over: Partial<WeeklySlot>): WeeklySlot => ({
  id: "s1",
  sectionId: "secA",
  facultyId: "fac1",
  roomId: "room1",
  dayOfWeek: 1,
  startMinute: 540,
  endMinute: 600,
  effectiveFrom: d("2026-07-15"),
  effectiveTo: d("2026-12-15"),
  ...over,
});

describe("clash detection", () => {
  it("reports every shared resource", () => {
    const clashes = findSlotClashes(slot({ id: undefined }), [slot({})]);
    expect(clashes[0].resources).toEqual(["room", "faculty", "section"]);
  });

  it("ignores touching ranges, other days and unrelated resources", () => {
    const existing = [slot({})];
    expect(findSlotClashes(slot({ id: "n", startMinute: 600, endMinute: 660 }), existing)).toEqual(
      [],
    );
    expect(findSlotClashes(slot({ id: "n", dayOfWeek: 2 }), existing)).toEqual([]);
    expect(
      findSlotClashes(
        slot({ id: "n", sectionId: "secB", facultyId: "fac2", roomId: "room2" }),
        existing,
      ),
    ).toEqual([]);
  });

  it("detects a faculty double-booking across sections", () => {
    const clashes = findSlotClashes(
      slot({ id: "n", sectionId: "secB", roomId: "room2", startMinute: 570 }),
      [slot({})],
    );
    expect(clashes).toHaveLength(1);
    expect(clashes[0].resources).toEqual(["faculty"]);
  });

  it("does not compare a slot with itself (editing)", () => {
    expect(findSlotClashes(slot({}), [slot({})])).toEqual([]);
  });

  it("only clashes when effective date ranges overlap", () => {
    const nextTerm = slot({
      id: "n",
      effectiveFrom: d("2027-01-05"),
      effectiveTo: d("2027-05-31"),
    });
    expect(findSlotClashes(nextTerm, [slot({})])).toEqual([]);
    expect(dateRangesOverlap(d("2026-01-01"), null, d("2030-01-01"), null)).toBe(true);
  });

  it("checks one-off bookings without a room", () => {
    const clashes = findBookingClashes(
      { sectionId: "secA", facultyId: "fac9", roomId: null, startMinute: 550, endMinute: 580 },
      [slot({})],
    );
    expect(clashes[0].resources).toEqual(["section"]);
  });
});

describe("expandOccurrences", () => {
  const weekly: SlotInput = {
    id: "slot1",
    sectionId: "secA",
    courseId: "c1",
    facultyId: "fac1",
    roomId: "room1",
    dayOfWeek: 1,
    startMinute: 540,
    endMinute: 600,
    effectiveFrom: d("2026-10-05"),
    effectiveTo: d("2026-10-26"),
  };
  const session = (over: Partial<SessionInput>): SessionInput => ({
    id: "x",
    timetableSlotId: null,
    sectionId: "secA",
    courseId: "c1",
    facultyId: "fac1",
    roomId: "room1",
    date: d("2026-10-14"),
    startMinute: 840,
    endMinute: 900,
    kind: "EXTRA",
    status: "SCHEDULED",
    cancelReason: null,
    attendanceState: "NOT_TAKEN",
    ...over,
  });

  it("expands Mondays within the effective range and skips holidays", () => {
    const occ = expandOccurrences({
      slots: [weekly],
      sessions: [],
      holidays: [d("2026-10-19")],
      from: d("2026-10-01"),
      to: d("2026-10-31"),
    });
    expect(occ.map((o) => o.date.toISOString().slice(0, 10))).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-26",
    ]);
  });

  it("marks cancelled occurrences and adds extra classes in order", () => {
    const occ = expandOccurrences({
      slots: [weekly],
      sessions: [
        session({
          id: "cancel",
          timetableSlotId: "slot1",
          date: d("2026-10-12"),
          status: "CANCELLED",
          kind: "REGULAR",
          cancelReason: "Faculty on leave",
        }),
        session({ id: "extra" }),
      ],
      holidays: [],
      from: d("2026-10-12"),
      to: d("2026-10-18"),
    });
    expect(occ).toHaveLength(2);
    expect(occ[0]).toMatchObject({
      slotId: "slot1",
      cancelled: true,
      cancelReason: "Faculty on leave",
      sessionId: "cancel",
    });
    expect(occ[1]).toMatchObject({ key: "session:extra", kind: "EXTRA", cancelled: false });
  });

  it("carries attendance state from the session", () => {
    const [occ] = expandOccurrences({
      slots: [weekly],
      sessions: [
        session({
          id: "taken",
          timetableSlotId: "slot1",
          date: d("2026-10-05"),
          kind: "REGULAR",
          attendanceState: "FINALIZED",
          startMinute: 540,
          endMinute: 600,
        }),
      ],
      holidays: [],
      from: d("2026-10-05"),
      to: d("2026-10-05"),
    });
    expect(occ.attendanceState).toBe("FINALIZED");
  });
});
