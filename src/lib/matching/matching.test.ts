import { describe, expect, it } from "vitest";

import { chunk, jobBrief, type JobForMatching } from "./brief";
import { sanitizeScores, scoreLabel } from "./results";

const refs = new Map([
  ["J1", "job-1"],
  ["J2", "job-2"],
]);

const result = (over: Record<string, unknown>) => ({
  job_ref: "J1",
  score: 80,
  matched_skills: ["Python"],
  missing_skills: [],
  eligibility_issues: [],
  explanation: "Good fit.",
  ...over,
});

describe("sanitizeScores", () => {
  it("maps refs to job ids and clamps scores", () => {
    const out = sanitizeScores(
      { results: [result({ score: 120.4 }), result({ job_ref: " j2 ", score: -5 })] },
      refs,
    );
    expect(out.map((r) => [r.jobId, r.score])).toEqual([
      ["job-1", 100],
      ["job-2", 0],
    ]);
  });

  it("drops unknown and duplicate refs", () => {
    const out = sanitizeScores(
      { results: [result({}), result({ score: 10 }), result({ job_ref: "J9" })] },
      refs,
    );
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(80);
  });

  it("caps scores with eligibility issues at 40", () => {
    const [r] = sanitizeScores(
      { results: [result({ score: 92, eligibility_issues: ["Requires US citizenship"] })] },
      refs,
    );
    expect(r.score).toBe(40);
    expect(r.reasons.eligibility_issues).toEqual(["Requires US citizenship"]);
  });

  it("trims and de-duplicates reason lists", () => {
    const [r] = sanitizeScores(
      {
        results: [result({ matched_skills: [" Python ", "Python", ""], explanation: "  Fine.  " })],
      },
      refs,
    );
    expect(r.reasons.matched_skills).toEqual(["Python"]);
    expect(r.reasons.explanation).toBe("Fine.");
  });
});

describe("scoreLabel", () => {
  it("buckets scores", () => {
    expect([95, 75, 55, 10].map(scoreLabel)).toEqual([
      "Excellent fit",
      "Strong fit",
      "Partial fit",
      "Weak fit",
    ]);
  });
});

describe("jobBrief", () => {
  const job: JobForMatching = {
    id: "job-1",
    title: "SWE Intern",
    locations: ["Toronto, ON, Canada"],
    remote_type: "hybrid",
    employment_type: "co_op",
    field: "software",
    terms: ["Fall 2027"],
    pay_text: null,
    pay_min: 40,
    pay_max: 45,
    pay_currency: "CAD",
    pay_period: "hour",
    eligibility_json: {
      degree_levels: ["Bachelor's"],
      sponsorship: "no",
      work_authorization: null,
    },
    summary: "Build APIs.",
    description: "x".repeat(5000),
    companies: { name: "Acme" },
  };

  it("includes key facts and truncates the description", () => {
    const brief = jobBrief(job, "J1", 100);
    expect(brief).toContain('<job ref="J1">');
    expect(brief).toContain("Company: Acme");
    expect(brief).toContain("Terms: Fall 2027");
    expect(brief).toContain("Pay: CA$40–CA$45/hr");
    expect(brief).toContain("Eligibility: degree: Bachelor's; sponsorship: no");
    expect(brief).toContain(`Description excerpt: ${"x".repeat(100)}\n`);
    expect(brief).not.toContain("x".repeat(101));
  });
});

describe("chunk", () => {
  it("splits into batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
