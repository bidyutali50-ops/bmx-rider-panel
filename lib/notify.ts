"use client";

import { supabaseBrowser } from "./supabase/client";

/** Insert an in-app notification (realtime subscribers will receive it). */
export async function pushNotification(input: {
  user_id?: string | null;
  audience?: "user" | "staff";
  type?: string;
  title: string;
  body?: string;
}) {
  const supabase = supabaseBrowser();
  await supabase.from("notifications").insert({
    user_id: input.user_id ?? null,
    audience: input.audience ?? (input.user_id ? "user" : "staff"),
    type: input.type ?? "info",
    title: input.title,
    body: input.body ?? null,
  });
}

export async function logActivity(action: string, entity?: string, entity_id?: string, details?: object) {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getUser();
  await supabase.from("activity_logs").insert({
    actor_id: data.user?.id ?? null,
    action,
    entity: entity ?? null,
    entity_id: entity_id ?? null,
    details: details ?? {},
  });
}
