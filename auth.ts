import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { authenticate, type LoginFailure } from "@/lib/auth/login";
import { db } from "@/lib/db";
import { clientIpFrom } from "@/lib/request";
import { loginSchema } from "@/lib/validators/auth";

class LoginError extends CredentialsSignin {
  constructor(reason: LoginFailure) {
    super();
    this.code = reason;
  }
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {} },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) throw new LoginError("invalid_credentials");

        const result = await authenticate(parsed.data, {
          ipAddress: clientIpFrom(request.headers),
          userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
        });
        if (!result.ok) throw new LoginError(result.reason);
        return result.user;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      // trigger "update" comes from unstable_update() on the server OR a client POST to
      // /api/auth/session, so only ever refresh claims from the DB — never from params.session —
      // and never let it revive a revoked session (sessionVersion mismatch → sign out).
      if (params.trigger === "update" && token.sub) {
        const user = await db.user.findUnique({
          where: { id: token.sub },
          select: {
            role: true,
            mustChangePassword: true,
            onboardingStep: true,
            sessionVersion: true,
            isActive: true,
            deletedAt: true,
          },
        });
        if (
          !user ||
          !user.isActive ||
          user.deletedAt ||
          user.sessionVersion !== token.sessionVersion
        ) {
          return null;
        }
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        token.onboardingStep = user.onboardingStep;
      }
      return token;
    },
  },
});
