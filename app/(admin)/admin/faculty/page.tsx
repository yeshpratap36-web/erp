import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { Pagination, SearchForm } from "@/components/admin/list-controls";
import { PageHeader } from "@/components/admin/page-header";
import { AccountStatusBadges } from "@/components/admin/status-badges";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listQuerySchema, PAGE_SIZE } from "@/lib/validators/common";

export const metadata: Metadata = { title: "Faculty" };

export default async function FacultyListPage({ searchParams }: PageProps<"/admin/faculty">) {
  await requirePermission("users:manage");
  const { q, page } = listQuerySchema.parse(await searchParams);

  const where: Prisma.UserWhereInput = {
    role: "FACULTY",
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { loginId: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [faculty, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        loginId: true,
        name: true,
        isActive: true,
        lockedUntil: true,
        mustChangePassword: true,
        facultyProfile: {
          select: {
            designation: true,
            department: { select: { code: true } },
            _count: { select: { assignments: true } },
          },
        },
      },
    }),
    db.user.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Faculty"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/import">Bulk import</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/faculty/new">Add faculty</Link>
            </Button>
          </>
        }
      />
      <SearchForm q={q} placeholder="Search name, employee ID or email" />
      <DataTable
        rows={faculty}
        rowKey={(f) => f.id}
        empty={q ? "No faculty match this search." : "No faculty yet."}
        columns={[
          {
            header: "Employee ID",
            cell: (f) => (
              <Link
                href={`/admin/faculty/${f.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {f.loginId}
              </Link>
            ),
          },
          { header: "Name", cell: (f) => f.name },
          {
            header: "Department",
            cell: (f) => f.facultyProfile?.department.code ?? "—",
            hideOnMobile: true,
          },
          {
            header: "Courses",
            cell: (f) => f.facultyProfile?._count.assignments ?? 0,
            hideOnMobile: true,
          },
          { header: "Status", cell: (f) => <AccountStatusBadges {...f} />, hideOnMobile: true },
        ]}
      />
      <Pagination page={page} total={total} params={{ q }} />
    </div>
  );
}
