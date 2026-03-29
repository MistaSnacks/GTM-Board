"use client";

import { useState, useMemo } from "react";

interface ColumnDef {
  key: string;
  label: string;
  sortable?: boolean;
  mono?: boolean;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface DataTableProps {
  columns: ColumnDef[];
  data: Record<string, unknown>[];
  emptyMessage?: string;
  onRowClick?: (row: Record<string, unknown>, index: number) => void;
}

export default function DataTable({ columns, data, emptyMessage = "No data available", onRowClick }: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [data, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (!data.length) {
    return (
      <div className="empty-state">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                  style={{ cursor: col.sortable !== false ? "pointer" : "default" }}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span style={{ marginLeft: "4px", opacity: 0.7 }}>
                      {sortDir === "asc" ? "\u2191" : "\u2193"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr
                key={idx}
                onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
                className={onRowClick ? "clickable-row" : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.mono ? "mono" : ""}>
                    {col.render
                      ? col.render(row[col.key], row)
                      : row[col.key] != null
                        ? String(row[col.key])
                        : "--"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
