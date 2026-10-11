import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WeekNav({
  label,
  prev,
  next,
  isCurrent,
  basePath,
}: {
  label: string;
  prev: string;
  next: string;
  isCurrent: boolean;
  basePath: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`${basePath}?week=${prev}`} aria-label="Previous week">
          <ChevronLeftIcon />
        </Link>
      </Button>
      <span className="min-w-36 text-center text-sm font-medium tabular-nums">{label}</span>
      <Button asChild variant="outline" size="sm">
        <Link href={`${basePath}?week=${next}`} aria-label="Next week">
          <ChevronRightIcon />
        </Link>
      </Button>
      {!isCurrent && (
        <Button asChild variant="ghost" size="sm">
          <Link href={basePath}>This week</Link>
        </Button>
      )}
    </div>
  );
}
