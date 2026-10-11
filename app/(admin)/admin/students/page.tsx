import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { DataTable } from "@/components/admin/data-table";
import { Pagination, SearchForm } from "@/components/admin/list-controls";
import { PageHeader } from "@/components/admin/page-header";
import { AccountStatusBadges } from "@/components/admin/status-badges";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Prisma } from "@/generated/prisma/client";
import { currentSectionOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listQuerySchema, PAGE_SIZE } from "@/lib/validators/common";

export const metadata: Metadata = { title: "Students" };

const STATUSES = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
  locked: "Locked",
  pending: "Awaiting first login",
};

const querySchema = listQuerySchema.extend({
  sectionId: z.string().max(40).optional().catch(undefined),
  status: z
    .enum(Object.keys(STATUSES) as [keyof typeof STATUSES])
    .catch("all")
    .default("all"),
});

export default async function StudentsPage({ searchParams }: PageProps<"/admin/students">) {
  await requirePermission("users:manage");
  const { q, page, sectionId, status } = querySchema.parse(await searchParams);

  const now = new Date();
  const statusWhere: Record<keyof typeof STATUSES, Prisma.UserWhereInput> = {
    all: {},
    active: { isActive: true },
    inactive: { isActive: false },
    locked: { lockedUntil: { gt: now } },
    pending: { isActive: true, mustChangePassword: true },
  };
  const where: Prisma.UserWhereInput = {
    role: "STUDENT",
    deletedAt: null,
    ...statusWhere[status],
    ...(sectionId ? { studentProfile: { sectionId } } : {}),
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

  const [students, total, sections] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { loginId: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        loginId: true,
        name: true,
        isActive: true,
        lockedUntil: true,
        mustChangePassword: true,
        studentProfile: {
          select: {
            section: {
              select: { name: true, semesterNo: true, program: { select: { code: true } } },
            },
          },
        },
      },
    }),
    db.user.count({ where }),
    currentSectionOptions(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Students"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/import">Bulk import</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/students/new">Add student</Link>
            </Button>
          </>
        }
      />
      <SearchForm q={q} placeholder="Search name, roll number or email">
        <NativeSelect name="sectionId" defaultValue={sectionId ?? ""} aria-label="Section">
          <NativeSelectOption value="">All sections</NativeSelectOption>
          {sections.map((s) => (
            <NativeSelectOption key={s.value} value={s.value}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status} aria-label="Status">
          {Object.entries(STATUSES).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </SearchForm>
      <DataTable
        rows={students}
        rowKey={(s) => s.id}
        empty={
          q || sectionId || status !== "all"
            ? "No students match these filters."
            : "No students yet."
        }
        columns={[
          {
            header: "Roll no.",
            cell: (s) => (
              <Link
                href={`/admin/students/${s.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {s.loginId}
              </Link>
            ),
          },
          { header: "Name", cell: (s) => s.name },
          {
            header: "Section",
            cell: (s) => {
              const sec = s.studentProfile?.section;
              return sec ? `${sec.program.code} · ${sec.semesterNo}${sec.name}` : "—";
            },
            hideOnMobile: true,
          },
          { header: "Status", cell: (s) => <AccountStatusBadges {...s} />, hideOnMobile: true },
        ]}
      />
      <Pagination
        page={page}
        total={total}
        params={{ q, sectionId, status: status === "all" ? undefined : status }}
      />
    </div>
  );
}
