import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAGE_SIZE } from "@/lib/validators/common";

/** GET search form — works without JavaScript and keeps the URL shareable. */
export function SearchForm({
  q,
  placeholder,
  children,
}: {
  q?: string;
  placeholder: string;
  /** Extra filters (e.g. a <select name="sectionId">). */
  children?: React.ReactNode;
}) {
  return (
    <form method="get" className="flex flex-wrap gap-2" role="search">
      <div className="relative min-w-48 flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="pl-8"
          aria-label="Search"
        />
      </div>
      {children}
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}

export function Pagination({
  page,
  total,
  params,
}: {
  page: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `?${s}` : "?";
  };
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" aria-disabled={page <= 1}>
          <Link href={href(page - 1)} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
            Previous
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" aria-disabled={page >= pages}>
          <Link
            href={href(page + 1)}
            className={page >= pages ? "pointer-events-none opacity-50" : ""}
          >
            Next
          </Link>
        </Button>
      </div>
    </div>
  );
}
