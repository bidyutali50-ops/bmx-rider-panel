import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(value: number | null | undefined, opts?: { compact?: boolean }) {
  const v = Number(value ?? 0);
  if (opts?.compact && Math.abs(v) >= 100000) {
    return "\u20B9" + (v / 100000).toFixed(1).replace(/\.0$/, "") + "L";
  }
  return "\u20B9" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartISO(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function phoneToLoginEmail(input: string) {
  const trimmed = input.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return trimmed.replace(/\D/g, "") + "@bmxpress.internal";
}

export function displayLogin(profile: { phone?: string | null; email?: string | null }) {
  return profile.email || profile.phone || "—";
}
