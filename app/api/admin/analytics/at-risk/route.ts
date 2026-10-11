import { z } from "zod";
import { apiRoute } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { termAnalytics } from "@/lib/services/analytics";

/** GET ?semesterId= — at-risk students as CSV (admin). */
export const GET = apiRoute(
  { permission: "analytics:read:any", input: z.object({ semesterId: z.string().min(1).max(40) }) },
  async ({ input }) => {
    const { atRisk } = await termAnalytics(input.semesterId);
    const csv = toCsv(
      atRisk.map((s) => ({
        risk: s.level,
        roll_number: s.rollNumber,
        name: s.name,
        section: s.section,
        attendance_percent: s.attendancePercent ?? "",
        low_attendance: s.lowAttendance ? "yes" : "no",
        failing_courses: s.failing.map((f) => `${f.code} (${f.percent}%)`).join("; "),
      })),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="at-risk-students.csv"',
        "Cache-Control": "no-store",
      },
    });
  },
);
