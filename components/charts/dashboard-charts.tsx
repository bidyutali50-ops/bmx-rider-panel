"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatINR, daysAgoISO } from "@/lib/utils";

const ORANGE = "#f4570c";
const TEAL = "#0e7c7b";
const GRID = "rgba(131,148,165,0.18)";
const MUTED = "#8394a5";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--fg)",
};

export function MonthlyPayoutChart({ paid }: { paid: { amount: number; paid_at: string | null }[] }) {
  const byMonth = new Map<string, number>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    byMonth.set(d.toLocaleDateString("en-IN", { month: "short" }), 0);
  }
  paid.forEach((p) => {
    if (!p.paid_at) return;
    const key = new Date(p.paid_at).toLocaleDateString("en-IN", { month: "short" });
    if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.amount));
  });
  const data = Array.from(byMonth, ([month, amount]) => ({ month, amount }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatINR(Number(v)), "Paid"]} cursor={{ fill: "rgba(244,87,12,0.06)" }} />
        <Bar dataKey="amount" fill={ORANGE} radius={[6, 6, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WeeklyEarningsChart({ entries }: { entries: { entry_date: string; net_amount: number }[] }) {
  const byDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) byDay.set(daysAgoISO(i), 0);
  entries.forEach((e) => {
    if (byDay.has(e.entry_date)) byDay.set(e.entry_date, (byDay.get(e.entry_date) ?? 0) + Number(e.net_amount));
  });
  const data = Array.from(byDay, ([date, amount]) => ({
    day: new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" }),
    amount,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ORANGE} stopOpacity={0.35} />
            <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 6" stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatINR(Number(v)), "Earnings"]} />
        <Area type="monotone" dataKey="amount" stroke={ORANGE} strokeWidth={2} fill="url(#earnGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HubPerformanceChart({
  entries,
}: {
  entries: { hub_id: string | null; completed_orders: number; hubs: { name: string } | null }[];
}) {
  const byHub = new Map<string, number>();
  entries.forEach((e) => {
    const name = e.hubs?.name ?? "Unassigned";
    byHub.set(name, (byHub.get(name) ?? 0) + Number(e.completed_orders));
  });
  const data = Array.from(byHub, ([hub, orders]) => ({ hub, orders })).sort((a, b) => b.orders - a.orders).slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="hub" width={90} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(14,124,123,0.06)" }} />
        <Bar dataKey="orders" fill={TEAL} radius={[0, 6, 6, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RiderGrowthChart({ riders }: { riders: { created_at: string }[] }) {
  const byWeek = new Map<string, number>();
  for (let i = 12; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    byWeek.set(`${d.getDate()}/${d.getMonth() + 1}`, 0);
  }
  let cumulative = 0;
  const sorted = [...riders].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const points = Array.from(byWeek.keys()).map((label, idx) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (12 - idx) * 7);
    cumulative = sorted.filter((r) => new Date(r.created_at) <= cutoff).length;
    return { week: label, riders: cumulative };
  });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke={GRID} vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="riders" stroke={ORANGE} strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PaymentTypeChart({ riders }: { riders: { rider_type: string | null }[] }) {
  const perOrder = riders.filter((r) => r.rider_type !== "mg").length;
  const mg = riders.length - perOrder;
  const data = [
    { name: "Per Order", value: perOrder },
    { name: "MG", value: mg },
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={4} strokeWidth={0}>
          <Cell fill={ORANGE} />
          <Cell fill={TEAL} />
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
