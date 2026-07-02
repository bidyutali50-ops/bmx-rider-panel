"use client";

import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "./supabase/client";
import type { Hub, Profile } from "./types";

export function useHubs() {
  return useQuery({
    queryKey: ["hubs"],
    queryFn: async () => {
      const { data, error } = await supabaseBrowser()
        .from("hubs")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Hub[];
    },
  });
}

export function useRiders(opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ["riders", opts?.activeOnly ?? false],
    queryFn: async () => {
      let q = supabaseBrowser()
        .from("profiles")
        .select("*, hubs(id, name, code)")
        .eq("role", "rider")
        .order("full_name");
      if (opts?.activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
}

export function useMyProfile() {
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const supabase = supabaseBrowser();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*, hubs(id, name, code)")
        .eq("id", userData.user.id)
        .single();
      return data as Profile | null;
    },
  });
}
