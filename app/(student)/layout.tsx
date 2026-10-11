import { AppShell, type NavItem } from "@/components/layout/app-shell";

const nav: NavItem[] = [
  { href: "/student", label: "Home" },
  { href: "/student/attendance", label: "Attendance" },
  { href: "/student/timetable", label: "Timetable" },
  { href: "/student/results", label: "Results" },
  { href: "/student/profile", label: "Profile" },
];

export default function StudentLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell role="STUDENT" title="Student" nav={nav}>
      {children}
    </AppShell>
  );
}
