import "server-only";
import { courseProgress, creditsEarned, gpa, type GradeBandInfo } from "@/lib/academics/grading";
import { db } from "@/lib/db";
import { defaultGradeBands } from "@/lib/services/exams";

const isPassFor = (bands: GradeBandInfo[]) => {
  const byLetter = new Map(bands.map((b) => [b.letter, b.isPass]));
  return (letter: string, gradePoint: number) => byLetter.get(letter) ?? gradePoint > 0;
};

/**
 * A student's own results (callers pass their own studentId):
 * - current term: marks of *published* exams and the running percentage per course
 * - published course results per term with SGPA, and CGPA across all terms
 */
export async function studentResults(studentId: string) {
  const [bands, enrollments, results] = await Promise.all([
    defaultGradeBands(),
    db.enrollment.findMany({
      where: { studentId, section: { semester: { isCurrent: true } } },
      orderBy: { course: { code: "asc" } },
      select: {
        sectionId: true,
        course: { select: { id: true, code: true, name: true, credits: true } },
      },
    }),
    db.courseResult.findMany({
      where: { studentId, isPublished: true },
      include: {
        course: { select: { code: true, name: true } },
        semester: { select: { id: true, name: true, startDate: true } },
      },
      orderBy: { course: { code: "asc" } },
    }),
  ]);

  const exams = await db.exam.findMany({
    where: {
      isPublished: true,
      OR: enrollments.map((e) => ({ sectionId: e.sectionId, courseId: e.course.id })),
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      maxMarks: true,
      weightage: true,
      date: true,
      courseId: true,
      marks: { where: { studentId }, select: { marksObtained: true, isAbsent: true } },
    },
  });

  const current = enrollments.map((e) => {
    const courseExams = exams.filter((x) => x.courseId === e.course.id);
    const marks = courseExams.flatMap((x) =>
      x.marks.map((m) => ({ examId: x.id, marksObtained: m.marksObtained, isAbsent: m.isAbsent })),
    );
    return {
      ...e.course,
      exams: courseExams.map(({ marks: m, ...x }) => ({ ...x, mark: m[0] ?? null })),
      progress: courseProgress(courseExams, marks),
    };
  });

  const pass = isPassFor(bands);
  const byTerm = new Map<
    string,
    { term: { id: string; name: string; startDate: Date }; courses: typeof results }
  >();
  for (const r of results) {
    const entry = byTerm.get(r.semesterId) ?? { term: r.semester, courses: [] };
    entry.courses.push(r);
    byTerm.set(r.semesterId, entry);
  }
  const terms = [...byTerm.values()]
    .sort((a, b) => a.term.startDate.getTime() - b.term.startDate.getTime())
    .map(({ term, courses }) => {
      const grades = courses.map((c) => ({
        credits: c.credits,
        gradePoint: c.gradePoint,
        isPass: pass(c.gradeLetter, c.gradePoint),
      }));
      return {
        term,
        sgpa: gpa(grades),
        creditsAttempted: grades.reduce((s, g) => s + g.credits, 0),
        creditsEarned: creditsEarned(grades),
        courses: courses.map((c) => ({
          code: c.course.code,
          name: c.course.name,
          credits: c.credits,
          totalPercent: c.totalPercent,
          gradeLetter: c.gradeLetter,
          gradePoint: c.gradePoint,
          isPass: pass(c.gradeLetter, c.gradePoint),
        })),
      };
    });
  const all = results.map((c) => ({
    credits: c.credits,
    gradePoint: c.gradePoint,
    isPass: pass(c.gradeLetter, c.gradePoint),
  }));
  return { current, terms, cgpa: gpa(all), creditsEarned: creditsEarned(all) };
}
