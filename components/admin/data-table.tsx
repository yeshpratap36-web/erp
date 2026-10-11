import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type Column<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Hide on small screens to keep tables readable on phones. */
  hideOnMobile?: boolean;
  className?: string;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  empty: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  const mobile = (c: Column<T>) => (c.hideOnMobile ? "hidden md:table-cell" : "");
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.header} className={`${mobile(c)} ${c.className ?? ""}`}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((c) => (
                <TableCell key={c.header} className={`${mobile(c)} ${c.className ?? ""}`}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
