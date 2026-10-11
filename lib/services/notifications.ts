import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sectionCourseRoster } from "@/lib/services/attendance-stats";

type NotificationInput = {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
};

/** In-app notifications for many users at once. Never fails the caller's action. */
export async function notify(userIds: string[], n: NotificationInput) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  try {
    await db.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        link: n.link ?? null,
      })),
    });
  } catch (err) {
    console.error("Failed to create notifications", n.type, err);
  }
}

/** User ids of active students enrolled in a section's course. */
export async function enrolledUserIds(sectionId: string, courseId: string) {
  const rows = await db.enrollment.findMany({
    where: { sectionId, courseId, student: { deletedAt: null, user: { isActive: true } } },
    select: { student: { select: { userId: true } } },
  });
  return rows.map((r) => r.student.userId);
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(
  userId: string,
  { skip, take }: { skip: number; take: number },
) {
  const [rows, total] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip, take }),
    db.notification.count({ where: { userId } }),
  ]);
  return { rows, total };
}

/** Mark one (own) notification read; returns its link. */
export async function markRead(user: CurrentUser, notificationId: string) {
  const n = await db.notification.findFirst({ where: { id: notificationId, userId: user.id } });
  if (!n) return null;
  if (!n.readAt)
    await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  return n.link;
}

export async function markAllRead(user: CurrentUser) {
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
}

/**
 * After attendance is confirmed: warn students now below the threshold in that course,
 * at most once a week per course.
 */
export async function warnLowAttendance(sectionId: string, courseId: string) {
  const [roster, course, profiles] = await Promise.all([
    sectionCourseRoster(sectionId, courseId),
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { code: true } }),
    db.enrollment.findMany({
      where: { sectionId, courseId },
      select: { student: { select: { id: true, userId: true } } },
    }),
  ]);
  const userOf = new Map(profiles.map((p) => [p.student.id, p.student.userId]));
  const low = roster.students
    .filter((s) => s.belowThreshold)
    .map((s) => ({ ...s, userId: userOf.get(s.id)! }));
  if (low.length === 0) return;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const recent = new Set(
    (
      await db.notification.findMany({
        where: {
          userId: { in: low.map((s) => s.userId) },
          type: "ATTENDANCE_WARNING",
          title: { contains: course.code },
          createdAt: { gte: weekAgo },
        },
        select: { userId: true },
      })
    ).map((n) => n.userId),
  );
  for (const s of low.filter((s) => !recent.has(s.userId))) {
    await notify([s.userId], {
      type: "ATTENDANCE_WARNING",
      title: `${course.code} attendance is ${s.percent}% (below ${roster.threshold}%)`,
      body: `Attend the next ${s.needed} ${course.code} classes to get back to ${roster.threshold}%.`,
      link: "/student/attendance",
    });
  }
}
