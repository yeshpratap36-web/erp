import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<Card className="h-96 animate-pulse" />}>
      <ChangePasswordCard />
    </Suspense>
  );
}

async function ChangePasswordCard() {
  const user = await requireSession();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {user.mustChangePassword ? "Set a new password" : "Change password"}
        </CardTitle>
        <CardDescription>
          {user.mustChangePassword
            ? `Welcome, ${user.name}. Replace your temporary password to continue.`
            : "You'll be signed out on your other devices."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm />
      </CardContent>
    </Card>
  );
}
