"use client";

import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCSV, exportExcel, exportPDF } from "@/lib/export";

type Row = Record<string, string | number | null | undefined>;

export function ExportButtons({ filename, rows, title }: { filename: string; rows: Row[]; title?: string }) {
  const disabled = !rows.length;
  return (
    <div className="flex items-center gap-1.5 no-print">
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => exportExcel(filename, rows)}>
        <FileSpreadsheet /> Excel
      </Button>
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => exportCSV(filename, rows)}>
        <Download /> CSV
      </Button>
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => exportPDF(title ?? filename, rows)}>
        <FileText /> PDF
      </Button>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => window.print()} aria-label="Print">
        <Printer />
      </Button>
    </div>
  );
}
