import Link from "next/link";
import { BellIcon } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/permissions";
import { requiredOnboardingPath } from "@/lib/auth/routing";
import { unreadCount } from "@/lib/services/notifications";

export async function UserMenu() {
  const session = await getCurrentUser();
  if (session.status !== "authenticated") return null;
  const { user } = session;
  const onboarded = !requiredOnboardingPath(user);
  const unread = onboarded ? await unreadCount(user.id) : 0;
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {onboarded && (
        <Button asChild variant="ghost" size="sm" className="relative">
          <Link
            href={`${ROLE_HOME[user.role]}/notifications`}
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            data-testid="bell"
          >
            <BellIcon />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </Button>
      )}
      <span className="hidden text-sm sm:inline">{user.name}</span>
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
