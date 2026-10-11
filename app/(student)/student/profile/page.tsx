import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sectionLabel } from "@/lib/services/timetable";

export const metadata: Metadata = { title: "Profile" };

export default async function StudentProfilePage() {
  const user = await requireRole("STUDENT");
  const profile = await db.studentProfile.findUniqueOrThrow({
    where: { userId: user.id },
    select: {
      rollNumber: true,
      admissionYear: true,
      currentSemesterNo: true,
      faceEnrolledAt: true,
      faceReenrollAllowed: true,
      program: { select: { name: true } },
      section: { select: { name: true, semesterNo: true, program: { select: { code: true } } } },
      user: { select: { email: true, phone: true } },
    },
  });

  const rows: [string, string][] = [
    ["Roll number", profile.rollNumber],
    ["Email", profile.user.email],
    ["Phone", profile.user.phone ?? "—"],
    ["Program", profile.program.name],
    ["Section", profile.section ? sectionLabel(profile.section) : "Not assigned"],
    ["Semester", String(profile.currentSemesterNo)],
    ["Admission year", String(profile.admissionYear)],
    ["Face enrollment", profile.faceEnrolledAt ? "Completed" : "Not completed"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.name}
        description="Contact the office to correct any of these details."
      />
      <Section title="Details">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Security">
        <Link href="/change-password" className="text-sm underline underline-offset-4">
          Change password
        </Link>
        <Link href="/student/face" className="block text-sm underline underline-offset-4">
          {profile.faceReenrollAllowed
            ? "Retake face photos (enabled for you)"
            : "Face enrollment status"}
        </Link>
      </Section>
    </div>
  );
}
