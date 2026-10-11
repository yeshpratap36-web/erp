import { describe, expect, it } from "vitest";
import { ACTIONS, can, permissionsFor } from "@/lib/permissions";

const admin = { role: "SUPER_ADMIN" as const };
const faculty = { role: "FACULTY" as const };
const student = { role: "STUDENT" as const };

describe("can()", () => {
  it("denies everything to anonymous users", () => {
    for (const action of ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });

  it("lets only admins manage users, settings, academics and read the audit log", () => {
    for (const action of [
      "users:manage",
      "settings:manage",
      "academics:manage",
      "audit:read",
    ] as const) {
      expect(can(admin, action)).toBe(true);
      expect(can(faculty, action)).toBe(false);
      expect(can(student, action)).toBe(false);
    }
  });

  it("gives faculty only assigned-scope actions, never *:any", () => {
    for (const action of permissionsFor("FACULTY")) {
      expect(action.endsWith(":any")).toBe(false);
    }
    expect(can(faculty, "attendance:take:assigned")).toBe(true);
    expect(can(faculty, "marks:enter:assigned")).toBe(true);
  });

  it("gives students only own-scope or read actions", () => {
    for (const action of permissionsFor("STUDENT")) {
      expect(action.endsWith(":own") || action === "announcements:read").toBe(true);
    }
    expect(can(student, "attendance:take:assigned")).toBe(false);
    expect(can(student, "marks:enter:assigned")).toBe(false);
  });

  it("does not let admins enroll faces (student-only)", () => {
    expect(can(admin, "face:enroll:own")).toBe(false);
    expect(can(student, "face:enroll:own")).toBe(true);
  });
});
