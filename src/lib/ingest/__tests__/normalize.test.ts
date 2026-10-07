import { describe, expect, it } from "vitest";

import { loadSeedCompanies } from "../companies";
import { mergeNormalized, type ListingOutput } from "../normalize/claude";
import { normalizedToColumns, rowToNormalized } from "../normalize/row";
import type { NormalizedJob } from "../types";

const base: NormalizedJob = {
  title: "SWE Intern (Summer 2027) - R1234",
  locations: ["New York, NY"],
  remote_type: "onsite",
  employment_type: "internship",
  field: "software",
  terms: ["Summer 2027"],
  duration: null,
  pay: { text: "$50/hr", min: 50, max: 50, currency: "USD", period: "hour" },
  deadline: null,
  eligibility: {
    years_of_study: [],
    majors: [],
    degree_levels: ["Bachelor's"],
    work_authorization: null,
    sponsorship: "no",
    notes: null,
  },
  summary: null,
};

const ai: ListingOutput = {
  title: "Software Engineering Intern",
  locations: ["New York, NY", "Remote (US)"],
  remote_type: "hybrid",
  employment_type: "internship",
  field: "software",
  terms: ["Summer 2027", "summer 27"],
  duration: "12 weeks",
  pay: { text: null, min: null, max: null, currency: null, period: null },
  deadline: "Oct 31",
  eligibility: {
    years_of_study: ["Junior"],
    majors: ["Computer Science"],
    degree_levels: [],
    work_authorization: null,
    sponsorship: "unknown",
    notes: null,
  },
  summary: "Build payment APIs with the platform team. For CS juniors.",
};

describe("mergeNormalized", () => {
  const merged = mergeNormalized(base, ai);

  it("prefers Claude's cleaned fields", () => {
    expect(merged.title).toBe("Software Engineering Intern");
    expect(merged.locations).toEqual(["New York, NY", "Remote (US)"]);
    expect(merged.remote_type).toBe("hybrid");
    expect(merged.duration).toBe("12 weeks");
    expect(merged.summary).toMatch(/payment APIs/);
    expect(merged.eligibility.majors).toEqual(["Computer Science"]);
  });

  it("drops malformed terms and dates", () => {
    expect(merged.terms).toEqual(["Summer 2027"]);
    expect(merged.deadline).toBeNull();
  });

  it("keeps rule-based values Claude left empty", () => {
    expect(merged.pay).toEqual(base.pay);
    expect(merged.eligibility.degree_levels).toEqual(["Bachelor's"]);
    expect(merged.eligibility.sponsorship).toBe("no");
  });
});

describe("row mapping", () => {
  it("round-trips through database columns", () => {
    const cols = normalizedToColumns(base);
    expect(cols.pay_min).toBe(50);
    const back = rowToNormalized({ ...cols, summary: null });
    expect(back).toEqual(base);
  });
});

describe("loadSeedCompanies", () => {
  it("loads the committed seed list", () => {
    const companies = loadSeedCompanies();
    expect(companies.length).toBeGreaterThanOrEqual(100);
    for (const c of companies) expect(["greenhouse", "lever", "ashby"]).toContain(c.ats);
  });
  it("rejects duplicate slugs", () => {
    const row = { name: "A", slug: "a", ats: "lever", atsSlug: "a" };
    expect(() => loadSeedCompanies([row, row])).toThrow(/Duplicate/);
  });
});
