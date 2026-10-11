"use client";

import Link from "next/link";
import { IssuedCredentials } from "@/components/admin/issued-credentials";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField, type SelectOption } from "@/components/forms/field";
import type { IssuedCredential } from "@/lib/services/users";
import {
  createFacultyAction,
  createStudentAction,
  resetPasswordAction,
  setActiveAction,
  setFaceReenrollAction,
  unlockAction,
} from "./actions";

function CreatedNotice({ credential, base }: { credential: IssuedCredential; base: string }) {
  return (
    <div className="space-y-2">
      <IssuedCredentials credentials={[credential]} />
      <Link href={`${base}/${credential.userId}`} className="text-sm underline underline-offset-4">
        Open {credential.name}&apos;s profile
      </Link>
    </div>
  );
}

export function CreateStudentForm({
  programs,
  sections,
  defaultYear,
}: {
  programs: SelectOption[];
  sections: SelectOption[];
  defaultYear: number;
}) {
  return (
    <ActionForm
      action={createStudentAction}
      submitLabel="Create student"
      pendingLabel="Creating…"
      className="sm:grid-cols-2"
      renderResult={(c) => <CreatedNotice credential={c} base="/admin/students" />}
    >
      <Field name="rollNumber" label="Roll number" placeholder="26CSE021" required />
      <Field name="name" label="Full name" required />
      <Field name="email" label="College email" type="email" required />
      <Field name="phone" label="Phone (optional)" type="tel" />
      <SelectField
        name="programId"
        label="Program"
        options={programs}
        placeholder="Choose…"
        required
      />
      <SelectField
        name="sectionId"
        label="Section (current term)"
        options={sections}
        placeholder="No section yet"
      />
      <Field
        name="admissionYear"
        label="Admission year"
        type="number"
        defaultValue={String(defaultYear)}
        required
      />
      <Field
        name="currentSemesterNo"
        label="Current semester"
        type="number"
        min={1}
        max={12}
        defaultValue="1"
        required
      />
    </ActionForm>
  );
}

export function CreateFacultyForm({ departments }: { departments: SelectOption[] }) {
  return (
    <ActionForm
      action={createFacultyAction}
      submitLabel="Create faculty"
      pendingLabel="Creating…"
      className="sm:grid-cols-2"
      renderResult={(c) => <CreatedNotice credential={c} base="/admin/faculty" />}
    >
      <Field name="employeeId" label="Employee ID" placeholder="FAC003" required />
      <Field name="name" label="Full name" required />
      <Field name="email" label="College email" type="email" required />
      <Field name="phone" label="Phone (optional)" type="tel" />
      <SelectField
        name="departmentId"
        label="Department"
        options={departments}
        placeholder="Choose…"
        required
      />
      <Field name="designation" label="Designation (optional)" placeholder="Assistant Professor" />
    </ActionForm>
  );
}

export function AccountActions({
  userId,
  name,
  isActive,
  isLocked,
  isSelf,
  faceReenrollAllowed,
}: {
  userId: string;
  name: string;
  isActive: boolean;
  isLocked: boolean;
  isSelf: boolean;
  /** Only for students. */
  faceReenrollAllowed?: boolean;
}) {
  if (isSelf) {
    return (
      <p className="text-sm text-muted-foreground">You can&apos;t manage your own account here.</p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <p className="text-sm font-medium">Reset password</p>
        <p className="text-xs text-muted-foreground">
          Issues a temporary password and signs them out everywhere.
        </p>
        <ConfirmAction
          action={resetPasswordAction}
          fields={{ userId }}
          label="Reset password"
          confirm={`Reset ${name}'s password? They will be signed out everywhere.`}
          renderResult={(c) => <IssuedCredentials credentials={[c]} />}
        />
      </div>
      {isLocked && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Locked after failed sign-ins</p>
          <ConfirmAction action={unlockAction} fields={{ userId }} label="Unlock account" />
        </div>
      )}
      {faceReenrollAllowed !== undefined && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Face re-enrollment</p>
          <p className="text-xs text-muted-foreground">
            {faceReenrollAllowed
              ? "Allowed — the student can retake their photos."
              : "Not allowed."}
          </p>
          <ConfirmAction
            action={setFaceReenrollAction}
            fields={{ userId, allowed: String(!faceReenrollAllowed) }}
            label={faceReenrollAllowed ? "Revoke permission" : "Allow re-enrollment"}
          />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {isActive ? "Deactivate account" : "Reactivate account"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isActive ? "Blocks sign-in immediately. Records are kept." : "Allows sign-in again."}
        </p>
        <ConfirmAction
          action={setActiveAction}
          fields={{ userId, active: String(!isActive) }}
          label={isActive ? "Deactivate" : "Reactivate"}
          variant={isActive ? "destructive" : "default"}
          confirm={
            isActive ? `Deactivate ${name}? They will be signed out immediately.` : undefined
          }
        />
      </div>
    </div>
  );
}
