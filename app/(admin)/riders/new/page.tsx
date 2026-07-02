"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, UploadCloud, ShieldCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useHubs } from "@/lib/hooks";
import { pushNotification, logActivity } from "@/lib/notify";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const schema = z.object({
  full_name: z.string().min(2, "Rider name is required"),
  phone: z.string().min(10, "Valid mobile number required"),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6, "Minimum 6 characters"),
  aadhaar_number: z.string().optional(),
  pan_number: z.string().optional(),
  dl_number: z.string().optional(),
  vehicle_type: z.string().optional(),
  vehicle_number: z.string().optional(),
  hub_id: z.string().min(1, "Select a hub"),
  joining_date: z.string(),
  payment_type: z.enum(["per_order", "mg"]),
  bank_name: z.string().optional(),
  account_number: z.string().optional(),
  ifsc: z.string().optional(),
  upi_id: z.string().optional(),
  emergency_contact: z.string().optional(),
  address: z.string().optional(),
  // per order
  rate_per_order: z.coerce.number().min(0).default(0),
  extra_km_rate: z.coerce.number().min(0).default(0),
  cod_incentive: z.coerce.number().min(0).default(0),
  fuel_allowance: z.coerce.number().min(0).default(0),
  weekly_bonus: z.coerce.number().min(0).default(0),
  monthly_bonus: z.coerce.number().min(0).default(0),
  // mg
  daily_mg: z.coerce.number().min(0).default(0),
  monthly_mg: z.coerce.number().min(0).default(0),
  required_orders: z.coerce.number().min(0).default(0),
  working_hours: z.coerce.number().min(0).default(0),
  incentive_per_extra_order: z.coerce.number().min(0).default(0),
  overtime_rate: z.coerce.number().min(0).default(0),
  // shared
  attendance_bonus: z.coerce.number().min(0).default(0),
  penalty_rate: z.coerce.number().min(0).default(0),
});
type FormValues = z.infer<typeof schema>;

type DocKey = "photo" | "aadhaar" | "pan" | "license";

export default function NewRiderPage() {
  const router = useRouter();
  const { data: hubs } = useHubs();
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<Partial<Record<DocKey, File>>>({});

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      joining_date: new Date().toISOString().slice(0, 10),
      payment_type: "per_order",
      rate_per_order: 50,
      daily_mg: 700,
      required_orders: 25,
      incentive_per_extra_order: 15,
    } as Partial<FormValues>,
  });
  const paymentType = form.watch("payment_type");
  const errors = form.formState.errors;

  function onDoc(key: DocKey) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) setDocs((d) => ({ ...d, [key]: f }));
    };
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const supabase = supabaseBrowser();

    const rateCard =
      values.payment_type === "per_order"
        ? {
            payment_type: "per_order",
            rate_per_order: values.rate_per_order,
            extra_km_rate: values.extra_km_rate,
            cod_incentive: values.cod_incentive,
            fuel_allowance: values.fuel_allowance,
            weekly_bonus: values.weekly_bonus,
            monthly_bonus: values.monthly_bonus,
            attendance_bonus: values.attendance_bonus,
            penalty_rate: values.penalty_rate,
            effective_date: values.joining_date,
          }
        : {
            payment_type: "mg",
            daily_mg: values.daily_mg,
            monthly_mg: values.monthly_mg,
            required_orders: values.required_orders,
            working_hours: values.working_hours,
            incentive_per_extra_order: values.incentive_per_extra_order,
            overtime_rate: values.overtime_rate,
            attendance_bonus: values.attendance_bonus,
            penalty_rate: values.penalty_rate,
            effective_date: values.joining_date,
          };

    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "create_user",
        full_name: values.full_name,
        phone: values.phone,
        email: values.email || undefined,
        password: values.password,
        role: "rider",
        hub_id: values.hub_id,
        profile: {
          aadhaar_number: values.aadhaar_number || null,
          pan_number: values.pan_number || null,
          dl_number: values.dl_number || null,
          vehicle_type: values.vehicle_type || null,
          vehicle_number: values.vehicle_number || null,
          joining_date: values.joining_date,
          bank_name: values.bank_name || null,
          account_number: values.account_number || null,
          ifsc: values.ifsc || null,
          upi_id: values.upi_id || null,
          emergency_contact: values.emergency_contact || null,
          address: values.address || null,
        },
        rate_card: rateCard,
      },
    });

    const err = error?.message || (data as { error?: string })?.error;
    if (err) {
      setSaving(false);
      toast.error("Could not create rider", { description: err });
      return;
    }

    const userId = (data as { user_id: string }).user_id;
    const riderCode = (data as { profile?: { rider_code?: string } }).profile?.rider_code;

    // Upload documents
    const urlUpdates: Record<string, string> = {};
    for (const [key, file] of Object.entries(docs) as [DocKey, File][]) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/${key}.${ext}`;
      const { error: upErr } = await supabase.storage.from("rider-docs").upload(path, file, { upsert: true });
      if (upErr) {
        toast.warning(`Could not upload ${key}`, { description: upErr.message });
        continue;
      }
      const field = key === "photo" ? "photo_url" : key === "aadhaar" ? "aadhaar_url" : key === "pan" ? "pan_url" : "dl_url";
      urlUpdates[field] = path;
    }
    if (Object.keys(urlUpdates).length) {
      await supabase.from("profiles").update(urlUpdates).eq("id", userId);
    }

    pushNotification({
      audience: "staff",
      type: "rider",
      title: `New rider onboarded: ${values.full_name}`,
      body: `${riderCode ?? ""} · ${values.payment_type === "mg" ? "MG" : "Per Order"}`,
    });
    logActivity(`Onboarded rider ${values.full_name} (${riderCode ?? ""})`, "rider", userId);

    toast.success("Rider onboarded", {
      description: `${values.full_name} can sign in with mobile ${values.phone}. Rider ID ${riderCode ?? ""}.`,
    });
    setSaving(false);
    router.push(`/riders/${userId}`);
  }

  const num = (name: keyof FormValues, label: string, hint?: string) => (
    <div key={name}>
      <Label>{label}</Label>
      <Input type="number" step="0.01" min={0} className="money" {...form.register(name)} />
      {hint && <p className="mt-1 text-[11px] text-[var(--muted)]">{hint}</p>}
    </div>
  );

  const docField = (key: DocKey, label: string) => (
    <div key={key}>
      <Label>{label}</Label>
      <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--muted)] transition-colors hover:border-brand-500/60 hover:text-brand-500">
        <UploadCloud className="size-4" />
        <span className="max-w-[90%] truncate px-2">{docs[key]?.name ?? "Choose file"}</span>
        <input type="file" accept="image/*,.pdf" className="sr-only" onChange={onDoc(key)} />
      </label>
    </div>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Onboard rider"
        description="Creates the rider's profile, login, documents and payment structure in one step"
      />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Identity & login</CardTitle>
            <CardDescription>The rider signs in with their mobile number and this password, then sets their own.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Rider name</Label>
              <Input {...form.register("full_name")} placeholder="Full name" />
              {errors.full_name && <p className="mt-1 text-xs text-red-500">{errors.full_name.message}</p>}
            </div>
            <div>
              <Label>Mobile number</Label>
              <Input {...form.register("phone")} placeholder="9876543210" className="money" />
              {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input {...form.register("email")} type="email" placeholder="rider@example.com" />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input {...form.register("password")} placeholder="Share this with the rider" />
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <div>
              <Label>Emergency contact</Label>
              <Input {...form.register("emergency_contact")} className="money" />
            </div>
            <div>
              <Label>Address</Label>
              <Input {...form.register("address")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>KYC & documents</CardTitle>
            <CardDescription>Numbers are stored securely; files go to private storage.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Aadhaar number</Label>
              <Input {...form.register("aadhaar_number")} className="money" placeholder="XXXX XXXX XXXX" />
            </div>
            <div>
              <Label>PAN</Label>
              <Input {...form.register("pan_number")} className="money uppercase" />
            </div>
            <div>
              <Label>Driving license</Label>
              <Input {...form.register("dl_number")} className="money uppercase" />
            </div>
            <div className="col-span-full grid gap-3 sm:grid-cols-4">
              {docField("photo", "Rider photo")}
              {docField("aadhaar", "Aadhaar upload")}
              {docField("pan", "PAN upload")}
              {docField("license", "License upload")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hub & vehicle</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Hub</Label>
              <Select {...form.register("hub_id")}>
                <option value="">Select hub</option>
                {hubs?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
              {errors.hub_id && <p className="mt-1 text-xs text-red-500">{errors.hub_id.message}</p>}
            </div>
            <div>
              <Label>Joining date</Label>
              <Input type="date" {...form.register("joining_date")} />
            </div>
            <div>
              <Label>Vehicle type</Label>
              <Select {...form.register("vehicle_type")}>
                <option value="">Select</option>
                <option>Bike</option>
                <option>Scooter</option>
                <option>EV Scooter</option>
                <option>Bicycle</option>
                <option>Van</option>
              </Select>
            </div>
            <div>
              <Label>Vehicle number</Label>
              <Input {...form.register("vehicle_number")} className="money uppercase" placeholder="TN 01 AB 1234" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment model</CardTitle>
            <CardDescription>
              {paymentType === "per_order"
                ? "Net = completed orders × rate + incentives − penalties."
                : "Rider earns the daily MG when the order target is met, plus incentive for every extra order."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(["per_order", "mg"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => form.setValue("payment_type", t)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                    paymentType === t
                      ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-brand-500/40"
                  }`}
                >
                  {t === "per_order" ? "Per Order" : "MG (Minimum Guarantee)"}
                </button>
              ))}
            </div>

            {paymentType === "per_order" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {num("rate_per_order", "Rate per order (₹)")}
                {num("extra_km_rate", "Extra KM rate (₹)")}
                {num("cod_incentive", "COD incentive (₹/order)")}
                {num("fuel_allowance", "Fuel allowance (₹/day)")}
                {num("weekly_bonus", "Weekly bonus (₹)")}
                {num("monthly_bonus", "Monthly bonus (₹)")}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {num("daily_mg", "Daily MG (₹)", "e.g. ₹700 for 25 orders")}
                {num("monthly_mg", "Monthly MG (₹)")}
                {num("required_orders", "Required orders / day")}
                {num("working_hours", "Working hours / day")}
                {num("incentive_per_extra_order", "Incentive per extra order (₹)")}
                {num("overtime_rate", "Overtime rate (₹/hr)")}
              </div>
            )}

            <div className="grid gap-3 border-t border-dashed border-[var(--border)] pt-4 sm:grid-cols-3">
              {num("attendance_bonus", "Attendance bonus (₹/day)")}
              {num("penalty_rate", "Standard penalty (₹)")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bank & UPI</CardTitle>
            <CardDescription>Used when approving and paying payout requests.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label>Bank name</Label><Input {...form.register("bank_name")} /></div>
            <div><Label>Account number</Label><Input {...form.register("account_number")} className="money" /></div>
            <div><Label>IFSC</Label><Input {...form.register("ifsc")} className="money uppercase" /></div>
            <div><Label>UPI ID</Label><Input {...form.register("upi_id")} className="money" placeholder="name@upi" /></div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3 rounded-xl glass p-4">
          <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <ShieldCheck className="size-4 text-emerald-500" />
            A Rider ID is generated automatically and the rider is asked to set a new password on first sign in.
          </p>
          <Button size="lg" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Onboard rider
          </Button>
        </div>
      </form>
    </div>
  );
}
