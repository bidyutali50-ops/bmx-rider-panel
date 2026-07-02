"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "./global-search";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";

export function Topbar({
  userId,
  isStaff,
  onMenu,
}: {
  userId: string;
  isStaff: boolean;
  onMenu: () => void;
}) {
  return (
    <header className="no-print sticky top-0 z-30 glass flex h-14 items-center gap-3 border-b border-[var(--border)] px-4">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu />
      </Button>
      <div className="flex-1">{isStaff && <GlobalSearch />}</div>
      <NotificationsBell userId={userId} isStaff={isStaff} />
      <ThemeToggle />
    </header>
  );
}
