import "server-only";
import Papa from "papaparse";
import type { z } from "zod";
import {
  courseProgress,
  distribution,
  gradeFor,
  summarize,
  type GradeBandInfo,
} from "@/lib/academics/grading";
import { audit } from "@/lib/audit";
import { assertSectionAccess } from "@/lib/auth/scope";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FieldValidationError, HttpError, notFound } from "@/lib/errors";
import type { examSchema } from "@/lib/validators/exams";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function defaultGradeBands(): Promise<GradeBandInfo[]> {
  const scale = await db.gradeScale.findFirst({
    where: { isDefault: true },
    include: { bands: { orderBy: { minPercent: "desc" } } },
  });
  if (!scale || scale.bands.length === 0)
    throw new HttpError(500, "no_grade_scale", "No default grade scale is configured.");
  return scale.bands;
}

async function sectionTerm(sectionId: string) {
  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: { semesterId: true },
  });
  if (!section) throw notFound("Section not found");
  return section.semesterId;
}

async function loadExam(examId: string, user: CurrentUser) {
  const exam = await db.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound("Exam not found");
  await assertSectionAccess(user, exam.sectionId, exam.courseId);
  return exam;
}

/** Active students enrolled in a section's course. */
export async function courseRoster(sectionId: string, courseId: string) {
  const rows = await db.enrollment.findMany({
    where: { sectionId, courseId, student: { deletedAt: null, user: { isActive: true } } },
    orderBy: { student: { rollNumber: "asc" } },
    select: {
      student: { select: { id: true, rollNumber: true, user: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.student.id,
    rollNumber: r.student.rollNumber,
    name: r.student.user.name,
  }));
}

async function assertWeightageFits(
  sectionId: string,
  courseId: string,
  semesterId: string,
  weightage: number,
  excludeExamId?: string,
) {
  const { _sum } = await db.exam.aggregate({
    where: {
      sectionId,
      courseId,
      semesterId,
      ...(excludeExamId ? { id: { not: excludeExamId } } : {}),
    },
    _sum: { weightage: true },
  });
  const used = _sum.weightage ?? 0;
  if (used + weightage > 100 + 1e-6) {
    throw new FieldValidationError({
      weightage: [
        `Only ${round2(100 - used)}% weightage is left for this course (${round2(used)}% used).`,
      ],
    });
  }
}

// ── Exams ───────────────────────────────────────────────────────────────────

export async function createExam(input: z.output<typeof examSchema>, user: CurrentUser) {
  await assertSectionAccess(user, input.sectionId, input.courseId);
  const semesterId = await sectionTerm(input.sectionId);
  await assertWeightageFits(input.sectionId, input.courseId, semesterId, input.weightage);
  return db.exam.create({ data: { ...input, semesterId } });
}

export async function deleteExam(examId: string, user: CurrentUser) {
  const exam = await loadExam(examId, user);
  if (exam.isPublished)
    throw new HttpError(409, "published", "Unpublish the exam before deleting it.");
  await db.exam.delete({ where: { id: examId } });
  return exam;
}

export async function setExamPublished(examId: string, published: boolean, user: CurrentUser) {
  const exam = await loadExam(examId, user);
  if (published) {
    const [roster, marks] = await Promise.all([
      courseRoster(exam.sectionId, exam.courseId),
      db.mark.count({
        where: { examId, OR: [{ isAbsent: true }, { marksObtained: { not: null } }] },
      }),
    ]);
    if (marks < roster.length) {
      throw new HttpError(
        400,
        "incomplete",
        `Enter marks for every student first (${roster.length - marks} missing).`,
      );
    }
  }
  await db.exam.update({ where: { id: examId }, data: { isPublished: published } });
  await audit({
    actorId: user.id,
    action: published ? "exam.published" : "exam.unpublished",
    entityType: "Exam",
    entityId: examId,
  });
}

// ── Marks ───────────────────────────────────────────────────────────────────

export type MarkEntry = { studentId: string; marksObtained: number | null; isAbsent: boolean };

/**
 * Save marks for an exam (only for students on the course roster). A blank, non-absent
 * entry clears the mark. Changes to a published exam are audit-logged per student.
 */
export async function saveMarks(examId: string, entries: MarkEntry[], user: CurrentUser) {
  const exam = await loadExam(examId, user);
  const roster = new Set((await courseRoster(exam.sectionId, exam.courseId)).map((s) => s.id));
  const errors: string[] = [];
  for (const e of entries) {
    if (!roster.has(e.studentId)) errors.push("A student isn't enrolled in this course.");
    if (
      !e.isAbsent &&
      e.marksObtained !== null &&
      (e.marksObtained < 0 || e.marksObtained > exam.maxMarks)
    ) {
      errors.push(`Marks must be between 0 and ${exam.maxMarks}.`);
    }
  }
  if (errors.length) throw new HttpError(400, "invalid_marks", [...new Set(errors)].join(" "));

  const existing = new Map(
    (await db.mark.findMany({ where: { examId } })).map((m) => [m.studentId, m]),
  );
  const changes: { studentId: string; from: string; to: string }[] = [];
  const describe = (m: { marksObtained: number | null; isAbsent: boolean } | undefined) =>
    !m ? "—" : m.isAbsent ? "AB" : m.marksObtained === null ? "—" : String(m.marksObtained);

  await db.$transaction(
    entries.map((e) => {
      const before = existing.get(e.studentId);
      const to = { marksObtained: e.isAbsent ? null : e.marksObtained, isAbsent: e.isAbsent };
      if (describe(before) !== describe(to))
        changes.push({ studentId: e.studentId, from: describe(before), to: describe(to) });
      return db.mark.upsert({
        where: { examId_studentId: { examId, studentId: e.studentId } },
        create: { examId, studentId: e.studentId, ...to, enteredById: user.id },
        update: { ...to, enteredById: user.id },
      });
    }),
  );

  if (exam.isPublished) {
    for (const c of changes) {
      await audit({
        actorId: user.id,
        action: "marks.edited",
        entityType: "Mark",
        entityId: `${examId}:${c.studentId}`,
        metadata: { exam: exam.name, from: c.from, to: c.to },
      });
    }
  }
  return { changed: changes.length };
}

/**
 * CSV with columns `roll_number` and `marks` ("AB" or "absent" for absent).
 * Validates every row against the roster before saving anything.
 */
export async function importMarksCsv(examId: string, csv: string, user: CurrentUser) {
  const exam = await loadExam(examId, user);
  const roster = await courseRoster(exam.sectionId, exam.courseId);
  const byRoll = new Map(roster.map((s) => [s.rollNumber.toUpperCase(), s.id]));
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    transform: (v) => v.trim(),
  });
  if (!parsed.meta.fields?.includes("roll_number") || !parsed.meta.fields.includes("marks")) {
    throw new HttpError(400, "invalid_csv", "The CSV needs `roll_number` and `marks` columns.");
  }

  const errors: string[] = [];
  const entries: MarkEntry[] = [];
  const seen = new Set<string>();
  parsed.data.forEach((row, i) => {
    const line = `Row ${i + 1}`;
    const studentId = byRoll.get((row.roll_number ?? "").toUpperCase());
    if (!studentId)
      return void errors.push(`${line}: ${row.roll_number || "(blank)"} isn't in this course`);
    if (seen.has(studentId)) return void errors.push(`${line}: ${row.roll_number} appears twice`);
    seen.add(studentId);
    const raw = (row.marks ?? "").toUpperCase();
    if (raw === "AB" || raw === "ABSENT")
      return void entries.push({ studentId, marksObtained: null, isAbsent: true });
    const value = Number(raw);
    if (raw === "" || !Number.isFinite(value) || value < 0 || value > exam.maxMarks) {
      return void errors.push(`${line}: marks must be 0–${exam.maxMarks} or AB`);
    }
    entries.push({ studentId, marksObtained: value, isAbsent: false });
  });
  if (errors.length) throw new HttpError(400, "invalid_csv", errors.slice(0, 8).join("; "));
  return saveMarks(examId, entries, user);
}

// ── Gradebook & results ─────────────────────────────────────────────────────

/** Everything a faculty member sees for one course-section. Callers must check access. */
export async function gradebook(sectionId: string, courseId: string) {
  const semesterId = await sectionTerm(sectionId);
  const [exams, roster, bands, results, course] = await Promise.all([
    db.exam.findMany({
      where: { sectionId, courseId, semesterId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: { marks: true },
    }),
    courseRoster(sectionId, courseId),
    defaultGradeBands(),
    db.courseResult.findMany({ where: { courseId, semesterId, student: { sectionId } } }),
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { credits: true } }),
  ]);

  const examInfo = exams.map((e) => ({ id: e.id, maxMarks: e.maxMarks, weightage: e.weightage }));
  const marksByStudent = new Map<
    string,
    { examId: string; marksObtained: number | null; isAbsent: boolean }[]
  >();
  for (const e of exams) {
    for (const m of e.marks) {
      const list = marksByStudent.get(m.studentId) ?? [];
      list.push({ examId: e.id, marksObtained: m.marksObtained, isAbsent: m.isAbsent });
      marksByStudent.set(m.studentId, list);
    }
  }
  const publishedResult = new Map(
    results.filter((r) => r.isPublished).map((r) => [r.studentId, r]),
  );

  const students = roster.map((s) => {
    const marks = marksByStudent.get(s.id) ?? [];
    const progress = courseProgress(examInfo, marks);
    const band = progress.percent !== null ? gradeFor(progress.percent, bands) : null;
    return {
      ...s,
      marks: new Map(marks.map((m) => [m.examId, m])),
      progress,
      grade: band?.letter ?? null,
      publishedGrade: publishedResult.get(s.id)?.gradeLetter ?? null,
    };
  });

  const totalWeight = exams.reduce((sum, e) => sum + e.weightage, 0);
  const graded = students.filter((s) => s.progress.percent !== null);
  return {
    semesterId,
    credits: course.credits,
    bands,
    totalWeight: round2(totalWeight),
    exams: exams.map((e) => {
      const values = e.marks.flatMap((m) =>
        m.isAbsent ? [0] : m.marksObtained !== null ? [m.marksObtained] : [],
      );
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        maxMarks: e.maxMarks,
        weightage: e.weightage,
        date: e.date,
        isPublished: e.isPublished,
        entered: e.marks.filter((m) => m.isAbsent || m.marksObtained !== null).length,
        stats: summarize(values),
      };
    }),
    students,
    stats: summarize(graded.map((s) => s.progress.percent!)),
    distribution: distribution(
      graded.flatMap((s) => (s.grade ? [s.grade] : [])),
      bands,
    ),
    allComplete: students.length > 0 && students.every((s) => s.progress.complete),
    resultsPublished: students.length > 0 && students.every((s) => s.publishedGrade !== null),
  };
}

/**
 * Snapshot final grades into CourseResult (published). Requires every exam to be marked
 * for every student and weightages to total 100%. Re-publishing updates the snapshot.
 */
export async function publishCourseResults(sectionId: string, courseId: string, user: CurrentUser) {
  await assertSectionAccess(user, sectionId, courseId);
  const book = await gradebook(sectionId, courseId);
  if (book.totalWeight !== 100) {
    throw new HttpError(
      400,
      "weightage",
      `Exam weightages add up to ${book.totalWeight}%, not 100%.`,
    );
  }
  if (!book.allComplete)
    throw new HttpError(400, "incomplete", "Enter every exam's marks for every student first.");

  await db.$transaction(
    book.students.map((s) => {
      const band = gradeFor(s.progress.percent!, book.bands);
      const data = {
        totalPercent: s.progress.percent!,
        gradeLetter: band.letter,
        gradePoint: band.gradePoint,
        // Attempted credits; whether they were earned follows from the grade band.
        credits: book.credits,
        isPublished: true,
      };
      return db.courseResult.upsert({
        where: {
          studentId_courseId_semesterId: { studentId: s.id, courseId, semesterId: book.semesterId },
        },
        create: { studentId: s.id, courseId, semesterId: book.semesterId, ...data },
        update: data,
      });
    }),
  );
  await audit({
    actorId: user.id,
    action: "results.published",
    entityType: "Course",
    entityId: courseId,
    metadata: { sectionId, students: book.students.length },
  });
}
