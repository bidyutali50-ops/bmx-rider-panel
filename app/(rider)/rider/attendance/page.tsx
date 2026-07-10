"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMyProfile } from "@/lib/hooks";
import { todayISO } from "@/lib/utils";
import type { Attendance, AttendanceStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const BADGE: Record<AttendanceStatus, "success" | "danger" | "warning" | "teal"> = {
  present: "success", absent: "danger", late: "warning", half_day: "teal",
};

export default function RiderAttendancePage() {
  const qc = useQueryClient();
  const supabase = supabaseBrowser();
  const { data: me } = useMyProfile();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const today = todayISO();

  const todayQ = useQuery({
    queryKey: ["my-attendance-today"],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("*")
        .eq("rider_id", me!.id).eq("att_date", today).maybeSingle();
      return (data ?? null) as Attendance | null;
    },
  });

  const monthQ = useQuery({
    queryKey: ["my-attendance-month", month],
    enabled: !!me,
    queryFn: async () => {
      const start = `${month}-01`;
      const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0).toISOString().slice(0, 10);
      const { data } = await supabase.from("attendance").select("*")
        .eq("rider_id", me!.id).gte("att_date", start).lte("att_date", end)
        .order("att_date", { ascending: false });
      return (data ?? []) as Attendance[];
    },
  });

  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, late: 0, half_day: 0 };
    for (const a of monthQ.data ?? []) s[a.status]++;
    return s;
  }, [monthQ.data]);

  /** Ask the phone for a precise fix. Rejects quickly if permission is denied. */
  function getLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("This device cannot share location."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            reject(new Error("Location permission denied. Allow location for this site, then try again."));
          } else if (err.code === err.TIMEOUT) {
            reject(new Error("Could not get your location in time. Move outdoors and try again."));
          } else {
            reject(new Error("Could not get your location. Turn on GPS and try again."));
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function punch(action: "in" | "out") {
    if (!me) return;
    setBusy(true);
    setLocating(true);

    let coords: { lat: number; lng: number } | null = null;
    try {
      coords = await getLocation();
    } catch (e) {
      setBusy(false); setLocating(false);
      toast.error("Location needed", { description: String((e as Error).message) });
      return;
    }
    setLocating(false);

    let error: { message: string } | null = null;
    try {
      const res = await supabase.rpc("rider_punch", {
        p_action: action,
        p_lat: coords.lat,
        p_lng: coords.lng,
      });
      error = res.error;
    } catch (e) {
      error = { message: String((e as Error)?.message ?? e) };
    }
    setBusy(false);

    if (error) {
      const net = /failed to fetch|networkerror|load failed/i.test(error.message);
      toast.error(action === "in" ? "Could not punch in" : "Could not punch out", {
        description: net ? "Check your internet connection and try again." : error.message,
      });
      return;
    }

    toast.success(action === "in" ? "Punched in" : "Punched out", {
      description: action === "in"
        ? "Your shift has started. Half of your daily MG is credited; punch out to earn the full amount."
        : "Shift complete. Your full daily MG has been credited.",
    });
    qc.invalidateQueries({ queryKey: ["my-attendance-today"] });
    qc.invalidateQueries({ queryKey: ["my-attendance-month"] });
    qc.invalidateQueries({ queryKey: ["my-wallet"] });
    qc.invalidateQueries({ queryKey: ["my-earnings"] });
  }

  const checkIn = () => punch("in");
  const checkOut = () => punch("out");

  const t = todayQ.data;
  const fmtTime = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Today · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", weekday: "long" })}</CardTitle>
          <CardDescription>Punch in at your hub when you start, and punch out when you finish. Location is checked.</CardDescription>
        </CardHeader>
        <CardContent>
          {todayQ.isLoading ? <Skeleton className="h-20" /> : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Check In</div>
                  <div className="money text-lg font-semibold">{fmtTime(t?.check_in)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Check Out</div>
                  <div className="money text-lg font-semibold">{fmtTime(t?.check_out)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Status</div>
                  {t ? <Badge variant={BADGE[t.status]}>{t.status.replace("_", " ")}</Badge> : <Badge variant="muted">not marked</Badge>}
                </div>
              </div>
              <div className="flex gap-2">
                {!t?.check_in && (
                  <Button onClick={checkIn} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <LogIn />} {locating ? "Getting location…" : "Punch In"}</Button>
                )}
                {t?.check_in && !t?.check_out && (
                  <Button variant="secondary" onClick={checkOut} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <LogOut />} {locating ? "Getting location…" : "Punch Out"}</Button>
                )}
                {t?.check_in && t?.check_out && <Badge variant="success">Shift complete</Badge>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-end justify-between space-y-0">
          <div>
            <CardTitle>Monthly Summary</CardTitle>
            <CardDescription>
              <span className="text-emerald-600 dark:text-emerald-400">{summary.present} present</span> · <span className="text-amber-600 dark:text-amber-400">{summary.late} late</span> · {summary.half_day} half day · <span className="text-red-500">{summary.absent} absent</span>
            </CardDescription>
          </div>
          <div className="w-40 space-y-1.5">
            <Label>Month</Label>
            <Input type="month" max={todayISO().slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {monthQ.isLoading ? <Skeleton className="h-32" /> : !monthQ.data?.length ? (
            <p className="text-sm text-[var(--muted)]">No attendance records for this month.</p>
          ) : (
            <div className="space-y-2">
              {monthQ.data.map((a) => (
                <div key={a.id} className="waybill-rule flex items-center justify-between gap-3 pb-2 text-sm">
                  <span className="money">{new Date(a.att_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" })}</span>
                  <span className="money text-xs text-[var(--muted)]">{fmtTime(a.check_in)} → {fmtTime(a.check_out)}</span>
                  <Badge variant={BADGE[a.status]}>{a.status.replace("_", " ")}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
