import { createBrowserClient } from "@supabase/ssr";

import { publicSupabaseEnv } from "@/lib/env";
import type { Database } from "./database.types";

export function createClient() {
  const { url, key } = publicSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}
