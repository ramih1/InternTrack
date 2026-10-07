import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicSupabaseEnv } from "@/lib/env";
import type { Database } from "./database.types";

/** Supabase client for Server Components, Server Actions and Route Handlers (acts as the user). */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = publicSupabaseEnv();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes
          // sessions, so this is safe to ignore.
        }
      },
    },
  });
}
