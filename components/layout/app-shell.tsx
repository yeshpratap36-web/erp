import Link from "next/link";
import { Suspense } from "react";
import { RoleGate } from "@/components/auth/role-gate";
import { UserMenu } from "@/components/layout/user-menu";
import type { Role } from "@/generated/prisma/enums";

export type NavItem = { href: string; label: string };

/**
 * Shell for signed-in areas. The header/nav prerender as a static shell; everything that
 * reads the session (user menu, gated page content) streams in behind Suspense.
 */
export function AppShell({
  role,
  title,
  nav,
  children,
}: {
  role: Role;
  title: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href={nav[0]?.href ?? "/"} className="font-semibold whitespace-nowrap">
            College ERP <span className="font-normal text-muted-foreground">· {title}</span>
          </Link>
          <div className="ml-auto">
            <Suspense fallback={<div className="h-8 w-24 animate-pulse rounded-md bg-muted" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
        {nav.length > 1 && (
          <nav className="mx-auto max-w-6xl overflow-x-auto px-4" aria-label="Main">
            <ul className="flex gap-1 pb-2 text-sm">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Suspense fallback={<PageSkeleton />}>
          <RoleGate roles={[role]}>{children}</RoleGate>
        </Suspense>
      </main>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-32 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
