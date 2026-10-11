import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField } from "@/components/forms/field";
import { RoomType } from "@/generated/prisma/enums";
import { enumOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deleteRoom, updateRoom } from "../../actions";

export const metadata: Metadata = { title: "Edit room" };

export default async function RoomPage({ params }: PageProps<"/admin/academics/rooms/[id]">) {
  await requirePermission("academics:manage");
  const { id } = await params;
  const room = await db.room.findUnique({ where: { id } });
  if (!room) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={room.name} back={{ href: "/admin/academics/rooms", label: "Rooms" }} />
      <Section title="Details">
        <ActionForm action={updateRoom} className="sm:grid-cols-2">
          <input type="hidden" name="id" value={room.id} />
          <Field name="code" label="Code" defaultValue={room.code} required />
          <Field name="name" label="Name" defaultValue={room.name} required />
          <Field name="building" label="Building (optional)" defaultValue={room.building ?? ""} />
          <Field
            name="capacity"
            label="Capacity"
            type="number"
            min={1}
            defaultValue={String(room.capacity)}
            required
          />
          <SelectField
            name="type"
            label="Type"
            options={enumOptions(RoomType)}
            defaultValue={room.type}
          />
        </ActionForm>
      </Section>
      <Section title="Delete" description="Only possible when no timetable slots use this room.">
        <ConfirmAction
          action={deleteRoom}
          fields={{ id: room.id }}
          label="Delete room"
          variant="destructive"
          confirm={`Delete ${room.code}? This cannot be undone.`}
        />
      </Section>
    </div>
  );
}
