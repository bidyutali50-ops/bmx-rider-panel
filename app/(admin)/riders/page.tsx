"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Bike, Plus, Search, Eye, Power } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs, useRiders } from "@/lib/hooks";
import { logActivity } from "@/lib/notify";
import type { Profile } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { RiderChip } from "@/components/app/rider-chip";
import { ExportButtons } from "@/components/app/export-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function RidersPage() {
  const { data: riders, isLoading } = useRiders();
  const { data: hubs } = useHubs();
  const qc = useQueryClient();
  const supabase = supabaseBrowser();

  const [search, setSearch] = useState("");
  const [hubFilter, setHubFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    return (riders ?? []).filter((r) => {
      const s = search.toLowerCase();
      const matchesSearch =
        !s || [r.full_name, r.phone, r.rider_code, r.email].some((f) => f?.toLowerCase().includes(s));
      const matchesHub = hubFilter === "all" || r.hub_id === hubFilter;
      const matchesStatus =
        statusFilter === "all" || (statusFilter === "active" ? r.active : !r.active);
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

  const columns: ColumnDef<Profile, unknown>[] = [
    {
      header: "Rider",
      accessorKey: "full_name",
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-500/10 font-display text-xs font-bold text-brand-600 dark:text-brand-400">
            {row.original.full_name?.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="font-medium">{row.original.full_name}</p>
            <p className="money text-[11px] text-[var(--muted)]">{row.original.phone ?? row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Rider ID",
      accessorKey: "rider_code",
      cell: ({ row }) => <RiderChip code={row.original.rider_code} />,
    },
    {
      header: "Hub",
      accessorFn: (r) => r.hubs?.name ?? "",
      cell: ({ row }) => row.original.hubs?.name ?? <span className="text-[var(--muted)]">Unassigned</span>,
    },
    {
      header: "Payment",
      accessorKey: "rider_type",
      cell: ({ row }) =>
        row.original.rider_type === "mg" ? <Badge variant="teal">MG</Badge> : <Badge>Per Order</Badge>,
    },
    {
      header: "Vehicle",
      accessorKey: "vehicle_number",
      cell: ({ row }) => (
        <span className="money text-xs">{row.original.vehicle_number ?? "—"}</span>
      ),
    },
    {
      header: "Status",
      accessorKey: "active",
      cell: ({ row }) =>
        row.original.active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="View rider">
            <Link href={`/riders/${row.original.id}`}><Eye /></Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={row.original.active ? "Deactivate" : "Activate"}
            className={row.original.active ? "hover:text-red-500" : "hover:text-emerald-500"}
            onClick={() => toggleActive(row.original)}
          >
            <Power />
          </Button>
        </div>
      ),
    },
  ];

  const exportRows = filtered.map((r) => ({
    "Rider ID": r.rider_code ?? "",
    Name: r.full_name,
    Mobile: r.phone ?? "",
    Email: r.email ?? "",
    Hub: r.hubs?.name ?? "",
    "Payment Type": r.rider_type === "mg" ? "MG" : "Per Order",
    Vehicle: r.vehicle_number ?? "",
    Status: r.active ? "Active" : "Inactive",
    Joined: r.joining_date ?? "",
  }));

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

      <Card>
        <CardContent className="pt-4">
          {isLoading && <Skeleton className="h-64 w-full" />}
          {!isLoading && !filtered.length && (
            <EmptyState
              icon={Bike}
              title="No riders match"
              description={search || hubFilter !== "all" ? "Adjust your search or filters." : "Onboard your first rider to get started."}
              action={<Button asChild><Link href="/riders/new"><Plus /> Onboard rider</Link></Button>}
            />
          )}
          {!isLoading && filtered.length > 0 && <DataTable columns={columns} data={filtered} />}
        </CardContent>
      </Card>
    </div>
  );
}
