import type { ReactNode } from "react";
import Card from "./Card";

export interface ResponsiveTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  cardLabel?: ReactNode;
}

interface ResponsiveTableProps<T> {
  rows: T[];
  columns: ResponsiveTableColumn<T>[];
  getRowKey: (row: T, index: number) => string;
  emptyLabel?: string;
}

export default function ResponsiveTable<T>({
  rows,
  columns,
  getRowKey,
  emptyLabel = "No rows to show.",
}: ResponsiveTableProps<T>) {
  if (rows.length === 0) {
    return <Card className="edge-table-empty">{emptyLabel}</Card>;
  }

  return (
    <div className="edge-responsive-table-wrap">
      <table className="edge-responsive-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === "right" ? "align-right" : ""}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={getRowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} className={column.align === "right" ? "align-right" : ""}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="edge-responsive-card-list">
        {rows.map((row, index) => (
          <Card key={getRowKey(row, index)} className="edge-responsive-row-card">
            {columns.map((column) => (
              <div key={column.key} className="edge-responsive-row-field">
                <span>{column.cardLabel ?? column.header}</span>
                <div className="edge-responsive-row-value">{column.render(row)}</div>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
