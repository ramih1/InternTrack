import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import { isStudentRole } from "./classify";
import { loadSeedCompanies } from "./companies";
import { groupPostings, type PostingGroup } from "./dedupe";
import { mapLimit } from "./fetch";
import { mergeNormalized, normalizeWithClaude } from "./normalize/claude";
import { normalizeHeuristic } from "./normalize/heuristic";
import { normalizedToColumns, rowToNormalized } from "./normalize/row";
import { chunk, contentHash, earliestPostedAt, isTooOld, sourceKey, staleSources } from "./plan";
import { fetchCompanyBoard, fetchSimplify, SIMPLIFY_LISTS } from "./sources";
import type { FetchResult, RawPosting, SeedCompany, SourceType } from "./types";

type JobInsert = Database["public"]["Tables"]["jobs"]["Insert"];
type SourceInsert = Database["public"]["Tables"]["job_sources"]["Insert"];
type CompanyRow = Pick<
  Database["public"]["Tables"]["companies"]["Row"],
  "id" | "slug" | "ats_type" | "ats_slug"
>;

export interface RefreshOptions {
  supabase: AdminClient;
  /** Stop starting new work after this many ms (Vercel functions have a hard limit). */
  budgetMs?: number;
  /** Max listings to normalize with Claude this run. 0 disables AI normalization. */
  aiMaxPerRun?: number;
  /** Ignore community-list postings older than this unless we already track them. */
  maxAgeDays?: number;
  companies?: SeedCompany[];
  simplifyLists?: string[];
  /** Skip fetching sources (only run the AI backlog). */
  skipFetch?: boolean;
  log?: (msg: string) => void;
  now?: Date;
}

export interface RefreshStats {
  companiesFetched: number;
  companiesFailed: { slug: string; error: string }[];
  simplifyOk: boolean;
  postingsSeen: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsTouched: number;
  sourcesUpserted: number;
  sourcesDeactivated: number;
  jobsClosed: number;
  aiNormalized: number;
  aiFailed: number;
  durationMs: number;
}

const PAGE = 1000;

export async function runRefresh(opts: RefreshOptions): Promise<RefreshStats> {
  const {
    supabase,
    budgetMs = 270_000,
    aiMaxPerRun = 100,
    maxAgeDays = 150,
    simplifyLists = SIMPLIFY_LISTS,
    log = console.log,
    now = new Date(),
  } = opts;
  const started = Date.now();
  const deadline = started + budgetMs;
  const nowIso = now.toISOString();
  const seed = opts.companies ?? loadSeedCompanies();

  const stats: RefreshStats = {
    companiesFetched: 0,
    companiesFailed: [],
    simplifyOk: false,
    postingsSeen: 0,
    jobsInserted: 0,
    jobsUpdated: 0,
    jobsTouched: 0,
    sourcesUpserted: 0,
    sourcesDeactivated: 0,
    jobsClosed: 0,
    aiNormalized: 0,
    aiFailed: 0,
    durationMs: 0,
  };

  if (!opts.skipFetch) {
    // 1. Companies -----------------------------------------------------------------------------
    await syncSeedCompanies(supabase, seed);
    const companies = await loadCompanies(supabase);

    // 2. Fetch sources -------------------------------------------------------------------------
    log(`Fetching ${seed.length} company boards + ${simplifyLists.length} community list(s)…`);
    const boardResults: FetchResult[] = await mapLimit(seed, 6, async (company) => {
      try {
        const postings = (await fetchCompanyBoard(company)).filter((p) =>
          isStudentRole(p.title, p.employmentTypeHint),
        );
        return { sourceType: company.ats, companySlug: company.slug, ok: true, postings };
      } catch (err) {
        return {
          sourceType: company.ats,
          companySlug: company.slug,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          postings: [],
        };
      }
    });
    for (const r of boardResults) {
      if (r.ok) stats.companiesFetched++;
      else stats.companiesFailed.push({ slug: r.companySlug!, error: r.error ?? "unknown" });
    }

    let simplifyPostings: RawPosting[] = [];
    try {
      simplifyPostings = (await fetchSimplify(simplifyLists)).postings;
      stats.simplifyOk = true;
    } catch (err) {
      log(`Community list fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. Existing sources, so we keep tracking old postings we already have -------------------
    const atsPostings = boardResults.flatMap((r) => r.postings);
    const existingSources = await loadExistingSources(supabase, [
      ...atsPostings,
      ...simplifyPostings,
    ]);
    const freshSimplify = simplifyPostings.filter(
      (p) =>
        existingSources.has(sourceKey(p.sourceType, p.externalId)) ||
        !isTooOld(p.postedAt, maxAgeDays, now),
    );
    // Every active listing counts as "seen" for closed detection, even ones we skip as too old.
    const seen = new Set<string>(
      [...atsPostings, ...simplifyPostings].map((p) => sourceKey(p.sourceType, p.externalId)),
    );

    // 4. Resolve companies for community-list postings (creating newly discovered ones) --------
    await resolveCompanies(supabase, companies, freshSimplify);

    const postings = [...atsPostings, ...freshSimplify];
    stats.postingsSeen = postings.length;
    const groups = groupPostings(postings);
    log(`${postings.length} postings → ${groups.length} unique jobs`);

    // 5. Upsert jobs and sources ----------------------------------------------------------------
    const jobIdByGroup = await upsertJobs(
      supabase,
      groups,
      existingSources,
      companies,
      nowIso,
      stats,
    );
    await upsertSources(supabase, groups, jobIdByGroup, companies, nowIso, stats);

    // 6. Closed detection -----------------------------------------------------------------------
    const okBoards = boardResults.filter((r) => r.ok);
    await closeStale(supabase, okBoards, stats.simplifyOk, companies, seen, nowIso, stats);
  }

  // 7. AI normalization of the backlog ----------------------------------------------------------
  if (process.env.ANTHROPIC_API_KEY && aiMaxPerRun > 0 && Date.now() < deadline - 30_000) {
    await normalizeBacklog(supabase, aiMaxPerRun, deadline, nowIso, stats, log);
  } else if (!process.env.ANTHROPIC_API_KEY) {
    log("ANTHROPIC_API_KEY not set — skipping AI normalization (rule-based fields only).");
  }

  stats.durationMs = Date.now() - started;
  return stats;
}

// -----------------------------------------------------------------------------------------------

async function syncSeedCompanies(supabase: AdminClient, seed: SeedCompany[]) {
  // A company discovered earlier via a community list may already own a seed company's ATS
  // slug under a different slug; release it so the seed row can claim it.
  const { data: existing, error } = await supabase
    .from("companies")
    .select("id, slug, ats_type, ats_slug")
    .in(
      "ats_slug",
      seed.map((c) => c.atsSlug),
    );
  if (error) throw error;
  const seedBySlug = new Map(seed.map((c) => [c.slug, c]));
  const conflicting = (existing ?? []).filter((row) => {
    const owner = seed.find((c) => c.ats === row.ats_type && c.atsSlug === row.ats_slug);
    return owner && owner.slug !== row.slug && !seedBySlug.has(row.slug);
  });
  if (conflicting.length) {
    const { error: clearErr } = await supabase
      .from("companies")
      .update({ ats_type: "other", ats_slug: null })
      .in(
        "id",
        conflicting.map((c) => c.id),
      );
    if (clearErr) throw clearErr;
  }

  const { error: upsertErr } = await supabase.from("companies").upsert(
    seed.map((c) => ({
      slug: c.slug,
      name: c.name,
      domain: c.domain ?? null,
      ats_type: c.ats,
      ats_slug: c.atsSlug,
      in_seed_list: true,
    })),
    { onConflict: "slug" },
  );
  if (upsertErr) throw upsertErr;
}

class CompanyIndex {
  bySlug = new Map<string, CompanyRow>();
  byAts = new Map<string, CompanyRow>();
  add(row: CompanyRow) {
    this.bySlug.set(row.slug, row);
    if (row.ats_slug) this.byAts.set(`${row.ats_type}:${row.ats_slug.toLowerCase()}`, row);
  }
  idFor(slug: string): string {
    const row = this.bySlug.get(slug);
    if (!row) throw new Error(`Unknown company slug ${slug}`);
    return row.id;
  }
}

async function loadCompanies(supabase: AdminClient): Promise<CompanyIndex> {
  const index = new CompanyIndex();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, slug, ats_type, ats_slug")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    data.forEach((row) => index.add(row));
    if (data.length < PAGE) break;
  }
  return index;
}

/** Points community-list postings at existing companies (by ATS, then slug); creates the rest. */
async function resolveCompanies(
  supabase: AdminClient,
  index: CompanyIndex,
  postings: RawPosting[],
) {
  const toCreate = new Map<
    string,
    { slug: string; name: string; ats_type: SeedCompany["ats"] | "other"; ats_slug: string | null }
  >();
  const claimedAts = new Set<string>();
  for (const p of postings) {
    const atsKey = p.companyAts ? `${p.companyAts.type}:${p.companyAts.slug.toLowerCase()}` : null;
    const match = (atsKey && index.byAts.get(atsKey)) || index.bySlug.get(p.companySlug);
    if (match) {
      p.companySlug = match.slug;
      continue;
    }
    if (!toCreate.has(p.companySlug)) {
      const canClaim = atsKey && !claimedAts.has(atsKey);
      if (canClaim) claimedAts.add(atsKey);
      toCreate.set(p.companySlug, {
        slug: p.companySlug,
        name: p.companyName,
        ats_type: canClaim ? p.companyAts!.type : "other",
        ats_slug: canClaim ? p.companyAts!.slug.toLowerCase() : null,
      });
    }
  }
  for (const rows of chunk([...toCreate.values()], 500)) {
    const { data, error } = await supabase
      .from("companies")
      .upsert(rows, { onConflict: "slug" })
      .select("id, slug, ats_type, ats_slug");
    if (error) throw error;
    data.forEach((row) => index.add(row));
  }
}

interface ExistingSource {
  id: string;
  job_id: string;
  source_type: SourceType;
  external_id: string;
}

async function loadExistingSources(supabase: AdminClient, postings: RawPosting[]) {
  const map = new Map<string, ExistingSource>();
  const idsByType = new Map<SourceType, Set<string>>();
  for (const p of postings) {
    let ids = idsByType.get(p.sourceType);
    if (!ids) idsByType.set(p.sourceType, (ids = new Set()));
    ids.add(p.externalId);
  }
  for (const [type, ids] of idsByType) {
    for (const part of chunk([...ids], 200)) {
      const { data, error } = await supabase
        .from("job_sources")
        .select("id, job_id, source_type, external_id")
        .eq("source_type", type)
        .in("external_id", part);
      if (error) throw error;
      for (const row of data)
        map.set(sourceKey(row.source_type, row.external_id), row as ExistingSource);
    }
  }
  return map;
}

interface ExistingJob {
  id: string;
  dedupe_key: string;
  content_hash: string | null;
  posted_at: string;
  posted_at_source: Database["public"]["Enums"]["posted_at_source"];
}

async function loadExistingJobs(supabase: AdminClient, keys: string[], ids: string[]) {
  const byKey = new Map<string, ExistingJob>();
  const byId = new Map<string, ExistingJob>();
  const cols = "id, dedupe_key, content_hash, posted_at, posted_at_source";
  const add = (rows: ExistingJob[]) =>
    rows.forEach((r) => {
      byKey.set(r.dedupe_key, r);
      byId.set(r.id, r);
    });
  for (const part of chunk(keys, 200)) {
    const { data, error } = await supabase.from("jobs").select(cols).in("dedupe_key", part);
    if (error) throw error;
    add(data);
  }
  const missing = ids.filter((id) => !byId.has(id));
  for (const part of chunk(missing, 200)) {
    const { data, error } = await supabase.from("jobs").select(cols).in("id", part);
    if (error) throw error;
    add(data);
  }
  return { byKey, byId };
}

async function upsertJobs(
  supabase: AdminClient,
  groups: PostingGroup[],
  existingSources: Map<string, ExistingSource>,
  companies: CompanyIndex,
  nowIso: string,
  stats: RefreshStats,
): Promise<Map<PostingGroup, string>> {
  const linkedJobIds = new Set<string>();
  for (const g of groups)
    for (const p of g.postings) {
      const s = existingSources.get(sourceKey(p.sourceType, p.externalId));
      if (s) linkedJobIds.add(s.job_id);
    }
  const existing = await loadExistingJobs(
    supabase,
    [...new Set(groups.flatMap((g) => g.fingerprints))],
    [...linkedJobIds],
  );

  const jobIdByGroup = new Map<PostingGroup, string>();
  const claimed = new Set<string>();
  const writes: { group: PostingGroup; row: JobInsert; isNew: boolean }[] = [];
  const touchIds: string[] = [];

  for (const group of groups) {
    const linked = group.postings
      .map((p) => existingSources.get(sourceKey(p.sourceType, p.externalId))?.job_id)
      .find((id) => id && existing.byId.has(id));
    const job =
      (linked && existing.byId.get(linked)) ||
      group.fingerprints.map((fp) => existing.byKey.get(fp)).find(Boolean);

    if (job && claimed.has(job.id)) {
      // Another group in this run already maps to the same job; just attach the sources.
      jobIdByGroup.set(group, job.id);
      continue;
    }

    const rest = group.postings.filter((p) => p !== group.primary);
    const normalized = normalizeHeuristic(group.primary, rest);
    const hash = contentHash(group.primary, normalized.locations);
    const sourcePostedAt = earliestPostedAt(group);

    if (job) {
      claimed.add(job.id);
      jobIdByGroup.set(group, job.id);
      if (job.content_hash === hash) {
        touchIds.push(job.id);
        continue;
      }
    }

    const keepPosted = job && (job.posted_at_source === "source" || !sourcePostedAt);
    writes.push({
      group,
      isNew: !job,
      row: {
        company_id: companies.idFor(group.primary.companySlug),
        dedupe_key: job?.dedupe_key ?? group.dedupeKey,
        ...normalizedToColumns(normalized),
        posted_at: keepPosted ? job.posted_at : (sourcePostedAt ?? nowIso),
        posted_at_source: keepPosted
          ? job.posted_at_source
          : sourcePostedAt
            ? "source"
            : "first_seen",
        description: group.primary.descriptionText || null,
        status: "open",
        closed_at: null,
        last_seen_at: nowIso,
        content_hash: hash,
        ai_normalized_at: null,
      },
    });
  }

  for (const part of chunk(writes, 500)) {
    const { data, error } = await supabase
      .from("jobs")
      .upsert(
        part.map((w) => w.row),
        { onConflict: "dedupe_key" },
      )
      .select("id, dedupe_key");
    if (error) throw error;
    const idByKey = new Map(data.map((r) => [r.dedupe_key, r.id]));
    for (const w of part) {
      const id = idByKey.get(w.row.dedupe_key);
      if (id) jobIdByGroup.set(w.group, id);
      if (w.isNew) stats.jobsInserted++;
      else stats.jobsUpdated++;
    }
  }

  for (const part of chunk(touchIds, 300)) {
    const { error } = await supabase
      .from("jobs")
      .update({ last_seen_at: nowIso, status: "open", closed_at: null })
      .in("id", part);
    if (error) throw error;
    stats.jobsTouched += part.length;
  }

  return jobIdByGroup;
}

async function upsertSources(
  supabase: AdminClient,
  groups: PostingGroup[],
  jobIdByGroup: Map<PostingGroup, string>,
  companies: CompanyIndex,
  nowIso: string,
  stats: RefreshStats,
) {
  const rows: SourceInsert[] = [];
  for (const g of groups) {
    const jobId = jobIdByGroup.get(g);
    if (!jobId) continue;
    for (const p of g.postings) {
      rows.push({
        job_id: jobId,
        company_id: companies.idFor(p.companySlug),
        source_type: p.sourceType,
        external_id: p.externalId,
        url: p.url,
        apply_url: p.applyUrl ?? null,
        is_active: true,
        last_seen_at: nowIso,
        last_checked_at: nowIso,
      });
    }
  }
  for (const part of chunk(rows, 500)) {
    const { error } = await supabase
      .from("job_sources")
      .upsert(part, { onConflict: "source_type,external_id" });
    if (error) throw error;
    stats.sourcesUpserted += part.length;
  }
}

async function closeStale(
  supabase: AdminClient,
  okBoards: FetchResult[],
  simplifyOk: boolean,
  companies: CompanyIndex,
  seen: Set<string>,
  nowIso: string,
  stats: RefreshStats,
) {
  type ActiveSource = { id: string; job_id: string; source_type: SourceType; external_id: string };
  const active: ActiveSource[] = [];

  const loadActive = async (sourceType: SourceType, companyIds: string[] | null) => {
    for (let from = 0; ; from += PAGE) {
      let q = supabase
        .from("job_sources")
        .select("id, job_id, source_type, external_id")
        .eq("source_type", sourceType)
        .eq("is_active", true);
      if (companyIds) q = q.in("company_id", companyIds);
      const { data, error } = await q.order("id").range(from, from + PAGE - 1);
      if (error) throw error;
      active.push(...(data as ActiveSource[]));
      if (data.length < PAGE) break;
    }
  };

  // Only scopes we fetched successfully: a failed fetch must never close jobs.
  for (const type of ["greenhouse", "lever", "ashby"] as const) {
    const ids = okBoards
      .filter((r) => r.sourceType === type)
      .map((r) => companies.idFor(r.companySlug!));
    for (const part of chunk(ids, 100)) await loadActive(type, part);
  }
  if (simplifyOk) await loadActive("simplify", null);

  const stale = staleSources(active, seen);
  for (const part of chunk(stale, 300)) {
    const { error } = await supabase
      .from("job_sources")
      .update({ is_active: false, last_checked_at: nowIso })
      .in(
        "id",
        part.map((s) => s.id),
      );
    if (error) throw error;
  }
  stats.sourcesDeactivated = stale.length;

  // A job closes when none of its sources are active anymore.
  const affected = [...new Set(stale.map((s) => s.job_id))];
  const stillActive = new Set<string>();
  for (const part of chunk(affected, 200)) {
    const { data, error } = await supabase
      .from("job_sources")
      .select("job_id")
      .in("job_id", part)
      .eq("is_active", true);
    if (error) throw error;
    data.forEach((r) => stillActive.add(r.job_id));
  }
  const toClose = affected.filter((id) => !stillActive.has(id));
  for (const part of chunk(toClose, 300)) {
    const { data, error } = await supabase
      .from("jobs")
      .update({ status: "closed", closed_at: nowIso })
      .in("id", part)
      .eq("status", "open")
      .select("id");
    if (error) throw error;
    stats.jobsClosed += data.length;
  }
}

async function normalizeBacklog(
  supabase: AdminClient,
  limit: number,
  deadline: number,
  nowIso: string,
  stats: RefreshStats,
  log: (msg: string) => void,
) {
  const { data: rows, error } = await supabase
    .from("jobs")
    .select("*, companies(name), job_sources(url)")
    .eq("status", "open")
    .is("ai_normalized_at", null)
    .not("description", "is", null)
    .order("posted_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!rows.length) return;
  log(`Normalizing ${rows.length} listings with Claude…`);

  await mapLimit(rows, 4, async (row) => {
    if (Date.now() > deadline - 20_000) return;
    const base = rowToNormalized(row);
    const result = await normalizeWithClaude(
      {
        companyName: row.companies?.name ?? "",
        title: row.title,
        locations: row.locations,
        postedAt: row.posted_at_source === "source" ? row.posted_at : null,
        url: row.job_sources[0]?.url ?? "",
        description: row.description ?? "",
        hints: { remote_type: base.remote_type, field: base.field, terms: base.terms },
      },
      nowIso.slice(0, 10),
    );

    if (!result.ok) {
      stats.aiFailed++;
      log(`  ✗ ${row.title} (${row.companies?.name}): ${result.reason} ${result.detail ?? ""}`);
      // Transient API errors are retried next run; refusals/parse failures keep rule-based data.
      if (result.reason === "api_error") return;
      await supabase.from("jobs").update({ ai_normalized_at: nowIso }).eq("id", row.id);
      return;
    }
    const merged = mergeNormalized(base, result.job);
    const { error: updErr } = await supabase
      .from("jobs")
      .update({ ...normalizedToColumns(merged), summary: merged.summary, ai_normalized_at: nowIso })
      .eq("id", row.id);
    if (updErr) {
      stats.aiFailed++;
      log(`  ✗ update failed for ${row.id}: ${updErr.message}`);
      return;
    }
    stats.aiNormalized++;
  });
}
