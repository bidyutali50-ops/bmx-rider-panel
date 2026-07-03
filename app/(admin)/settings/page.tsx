"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, IndianRupee, CalendarOff, Users, Plus, KeyRound, Trash2, Loader2, Save } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs, useMyProfile } from "@/lib/hooks";
import { displayLogin, edgeErrorMessage} from "@/lib/utils";
import { logActivity } from "@/lib/notify";
import { ROLE_LABELS, STAFF_ROLES, type Profile, type Role } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface CompanySettings { name: string; address: string; phone: string; email: string; gst: string; }
interface PaymentRules { default_rate_per_order: number; default_daily_mg: number; default_required_orders: number; default_incentive_per_extra_order: number; }
interface Holiday { date: string; name: string; }

export default function SettingsPage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();
  const { data: me } = useMyProfile();
  const { data: hubs } = useHubs();
  const isSuperOrAdmin = me?.role === "super_admin" || me?.role === "admin";

  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("key, value");
      const map: Record<string, unknown> = {};
      for (const row of data ?? []) map[row.key] = row.value;
      return map;
    },
  });

  const staffQ = useQuery({
    queryKey: ["staff-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("*, hubs!profiles_hub_id_fkey(name)").in("role", STAFF_ROLES).order("full_name");
      return (data ?? []) as Profile[];
    },
  });

  const [company, setCompany] = useState<CompanySettings>({ name: "", address: "", phone: "", email: "", gst: "" });
  const [rules, setRules] = useState<PaymentRules>({ default_rate_per_order: 50, default_daily_mg: 700, default_required_orders: 25, default_incentive_per_extra_order: 15 });
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHoliday, setNewHoliday] = useState<Holiday>({ date: "", name: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    if (s.company) setCompany({ ...company, ...(s.company as CompanySettings) });
    if (s.payment_rules) setRules({ ...rules, ...(s.payment_rules as PaymentRules) });
    if (s.holidays) setHolidays((s.holidays as { list?: Holiday[] }).list ?? (Array.isArray(s.holidays) ? s.holidays as Holiday[] : []));
  }, [settingsQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveSetting(key: string, value: unknown, label: string) {
    setSaving(true);
    const { error } = await supabase.from("settings").upsert({ key, value }, { onConflict: "key" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${label} saved`);
    logActivity(`Updated ${label.toLowerCase()}`, "settings", key);
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  // ---- staff management ----
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({ full_name: "", phone: "", email: "", password: "", role: "data_entry" as Role, hub_id: "" });
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetPwd, setResetPwd] = useState("");

  async function createStaff() {
    if (!staffForm.full_name.trim() || staffForm.password.length < 6 || (!staffForm.phone && !staffForm.email)) {
      toast.error("Name, phone or email, and a 6+ char password are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "create_user",
        full_name: staffForm.full_name.trim(),
        phone: staffForm.phone.trim() || undefined,
        email: staffForm.email.trim() || undefined,
        password: staffForm.password,
        role: staffForm.role,
        hub_id: staffForm.hub_id || undefined,
      },
    });
    setSaving(false);
    const err = (error || (data as { error?: string })?.error) ? await edgeErrorMessage(error, data) : null;
    if (err) { toast.error("Could not create user", { description: err }); return; }
    toast.success("Staff user created");
    logActivity("Created staff user", "user", undefined, { name: staffForm.full_name, role: staffForm.role });
    setStaffOpen(false);
    setStaffForm({ full_name: "", phone: "", email: "", password: "", role: "data_entry", hub_id: "" });
    qc.invalidateQueries({ queryKey: ["staff-users"] });
  }

  async function resetStaffPassword() {
    if (!resetTarget || resetPwd.length < 6) { toast.error("Minimum 6 characters"); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "reset_password", user_id: resetTarget.id, password: resetPwd },
    });
    setSaving(false);
    const err = (error || (data as { error?: string })?.error) ? await edgeErrorMessage(error, data) : null;
    if (err) { toast.error("Reset failed", { description: err }); return; }
    toast.success("Password reset");
    setResetTarget(null); setResetPwd("");
  }

  async function toggleStaffActive(p: Profile) {
    const { error } = await supabase.from("profiles").update({ active: !p.active }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(p.active ? "User deactivated" : "User activated");
    qc.invalidateQueries({ queryKey: ["staff-users"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Company profile, payment defaults, holidays and staff access" />

      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="payment">Payment Rules</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          {isSuperOrAdmin && <TabsTrigger value="users">User Management</TabsTrigger>}
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="size-4 text-brand-500" /> Company Profile</CardTitle>
              <CardDescription>Appears on report headers and exports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsQ.isLoading ? <Skeleton className="h-32" /> : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <F label="Company Name"><Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} placeholder="BM XPRESS LOGISTICS PRIVATE LIMITED" /></F>
                    <F label="GST Number"><Input value={company.gst} onChange={(e) => setCompany({ ...company, gst: e.target.value.toUpperCase() })} /></F>
                    <F label="Phone"><Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></F>
                    <F label="Email"><Input value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} /></F>
                  </div>
                  <F label="Registered Address"><Input value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} placeholder="Sagardighi, Murshidabad, West Bengal" /></F>
                  <div className="flex justify-end">
                    <Button onClick={() => saveSetting("company", company, "Company profile")} disabled={saving || !isSuperOrAdmin}>
                      {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><IndianRupee className="size-4 text-brand-500" /> Default Payment Rules</CardTitle>
              <CardDescription>Used as starting values when onboarding new riders</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <F label="Rate per Order (₹)"><Input type="number" className="money" value={rules.default_rate_per_order} onChange={(e) => setRules({ ...rules, default_rate_per_order: Number(e.target.value) })} /></F>
                <F label="Daily MG (₹)"><Input type="number" className="money" value={rules.default_daily_mg} onChange={(e) => setRules({ ...rules, default_daily_mg: Number(e.target.value) })} /></F>
                <F label="Required Orders / Day"><Input type="number" className="money" value={rules.default_required_orders} onChange={(e) => setRules({ ...rules, default_required_orders: Number(e.target.value) })} /></F>
                <F label="Incentive per Extra Order (₹)"><Input type="number" className="money" value={rules.default_incentive_per_extra_order} onChange={(e) => setRules({ ...rules, default_incentive_per_extra_order: Number(e.target.value) })} /></F>
              </div>
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3 text-sm text-[var(--muted)]">
                Example: an MG rider with ₹{rules.default_daily_mg}/{rules.default_required_orders} orders earns the full MG on target, pro-rata below target, and ₹{rules.default_incentive_per_extra_order} for every order above it.
              </div>
              <div className="flex justify-end">
                <Button onClick={() => saveSetting("payment_rules", rules, "Payment rules")} disabled={saving || !isSuperOrAdmin}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarOff className="size-4 text-brand-500" /> Holiday Calendar</CardTitle>
              <CardDescription>Company holidays for the year</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <F label="Date"><Input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} /></F>
                <F label="Holiday Name"><Input value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} placeholder="Durga Puja" /></F>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!newHoliday.date || !newHoliday.name.trim()) return;
                    const next = [...holidays, newHoliday].sort((a, b) => a.date.localeCompare(b.date));
                    setHolidays(next);
                    setNewHoliday({ date: "", name: "" });
                  }}
                ><Plus /> Add</Button>
              </div>
              {holidays.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No holidays added yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {holidays.map((h, i) => (
                    <div key={i} className="waybill-rule flex items-center justify-between gap-3 pb-1.5 text-sm">
                      <span><span className="money mr-2">{h.date}</span>{h.name}</span>
                      <button className="text-[var(--muted)] hover:text-red-500" onClick={() => setHolidays(holidays.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={() => saveSetting("holidays", { list: holidays }, "Holidays")} disabled={saving || !isSuperOrAdmin}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isSuperOrAdmin && (
          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2"><Users className="size-4 text-brand-500" /> Staff Users</CardTitle>
                  <CardDescription>Admins, hub managers and data entry operators</CardDescription>
                </div>
                <Button onClick={() => setStaffOpen(true)}><Plus /> Add User</Button>
              </CardHeader>
              <CardContent>
                {staffQ.isLoading ? <Skeleton className="h-32" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                          <th className="px-2 py-2">Name</th><th className="px-2 py-2">Login</th>
                          <th className="px-2 py-2">Role</th><th className="px-2 py-2">Hub</th>
                          <th className="px-2 py-2">Status</th><th className="px-2 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(staffQ.data ?? []).map((p) => (
                          <tr key={p.id} className="waybill-rule">
                            <td className="px-2 py-2.5 font-medium">{p.full_name}</td>
                            <td className="money px-2 py-2.5">{displayLogin(p)}</td>
                            <td className="px-2 py-2.5"><Badge variant={p.role === "super_admin" ? "default" : "muted"}>{ROLE_LABELS[p.role]}</Badge></td>
                            <td className="px-2 py-2.5">{p.hubs?.name ?? "—"}</td>
                            <td className="px-2 py-2.5"><Badge variant={p.active ? "success" : "danger"}>{p.active ? "Active" : "Inactive"}</Badge></td>
                            <td className="px-2 py-2.5">
                              <div className="flex justify-end gap-1.5">
                                <Button size="sm" variant="ghost" onClick={() => setResetTarget(p)}><KeyRound /> Reset</Button>
                                {p.id !== me?.id && (
                                  <Button size="sm" variant={p.active ? "destructive" : "success"} onClick={() => toggleStaffActive(p)}>
                                    {p.active ? "Deactivate" : "Activate"}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={staffOpen} onOpenChange={setStaffOpen}>
        <DialogContent title="Add Staff User" description="Creates a login with the selected role">
          <div className="grid gap-3">
            <F label="Full Name *"><Input value={staffForm.full_name} onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })} /></F>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Mobile"><Input value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} placeholder="10-digit mobile" /></F>
              <F label="Email"><Input value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} placeholder="Optional if mobile given" /></F>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Role">
                <Select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value as Role })}>
                  <option value="admin">Admin</option>
                  <option value="hub_manager">Hub Manager</option>
                  <option value="data_entry">Data Entry Operator</option>
                  {me?.role === "super_admin" && <option value="super_admin">Super Admin</option>}
                </Select>
              </F>
              <F label="Hub (for hub roles)">
                <Select value={staffForm.hub_id} onChange={(e) => setStaffForm({ ...staffForm, hub_id: e.target.value })}>
                  <option value="">— None —</option>
                  {hubs?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </Select>
              </F>
            </div>
            <F label="Temporary Password *"><Input value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} placeholder="Minimum 6 characters" /></F>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStaffOpen(false)}>Cancel</Button>
              <Button onClick={createStaff} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Plus />} Create User</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        {resetTarget && (
          <DialogContent title="Reset Password" description={`Set a temporary password for ${resetTarget.full_name}`}>
            <div className="space-y-3">
              <F label="New Password"><Input value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} placeholder="Minimum 6 characters" /></F>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button>
                <Button onClick={resetStaffPassword} disabled={saving}>{saving ? "Resetting…" : "Reset Password"}</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
