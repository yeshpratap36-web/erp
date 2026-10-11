import { AppShell, type NavItem } from "@/components/layout/app-shell";

const nav: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/faculty", label: "Faculty" },
  { href: "/admin/import", label: "Bulk import" },
  { href: "/admin/timetable", label: "Timetable" },
  { href: "/admin/academics", label: "Academics" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell role="SUPER_ADMIN" title="Admin" nav={nav}>
      {children}
    </AppShell>
  );
}
