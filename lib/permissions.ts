/**
 * Single source of truth for role-based permissions.
 *
 * `can()` answers "may this role perform this kind of action at all?".
 * Row-level scoping (a student's own data, a faculty member's assigned sections)
 * is enforced separately in lib/auth/scope.ts and in every DB query.
 *
 * Pure module — no server-only imports — so it can be unit-tested and used in UI
 * to hide controls. UI checks are cosmetic; the server always re-checks.
 */
import type { Role } from "@/generated/prisma/enums";

export const ACTIONS = [
  // Own account
  "profile:read:own",
  "password:change:own",

  // People & accounts
  "users:manage", // create/update/deactivate/unlock/reset password, CSV import
  "students:read:any",
  "students:read:assigned", // students in sections the faculty teaches

  // Academic structure
  "academics:manage", // departments, programs, years, semesters, courses, sections, rooms, enrollment, assignments
  "academics:read",

  // Timetable
  "timetable:manage", // institution-wide timetable builder
  "timetable:propose:assigned", // faculty: extra classes, cancellations, changes for own sections
  "timetable:read:own",

  // Attendance
  "attendance:take:assigned",
  "attendance:read:assigned",
  "attendance:read:any",
  "attendance:read:own",
  "attendance:override:any",

  // Face data — enrollment of one's own face only; nobody can read embeddings/photos via the API.
  "face:enroll:own",
  "face:reenroll:allow", // grant a student permission to re-enroll

  // Marks & results
  "marks:enter:assigned",
  "marks:read:assigned",
  "marks:read:any",
  "marks:edit:any",
  "results:read:own",

  // Requests
  "requests:create:own",
  "requests:review:assigned",
  "requests:review:any",

  // Communication
  "announcements:post:assigned",
  "announcements:post:any",
  "announcements:read",

  // Administration
  "analytics:read:any",
  "settings:manage",
  "audit:read",
] as const;

export type Action = (typeof ACTIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Action[]> = {
  SUPER_ADMIN: ACTIONS.filter(
    // Admins don't have their own face/attendance/results/requests — those are student-only.
    (a) =>
      ![
        "face:enroll:own",
        "attendance:read:own",
        "results:read:own",
        "requests:create:own",
        "timetable:read:own",
      ].includes(a),
  ),
  FACULTY: [
    "profile:read:own",
    "password:change:own",
    "students:read:assigned",
    "academics:read",
    "timetable:propose:assigned",
    "timetable:read:own",
    "attendance:take:assigned",
    "attendance:read:assigned",
    "face:reenroll:allow",
    "marks:enter:assigned",
    "marks:read:assigned",
    "requests:review:assigned",
    "announcements:post:assigned",
    "announcements:read",
  ],
  STUDENT: [
    "profile:read:own",
    "password:change:own",
    "timetable:read:own",
    "attendance:read:own",
    "face:enroll:own",
    "results:read:own",
    "requests:create:own",
    "announcements:read",
  ],
};

const PERMISSION_SETS: Record<Role, ReadonlySet<Action>> = {
  SUPER_ADMIN: new Set(ROLE_PERMISSIONS.SUPER_ADMIN),
  FACULTY: new Set(ROLE_PERMISSIONS.FACULTY),
  STUDENT: new Set(ROLE_PERMISSIONS.STUDENT),
};

export function can(user: { role: Role } | null | undefined, action: Action): boolean {
  return !!user && PERMISSION_SETS[user.role].has(action);
}

export function permissionsFor(role: Role): readonly Action[] {
  return ROLE_PERMISSIONS[role];
}

/** Landing page for each role after login/onboarding. */
export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  FACULTY: "/faculty",
  STUDENT: "/student",
};
