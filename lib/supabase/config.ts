// Supabase project configuration.
// The publishable key is safe to expose in the browser — all data access is
// protected by Row Level Security policies in the database.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://aamofkqdmqtpnqdxximh.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_z3Q0aWJAm0vyVj0mAAZJRw_gQRa84ET";
