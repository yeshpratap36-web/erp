import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminDashboardPage() {
  const user = await requireRole("SUPER_ADMIN");
  const now = new Date();
  const [students, faculty, pendingFirstLogin, locked, sections, courses, currentTerm] =
    await Promise.all([
      db.user.count({ where: { role: "STUDENT", deletedAt: null, isActive: true } }),
      db.user.count({ where: { role: "FACULTY", deletedAt: null, isActive: true } }),
      db.user.count({
        where: { role: "STUDENT", deletedAt: null, isActive: true, mustChangePassword: true },
      }),
      db.user.count({ where: { role: "STUDENT", lockedUntil: { gt: now } } }),
      db.section.count({ where: { semester: { isCurrent: true } } }),
      db.course.count(),
      db.semester.findFirst({ where: { isCurrent: true }, select: { name: true } }),
    ]);

  const stats = [
    { label: "Active students", value: students, href: "/admin/students" },
    { label: "Active faculty", value: faculty, href: "/admin/faculty" },
    {
      label: "Students awaiting first login",
      value: pendingFirstLogin,
      href: "/admin/students?status=pending",
    },
    { label: "Locked student accounts", value: locked, href: "/admin/students?status=locked" },
    { label: "Sections this term", value: sections, href: "/admin/academics/sections" },
    { label: "Courses", value: courses, href: "/admin/academics/courses" },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name}`}
        description={
          currentTerm
            ? `Current term: ${currentTerm.name}`
            : "No current term is set — configure one under Academics."
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-xl border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
