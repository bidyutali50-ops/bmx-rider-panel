"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, CalendarCheck, UserRound, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { BrandLockup } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsBell } from "./notifications-bell";

const NAV = [
  { href: "/rider", label: "Home", icon: LayoutDashboard },
  { href: "/rider/payouts", label: "Wallet", icon: Wallet },
  { href: "/rider/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/rider/profile", label: "Profile", icon: UserRound },
];

export function RiderShell({ userId, name, children }: { userId: string; name: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <BrandLockup />
          <div className="flex items-center gap-1.5">
            <NotificationsBell userId={userId} isStaff={false} />
            <ThemeToggle />
            <button onClick={signOut} className="rounded-lg p-2 text-[var(--muted)] hover:bg-ink-100 hover:text-[var(--fg)] dark:hover:bg-ink-850" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        <nav className="mx-auto hidden max-w-3xl items-center gap-1 px-4 pb-2 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                  active ? "bg-brand-500 text-white" : "text-[var(--muted)] hover:text-[var(--fg)]")}>
                <item.icon className="size-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl p-4">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
                  active ? "text-brand-600 dark:text-brand-400" : "text-[var(--muted)]")}>
                <item.icon className="size-5" /> {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
