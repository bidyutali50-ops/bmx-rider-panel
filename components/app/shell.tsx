"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { Role } from "@/lib/types";

export function AdminShell({
  role,
  name,
  userId,
  children,
}: {
  role: Role;
  name: string;
  userId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh">
      <Sidebar role={role} name={name} open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-64">
        <Topbar userId={userId} isStaff onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1400px] p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
