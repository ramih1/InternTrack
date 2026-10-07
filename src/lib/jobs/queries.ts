import "server-only";

import { createClient } from "@/lib/supabase/server";

import { likePattern, normalizeLocationQuery, PAGE_SIZE, type JobFilters } from "./filters";

const LIST_COLUMNS =
  "id, title, locations, remote_type, employment_type, field, terms, posted_at, posted_at_source, pay_text, pay_min, pay_max, pay_currency, pay_period, deadline, summary, companies!inner(name, slug, domain)";

export async function listJobs(filters: JobFilters, now: Date = new Date()) {
  const supabase = await createClient();
  let query = supabase.from("jobs").select(LIST_COLUMNS, { count: "exact" }).eq("status", "open");

  if (filters.q) query = query.ilike("title", likePattern(filters.q));
  if (filters.company) query = query.ilike("companies.name", likePattern(filters.company));
  if (filters.location) {
    query = query.ilike("locations_search", likePattern(normalizeLocationQuery(filters.location)));
  }
  if (filters.remote) query = query.eq("remote_type", filters.remote);
  if (filters.term) query = query.contains("terms", [filters.term]);
  if (filters.field) query = query.eq("field", filters.field);
  if (filters.type) query = query.eq("employment_type", filters.type);
  if (filters.sponsorship) query = query.eq("eligibility_json->>sponsorship", "yes");
  if (filters.days) {
    query = query.gte(
      "posted_at",
      new Date(now.getTime() - filters.days * 86_400_000).toISOString(),
    );
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("posted_at", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw new Error(`Failed to load jobs: ${error.message}`);
  return { jobs: data, total: count ?? 0 };
}

export type JobListItem = Awaited<ReturnType<typeof listJobs>>["jobs"][number];

export async function getJob(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, locations, remote_type, employment_type, field, terms, duration, pay_text, pay_min, pay_max, pay_currency, pay_period, posted_at, posted_at_source, deadline, eligibility_json, description, summary, status, last_seen_at, ai_normalized_at, companies(name, slug, domain), job_sources(id, source_type, url, apply_url, is_active)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load job: ${error.message}`);
  return data;
}

export async function countOpenJobs() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  if (error) throw new Error(error.message);
  return count ?? 0;
}
