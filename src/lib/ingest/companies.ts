import { z } from "zod";

import seed from "../../../data/companies.json";
import type { SeedCompany } from "./types";

const SeedCompanySchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  domain: z.string().optional(),
  ats: z.enum(["greenhouse", "lever", "ashby"]),
  atsSlug: z.string().min(1),
});

/** Loads and validates `data/companies.json`. */
export function loadSeedCompanies(data: unknown = seed): SeedCompany[] {
  const companies = z.array(SeedCompanySchema).parse(data);
  const slugs = new Set<string>();
  for (const c of companies) {
    if (slugs.has(c.slug)) throw new Error(`Duplicate company slug in seed list: ${c.slug}`);
    slugs.add(c.slug);
  }
  return companies;
}
