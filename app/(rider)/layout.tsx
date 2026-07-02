import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { RiderShell } from "@/components/app/rider-shell";

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, first_login, active")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.first_login) redirect("/welcome");
  if (profile.role !== "rider") redirect("/dashboard");

  return <RiderShell userId={user.id} name={profile.full_name}>{children}</RiderShell>;
}
