import { AppShell, type NavItem } from "@/components/layout/app-shell";

const nav: NavItem[] = [{ href: "/student", label: "Dashboard" }];

export default function StudentLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell role="STUDENT" title="Student" nav={nav}>
      {children}
    </AppShell>
  );
}
