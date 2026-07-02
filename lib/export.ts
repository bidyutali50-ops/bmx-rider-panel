"use client";

/** Export helpers: CSV, Excel (SheetJS) and print-to-PDF. */

type Row = Record<string, string | number | null | undefined>;

export function exportCSV(filename: string, rows: Row[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${filename}.csv`);
}

export async function exportExcel(filename: string, rows: Row[], sheet = "Report") {
  if (!rows.length) return;
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportPDF(title: string, rows: Row[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body{font-family:ui-sans-serif,system-ui;padding:24px;color:#161b21}
    h1{font-size:18px;margin:0 0 4px} .sub{color:#64768a;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{text-align:left;border-bottom:2px solid #161b21;padding:6px 8px;text-transform:uppercase;font-size:10px;letter-spacing:.05em}
    td{border-bottom:1px dashed #d3dae2;padding:6px 8px}
  </style></head><body>
  <h1>BM XPRESS LOGISTICS PRIVATE LIMITED</h1>
  <div class="sub">${title} · Generated ${new Date().toLocaleString("en-IN")}</div>
  <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
