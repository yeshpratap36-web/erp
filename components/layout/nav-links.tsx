"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

type Props = { items: NavItem[]; label: string; exactFirst?: boolean };

/**
 * Horizontal, scrollable nav (works on phones). The pathname is request-time data on
 * dynamic routes, so the links prerender unhighlighted and the active state streams in.
 */
export function NavLinks(props: Props) {
  return (
    <Suspense fallback={<NavList {...props} isActive={() => false} />}>
      <ActiveNavLinks {...props} />
    </Suspense>
  );
}

function ActiveNavLinks({ exactFirst = true, ...props }: Props) {
  const pathname = usePathname();
  return (
    <NavList
      {...props}
      isActive={(href, i) =>
        exactFirst && i === 0
          ? pathname === href
          : pathname === href || pathname.startsWith(href + "/")
      }
    />
  );
}

function NavList({
  items,
  label,
  isActive,
}: Props & { isActive: (href: string, index: number) => boolean }) {
  return (
    <nav aria-label={label} className="overflow-x-auto">
      <ul className="flex gap-1 text-sm">
        {items.map((item, i) => {
          const active = isActive(item.href, i);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-1.5 whitespace-nowrap",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
