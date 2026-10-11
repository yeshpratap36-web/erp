import { Badge } from "@/components/ui/badge";

export function AccountStatusBadges({
  isActive,
  lockedUntil,
  mustChangePassword,
}: {
  isActive: boolean;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
}) {
  const locked = lockedUntil !== null && lockedUntil > new Date();
  return (
    <span className="inline-flex flex-wrap gap-1">
      {isActive ? (
        <Badge variant="secondary">Active</Badge>
      ) : (
        <Badge variant="destructive">Inactive</Badge>
      )}
      {locked && <Badge variant="destructive">Locked</Badge>}
      {mustChangePassword && <Badge variant="outline">Temp password</Badge>}
    </span>
  );
}
