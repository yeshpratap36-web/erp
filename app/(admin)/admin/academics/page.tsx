import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Academics" };

export default async function AcademicsOverviewPage() {
  await requirePermission("academics:manage");
  const [departments, programs, years, courses, sections, rooms] = await Promise.all([
    db.department.count(),
    db.program.count(),
    db.academicYear.count(),
    db.course.count(),
    db.section.count(),
    db.room.count(),
  ]);
  const cards = [
    { label: "Departments", value: departments, href: "departments", hint: "e.g. CSE, ECE" },
    {
      label: "Programs",
      value: programs,
      href: "programs",
      hint: "Degrees offered by a department",
    },
    { label: "Academic years", value: years, href: "years", hint: "Terms and holidays" },
    { label: "Courses", value: courses, href: "courses", hint: "Subjects with credits" },
    { label: "Sections", value: sections, href: "sections", hint: "Student cohorts per term" },
    { label: "Rooms", value: rooms, href: "rooms", hint: "Classrooms and labs" },
  ];
  return (
    <div>
      <PageHeader
        title="Academic structure"
        description="Set these up before creating sections and timetables."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={`/admin/academics/${c.href}`}
            className="rounded-xl border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{c.label}</span>
              <span className="text-xl font-semibold tabular-nums">{c.value}</span>
            </div>
            <p className="text-sm text-muted-foreground">{c.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
