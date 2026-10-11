import type { OnboardingStep, Role } from "@/generated/prisma/enums";

type SessionClaims = {
  role: Role;
  mustChangePassword: boolean;
  onboardingStep: OnboardingStep;
  sessionVersion: number;
};

declare module "next-auth" {
  interface User extends SessionClaims {
    id: string;
  }
  interface Session {
    user: SessionClaims & { id: string; name: string; email: string };
  }
}

// next-auth/jwt re-exports from @auth/core/jwt; augmentation must target the source module.
declare module "@auth/core/jwt" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface JWT extends SessionClaims {}
}
