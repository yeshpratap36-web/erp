import "server-only";
import type { CurrentUser } from "@/lib/auth/session";
import { ownStudentId } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import type { ScheduleScope } from "@/lib/services/timetable";

/** The signed-in student's own schedule scope: only the (section, course) pairs they're enrolled in. */
export async function ownScheduleScope(user: CurrentUser): Promise<ScheduleScope> {
  const enrollments = await db.enrollment.findMany({
    where: { studentId: ownStudentId(user) },
    select: { sectionId: true, courseId: true },
  });
  return { enrollments };
}
