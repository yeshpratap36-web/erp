import { NavLinks } from "@/components/layout/nav-links";

const items = [
  { href: "/admin/academics", label: "Overview" },
  { href: "/admin/academics/departments", label: "Departments" },
  { href: "/admin/academics/programs", label: "Programs" },
  { href: "/admin/academics/years", label: "Years & terms" },
  { href: "/admin/academics/courses", label: "Courses" },
  { href: "/admin/academics/sections", label: "Sections" },
  { href: "/admin/academics/rooms", label: "Rooms" },
];

export default function AcademicsLayout({ children }: LayoutProps<"/admin/academics">) {
  return (
    <div className="space-y-6">
      <div className="border-b pb-2">
        <NavLinks items={items} label="Academics" />
      </div>
      {children}
    </div>
  );
}
