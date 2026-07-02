"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/app/brand";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error("Could not send reset link", { description: error.message });
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandMark className="size-12" />
        </div>
        <div className="surface rounded-2xl p-6 shadow-lg">
          {sent ? (
            <div className="space-y-3 text-center">
              <h1 className="font-display text-lg font-semibold">Check your email</h1>
              <p className="text-sm text-[var(--muted)]">
                If an account exists for {email}, a password reset link is on its way.
              </p>
              <Link href="/login" className="inline-flex items-center gap-1 text-sm text-brand-500 hover:underline">
                <ArrowLeft className="size-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <h1 className="font-display text-lg font-semibold">Reset your password</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Enter your email and we&apos;ll send a reset link. Riders without email: ask your admin to reset your password.
                </p>
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />} Send reset link
              </Button>
              <p className="text-center text-xs">
                <Link href="/login" className="text-brand-500 hover:underline">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
