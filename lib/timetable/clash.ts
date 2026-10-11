/**
 * Clash detection for recurring weekly slots and one-off class sessions.
 * Two bookings clash when they share a room, a faculty member or a section,
 * fall on the same day, and their time ranges overlap (touching ends don't clash).
 */

export type ClashResource = "room" | "faculty" | "section";

export type Booking = {
  id?: string;
  sectionId: string;
  facultyId: string;
  roomId: string | null;
  startMinute: number;
  endMinute: number;
};

export type WeeklySlot = Booking & {
  dayOfWeek: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type Clash<T> = { with: T; resources: ClashResource[] };

export const timesOverlap = (a: Booking, b: Booking) =>
  a.startMinute < b.endMinute && b.startMinute < a.endMinute;

/** Do two (possibly open-ended) date ranges share at least one day? */
export const dateRangesOverlap = (aFrom: Date, aTo: Date | null, bFrom: Date, bTo: Date | null) =>
  (bTo === null || aFrom <= bTo) && (aTo === null || bFrom <= aTo);

export function sharedResources(a: Booking, b: Booking): ClashResource[] {
  const shared: ClashResource[] = [];
  if (a.roomId && a.roomId === b.roomId) shared.push("room");
  if (a.facultyId === b.facultyId) shared.push("faculty");
  if (a.sectionId === b.sectionId) shared.push("section");
  return shared;
}

/** Clashes between a candidate booking and existing ones on the same day. */
export function findBookingClashes<T extends Booking>(
  candidate: Booking,
  existing: T[],
): Clash<T>[] {
  return existing.flatMap((other) => {
    if (candidate.id && other.id === candidate.id) return [];
    if (!timesOverlap(candidate, other)) return [];
    const resources = sharedResources(candidate, other);
    return resources.length ? [{ with: other, resources }] : [];
  });
}

/** Clashes between a candidate weekly slot and existing weekly slots. */
export function findSlotClashes<T extends WeeklySlot>(
  candidate: WeeklySlot,
  existing: T[],
): Clash<T>[] {
  const sameDayAndRange = existing.filter(
    (s) =>
      s.dayOfWeek === candidate.dayOfWeek &&
      dateRangesOverlap(
        candidate.effectiveFrom,
        candidate.effectiveTo,
        s.effectiveFrom,
        s.effectiveTo,
      ),
  );
  return findBookingClashes(candidate, sameDayAndRange);
}
