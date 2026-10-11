import { NavLinks } from "@/components/layout/nav-links";

export function CourseTabs({ sectionId, courseId }: { sectionId: string; courseId: string }) {
  const base = `/faculty/courses/${sectionId}/${courseId}`;
  return (
    <div className="border-b pb-2">
      <NavLinks
        label="Course"
        items={[
          { href: base, label: "Attendance" },
          { href: `${base}/marks`, label: "Marks & grades" },
        ]}
      />
    </div>
  );
}
