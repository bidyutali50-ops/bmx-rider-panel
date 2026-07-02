"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, ShieldCheck, KeyRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMyProfile } from "@/lib/hooks";
import { displayLogin } from "@/lib/utils";
import { RiderChip } from "@/components/app/rider-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function RiderProfilePage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();
  const { data: me, isLoading } = useMyProfile();

  const [form, setForm] = useState({ upi_id: "", bank_name: "", account_number: "", ifsc: "", emergency_contact: "", address: "" });
  const [pwd, setPwd] = useState({ p1: "", p2: "" });
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      setForm({
        upi_id: me.upi_id ?? "", bank_name: me.bank_name ?? "", account_number: me.account_number ?? "",
        ifsc: me.ifsc ?? "", emergency_contact: me.emergency_contact ?? "", address: me.address ?? "",
      });
      if (me.photo_url) {
        supabase.storage.from("rider-docs").createSignedUrl(me.photo_url, 3600)
          .then(({ data }) => setPhoto(data?.signedUrl ?? null));
      }
    }
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!me) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      upi_id: form.upi_id.trim() || null,
      bank_name: form.bank_name.trim() || null,
      account_number: form.account_number.trim() || null,
      ifsc: form.ifsc.trim().toUpperCase() || null,
      emergency_contact: form.emergency_contact.trim() || null,
      address: form.address.trim() || null,
    }).eq("id", me.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["my-profile"] });
  }

  async function changePassword() {
    if (pwd.p1.length < 6) { toast.error("Minimum 6 characters"); return; }
    if (pwd.p1 !== pwd.p2) { toast.error("Passwords do not match"); return; }
    setChanging(true);
    const { error } = await supabase.auth.updateUser({ password: pwd.p1 });
    setChanging(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password changed");
    setPwd({ p1: "", p2: "" });
  }

  if (isLoading || !me) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-5">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={me.full_name} className="size-16 rounded-2xl border border-[var(--border)] object-cover" />
          ) : (
            <div className="grid size-16 place-items-center rounded-2xl bg-brand-500/12 font-display text-xl font-bold text-brand-600 dark:text-brand-400">
              {me.full_name.charAt(0)}
            </div>
          )}
          <div>
            <div className="font-display text-lg font-bold">{me.full_name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <RiderChip code={me.rider_code} />
              <span className="money">{displayLogin(me)}</span>
              <Badge variant={me.rider_type === "mg" ? "teal" : "default"}>{me.rider_type === "mg" ? "MG" : "Per Order"}</Badge>
              {me.hubs?.name && <span>{me.hubs.name}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment & Contact Details</CardTitle>
          <CardDescription>These are used when your payouts are processed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="UPI ID"><Input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="name@upi" /></F>
            <F label="Bank Name"><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></F>
            <F label="Account Number"><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className="money" /></F>
            <F label="IFSC"><Input value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} className="money" /></F>
            <F label="Emergency Contact"><Input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} /></F>
            <F label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></F>
          </div>
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--muted)]">
            <ShieldCheck className="mr-1 inline size-3.5 text-brand-500" />
            Name, mobile, hub, documents and payment model can only be changed by your admin.
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save Changes</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="size-4 text-brand-500" /> Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="New Password"><Input type="password" value={pwd.p1} onChange={(e) => setPwd({ ...pwd, p1: e.target.value })} /></F>
            <F label="Confirm Password"><Input type="password" value={pwd.p2} onChange={(e) => setPwd({ ...pwd, p2: e.target.value })} /></F>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={changePassword} disabled={changing}>
              {changing ? <Loader2 className="animate-spin" /> : <KeyRound />} Update Password
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
