import { describe, expect, it } from "vitest";

import { isStudentRole } from "../classify";
import { parseAshby, type AshbyResponse } from "../sources/ashby";
import { parseGreenhouse, type GreenhouseResponse } from "../sources/greenhouse";
import { parseLever, type LeverResponse } from "../sources/lever";
import { parseSimplify, type SimplifyListing } from "../sources/simplify";
import type { SeedCompany } from "../types";
import ashbyFixture from "./fixtures/ashby.json";
import greenhouseFixture from "./fixtures/greenhouse.json";
import leverFixture from "./fixtures/lever.json";
import simplifyFixture from "./fixtures/simplify.json";

const company = (ats: SeedCompany["ats"], atsSlug: string, name: string): SeedCompany => ({
  name,
  slug: atsSlug,
  ats,
  atsSlug,
});

describe("parseGreenhouse", () => {
  const postings = parseGreenhouse(
    greenhouseFixture as GreenhouseResponse,
    company("greenhouse", "acme", "Acme"),
  );

  it("maps every job with a namespaced external id", () => {
    expect(postings).toHaveLength(3);
    expect(postings[0]).toMatchObject({
      sourceType: "greenhouse",
      externalId: "acme:7012345",
      companyName: "Acme",
      companySlug: "acme",
      title: "Software Engineering Intern (Summer 2027)",
      url: "https://job-boards.greenhouse.io/acme/jobs/7012345",
      postedAt: "2026-09-15T09:00:00-04:00",
      departments: ["Engineering"],
    });
  });

  it("splits multi-location strings", () => {
    expect(postings[0].locations).toEqual(["San Francisco, CA", "New York, NY"]);
  });

  it("falls back to office locations when the location name is empty", () => {
    expect(postings[2].locations).toEqual(["Toronto, ON, Canada"]);
  });

  it("decodes double-encoded HTML content into plain text", () => {
    const text = postings[0].descriptionText!;
    expect(text).toContain("Acme builds payments infrastructure.");
    expect(text).toContain("What you'll do");
    expect(text).toContain("• Ship features to production");
    expect(text).not.toMatch(/<|&lt;|&amp;/);
  });

  it("leaves postedAt null when the board has no publish date", () => {
    expect(postings[1].postedAt).toBeNull();
  });

  it("keeps only student roles after filtering", () => {
    const student = postings.filter((p) => isStudentRole(p.title, p.employmentTypeHint));
    expect(student.map((p) => p.externalId)).toEqual(["acme:7012345", "acme:7012347"]);
  });
});

describe("parseLever", () => {
  const postings = parseLever(leverFixture as LeverResponse, company("lever", "globex", "Globex"));

  it("maps fields, workplace type and salary range", () => {
    expect(postings[0]).toMatchObject({
      sourceType: "lever",
      externalId: "globex:5c0f6a6e-1b4f-4d2a-9c35-0a6f2c7f9e11",
      title: "Platform Engineer",
      locations: ["Denver, CO", "Austin, TX"],
      remoteHint: "hybrid",
      employmentTypeHint: "Intern",
      departments: ["Engineering", "Platform"],
      applyUrl: "https://jobs.lever.co/globex/5c0f6a6e-1b4f-4d2a-9c35-0a6f2c7f9e11/apply",
      payHint: { min: 40, max: 48, currency: "USD", period: "hour", text: "$40–$48 per hour" },
    });
    expect(postings[0].postedAt).toBe(new Date(1789300000000).toISOString());
  });

  it("includes list sections in the description", () => {
    expect(postings[0].descriptionText).toContain("Requirements");
    expect(postings[0].descriptionText).toContain("• Pursuing a BS in CS");
  });

  it("uses the commitment to detect interns whose title lacks 'intern'", () => {
    const student = postings.filter((p) => isStudentRole(p.title, p.employmentTypeHint));
    expect(student.map((p) => p.title)).toEqual(["Platform Engineer"]);
  });

  it("falls back to the single location when allLocations is missing", () => {
    expect(postings[1].locations).toEqual(["Remote"]);
    expect(postings[1].payHint).toBeNull();
  });
});

describe("parseAshby", () => {
  const postings = parseAshby(
    ashbyFixture as AshbyResponse,
    company("ashby", "initech", "Initech"),
  );

  it("drops unlisted postings", () => {
    expect(postings.map((p) => p.title)).toEqual([
      "Machine Learning Research Intern",
      "Product Designer",
    ]);
  });

  it("maps locations, workplace type and compensation", () => {
    expect(postings[0]).toMatchObject({
      sourceType: "ashby",
      externalId: "initech:0b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9",
      locations: ["London, United Kingdom", "Remote (UK)"],
      remoteHint: "hybrid",
      employmentTypeHint: "Intern",
      postedAt: "2026-09-20T15:30:00.000+00:00",
      payHint: {
        min: 4000,
        max: 5000,
        currency: "GBP",
        period: "month",
        text: "£4K – £5K per month",
      },
    });
  });

  it("treats isRemote as a remote hint", () => {
    expect(postings[1].remoteHint).toBe("remote");
  });
});

describe("parseSimplify", () => {
  const { postings, inactiveIds } = parseSimplify(simplifyFixture as SimplifyListing[]);

  it("keeps active, visible listings and reports the rest as inactive", () => {
    expect(postings).toHaveLength(4);
    expect(inactiveIds).toHaveLength(2);
  });

  it("detects the ATS behind the listing URL", () => {
    const gh = postings.find((p) => p.url.includes("greenhouse.io"))!;
    expect(gh.companyAts).toEqual({ type: "greenhouse", slug: "truveta" });
    expect(gh.companySlug).toBe("truveta");
    const lever = postings.find((p) => p.url.includes("lever.co"))!;
    expect(lever.companyAts).toEqual({ type: "lever", slug: "multiplylabs" });
    const workday = postings.find((p) => p.url.includes("myworkdayjobs"))!;
    expect(workday.companyAts).toBeNull();
  });

  it("converts unix timestamps and carries community-list hints", () => {
    const p = postings[0];
    expect(p.postedAt).toBe(new Date(1771987584 * 1000).toISOString());
    expect(p.termsHint).toEqual(["Summer 2026"]);
    expect(p.categoryHint).toBe("Software");
    expect(p.degreesHint).toEqual(["Bachelor's", "Master's"]);
    expect(p.descriptionText).toBeNull();
  });

  it("skips malformed rows", () => {
    const result = parseSimplify([
      { id: "x", title: "", company_name: "A", url: "https://a", active: true, is_visible: true },
    ]);
    expect(result.postings).toHaveLength(0);
  });
});
