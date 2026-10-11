import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/page-header";
import { AccountStatusBadges } from "@/components/admin/status-badges";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { currentSectionOptions, programOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { enrollmentStatus } from "@/lib/services/face-enrollment";
import { updateStudentAction } from "../../users/actions";
import { AccountActions } from "../../users/user-forms";

export const metadata: Metadata = { title: "Student" };

export default async function StudentPage({ params }: PageProps<"/admin/students/[id]">) {
  const admin = await requirePermission("users:manage");
  const { id } = await params;
  const user = await db.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    include: {
      studentProfile: {
        include: {
          section: {
            select: { id: true, name: true, semesterNo: true, program: { select: { code: true } } },
          },
        },
      },
    },
  });
  if (!user?.studentProfile) notFound();
  const profile = user.studentProfile;

  const [programs, sections, biometrics] = await Promise.all([
    programOptions(),
    currentSectionOptions(),
    enrollmentStatus(user.id),
  ]);
  // Keep a past-term section selectable so editing other fields doesn't silently drop it.
  if (profile.section && !sections.some((s) => s.value === profile.section!.id)) {
    sections.unshift({
      value: profile.section.id,
      label: `${profile.section.program.code} · Sem ${profile.section.semesterNo} · ${profile.section.name} (past term)`,
    });
  }
  const isLocked = !!user.lockedUntil && user.lockedUntil > new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {user.loginId} · {user.email} <AccountStatusBadges {...user} />
          </span>
        }
        back={{ href: "/admin/students", label: "Students" }}
      />

      <Section title="Profile">
        <ActionForm action={updateStudentAction} className="sm:grid-cols-2">
          <input type="hidden" name="userId" value={user.id} />
          <Field name="name" label="Full name" defaultValue={user.name} required />
          <Field
            name="email"
            label="College email"
            type="email"
            defaultValue={user.email}
            required
          />
          <Field name="phone" label="Phone (optional)" type="tel" defaultValue={user.phone ?? ""} />
          <SelectField
            name="programId"
            label="Program"
            options={programs}
            defaultValue={profile.programId}
            required
          />
          <SelectField
            name="sectionId"
            label="Section"
            options={sections}
            placeholder="No section"
            defaultValue={profile.sectionId ?? ""}
            hint="Changing the section moves the student's course enrollments."
          />
          <Field
            name="admissionYear"
            label="Admission year"
            type="number"
            defaultValue={String(profile.admissionYear)}
            required
          />
          <Field
            name="currentSemesterNo"
            label="Current semester"
            type="number"
            min={1}
            max={12}
            defaultValue={String(profile.currentSemesterNo)}
            required
          />
        </ActionForm>
      </Section>

      <Section title="Account">
        <dl className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          <div>Last sign-in: {formatDateTime(user.lastLoginAt)}</div>
          <div>Password changed: {formatDateTime(user.passwordChangedAt)}</div>
          <div>Onboarding: {user.onboardingStep.toLowerCase().replace(/_/g, " ")}</div>
          <div>Face enrolled: {formatDateTime(profile.faceEnrolledAt)}</div>
          <div>
            Face samples: {biometrics.active} active
            {biometrics.pending ? `, ${biometrics.pending} pending` : ""}
          </div>
          <div>
            Biometric consent:{" "}
            {biometrics.consent
              ? `${formatDateTime(biometrics.consent.givenAt)} (${biometrics.consent.consentVersion})`
              : biometrics.optedOutAt
                ? `opted out ${formatDateTime(biometrics.optedOutAt)} (manual attendance)`
                : "not given"}
          </div>
        </dl>
        <AccountActions
          userId={user.id}
          name={user.name}
          isActive={user.isActive}
          isLocked={isLocked}
          isSelf={user.id === admin.id}
          faceReenrollAllowed={profile.faceReenrollAllowed}
          hasBiometricData={!!biometrics.consent || biometrics.active + biometrics.pending > 0}
        />
      </Section>
    </div>
  );
}
