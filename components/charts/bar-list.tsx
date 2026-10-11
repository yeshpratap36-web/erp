import { ChartTable } from "@/components/charts/table-view";

/**
 * Horizontal single-series bars with the value at the tip (e.g. department comparison).
 * One measure per chart — two measures get two charts, never a second axis.
 */
export function BarList({
  title,
  data,
  max = 100,
  format = (v: number) => `${v}%`,
  reference,
}: {
  title: string;
  data: { label: string; value: number | null }[];
  max?: number;
  format?: (v: number) => string;
  /** Optional reference mark (e.g. the attendance threshold). */
  reference?: { value: number; label: string };
}) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <ul className="space-y-2">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-sm">
            <span className="truncate text-muted-foreground">{d.label}</span>
            <div
              className="relative flex h-6 items-center"
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${d.value === null ? "no data" : format(d.value)}`}
              title={`${d.label}: ${d.value === null ? "no data" : format(d.value)}`}
            >
              {reference && (
                <div
                  className="absolute top-0 bottom-0 border-l"
                  style={{
                    left: `${(reference.value / max) * 100}%`,
                    borderColor: "var(--viz-muted)",
                  }}
                  aria-hidden
                />
              )}
              {d.value === null ? (
                <span className="text-xs text-muted-foreground">No data</span>
              ) : (
                <>
                  <div
                    className="h-5 max-h-6 rounded-r-[4px]"
                    style={{
                      width: `${Math.max(0.5, (d.value / max) * 100)}%`,
                      background: "var(--viz-series-1)",
                    }}
                  />
                  <span className="ml-1.5 text-xs tabular-nums">{format(d.value)}</span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {reference && (
        <p className="text-xs text-muted-foreground">Vertical line: {reference.label}</p>
      )}
      <ChartTable
        caption={title}
        columns={["", "Value"]}
        rows={data.map((d) => [d.label, d.value === null ? "—" : format(d.value)])}
      />
    </figure>
  );
}
