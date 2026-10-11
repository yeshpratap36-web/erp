import { apiRoute } from "@/lib/api";
import { assertSectionAccess } from "@/lib/auth/scope";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { sectionCourseRoster } from "@/lib/services/attendance-stats";

/** GET — attendance summary CSV for a section's course (faculty: own sections only). */
export const GET = apiRoute<undefined, Response, { sectionId: string; courseId: string }>(
  { permission: "attendance:read:assigned" },
  async ({ user, params }) => {
    await assertSectionAccess(user, params.sectionId, params.courseId);
    const [course, roster] = await Promise.all([
      db.course.findUniqueOrThrow({ where: { id: params.courseId }, select: { code: true } }),
      sectionCourseRoster(params.sectionId, params.courseId),
    ]);
    const csv = toCsv(
      roster.students.map((s) => ({
        roll_number: s.rollNumber,
        name: s.name,
        attended: s.attended,
        total: s.total,
        percent: s.percent ?? "",
        below_threshold: s.belowThreshold ? "yes" : "no",
        classes_needed: s.belowThreshold ? s.needed : 0,
      })),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${course.code}-attendance.csv"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
