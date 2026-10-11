import "server-only";
import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * Row-level access rules. Every query that takes a client-supplied id (sectionId,
 * studentId, sessionId…) must pass through one of these before touching data.
 */

/** Admin: any section. Faculty: only sections (optionally a course) they are assigned to. */
export async function canAccessSection(
  user: CurrentUser,
  sectionId: string,
  courseId?: string,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role !== "FACULTY" || !user.facultyProfile) return false;
  const assignment = await db.facultyAssignment.findFirst({
    where: { facultyId: user.facultyProfile.id, sectionId, ...(courseId ? { courseId } : {}) },
    select: { id: true },
  });
  return assignment !== null;
}

export async function assertSectionAccess(user: CurrentUser, sectionId: string, courseId?: string) {
  if (!(await canAccessSection(user, sectionId, courseId))) throw forbidden();
}

/** Admin: any student. Faculty: students enrolled in a section/course they teach. Student: self. */
export async function canAccessStudent(
  user: CurrentUser,
  studentProfileId: string,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "STUDENT") return user.studentProfile?.id === studentProfileId;
  if (!user.facultyProfile) return false;
  const shared = await db.enrollment.findFirst({
    where: {
      studentId: studentProfileId,
      section: { assignments: { some: { facultyId: user.facultyProfile.id } } },
    },
    select: { id: true },
  });
  return shared !== null;
}

export async function assertStudentAccess(user: CurrentUser, studentProfileId: string) {
  if (!(await canAccessStudent(user, studentProfileId))) throw forbidden();
}

/** The current user's own student profile id; throws for non-students. */
export function ownStudentId(user: CurrentUser): string {
  if (user.role !== "STUDENT" || !user.studentProfile) throw forbidden();
  return user.studentProfile.id;
}
