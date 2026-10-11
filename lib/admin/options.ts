import "server-only";
import type { SelectOption } from "@/components/forms/field";
import { db } from "@/lib/db";

export async function departmentOptions(): Promise<SelectOption[]> {
  const rows = await db.department.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return rows.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }));
}

export async function programOptions(): Promise<SelectOption[]> {
  const rows = await db.program.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return rows.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
}

export async function termOptions(): Promise<SelectOption[]> {
  const rows = await db.semester.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isCurrent: true },
  });
  return rows.map((s) => ({ value: s.id, label: s.isCurrent ? `${s.name} (current)` : s.name }));
}

/** Sections of the current term (where students are placed). */
export async function currentSectionOptions(): Promise<SelectOption[]> {
  const rows = await db.section.findMany({
    where: { semester: { isCurrent: true } },
    orderBy: [{ program: { code: "asc" } }, { semesterNo: "asc" }, { name: "asc" }],
    select: { id: true, name: true, semesterNo: true, program: { select: { code: true } } },
  });
  return rows.map((s) => ({
    value: s.id,
    label: `${s.program.code} · Sem ${s.semesterNo} · ${s.name}`,
  }));
}

export async function courseOptions(): Promise<SelectOption[]> {
  const rows = await db.course.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return rows.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));
}

export async function activeFacultyOptions(): Promise<SelectOption[]> {
  const rows = await db.facultyProfile.findMany({
    where: { deletedAt: null, user: { isActive: true } },
    orderBy: { user: { name: "asc" } },
    select: { id: true, employeeId: true, user: { select: { name: true } } },
  });
  return rows.map((f) => ({ value: f.id, label: `${f.user.name} (${f.employeeId})` }));
}

export function enumOptions<T extends string>(values: Record<string, T>): SelectOption[] {
  return Object.values(values).map((v) => ({
    value: v,
    label: v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " "),
  }));
}
