"use client";

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DataTable<TData>({
  columns,
  data,
  pageSize = 15,
  rowClassName,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageSize?: number;
  rowClassName?: (row: TData) => string | undefined;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div>
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b-2 border-[var(--border)]">
              {hg.headers.map((header) => (
                <TH key={header.id}>
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-[var(--fg)]"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <ArrowUpDown className="size-3" />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TH>
              ))}
            </tr>
          ))}
        </THead>
        <TBody>
          {table.getRowModel().rows.map((row) => (
            <TR key={row.id} className={cn(rowClassName?.(row.original))}>
              {row.getVisibleCells().map((cell) => (
                <TD key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
      {table.getPageCount() > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)] no-print">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} ·{" "}
            {data.length} rows
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
