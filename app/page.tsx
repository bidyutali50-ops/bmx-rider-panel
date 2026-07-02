import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { STAFF_ROLES } from "@/lib/types";
import type { Role } from "@/lib/types";

export default async function Home() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_login")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.first_login) redirect("/welcome");
  if (STAFF_ROLES.includes(profile.role as Role)) redirect("/dashboard");
  redirect("/rider");
}
