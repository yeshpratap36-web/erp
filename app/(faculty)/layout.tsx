import { AppShell, type NavItem } from "@/components/layout/app-shell";

const nav: NavItem[] = [{ href: "/faculty", label: "Dashboard" }];

export default function FacultyLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell role="FACULTY" title="Faculty" nav={nav}>
      {children}
    </AppShell>
  );
}
