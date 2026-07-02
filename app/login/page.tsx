"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { phoneToLoginEmail } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/app/brand";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = supabaseBrowser();
    const email = phoneToLoginEmail(identifier);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Sign in failed", { description: "Check your mobile number / email and password." });
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <svg className="absolute -top-24 left-1/2 w-[900px] -translate-x-1/2 opacity-[0.07]" viewBox="0 0 900 400">
          <path d="M0 320 C 200 260, 300 120, 480 140 S 780 260, 900 180" fill="none" stroke="#f4570c" strokeWidth="3" strokeDasharray="2 14" strokeLinecap="round" />
        </svg>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.21, 0.6, 0.35, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-12" />
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">BM XPRESS</h1>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
              Rider Payout Console
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="surface space-y-4 rounded-2xl p-6 shadow-lg">
          <div>
            <Label htmlFor="identifier">Mobile number or email</Label>
            <Input
              id="identifier"
              placeholder="98765 43210"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <Button className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} Sign in
          </Button>
          <p className="text-center text-xs text-[var(--muted)]">
            <Link href="/forgot-password" className="text-brand-500 hover:underline">
              Forgot password?
            </Link>
          </p>
        </form>
        <p className="mt-6 text-center text-[11px] text-[var(--muted)]">
          BM XPRESS LOGISTICS PRIVATE LIMITED
        </p>
      </motion.div>
    </main>
  );
}
