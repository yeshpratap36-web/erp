import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

export async function UserMenu() {
  const session = await getCurrentUser();
  if (session.status !== "authenticated") return null;
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm sm:inline">{session.user.name}</span>
      <Button asChild variant="ghost" size="sm">
        <Link href="/change-password">Password</Link>
      </Button>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
