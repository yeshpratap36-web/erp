import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { IMPORT_COLUMNS } from "@/lib/import/user-csv";
import { requirePermission } from "@/lib/auth/session";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Bulk import" };

export default async function ImportPage() {
  await requirePermission("users:manage");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk import"
        description="Create many student or faculty accounts from a CSV. Nothing is saved until you confirm the preview."
      />
      <ImportWizard columns={IMPORT_COLUMNS} />
    </div>
  );
}
