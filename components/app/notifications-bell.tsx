"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, CheckCheck } from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export function NotificationsBell({ userId, isStaff }: { userId: string; isStaff: boolean }) {
  const [items, setItems] = useState<Notification[]>([]);
  const supabase = supabaseBrowser();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(15);
    setItems((data as Notification[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("notifications-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new as Notification;
          const mine = n.user_id === userId || (n.audience === "staff" && isStaff);
          if (mine) {
            toast(n.title, { description: n.body ?? undefined });
            setItems((prev) => [n, ...prev].slice(0, 15));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, isStaff, load]);

  const unread = items.filter((i) => !i.read).length;

  async function markAllRead() {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", ids);
  }

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-xl surface p-2 shadow-xl animate-fade-up"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="font-display text-sm font-semibold">Notifications</p>
            <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-brand-500 hover:underline">
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-[var(--muted)]">You&apos;re all caught up.</p>
            )}
            {items.map((n) => (
              <div key={n.id} className="waybill-rule flex gap-2.5 px-2 py-2.5 last:border-0">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-ink-300 dark:bg-ink-700" : "bg-brand-500"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{n.title}</p>
                  {n.body && <p className="truncate text-xs text-[var(--muted)]">{n.body}</p>}
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
