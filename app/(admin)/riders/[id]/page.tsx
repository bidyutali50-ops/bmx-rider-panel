"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, KeyRound, Loader2, Save, ShieldCheck, UserX, UserCheck,
  Phone, Mail, MapPin, Bike, Landmark, FileBadge, Wallet,
} from "lucide-react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs } from "@/lib/hooks";
import { formatINR, displayLogin, edgeErrorMessage} from "@/lib/utils";
import { pushNotification, logActivity } from "@/lib/notify";
import type { Profile, RateCard, RiderWallet, PaymentType } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { RiderChip } from "@/components/app/rider-chip";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function RiderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const router = useRouter();
  const supabase = supabaseBrowser();
  const { data: hubs } = useHubs();

  const riderQ = useQuery({
    queryKey: ["rider", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("*, hubs(id, name, code)").eq("id", id).single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const rateQ = useQuery({
    queryKey: ["rate-card", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("rate_cards").select("*").eq("rider_id", id)
        .order("effective_date", { ascending: false }).limit(1).maybeSingle();
      return (data ?? null) as RateCard | null;
    },
  });

  const walletQ = useQuery({
    queryKey: ["wallet", id],
    queryFn: async () => {
      const { data } = await supabase.from("rider_wallets").select("*").eq("rider_id", id).maybeSingle();
      return (data ?? null) as RiderWallet | null;
    },
  });

  const [profileForm, setProfileForm] = useState<Partial<Profile>>({});
  const [rateForm, setRateForm] = useState<Partial<RateCard>>({});
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [signedPhoto, setSignedPhoto] = useState<string | null>(null);

  const rider = riderQ.data;

  useEffect(() => {
    if (rider) setProfileForm(rider);
  }, [rider]);
  useEffect(() => {
    if (rateQ.data) setRateForm(rateQ.data);
    else if (rider) setRateForm({ payment_type: rider.rider_type ?? "per_order" });
  }, [rateQ.data, rider]);
  useEffect(() => {
    if (!rider?.photo_url) return;
    supabase.storage.from("rider-docs").createSignedUrl(rider.photo_url, 3600)
      .then(({ data }) => setSignedPhoto(data?.signedUrl ?? null));
  }, [rider?.photo_url]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveProfile() {
    if (!rider) return;
    setSaving(true);
    const f = profileForm;
    const { error } = await supabase.from("profiles").update({
      full_name: f.full_name, phone: f.phone, email: f.email || null,
      aadhaar_number: f.aadhaar_number || null, pan_number: f.pan_number || null, dl_number: f.dl_number || null,
      vehicle_type: f.vehicle_type || null, vehicle_number: f.vehicle_number || null,
      joining_date: f.joining_date || null, hub_id: f.hub_id || null,
      bank_name: f.bank_name || null, account_number: f.account_number || null,
      ifsc: f.ifsc || null, upi_id: f.upi_id || null,
      emergency_contact: f.emergency_contact || null, address: f.address || null,
      rider_type: f.rider_type ?? rider.rider_type,
    }).eq("id", rider.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    logActivity("Updated rider profile", "rider", rider.id, { name: f.full_name });
    qc.invalidateQueries({ queryKey: ["rider", id] });
    qc.invalidateQueries({ queryKey: ["riders"] });
  }

  async function saveRateCard() {
    if (!rider) return;
    setSaving(true);
    const r = rateForm;
    const payload = {
      rider_id: rider.id,
      payment_type: (r.payment_type ?? "per_order") as PaymentType,
      rate_per_order: Number(r.rate_per_order ?? 0), extra_km_rate: Number(r.extra_km_rate ?? 0),
      cod_incentive: Number(r.cod_incentive ?? 0), fuel_allowance: Number(r.fuel_allowance ?? 0),
      weekly_bonus: Number(r.weekly_bonus ?? 0), monthly_bonus: Number(r.monthly_bonus ?? 0),
      daily_mg: Number(r.daily_mg ?? 0), monthly_mg: Number(r.monthly_mg ?? 0),
      required_orders: Number(r.required_orders ?? 0), working_hours: Number(r.working_hours ?? 0),
      incentive_per_extra_order: Number(r.incentive_per_extra_order ?? 0), overtime_rate: Number(r.overtime_rate ?? 0),
      attendance_bonus: Number(r.attendance_bonus ?? 0), penalty_rate: Number(r.penalty_rate ?? 0),
      effective_date: new Date().toISOString().slice(0, 10),
    };
    const { error } = rateQ.data
      ? await supabase.from("rate_cards").update(payload).eq("id", rateQ.data.id)
      : await supabase.from("rate_cards").insert(payload);
    if (!error) {
      await supabase.from("profiles").update({ rider_type: payload.payment_type }).eq("id", rider.id);
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Rate card saved");
    logActivity("Updated rate card", "rider", rider.id);
    qc.invalidateQueries({ queryKey: ["rate-card", id] });
  }

  async function toggleActive() {
    if (!rider) return;
    const next = !rider.active;
    const { error } = await supabase.from("profiles").update({ active: next }).eq("id", rider.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Rider activated" : "Rider deactivated");
    pushNotification({ user_id: rider.id, type: "account", title: next ? "Account activated" : "Account deactivated",
      body: next ? "Your BM Xpress account is active again." : "Your account has been deactivated. Contact your hub manager." });
    logActivity(next ? "Activated rider" : "Deactivated rider", "rider", rider.id, { name: rider.full_name });
    qc.invalidateQueries({ queryKey: ["rider", id] });
    qc.invalidateQueries({ queryKey: ["riders"] });
  }

  async function resetPassword() {
    if (!rider || newPassword.length < 6) { toast.error("Minimum 6 characters"); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "reset_password", user_id: rider.id, password: newPassword },
    });
    setSaving(false);
    const err = (error || (data as { error?: string })?.error) ? await edgeErrorMessage(error, data) : null;
    if (err) { toast.error("Reset failed", { description: err }); return; }
    toast.success("Password reset", { description: "Rider must set a new password at next login." });
    logActivity("Reset rider password", "rider", rider.id);
    setResetOpen(false); setNewPassword("");
  }

  if (riderQ.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  }
  if (!rider) {
    return <div className="text-sm text-[var(--muted)]">Rider not found. <Link className="text-brand-600 underline" href="/riders">Back to riders</Link></div>;
  }

  const pt = (rateForm.payment_type ?? "per_order") as PaymentType;
  const money = (v?: number) => formatINR(v ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={rider.full_name}
        description={<span className="flex flex-wrap items-center gap-2"><RiderChip code={rider.rider_code} /> <span>{displayLogin(rider)}</span> <Badge variant={rider.active ? "success" : "danger"}>{rider.active ? "Active" : "Inactive"}</Badge> <Badge variant={rider.rider_type === "mg" ? "teal" : "default"}>{rider.rider_type === "mg" ? "MG" : "Per Order"}</Badge></span>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/riders")}><ArrowLeft /> Back</Button>
            <Button variant="secondary" onClick={() => setResetOpen(true)}><KeyRound /> Reset Password</Button>
            <Button variant={rider.active ? "destructive" : "success"} onClick={toggleActive}>
              {rider.active ? <><UserX /> Deactivate</> : <><UserCheck /> Activate</>}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Wallet Balance" value={money(walletQ.data?.wallet_balance)} icon={Wallet} money tone="brand" />
        <StatCard title="Total Earned" value={money(walletQ.data?.total_earned)} icon={Landmark} money />
        <StatCard title="Total Paid" value={money(walletQ.data?.total_paid)} icon={ShieldCheck} money tone="teal" />
        <StatCard title="Pending Requests" value={money(walletQ.data?.pending_amount)} icon={FileBadge} money tone="warn" />
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="rate">Rate Card</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Rider Details</CardTitle>
              <CardDescription>Identity, vehicle, hub and payment destination</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {signedPhoto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signedPhoto} alt={rider.full_name} className="size-20 rounded-2xl border border-[var(--border)] object-cover" />
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Full Name"><Input value={profileForm.full_name ?? ""} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} /></Field>
                <Field label="Mobile"><Input value={profileForm.phone ?? ""} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} /></Field>
                <Field label="Email"><Input value={profileForm.email ?? ""} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} /></Field>
                <Field label="Hub">
                  <Select value={profileForm.hub_id ?? ""} onChange={(e) => setProfileForm({ ...profileForm, hub_id: e.target.value })}>
                    <option value="">— No hub —</option>
                    {hubs?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </Select>
                </Field>
                <Field label="Joining Date"><Input type="date" value={profileForm.joining_date ?? ""} onChange={(e) => setProfileForm({ ...profileForm, joining_date: e.target.value })} /></Field>
                <Field label="Vehicle Type">
                  <Select value={profileForm.vehicle_type ?? ""} onChange={(e) => setProfileForm({ ...profileForm, vehicle_type: e.target.value })}>
                    <option value="">Select</option><option>Bike</option><option>Scooter</option><option>EV</option><option>Cycle</option><option>Van</option>
                  </Select>
                </Field>
                <Field label="Vehicle Number"><Input value={profileForm.vehicle_number ?? ""} onChange={(e) => setProfileForm({ ...profileForm, vehicle_number: e.target.value })} /></Field>
                <Field label="Aadhaar Number"><Input value={profileForm.aadhaar_number ?? ""} onChange={(e) => setProfileForm({ ...profileForm, aadhaar_number: e.target.value })} /></Field>
                <Field label="PAN Number"><Input value={profileForm.pan_number ?? ""} onChange={(e) => setProfileForm({ ...profileForm, pan_number: e.target.value })} /></Field>
                <Field label="DL Number"><Input value={profileForm.dl_number ?? ""} onChange={(e) => setProfileForm({ ...profileForm, dl_number: e.target.value })} /></Field>
                <Field label="Bank Name"><Input value={profileForm.bank_name ?? ""} onChange={(e) => setProfileForm({ ...profileForm, bank_name: e.target.value })} /></Field>
                <Field label="Account Number"><Input value={profileForm.account_number ?? ""} onChange={(e) => setProfileForm({ ...profileForm, account_number: e.target.value })} /></Field>
                <Field label="IFSC"><Input value={profileForm.ifsc ?? ""} onChange={(e) => setProfileForm({ ...profileForm, ifsc: e.target.value.toUpperCase() })} /></Field>
                <Field label="UPI ID"><Input value={profileForm.upi_id ?? ""} onChange={(e) => setProfileForm({ ...profileForm, upi_id: e.target.value })} /></Field>
                <Field label="Emergency Contact"><Input value={profileForm.emergency_contact ?? ""} onChange={(e) => setProfileForm({ ...profileForm, emergency_contact: e.target.value })} /></Field>
                <Field label="Address"><Input value={profileForm.address ?? ""} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} /></Field>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save Profile</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rate" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Rate Card</CardTitle>
              <CardDescription>Controls how daily earnings are calculated for this rider</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-xs">
                <Field label="Payment Model">
                  <Select value={pt} onChange={(e) => setRateForm({ ...rateForm, payment_type: e.target.value as PaymentType })}>
                    <option value="per_order">Per Order</option>
                    <option value="mg">Minimum Guarantee (MG)</option>
                  </Select>
                </Field>
              </div>

              {pt === "per_order" ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <NumField label="Rate per Order (₹)" v={rateForm.rate_per_order} set={(v) => setRateForm({ ...rateForm, rate_per_order: v })} />
                  <NumField label="Extra KM Rate (₹)" v={rateForm.extra_km_rate} set={(v) => setRateForm({ ...rateForm, extra_km_rate: v })} />
                  <NumField label="COD Incentive (₹/order)" v={rateForm.cod_incentive} set={(v) => setRateForm({ ...rateForm, cod_incentive: v })} />
                  <NumField label="Fuel Allowance (₹/day)" v={rateForm.fuel_allowance} set={(v) => setRateForm({ ...rateForm, fuel_allowance: v })} />
                  <NumField label="Weekly Bonus (₹)" v={rateForm.weekly_bonus} set={(v) => setRateForm({ ...rateForm, weekly_bonus: v })} />
                  <NumField label="Monthly Bonus (₹)" v={rateForm.monthly_bonus} set={(v) => setRateForm({ ...rateForm, monthly_bonus: v })} />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <NumField label="Daily MG (₹)" v={rateForm.daily_mg} set={(v) => setRateForm({ ...rateForm, daily_mg: v })} />
                  <NumField label="Monthly MG (₹)" v={rateForm.monthly_mg} set={(v) => setRateForm({ ...rateForm, monthly_mg: v })} />
                  <NumField label="Required Orders / Day" v={rateForm.required_orders} set={(v) => setRateForm({ ...rateForm, required_orders: v })} />
                  <NumField label="Working Hours" v={rateForm.working_hours} set={(v) => setRateForm({ ...rateForm, working_hours: v })} />
                  <NumField label="Incentive per Extra Order (₹)" v={rateForm.incentive_per_extra_order} set={(v) => setRateForm({ ...rateForm, incentive_per_extra_order: v })} />
                  <NumField label="Overtime Rate (₹/hr)" v={rateForm.overtime_rate} set={(v) => setRateForm({ ...rateForm, overtime_rate: v })} />
                  <NumField label="COD Incentive (₹/order)" v={rateForm.cod_incentive} set={(v) => setRateForm({ ...rateForm, cod_incentive: v })} />
                </div>
              )}

              <div className="waybill-rule grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                <NumField label="Attendance Bonus (₹/day)" v={rateForm.attendance_bonus} set={(v) => setRateForm({ ...rateForm, attendance_bonus: v })} />
                <NumField label="Penalty Rate (₹)" v={rateForm.penalty_rate} set={(v) => setRateForm({ ...rateForm, penalty_rate: v })} />
              </div>

              <div className="flex justify-end">
                <Button onClick={saveRateCard} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save Rate Card</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent title="Reset Password" description={`Set a temporary password for ${rider.full_name}. They'll be asked to change it at next login.`}>
          <div className="space-y-3">
            <Field label="New Password"><Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button>
              <Button onClick={resetPassword} disabled={saving}>{saving ? "Resetting…" : "Reset Password"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function NumField({ label, v, set }: { label: string; v?: number; set: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={0} step="0.01" value={v ?? 0} onChange={(e) => set(Number(e.target.value))} className="money" />
    </div>
  );
}
