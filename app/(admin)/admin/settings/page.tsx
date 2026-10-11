import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { BareCheckbox, BareInput } from "@/components/forms/bare-input";
import { CheckboxField, Field } from "@/components/forms/field";
import { requirePermission } from "@/lib/auth/session";
import { defaultGradeBands } from "@/lib/services/exams";
import { getSetting } from "@/lib/settings.server";
import { saveGradeBandsAction, saveSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

const EXTRA_ROWS = 2;

export default async function SettingsPage() {
  await requirePermission("settings:manage");
  const [threshold, match, uncertain, deleteRaw, maxFailed, lockout, bands] = await Promise.all([
    getSetting("attendance.threshold"),
    getSetting("face.matchThreshold"),
    getSetting("face.uncertainThreshold"),
    getSetting("face.deleteRawPhotosAfterEnrollment"),
    getSetting("auth.maxFailedAttempts"),
    getSetting("auth.lockoutMinutes"),
    defaultGradeBands(),
  ]);
  const rows = [...bands, ...Array.from({ length: EXTRA_ROWS }, () => null)];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Changes apply immediately and are recorded in the audit log."
      />

      <Section title="Attendance, face recognition & sign-in">
        <ActionForm action={saveSettingsAction} className="sm:grid-cols-2">
          <Field
            name="attendance.threshold"
            label="Attendance threshold (%)"
            type="number"
            min={0}
            max={100}
            step="any"
            defaultValue={String(threshold)}
            hint="Students below this see a warning."
            required
          />
          <div />
          <Field
            name="face.matchThreshold"
            label="Face match threshold"
            type="number"
            min={0}
            max={1}
            step={0.01}
            defaultValue={String(match)}
            hint="Cosine similarity for a confident match (SFace guidance: ≥ 0.363)."
            required
          />
          <Field
            name="face.uncertainThreshold"
            label="Uncertain threshold"
            type="number"
            min={0}
            max={1}
            step={0.01}
            defaultValue={String(uncertain)}
            hint="Between this and the match threshold, faculty must decide."
            required
          />
          <Field
            name="auth.maxFailedAttempts"
            label="Failed sign-ins before lockout"
            type="number"
            min={3}
            max={20}
            defaultValue={String(maxFailed)}
            required
          />
          <Field
            name="auth.lockoutMinutes"
            label="Lockout duration (minutes)"
            type="number"
            min={1}
            max={1440}
            defaultValue={String(lockout)}
            required
          />
          <div className="sm:col-span-2">
            <CheckboxField
              name="face.deleteRawPhotosAfterEnrollment"
              label="Delete enrollment photos after face templates are created"
              defaultChecked={deleteRaw}
              hint="The consent text students see follows this setting."
            />
          </div>
        </ActionForm>
      </Section>

      <Section
        title="Grade scale"
        description="A score gets the grade with the highest minimum at or below it. Leave a letter blank to remove a row."
      >
        <ActionForm action={saveGradeBandsAction} submitLabel="Save grade scale">
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pr-2 pb-1 font-medium">Grade</th>
                  <th className="pr-2 pb-1 font-medium">Minimum %</th>
                  <th className="pr-2 pb-1 font-medium">Grade point</th>
                  <th className="pb-1 font-medium">Pass</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <BareInput
                        name={`letter:${i}`}
                        defaultValue={b?.letter ?? ""}
                        className="w-16"
                        aria-label={`Grade ${i + 1} letter`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <BareInput
                        name={`min:${i}`}
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        defaultValue={b?.minPercent ?? ""}
                        className="w-24"
                        aria-label={`Grade ${i + 1} minimum percent`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <BareInput
                        name={`gp:${i}`}
                        type="number"
                        min={0}
                        max={10}
                        step="any"
                        defaultValue={b?.gradePoint ?? ""}
                        className="w-20"
                        aria-label={`Grade ${i + 1} grade point`}
                      />
                    </td>
                    <td className="py-1">
                      <BareCheckbox
                        name={`pass:${i}`}
                        defaultChecked={b?.isPass ?? true}
                        aria-label={`Grade ${i + 1} is a pass`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ActionForm>
      </Section>
    </div>
  );
}
