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

// Supabase functions.invoke() wraps non-2xx responses in a FunctionsHttpError
// whose .message is generic ("Edge Function returned a non-2xx status code").
// The real, human-friendly message we returned lives in the response body.
// This reads it out so the UI can show the actual reason.
export async function edgeErrorMessage(
  error: unknown,
  data: unknown
): Promise<string | null> {
  const bodyErr = (data as { error?: string } | null)?.error;
  if (bodyErr) return bodyErr;
  if (!error) return null;
  const ctx = (error as { context?: unknown }).context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).json();
      if (body?.error) return body.error as string;
    } catch {
      // fall through to text
    }
    try {
      const txt = await (ctx as Response).text?.();
      if (txt) return txt;
    } catch {
      // ignore
    }
  }
  return (error as { message?: string }).message ?? "Something went wrong";
}
