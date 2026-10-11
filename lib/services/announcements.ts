import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ROLE_HOME } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { notify } from "@/lib/services/notifications";
import type { announcementSchema } from "@/lib/validators/communication";

type AnnouncementInput = z.output<typeof announcementSchema>;

/** Sections a faculty member teaches this term (their only allowed announcement targets). */
export async function facultySectionIds(facultyProfileId: string) {
  const rows = await db.facultyAssignment.findMany({
    where: { facultyId: facultyProfileId },
    select: { sectionId: true },
    distinct: ["sectionId"],
  });
  return rows.map((r) => r.sectionId);
}

/** DB filter equivalent of rules.isVisibleTo for the current user. */
async function visibilityFilter(user: CurrentUser): Promise<Prisma.AnnouncementWhereInput> {
  const now = new Date();
  const live: Prisma.AnnouncementWhereInput = {
    publishedAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  if (user.role === "SUPER_ADMIN") return live;

  let departmentId: string | null = null;
  let sectionIds: string[] = [];
  if (user.role === "STUDENT" && user.studentProfile) {
    const p = await db.studentProfile.findUniqueOrThrow({
      where: { id: user.studentProfile.id },
      select: { sectionId: true, program: { select: { departmentId: true } } },
    });
    departmentId = p.program.departmentId;
    sectionIds = p.sectionId ? [p.sectionId] : [];
  } else if (user.role === "FACULTY" && user.facultyProfile) {
    departmentId = user.facultyProfile.departmentId;
    sectionIds = await facultySectionIds(user.facultyProfile.id);
  }
  return {
    AND: [
      live,
      {
        OR: [
          { audience: "ALL" },
          { audience: "ROLE", targetRole: user.role },
          ...(departmentId ? [{ audience: "DEPARTMENT" as const, departmentId }] : []),
          ...(sectionIds.length
            ? [{ audience: "SECTION" as const, sectionId: { in: sectionIds } }]
            : []),
          // Authors always see their own posts.
          { authorId: user.id },
        ],
      },
    ],
  };
}

export async function announcementFeed(
  user: CurrentUser,
  { skip, take }: { skip: number; take: number },
) {
  const where = await visibilityFilter(user);
  const [rows, total] = await Promise.all([
    db.announcement.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip,
      take,
      include: {
        author: { select: { name: true, role: true } },
        department: { select: { code: true } },
        section: { select: { name: true, semesterNo: true, program: { select: { code: true } } } },
      },
    }),
    db.announcement.count({ where }),
  ]);
  return { rows, total };
}

/** Who receives the notification for an announcement (author excluded). */
async function recipientIds(a: AnnouncementInput, authorId: string) {
  const active = {
    isActive: true,
    deletedAt: null,
    id: { not: authorId },
  } satisfies Prisma.UserWhereInput;
  let where: Prisma.UserWhereInput;
  switch (a.audience) {
    case "ALL":
      where = active;
      break;
    case "ROLE":
      where = { ...active, role: a.targetRole! };
      break;
    case "DEPARTMENT":
      where = {
        ...active,
        OR: [
          { studentProfile: { program: { departmentId: a.departmentId! } } },
          { facultyProfile: { departmentId: a.departmentId! } },
        ],
      };
      break;
    case "SECTION":
      where = { ...active, studentProfile: { sectionId: a.sectionId! } };
      break;
  }
  return await db.user.findMany({ where, select: { id: true, role: true } });
}

/** Admins may post to any audience; faculty only to sections they teach. */
export async function postAnnouncement(input: AnnouncementInput, user: CurrentUser) {
  if (user.role === "FACULTY") {
    const mine = await facultySectionIds(user.facultyProfile!.id);
    if (input.audience !== "SECTION" || !input.sectionId || !mine.includes(input.sectionId))
      throw forbidden("Faculty can post only to their own sections.");
  } else if (user.role !== "SUPER_ADMIN") {
    throw forbidden();
  }
  const announcement = await db.announcement.create({
    data: {
      authorId: user.id,
      title: input.title,
      body: input.body,
      audience: input.audience,
      targetRole: input.audience === "ROLE" ? input.targetRole : null,
      departmentId: input.audience === "DEPARTMENT" ? input.departmentId : null,
      sectionId: input.audience === "SECTION" ? input.sectionId : null,
      expiresAt: input.expiresAt,
    },
  });
  // Each recipient's link points into their own role area.
  const recipients = await recipientIds(input, user.id);
  for (const role of ["SUPER_ADMIN", "FACULTY", "STUDENT"] as const) {
    await notify(
      recipients.filter((r) => r.role === role).map((r) => r.id),
      {
        type: "ANNOUNCEMENT",
        title: input.title,
        body: input.body.slice(0, 200),
        link: `${ROLE_HOME[role]}/announcements`,
      },
    );
  }
  return announcement;
}

/** Authors (and admins) can remove an announcement. */
export async function deleteAnnouncement(id: string, user: CurrentUser) {
  const a = await db.announcement.findUnique({ where: { id } });
  if (!a) throw notFound("Announcement not found");
  if (user.role !== "SUPER_ADMIN" && a.authorId !== user.id) throw forbidden();
  await db.announcement.delete({ where: { id } });
}
