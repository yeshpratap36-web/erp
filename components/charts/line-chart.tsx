"use client";

import { useEffect, useRef, useState } from "react";
import { ChartTable } from "@/components/charts/table-view";

type Point = { label: string; value: number };

/**
 * Single-series line (e.g. weekly attendance %). 2px line, 8px end markers with a surface
 * ring, hairline grid, labeled reference line, crosshair tooltip on pointer and keyboard.
 */
export function LineChart({
  title,
  data,
  min = 0,
  max = 100,
  format = (v: number) => `${v}%`,
  reference,
  height = 200,
}: {
  title: string;
  data: Point[];
  min?: number;
  max?: number;
  format?: (v: number) => string;
  reference?: { value: number; label: string };
  height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { left: 32, right: 12, top: 12, bottom: 22 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v: number) => pad.top + h - ((v - min) / (max - min)) * h;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");
  const ticks = [min, (min + max) / 2, max];
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.floor(w / 56)));

  function nearest(clientX: number) {
    const rect = wrap.current!.getBoundingClientRect();
    const px = clientX - rect.left - pad.left;
    return Math.min(data.length - 1, Math.max(0, Math.round((px / w) * (data.length - 1))));
  }

  const current = active !== null ? data[active] : null;
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div
        ref={wrap}
        className="relative outline-none"
        tabIndex={0}
        role="img"
        aria-label={`${title}. ${data.length} points; use arrow keys to read values.`}
        onPointerMove={(e) => data.length && setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? data.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? 0) - 1));
          if (e.key === "ArrowRight") setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1));
        }}
      >
        <svg width={width} height={height} className="block max-w-full overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text
                x={pad.left - 6}
                y={y(t) + 3}
                textAnchor="end"
                fontSize={10}
                fill="var(--viz-muted)"
              >
                {format(t)}
              </text>
            </g>
          ))}
          {reference && (
            <g>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(reference.value)}
                y2={y(reference.value)}
                stroke="var(--viz-muted)"
                strokeWidth={1}
              />
              <text
                x={width - pad.right}
                y={y(reference.value) - 4}
                textAnchor="end"
                fontSize={10}
                fill="var(--viz-muted)"
              >
                {reference.label}
              </text>
            </g>
          )}
          {data.map(
            (d, i) =>
              i % labelEvery === 0 && (
                <text
                  key={d.label}
                  x={x(i)}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--viz-muted)"
                >
                  {d.label}
                </text>
              ),
          )}
          <path
            d={path}
            fill="none"
            stroke="var(--viz-series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={pad.top}
              y2={pad.top + h}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
          )}
          {data.length > 0 && (
            <circle
              cx={x(active ?? data.length - 1)}
              cy={y(data[active ?? data.length - 1].value)}
              r={4}
              fill="var(--viz-series-1)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
          )}
        </svg>
        {current && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm"
            style={{ left: Math.min(x(active!) + 8, width - 120) }}
            role="status"
          >
            <div className="font-semibold tabular-nums">{format(current.value)}</div>
            <div className="text-muted-foreground">{current.label}</div>
          </div>
        )}
      </div>
      <ChartTable
        caption={title}
        columns={["", "Value"]}
        rows={data.map((d) => [d.label, format(d.value)])}
      />
    </figure>
  );
}
