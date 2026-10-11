import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { RoomType } from "@/generated/prisma/enums";
import { enumOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createRoom } from "../actions";

export const metadata: Metadata = { title: "Rooms" };

export default async function RoomsPage() {
  await requirePermission("academics:manage");
  const rooms = await db.room.findMany({ orderBy: { code: "asc" } });

  return (
    <div className="space-y-6">
      <PageHeader title="Rooms" />
      <DataTable
        rows={rooms}
        rowKey={(r) => r.id}
        empty="No rooms yet."
        columns={[
          {
            header: "Code",
            cell: (r) => (
              <Link
                href={`/admin/academics/rooms/${r.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {r.code}
              </Link>
            ),
          },
          { header: "Name", cell: (r) => r.name },
          { header: "Building", cell: (r) => r.building ?? "—", hideOnMobile: true },
          { header: "Capacity", cell: (r) => r.capacity },
          {
            header: "Type",
            cell: (r) => r.type.toLowerCase().replace("_", " "),
            hideOnMobile: true,
          },
        ]}
      />
      <Section title="Add room">
        <ActionForm action={createRoom} submitLabel="Add room" className="sm:grid-cols-2">
          <Field name="code" label="Code" placeholder="LH-103" required />
          <Field name="name" label="Name" placeholder="Lecture Hall 103" required />
          <Field name="building" label="Building (optional)" />
          <Field
            name="capacity"
            label="Capacity"
            type="number"
            min={1}
            defaultValue="60"
            required
          />
          <SelectField
            name="type"
            label="Type"
            options={enumOptions(RoomType)}
            defaultValue="CLASSROOM"
          />
        </ActionForm>
      </Section>
    </div>
  );
}
