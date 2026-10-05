import { describe, expect, it } from "vitest";

import { canonicalPostingRef, parseAtsUrl } from "../ats-url";
import { groupPostings, jobFingerprint, normalizeTitle } from "../dedupe";
import { normalizeHeuristic } from "../normalize/heuristic";
import { contentHash, earliestPostedAt, isTooOld, staleSources } from "../plan";
import type { RawPosting } from "../types";

const posting = (over: Partial<RawPosting>): RawPosting => ({
  sourceType: "greenhouse",
  externalId: "acme:1",
  companyName: "Acme",
  companySlug: "acme",
  title: "Software Engineering Intern",
  url: "https://job-boards.greenhouse.io/acme/jobs/1",
  locations: ["New York, NY"],
  descriptionText: "Build things.",
  ...over,
});

describe("parseAtsUrl", () => {
  it("recognizes Greenhouse, Lever and Ashby posting URLs", () => {
    expect(parseAtsUrl("https://job-boards.greenhouse.io/stripe/jobs/6012345")).toEqual({
      type: "greenhouse",
      slug: "stripe",
      jobId: "6012345",
    });
    expect(parseAtsUrl("https://boards.greenhouse.io/embed/job_app?for=figma&token=55")).toEqual({
      type: "greenhouse",
      slug: "figma",
      jobId: "55",
    });
    expect(
      parseAtsUrl("https://jobs.lever.co/palantir/5c0f6a6e-1b4f-4d2a-9c35-0a6f2c7f9e11/apply"),
    ).toEqual({ type: "lever", slug: "palantir", jobId: "5c0f6a6e-1b4f-4d2a-9c35-0a6f2c7f9e11" });
    expect(parseAtsUrl("https://jobs.ashbyhq.com/openai")).toEqual({
      type: "ashby",
      slug: "openai",
      jobId: null,
    });
    expect(parseAtsUrl("https://acme.wd5.myworkdayjobs.com/x")).toBeNull();
    expect(parseAtsUrl("not a url")).toBeNull();
  });

  it("builds matching canonical refs for ATS and community-list postings", () => {
    expect(canonicalPostingRef("greenhouse", "acme:1", "")).toBe("greenhouse:acme:1");
    expect(
      canonicalPostingRef("simplify", "uuid", "https://job-boards.greenhouse.io/Acme/jobs/1"),
    ).toBe("greenhouse:acme:1");
    expect(canonicalPostingRef("simplify", "uuid", "https://example.com/job")).toBeNull();
  });
});

describe("fingerprints", () => {
  it("ignores punctuation, case and intern/internship spelling", () => {
    expect(normalizeTitle("Software Engineering Internship (Summer 2027)")).toBe(
      normalizeTitle("software engineering intern - summer 2027"),
    );
    expect(jobFingerprint("acme", "SWE Co-op")).toBe("acme::swe coop");
  });
  it("keeps different terms distinct", () => {
    expect(normalizeTitle("Intern - Summer 2027")).not.toBe(normalizeTitle("Intern - Fall 2027"));
  });
});

describe("groupPostings", () => {
  it("merges the same role across locations on one board", () => {
    const groups = groupPostings([
      posting({ externalId: "acme:1", locations: ["New York, NY"] }),
      posting({ externalId: "acme:2", locations: ["Seattle, WA"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].postings).toHaveLength(2);
  });

  it("merges a community-list listing with the ATS posting it links to, even if titles differ", () => {
    const groups = groupPostings([
      posting({ externalId: "acme:1", title: "Software Engineer Intern, Payments" }),
      posting({
        sourceType: "simplify",
        externalId: "simplify-uuid",
        title: "Software Engineer Intern",
        url: "https://job-boards.greenhouse.io/acme/jobs/1?utm_source=Simplify",
        descriptionText: null,
      }),
    ]);
    expect(groups).toHaveLength(1);
    // ATS posting is primary since it carries the description.
    expect(groups[0].primary.sourceType).toBe("greenhouse");
    expect(groups[0].dedupeKey).toBe("acme::software engineer intern payments");
    expect(groups[0].fingerprints).toHaveLength(2);
  });

  it("keeps different companies and different roles apart", () => {
    const groups = groupPostings([
      posting({}),
      posting({ externalId: "acme:9", title: "Data Science Intern", url: "https://x/9" }),
      posting({ companySlug: "globex", externalId: "globex:1", url: "https://x/g1" }),
    ]);
    expect(groups).toHaveLength(3);
  });

  it("drops exact duplicates of the same source posting", () => {
    const groups = groupPostings([posting({}), posting({})]);
    expect(groups[0].postings).toHaveLength(1);
  });

  it("merges transitively (A~B by URL, B~C by title)", () => {
    const groups = groupPostings([
      posting({ externalId: "acme:1", title: "SWE Intern, Infra" }),
      posting({
        sourceType: "simplify",
        externalId: "s1",
        title: "Software Engineering Intern",
        url: "https://boards.greenhouse.io/acme/jobs/1",
      }),
      posting({
        sourceType: "simplify",
        externalId: "s2",
        title: "Software Engineering Intern",
        url: "https://other",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].postings).toHaveLength(3);
  });
});

describe("normalizeHeuristic", () => {
  it("combines locations and hints across the group", () => {
    const n = normalizeHeuristic(
      posting({
        title: "Software Engineering Intern (Summer 2027)",
        descriptionText: "Pay: $50 - $58/hr. Hybrid schedule.",
        locations: ["New York, NY"],
      }),
      [
        posting({
          sourceType: "simplify",
          externalId: "s",
          locations: ["Remote in USA"],
          termsHint: ["Summer 2027", "N/A"],
          sponsorshipHint: "Does Not Offer Sponsorship",
          degreesHint: ["Bachelor's"],
        }),
      ],
    );
    expect(n.locations).toEqual(["New York, NY", "Remote (US)"]);
    expect(n.terms).toEqual(["Summer 2027"]);
    expect(n.remote_type).toBe("hybrid");
    expect(n.field).toBe("software");
    expect(n.pay).toMatchObject({ min: 50, max: 58, period: "hour" });
    expect(n.eligibility.sponsorship).toBe("no");
    expect(n.eligibility.degree_levels).toEqual(["Bachelor's"]);
    expect(n.summary).toBeNull();
  });
});

describe("refresh planning helpers", () => {
  it("contentHash changes only when normalized content changes", () => {
    const a = posting({});
    expect(contentHash(a, ["B", "A"])).toBe(contentHash(a, ["A", "B"]));
    expect(contentHash(a, ["A"])).not.toBe(contentHash({ ...a, descriptionText: "New" }, ["A"]));
  });

  it("earliestPostedAt picks the earliest valid source date", () => {
    const [group] = groupPostings([
      posting({ externalId: "acme:1", postedAt: "2026-09-20T00:00:00Z" }),
      posting({ externalId: "acme:2", postedAt: "2026-09-10T00:00:00Z" }),
      posting({ externalId: "acme:3", postedAt: "garbage" }),
    ]);
    expect(earliestPostedAt(group)).toBe("2026-09-10T00:00:00.000Z");
  });

  it("staleSources returns active sources not seen this run", () => {
    const active = [
      { source_type: "greenhouse", external_id: "acme:1" },
      { source_type: "greenhouse", external_id: "acme:2" },
    ];
    expect(staleSources(active, new Set(["greenhouse:acme:1"]))).toEqual([active[1]]);
  });

  it("isTooOld", () => {
    const now = new Date("2026-10-05T00:00:00Z");
    expect(isTooOld("2026-01-01T00:00:00Z", 150, now)).toBe(true);
    expect(isTooOld("2026-09-01T00:00:00Z", 150, now)).toBe(false);
    expect(isTooOld(null, 150, now)).toBe(false);
  });
});
