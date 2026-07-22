"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bike, Plus, Search, Eye, Power } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs, useRiders } from "@/lib/hooks";
import { logActivity } from "@/lib/notify";
import { formatINR } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { ExportButtons } from "@/components/app/export-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type BoardRow = {
  rider_id: string;
  outstanding: number;
  today_delivered: number;
  today_failed: number;
  today_ongoing: number;
  shift_start: string | null;
  shift_end: string | null;
};

function fmtTime(t?: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":");
  let hr = Number(h);
  const ap = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${hr}:${m} ${ap}`;
}

function Chip({ label, tone }: { label: string; tone: "amber" | "green" | "red" }) {
  const map = {
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    red: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  };
  return <span className={`inline-block rounded-md px-2 py-1 text-[11px] font-semibold ${map[tone]}`}>{label}</span>;
}

export default function RidersPage() {
  const { data: riders, isLoading } = useRiders();
  const { data: hubs } = useHubs();
  const qc = useQueryClient();
  const supabase = supabaseBrowser();

  const [search, setSearch] = useState("");
  const [hubFilter, setHubFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const board = useQuery({
    queryKey: ["rider-board"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rider_board");
      if (error) throw error;
      const m = new Map<string, BoardRow>();
      (data ?? []).forEach((r: BoardRow) => m.set(r.rider_id, r));
      return m;
    },
  });

  const filtered = useMemo(() => {
    return (riders ?? []).filter((r) => {
      const s = search.toLowerCase();
      const matchesSearch =
        !s || [r.full_name, r.phone, r.rider_code, r.email].some((f) => f?.toLowerCase().includes(s));
      const matchesHub = hubFilter === "all" || r.hub_id === hubFilter;
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? r.active : !r.active);
      const matchesType = typeFilter === "all" || r.rider_type === typeFilter;
      return matchesSearch && matchesHub && matchesStatus && matchesType;
    });
  }, [riders, search, hubFilter, statusFilter, typeFilter]);

  async function toggleActive(r: Profile) {
    const { error } = await supabase.from("profiles").update({ active: !r.active }).eq("id", r.id);
    if (error) return toast.error("Could not update rider", { description: error.message });
    toast.success(r.active ? `${r.full_name} deactivated` : `${r.full_name} activated`);
    logActivity(`${r.active ? "Deactivated" : "Activated"} rider ${r.full_name}`, "rider", r.id);
    qc.invalidateQueries({ queryKey: ["riders"] });
  }

  const exportRows = filtered.map((r) => {
    const b = board.data?.get(r.id);
    return {
      "Rider ID": r.rider_code ?? "",
      Name: r.full_name,
      Mobile: r.phone ?? "",
      Hub: r.hubs?.name ?? "",
      Outstanding: b?.outstanding ?? 0,
      "Delivered Today": b?.today_delivered ?? 0,
      "Failed Today": b?.today_failed ?? 0,
      Shift: b?.shift_start ? `${fmtTime(b.shift_start)} - ${fmtTime(b.shift_end)}` : "",
      "Payment Type": r.rider_type === "mg" ? "MG" : "Per Order",
      Status: r.active ? "Active" : "Inactive",
    };
  });

  return (
    <div>
      <PageHeader
        title="Riders"
        description={`${riders?.length ?? 0} riders across ${hubs?.length ?? 0} hubs`}
        actions={
          <>
            <ExportButtons filename="riders" rows={exportRows} title="Rider Master" />
            <Button asChild><Link href="/riders/new"><Plus /> Onboard rider</Link></Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 no-print">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
          <Input className="pl-8" placeholder="Name, mobile or rider ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-44">
          <Select value={hubFilter} onChange={(e) => setHubFilter(e.target.value)}>
            <option value="all">All hubs</option>
            {hubs?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
        </div>
        <div className="w-36">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
        <div className="w-36">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            <option value="per_order">Per Order</option>
            <option value="mg">MG</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !filtered.length ? (
        <EmptyState
          icon={Bike}
          title="No riders match"
          description={search || hubFilter !== "all" ? "Adjust your search or filters." : "Onboard your first rider to get started."}
          action={<Button asChild><Link href="/riders/new"><Plus /> Onboard rider</Link></Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <table className="w-full min-w-[780px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left align-middle">
                <th className="px-4 py-3 text-xs font-medium text-[var(--muted)]">Rider (ID)</th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--muted)]">Outstanding</th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--muted)]">Network</th>
                <th className="px-3 py-3 text-center"><Chip label="Ongoing" tone="amber" /></th>
                <th className="px-3 py-3 text-center"><Chip label="Delivered" tone="green" /></th>
                <th className="px-3 py-3 text-center"><Chip label="Failed" tone="red" /></th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--muted)]">Shift Time</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((r) => {
                const b = board.data?.get(r.id);
                const shift = b?.shift_start ? `${fmtTime(b.shift_start)} – ${fmtTime(b.shift_end)}` : null;
                return (
                  <tr key={r.id} className="align-middle transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                    {/* Rider + status dot */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`size-2.5 shrink-0 rounded-full ${r.active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                          title={r.active ? "Active" : "Inactive"}
                        />
                        <div className="min-w-0">
                          <Link href={`/riders/${r.id}`} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                            {r.full_name}
                          </Link>
                          <div className="money text-[11px] text-[var(--muted)]">
                            {r.rider_code ?? r.phone}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Outstanding */}
                    <td className="px-4 py-3 money font-medium tabular-nums">{formatINR(b?.outstanding ?? 0)}</td>
                    {/* Network / hub */}
                    <td className="px-4 py-3">
                      {r.hubs?.name ?? <span className="text-[var(--muted)]">Unassigned</span>}
                    </td>
                    {/* Ongoing / Delivered / Failed */}
                    <td className={`px-3 py-3 text-center tabular-nums ${b?.today_ongoing ? "font-semibold text-amber-600 dark:text-amber-400" : "text-[var(--muted)]"}`}>
                      {b?.today_ongoing ?? 0}
                    </td>
                    <td className={`px-3 py-3 text-center tabular-nums ${b?.today_delivered ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-[var(--muted)]"}`}>
                      {b?.today_delivered ?? 0}
                    </td>
                    <td className={`px-3 py-3 text-center tabular-nums ${b?.today_failed ? "font-semibold text-red-500" : "text-[var(--muted)]"}`}>
                      {b?.today_failed ?? 0}
                    </td>
                    {/* Shift time */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {shift ? <span className="rounded-md bg-black/[0.03] px-2 py-1 dark:bg-white/[0.05]">{shift}</span> : <span className="text-[var(--muted)]">—</span>}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" aria-label="View rider">
                          <Link href={`/riders/${r.id}`}><Eye /></Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={r.active ? "Deactivate" : "Activate"}
                          className={r.active ? "hover:text-red-500" : "hover:text-emerald-500"}
                          onClick={() => toggleActive(r)}
                        >
                          <Power />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
