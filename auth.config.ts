import type { NextAuthConfig } from "next-auth";

/**
 * DB-free Auth.js config shared by proxy.ts and auth.ts. The proxy only needs to
 * decode the JWT; anything that touches the database lives in auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // 12h
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // Initial sign-in: copy claims from authorize()'s return value.
        token.sub = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        token.onboardingStep = user.onboardingStep;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (!token.sub) throw new Error("JWT is missing its subject");
      session.user = {
        ...session.user,
        id: token.sub,
        role: token.role,
        mustChangePassword: token.mustChangePassword,
        onboardingStep: token.onboardingStep,
        sessionVersion: token.sessionVersion,
      };
      return session;
    },
  },
} satisfies NextAuthConfig;
