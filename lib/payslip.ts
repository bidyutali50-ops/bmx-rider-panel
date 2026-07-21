interface PayslipDay {
  date: string;
  weekday: string;
  label: string;
  orders: number;
  amount: number;
}

export interface PayslipData {
  riderName: string;
  riderCode: string;
  phone: string;
  weekStart: string;
  weekEnd: string;
  payBy: string;
  isFinal: boolean;
  total: number;
  days: PayslipDay[];
}

const inr = (n: number) =>
  "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/**
 * A print-ready payslip in the BM Xpress consignment-note style:
 * warm paper, black ink, mono figures, orange stamp. Opens in a new tab
 * and triggers the browser's Save-as-PDF.
 */
export function buildPayslipHTML(d: PayslipData): string {
  const rows = d.days
    .map(
      (r) => `
      <tr>
        <td class="mono">${r.weekday} ${fmt(r.date).replace(/ \d{4}$/, "")}</td>
        <td>${r.label}</td>
        <td class="mono r">${r.orders || "—"}</td>
        <td class="mono r">${inr(r.amount)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Payslip ${d.riderCode} ${d.weekStart}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --ink:#1a1714; --muted:#7d7466; --line:#e4ded3; --paper:#fffefb; --orange:#e4570f; }
  body { font-family: "Archivo", system-ui, sans-serif; color: var(--ink); background:#f2eee7; padding: 24px; }
  .slip { max-width: 640px; margin: 0 auto; background: var(--paper); border:1px solid var(--line); }
  .mono { font-family:"IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; }
  .r { text-align:right; }
  header { display:flex; justify-content:space-between; align-items:flex-start; padding:22px 24px; border-bottom:2px solid var(--ink); }
  .brand { display:flex; align-items:center; gap:10px; }
  .logo { width:38px; height:38px; border-radius:7px; background:var(--orange); color:#fff; display:grid; place-items:center; font-weight:800; font-size:15px; letter-spacing:.5px; }
  .co { font-weight:800; font-size:17px; letter-spacing:-.01em; }
  .co small { display:block; font-weight:500; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
  .doc { text-align:right; }
  .doc .t { font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); }
  .doc .n { font-weight:800; font-size:15px; }
  .stamp { display:inline-block; margin-top:4px; padding:2px 8px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; border:1.5px solid; border-radius:4px; }
  .stamp.final { color:#0f6f66; border-color:#0f6f66; }
  .stamp.prov { color:var(--orange); border-color:var(--orange); }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:2px 24px; padding:18px 24px; border-bottom:1px dashed var(--line); }
  .meta div { font-size:13px; }
  .meta .k { font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
  .meta .v { font-weight:600; }
  table { width:100%; border-collapse:collapse; }
  thead th { font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); text-align:left; padding:10px 24px; border-bottom:1px solid var(--line); }
  thead th:last-child, thead th:nth-child(3){ text-align:right; }
  tbody td { padding:9px 24px; font-size:13px; border-bottom:1px dashed var(--line); }
  tfoot td { padding:16px 24px; font-weight:800; font-size:16px; border-top:2px solid var(--ink); }
  .note { padding:14px 24px; font-size:11px; color:var(--muted); line-height:1.5; }
  .perf { height:10px; background-image: radial-gradient(circle at 4px 50%, #f2eee7 3px, transparent 3.5px); background-size:12px 100%; }
  @media print { body { background:#fff; padding:0; } .slip { border:none; max-width:none; } @page { margin:14mm; } }
</style></head>
<body>
  <div class="slip">
    <header>
      <div class="brand">
        <div class="logo">BM</div>
        <div class="co">BM XPRESS<small>Logistics Pvt Ltd</small></div>
      </div>
      <div class="doc">
        <div class="t">Payslip</div>
        <div class="n mono">${d.riderCode || "—"}</div>
        <span class="stamp ${d.isFinal ? "final" : "prov"}">${d.isFinal ? "Final" : "Provisional"}</span>
      </div>
    </header>

    <div class="meta">
      <div><div class="k">Rider</div><div class="v">${d.riderName}</div></div>
      <div><div class="k">Mobile</div><div class="v mono">${d.phone || "—"}</div></div>
      <div><div class="k">Week</div><div class="v mono">${fmt(d.weekStart)} – ${fmt(d.weekEnd)}</div></div>
      <div><div class="k">Pay by</div><div class="v mono">${fmt(d.payBy)}</div></div>
    </div>

    <table>
      <thead><tr><th>Day</th><th>Type</th><th>Orders</th><th>Amount</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" style="color:var(--muted)">No work recorded this week.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="3">Total payable</td><td class="mono r">${inr(d.total)}</td></tr></tfoot>
    </table>

    <div class="note">
      ${d.isFinal
        ? "This is your final weekly bill. Payment will be released by the date shown above."
        : "This bill is provisional and may change until the Thursday final check. COD amounts, if any, are tracked separately and are not deducted from this pay."}
      <br/>Generated ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · BM Xpress Logistics Pvt Ltd, Murshidabad, West Bengal.
    </div>
    <div class="perf"></div>
  </div>
</body></html>`;
}
