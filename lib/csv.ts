/**
 * Minimal CSV writer for exports. Cells that start with = + - @ (or tab/CR) are prefixed
 * with a quote so spreadsheets don't execute them as formulas (CSV injection).
 */
export function toCsv(
  rows: Record<string, string | number | null | undefined>[],
  headers?: string[],
) {
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const escape = (value: unknown) => {
    let s = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    cols.map(escape).join(","),
    ...rows.map((r) => cols.map((c) => escape(r[c])).join(",")),
  ].join("\r\n");
}
