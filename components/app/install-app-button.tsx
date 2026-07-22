"use client";

import { useEffect, useState } from "react";
import { Download, Share, Check } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Always-available install entry point (Profile screen). */
export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) { setInstalled(true); return; }

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));

    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|android/i.test(ua)) setIos(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  }

  if (installed) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-teal-500/10 px-3 py-2.5 text-sm font-medium text-teal-600 dark:text-teal-400">
        <Check className="size-4" /> App installed on this device
      </div>
    );
  }

  if (ios) {
    return (
      <p className="rounded-lg border border-[var(--border)] px-3 py-2.5 text-xs text-[var(--muted)]">
        To install: tap <Share className="inline size-3.5" /> <span className="font-medium">Share</span>, then{" "}
        <span className="font-medium">Add to Home Screen</span>.
      </p>
    );
  }

  return (
    <button
      onClick={install}
      disabled={!deferred}
      className="press flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
    >
      <Download className="size-4" />
      {deferred ? "Install BM Xpress app" : "Open in Chrome to install"}
    </button>
  );
}
