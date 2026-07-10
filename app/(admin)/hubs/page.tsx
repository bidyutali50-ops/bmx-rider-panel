"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Warehouse, Plus, Pencil, Trash2, Search, MapPin, Phone, Loader2, Crosshair } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs } from "@/lib/hooks";
import { pushNotification, logActivity } from "@/lib/notify";
import type { Hub } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { todayISO } from "@/lib/utils";

const hubSchema = z.object({
  name: z.string().min(2, "Hub name is required"),
  code: z.string().min(1, "Hub code is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  manager_id: z.string().optional(),
  contact_number: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  geofence_radius_m: z.string().optional(),
  geofence_enabled: z.boolean().optional(),
});
type HubForm = z.infer<typeof hubSchema>;

export default function HubsPage() {
  const { data: hubs, isLoading } = useHubs();
  const qc = useQueryClient();
  const supabase = supabaseBrowser();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Hub | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  function useMyLocation() {
    if (!("geolocation" in navigator)) { toast.error("This device cannot share location"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        form.setValue("latitude", pos.coords.latitude.toFixed(6));
        form.setValue("longitude", pos.coords.longitude.toFixed(6));
        toast.success("Location captured", { description: `Accurate to about ${Math.round(pos.coords.accuracy)} m` });
      },
      () => { setLocating(false); toast.error("Could not get location", { description: "Allow location access and try again." }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const managers = useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["super_admin", "admin", "hub_manager"])
        .order("full_name");
      return data ?? [];
    },
  });

  const hubStats = useQuery({
    queryKey: ["hub-stats"],
    queryFn: async () => {
      const today = todayISO();
      const [riders, entries, payouts] = await Promise.all([
        supabase.from("profiles").select("id, hub_id, active").eq("role", "rider"),
        supabase.from("data_entries").select("rider_id, hub_id").eq("entry_date", today),
        supabase.from("payout_requests").select("rider_id, status, profiles(hub_id)").eq("status", "pending"),
      ]);
      return {
        riders: riders.data ?? [],
        entries: entries.data ?? [],
        payouts: (payouts.data ?? []) as { rider_id: string; profiles: { hub_id: string | null } | null }[],
      };
    },
  });

  const form = useForm<HubForm>({
    resolver: zodResolver(hubSchema),
    defaultValues: { status: "active" },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", code: "", address: "", city: "", state: "", pincode: "", manager_id: "", contact_number: "", status: "active", latitude: "", longitude: "", geofence_radius_m: "100", geofence_enabled: true });
    setOpen(true);
  }

  function openEdit(hub: Hub) {
    setEditing(hub);
    form.reset({
      name: hub.name,
      code: hub.code ?? "",
      address: hub.address ?? "",
      city: hub.city ?? "",
      state: hub.state ?? "",
      pincode: hub.pincode ?? "",
      manager_id: hub.manager_id ?? "",
      contact_number: hub.contact_number ?? "",
      latitude: hub.latitude != null ? String(hub.latitude) : "",
      longitude: hub.longitude != null ? String(hub.longitude) : "",
      geofence_radius_m: hub.geofence_radius_m != null ? String(hub.geofence_radius_m) : "100",
      geofence_enabled: hub.geofence_enabled ?? true,
      status: hub.status ?? "active",
    });
    setOpen(true);
  }

  async function onSubmit(values: HubForm) {
    setSaving(true);
    const lat = values.latitude?.trim() ? Number(values.latitude) : null;
    const lng = values.longitude?.trim() ? Number(values.longitude) : null;
    if ((lat === null) !== (lng === null)) {
      setSaving(false);
      toast.error("Set both latitude and longitude, or leave both blank");
      return;
    }
    if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lng as number) > 180)) {
      setSaving(false);
      toast.error("Latitude must be -90..90 and longitude -180..180");
      return;
    }
    const payload = {
      ...values,
      manager_id: values.manager_id || null,
      latitude: lat,
      longitude: lng,
      geofence_radius_m: Number(values.geofence_radius_m || 100) || 100,
      geofence_enabled: values.geofence_enabled ?? true,
    };
    const res = editing
      ? await supabase.from("hubs").update(payload).eq("id", editing.id)
      : await supabase.from("hubs").insert(payload);
    setSaving(false);
    if (res.error) {
      toast.error("Could not save hub", { description: res.error.message });
      return;
    }
    toast.success(editing ? "Hub updated" : "Hub created");
    logActivity(`${editing ? "Updated" : "Created"} hub ${values.name}`, "hub");
    if (!editing) pushNotification({ audience: "staff", type: "hub", title: `New hub: ${values.name}`, body: values.city });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["hubs"] });
  }

  async function deleteHub(hub: Hub) {
    if (!confirm(`Delete hub “${hub.name}”? Riders assigned to it will become unassigned.`)) return;
    const { error } = await supabase.from("hubs").delete().eq("id", hub.id);
    if (error) return toast.error("Could not delete hub", { description: error.message });
    toast.success("Hub deleted");
    logActivity(`Deleted hub ${hub.name}`, "hub");
    qc.invalidateQueries({ queryKey: ["hubs"] });
  }

  const filtered = useMemo(() => {
    return (hubs ?? []).filter((h) => {
      const matchesSearch =
        !search ||
        [h.name, h.code, h.city, h.state].some((f) => f?.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === "all" || (h.status ?? "active") === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [hubs, search, statusFilter]);

  function statsFor(hubId: string) {
    const d = hubStats.data;
    if (!d) return { riders: 0, active: 0, pendingEntry: 0, pendingPayout: 0 };
    const hubRiders = d.riders.filter((r) => r.hub_id === hubId);
    const active = hubRiders.filter((r) => r.active);
    const enteredToday = new Set(d.entries.filter((e) => e.hub_id === hubId).map((e) => e.rider_id));
    const pendingEntry = active.filter((r) => !enteredToday.has(r.id)).length;
    const pendingPayout = d.payouts.filter((p) => p.profiles?.hub_id === hubId).length;
    return { riders: hubRiders.length, active: active.length, pendingEntry, pendingPayout };
  }

  return (
    <div>
      <PageHeader
        title="Hubs"
        description="Delivery hubs and their day-to-day workload"
        actions={<Button onClick={openCreate}><Plus /> Create hub</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
          <Input className="pl-8" placeholder="Search name, code or city" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-36">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      )}

      {!isLoading && !filtered.length && (
        <EmptyState
          icon={Warehouse}
          title="No hubs found"
          description={search ? "Try a different search term." : "Create your first hub to start assigning riders."}
          action={!search ? <Button onClick={openCreate}><Plus /> Create hub</Button> : undefined}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((hub) => {
          const st = statsFor(hub.id);
          return (
            <Card key={hub.id} className="group p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display truncate font-semibold">{hub.name}</h3>
                    <Badge variant={(hub.status ?? "active") === "active" ? "success" : "muted"}>
                      {hub.status ?? "active"}
                    </Badge>
                  </div>
                  <p className="money mt-0.5 text-xs text-[var(--muted)]">{hub.code ?? "—"}</p>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(hub)} aria-label="Edit hub"><Pencil /></Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteHub(hub)} aria-label="Delete hub" className="hover:text-red-500"><Trash2 /></Button>
                </div>
              </div>

              <div className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                <p className="flex items-center gap-1.5"><MapPin className="size-3.5" />{[hub.city, hub.state, hub.pincode].filter(Boolean).join(", ") || "No address yet"}</p>
                {hub.contact_number && <p className="flex items-center gap-1.5"><Phone className="size-3.5" />{hub.contact_number}</p>}
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-dashed border-[var(--border)] pt-3 text-center">
                {[
                  { label: "Riders", value: st.riders },
                  { label: "Active", value: st.active },
                  { label: "Pend. entry", value: st.pendingEntry, warn: st.pendingEntry > 0 },
                  { label: "Pend. payout", value: st.pendingPayout, warn: st.pendingPayout > 0 },
                ].map((s) => (
                  <div key={s.label}>
                    <p className={`font-display text-lg font-semibold ${s.warn ? "text-amber-500" : ""}`}>{s.value}</p>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{s.label}</p>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? "Edit hub" : "Create hub"} description="Hubs group riders, data entry and payouts by location.">
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Hub name</Label>
              <Input {...form.register("name")} placeholder="Chennai Central Hub" />
              {form.formState.errors.name && <p className="mt-1 text-xs text-red-500">{form.formState.errors.name.message}</p>}
            </div>
            <div>
              <Label>Hub code</Label>
              <Input {...form.register("code")} placeholder="CHN-01" className="money" />
              {form.formState.errors.code && <p className="mt-1 text-xs text-red-500">{form.formState.errors.code.message}</p>}
            </div>
            <div>
              <Label>Status</Label>
              <Select {...form.register("status")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input {...form.register("address")} placeholder="Street address" />
            </div>
            <div>
              <Label>City</Label>
              <Input {...form.register("city")} />
            </div>
            <div>
              <Label>State</Label>
              <Input {...form.register("state")} />
            </div>
            <div>
              <Label>Pincode</Label>
              <Input {...form.register("pincode")} />
            </div>
            <div>
              <Label>Contact number</Label>
              <Input {...form.register("contact_number")} />
            </div>
            <div className="col-span-2 mt-1 rounded-xl border border-dashed border-[var(--border)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Punch-in location (geofence)</p>
                  <p className="text-xs text-[var(--muted)]">Riders can only punch in/out within this radius. Leave blank to allow anywhere.</p>
                </div>
                <Button type="button" variant="secondary" size="sm" disabled={locating} onClick={useMyLocation}>
                  {locating ? <Loader2 className="animate-spin" /> : <Crosshair />} Use my location
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <Label>Latitude</Label>
                  <Input {...form.register("latitude")} placeholder="22.5760" className="money" />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input {...form.register("longitude")} placeholder="88.2360" className="money" />
                </div>
                <div>
                  <Label>Radius (metres)</Label>
                  <Input {...form.register("geofence_radius_m")} type="number" min={20} className="money" />
                </div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register("geofence_enabled")} />
                Enforce this geofence
              </label>
            </div>

            <div className="col-span-2">
              <Label>Hub manager</Label>
              <Select {...form.register("manager_id")}>
                <option value="">Unassigned</option>
                {managers.data?.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-2 mt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />} {editing ? "Save changes" : "Create hub"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
