import { apiRoute } from "@/lib/api";
import { permissionsFor } from "@/lib/permissions";

/** GET /api/me — the signed-in user's own profile and permissions. */
export const GET = apiRoute({ permission: "profile:read:own" }, async ({ user }) => ({
  id: user.id,
  loginId: user.loginId,
  name: user.name,
  email: user.email,
  role: user.role,
  permissions: permissionsFor(user.role),
}));
