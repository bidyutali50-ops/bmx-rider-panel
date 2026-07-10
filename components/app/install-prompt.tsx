"use client";

import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "bmx_install_dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Register the service worker (required for install on Android/desktop)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* install support is a bonus; never break the app over it */
      });
    }

    // Already installed? Then never nag.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* private mode */
    }
    if (dismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires beforeinstallprompt — show manual instructions instead.
    const ua = window.navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|android/i.test(ua);
    if (isIos && isSafari) {
      setShowIosHint(true);
      setHidden(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500 font-display text-sm font-bold text-white">
          BM
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install BM Xpress Rider</p>
          {showIosHint ? (
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Tap <Share className="inline size-3" /> Share, then{" "}
              <span className="font-medium">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Add it to your home screen for quick access to earnings and payouts.
            </p>
          )}
          {!showIosHint && (
            <button
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Download className="size-3.5" /> Install
            </button>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-[var(--muted)] hover:text-[var(--fg)]">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
