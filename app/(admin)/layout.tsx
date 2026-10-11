import { AppShell, type NavItem } from "@/components/layout/app-shell";

const nav: NavItem[] = [{ href: "/admin", label: "Dashboard" }];

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell role="SUPER_ADMIN" title="Admin" nav={nav}>
      {children}
    </AppShell>
  );
}
