import { ChartTable } from "@/components/charts/table-view";

/**
 * Single-series column chart (e.g. grade distribution). Columns ≤ 24px with a 4px rounded
 * data-end, value on the cap in text ink, hairline grid. Each column is focusable and
 * carries its value for hover/keyboard; the table view repeats every value.
 */
export function ColumnChart({
  title,
  data,
  valueLabel,
  unit,
  height = 160,
}: {
  title: string;
  data: { label: string; value: number }[];
  /** Column header for the table view. */
  valueLabel: string;
  /** Singular/plural unit for spoken values, e.g. ["student", "students"]. */
  unit: [string, string];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const spoken = (d: { label: string; value: number }) =>
    `${d.label}: ${d.value} ${d.value === 1 ? unit[0] : unit[1]}`;
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="relative" style={{ height }}>
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute right-0 left-0 border-t text-[10px] text-muted-foreground"
            style={{ bottom: `${(t / max) * 100}%`, borderColor: "var(--viz-grid)" }}
            aria-hidden
          >
            <span className="absolute -top-2 -left-0.5 -translate-x-full pr-1 tabular-nums">
              {t}
            </span>
          </div>
        ))}
        <div
          className="absolute inset-0 ml-6 flex items-end justify-around"
          style={{ borderBottom: "1px solid var(--viz-axis)" }}
        >
          {data.map((d) => (
            <div
              key={d.label}
              className="group flex h-full w-full max-w-16 flex-col items-center justify-end outline-none"
              tabIndex={0}
              role="img"
              aria-label={spoken(d)}
              title={spoken(d)}
            >
              {d.value > 0 && <span className="mb-0.5 text-[11px] tabular-nums">{d.value}</span>}
              <div
                className="w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:outline-2"
                style={{ height: `${(d.value / max) * 100}%`, background: "var(--viz-series-1)" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="ml-6 flex justify-around text-xs">
        {data.map((d) => (
          <span key={d.label} className="w-full max-w-16 text-center text-muted-foreground">
            {d.label}
          </span>
        ))}
      </div>
      <ChartTable
        caption={title}
        columns={["Category", valueLabel]}
        rows={data.map((d) => [d.label, d.value])}
      />
    </figure>
  );
}
