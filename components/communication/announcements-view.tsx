import { deleteAnnouncementAction, postAnnouncementAction } from "@/app/actions/communication";
import { Pagination } from "@/components/admin/list-controls";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField, TextareaField } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { currentSectionOptions, departmentOptions } from "@/lib/admin/options";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { announcementFeed, facultySectionIds } from "@/lib/services/announcements";
import { sectionLabel } from "@/lib/services/timetable";
import { PAGE_SIZE } from "@/lib/validators/common";

function audienceLabel(a: {
  audience: string;
  targetRole: string | null;
  department: { code: string } | null;
  section: { name: string; semesterNo: number; program: { code: string } } | null;
}) {
  switch (a.audience) {
    case "ALL":
      return "Everyone";
    case "ROLE":
      return a.targetRole === "STUDENT"
        ? "All students"
        : a.targetRole === "FACULTY"
          ? "All faculty"
          : "Admins";
    case "DEPARTMENT":
      return `${a.department?.code ?? ""} department`;
    default:
      return a.section ? sectionLabel(a.section) : "Section";
  }
}

async function PostForm({ user }: { user: CurrentUser }) {
  if (user.role === "FACULTY") {
    const ids = await facultySectionIds(user.facultyProfile!.id);
    const sections = await db.section.findMany({
      where: { id: { in: ids }, semester: { isCurrent: true } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, semesterNo: true, program: { select: { code: true } } },
    });
    return (
      <ActionForm action={postAnnouncementAction} submitLabel="Post" className="sm:grid-cols-2">
        <input type="hidden" name="audience" value="SECTION" />
        <SelectField
          name="sectionId"
          label="Section"
          options={sections.map((s) => ({ value: s.id, label: sectionLabel(s) }))}
          placeholder="Choose…"
          required
        />
        <Field name="expiresAt" label="Show until (optional)" type="date" />
        <div className="grid gap-4 sm:col-span-2">
          <Field name="title" label="Title" required maxLength={150} />
          <TextareaField name="body" label="Message" required rows={4} maxLength={5000} />
        </div>
      </ActionForm>
    );
  }
  const [departments, sections] = await Promise.all([departmentOptions(), currentSectionOptions()]);
  return (
    <ActionForm action={postAnnouncementAction} submitLabel="Post" className="sm:grid-cols-2">
      <SelectField
        name="audience"
        label="Audience"
        options={[
          { value: "ALL", label: "Everyone" },
          { value: "ROLE", label: "A role" },
          { value: "DEPARTMENT", label: "A department" },
          { value: "SECTION", label: "A section" },
        ]}
        defaultValue="ALL"
        hint="Then pick the role, department or section below if needed."
      />
      <Field name="expiresAt" label="Show until (optional)" type="date" />
      <SelectField
        name="targetRole"
        label="Role (for 'A role')"
        options={[
          { value: "STUDENT", label: "Students" },
          { value: "FACULTY", label: "Faculty" },
        ]}
        placeholder="—"
      />
      <SelectField
        name="departmentId"
        label="Department (for 'A department')"
        options={departments}
        placeholder="—"
      />
      <SelectField
        name="sectionId"
        label="Section (for 'A section')"
        options={sections}
        placeholder="—"
      />
      <div className="grid gap-4 sm:col-span-2">
        <Field name="title" label="Title" required maxLength={150} />
        <TextareaField name="body" label="Message" required rows={4} maxLength={5000} />
      </div>
    </ActionForm>
  );
}

export async function AnnouncementsView({ user, page }: { user: CurrentUser; page: number }) {
  const { rows, total } = await announcementFeed(user, {
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const canPost = user.role === "SUPER_ADMIN" || user.role === "FACULTY";
  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" />
      {canPost && (
        <Section
          title="Post an announcement"
          description={
            user.role === "FACULTY"
              ? "Goes to the students of one of your sections."
              : "Recipients are also notified."
          }
        >
          <PostForm user={user} />
        </Section>
      )}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No announcements.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.id} className="space-y-2 rounded-xl border p-4" data-testid="announcement">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-medium">{a.title}</h2>
                <Badge variant="outline">{audienceLabel(a)}</Badge>
              </div>
              <p className="text-sm whitespace-pre-line">{a.body}</p>
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <span>
                  {a.author.name} · {formatDateTime(a.publishedAt)}
                </span>
                {a.expiresAt && <span>until {formatDateTime(a.expiresAt)}</span>}
              </div>
              {(user.role === "SUPER_ADMIN" || a.authorId === user.id) && (
                <ConfirmAction
                  action={deleteAnnouncementAction}
                  fields={{ id: a.id }}
                  label="Delete"
                  confirm="Delete this announcement?"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} total={total} params={{}} />
    </div>
  );
}
