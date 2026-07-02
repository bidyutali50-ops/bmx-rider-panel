import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { AdminShell } from "@/components/app/shell";
import { STAFF_ROLES, type Role } from "@/lib/types";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, first_login, active")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.first_login) redirect("/welcome");
  if (!STAFF_ROLES.includes(profile.role as Role)) redirect("/rider");

  return (
    <AdminShell role={profile.role as Role} name={profile.full_name} userId={user.id}>
      {children}
    </AdminShell>
  );
}
