"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Warehouse,
  Bike,
  ClipboardList,
  FileSpreadsheet,
  CreditCard,
  AlertTriangle,
  Wallet,
  CalendarCheck,
  BarChart3,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLockup } from "./brand";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

const SECTIONS: {
  title: string | null;
  items: { href: string; label: string; icon: typeof LayoutDashboard; roles: string[] }[];
}[] = [
  {
    title: null,
    items: [
      { href: "/dashboard", label: "Dispatch", icon: LayoutDashboard, roles: ["super_admin", "admin", "hub_manager", "data_entry"] },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/riders", label: "Riders", icon: Bike, roles: ["super_admin", "admin", "hub_manager"] },
      { href: "/hubs", label: "Hubs", icon: Warehouse, roles: ["super_admin", "admin", "hub_manager"] },
      { href: "/data-entry", label: "Data Entry", icon: ClipboardList, roles: ["super_admin", "admin", "hub_manager", "data_entry"] },
      { href: "/attendance", label: "Attendance", icon: CalendarCheck, roles: ["super_admin", "admin", "hub_manager", "data_entry"] },
      { href: "/pending-entries", label: "Pending", icon: AlertTriangle, roles: ["super_admin", "admin", "hub_manager", "data_entry"] },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/client-import", label: "Client Import", icon: FileSpreadsheet, roles: ["super_admin", "admin"] },
      { href: "/rider-payout", label: "Rider Payout", icon: CreditCard, roles: ["super_admin", "admin"] },
      { href: "/payouts", label: "Payouts", icon: Wallet, roles: ["super_admin", "admin"] },
      { href: "/reports", label: "Reports", icon: BarChart3, roles: ["super_admin", "admin", "hub_manager"] },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, roles: ["super_admin", "admin"] },
    ],
  },
];

export function Sidebar({
  role,
  name,
  open,
  onClose,
}: {
  role: Role;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden no-print" onClick={onClose} />
      )}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--card)] transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-5">
          <BrandLockup />
          <button className="rounded-lg p-1 lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {SECTIONS.map((section, si) => {
            const visible = section.items.filter((n) => n.roles.includes(role));
            if (!visible.length) return null;
            return (
              <div key={si} className="space-y-0.5">
                {section.title && (
                  <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]/70">
                    {section.title}
                  </p>
                )}
                {visible.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                          : "text-[var(--muted)] hover:bg-ink-100 hover:text-[var(--fg)] dark:hover:bg-ink-850"
                      )}
                    >
                      <span
                        className={cn(
                          "h-4 w-[3px] rounded-full transition-colors",
                          active ? "bg-brand-500" : "bg-transparent group-hover:bg-ink-300 dark:group-hover:bg-ink-700"
                        )}
                      />
                      <item.icon className="size-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-dashed border-[var(--border)] p-4">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-[var(--muted)]">{ROLE_LABELS[role]}</p>
          <button
            onClick={signOut}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
