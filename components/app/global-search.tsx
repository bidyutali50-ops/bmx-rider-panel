"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Bike, Warehouse } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/client";
import { RiderChip } from "./rider-chip";

interface Result {
  kind: "rider" | "hub";
  id: string;
  title: string;
  subtitle: string;
  code?: string | null;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const supabase = supabaseBrowser();
      const term = `%${q.trim()}%`;
      const [riders, hubs] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, phone, rider_code, role")
          .eq("role", "rider")
          .or(`full_name.ilike.${term},phone.ilike.${term},rider_code.ilike.${term}`)
          .limit(6),
        supabase.from("hubs").select("id, name, city, code").or(`name.ilike.${term},code.ilike.${term},city.ilike.${term}`).limit(4),
      ]);
      const r: Result[] = [
        ...((riders.data ?? []) as { id: string; full_name: string; phone: string | null; rider_code: string | null }[]).map((p) => ({
          kind: "rider" as const,
          id: p.id,
          title: p.full_name,
          subtitle: p.phone ?? "",
          code: p.rider_code,
        })),
        ...((hubs.data ?? []) as { id: string; name: string; city: string | null; code: string | null }[]).map((h) => ({
          kind: "hub" as const,
          id: h.id,
          title: h.name,
          subtitle: h.city ?? "",
          code: h.code,
        })),
      ];
      setResults(r);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function go(r: Result) {
    setOpen(false);
    setQ("");
    router.push(r.kind === "rider" ? `/riders/${r.id}` : "/hubs");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--muted)] transition-colors hover:border-brand-500/50"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search riders, hubs…</span>
        <kbd className="hidden rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] sm:block">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Global search" description="Find a rider by name, mobile number or rider ID — or jump to a hub.">
          <Input
            autoFocus
            placeholder="Type a name, mobile, rider ID or hub…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-3 max-h-72 space-y-0.5 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.kind + r.id}
                onClick={() => go(r)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-ink-100 dark:hover:bg-ink-850"
              >
                {r.kind === "rider" ? (
                  <Bike className="size-4 text-brand-500" />
                ) : (
                  <Warehouse className="size-4 text-teal-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{r.subtitle}</p>
                </div>
                <RiderChip code={r.code} />
              </button>
            ))}
            {q && !results.length && (
              <p className="py-6 text-center text-sm text-[var(--muted)]">No matches for “{q}”.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
