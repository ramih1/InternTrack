import { describe, expect, it } from "vitest";

import { applyGraduationCheck, dateRange, graduationIssue, graduationWindow } from "./eligibility";
import type { MatchResult } from "./results";

const ym = (year: number, month: number) => year * 12 + month - 1;
const notes = (text: string) => ({ notes: text });

describe("dateRange", () => {
  it("reads months, seasons and bare years", () => {
    expect(dateRange("December 2027")).toEqual([ym(2027, 12), ym(2027, 12)]);
    expect(dateRange("sept 2026")).toEqual([ym(2026, 9), ym(2026, 9)]);
    expect(dateRange("Summer 2028")).toEqual([ym(2028, 5), ym(2028, 9)]);
    expect(dateRange("2027")).toEqual([ym(2027, 1), ym(2027, 12)]);
    expect(dateRange("someday 2027")).toBeNull();
  });
});

describe("graduationWindow", () => {
  // Phrasings taken from real postings' eligibility notes.
  it.each([
    [
      "Enrolled in Canada; graduation between December 2027 and Summer 2028; master's ok",
      ym(2027, 12),
      ym(2028, 9),
    ],
    ["Must graduate between December 2026 and August 2027; in person", ym(2026, 12), ym(2027, 8)],
    [
      "Bachelor's or Master's program, graduating by Summer 2026; prior internship",
      null,
      ym(2026, 9),
    ],
    ["Must graduate before December 2027. Previous mobile internship", null, ym(2027, 12)],
    ["Graduation date in Fall 2026 or Spring 2027; previous internship", ym(2026, 8), ym(2027, 6)],
    ["seeking program with expected graduation Winter 2027/Spring 2028.", ym(2027, 1), ym(2028, 6)],
    ["Must graduate in class of 2026 or 2027; C/C++ experience", ym(2026, 1), ym(2027, 12)],
    ["Must graduate in 2028 and return to university", ym(2028, 1), ym(2028, 12)],
    ["University student graduating in 2027 or later", ym(2027, 1), null],
    ["Must graduate between Autumn 2027 and Summer 2028.", ym(2027, 8), ym(2028, 9)],
  ])("%s", (text, earliest, latest) => {
    expect(graduationWindow(text)).toMatchObject({ earliest, latest });
  });

  it("ignores notes without a dated graduation requirement", () => {
    expect(graduationWindow(null)).toBeNull();
    expect(graduationWindow("Currently enrolled in a full-time graduate program.")).toBeNull();
    expect(
      graduationWindow("Students graduating before the internship begins are not eligible."),
    ).toBeNull();
    expect(graduationWindow("Internship runs Jan 25 - Apr 16 2027; apply by May 2026.")).toBeNull();
  });
});

describe("graduationIssue", () => {
  const window = notes("Must graduate between December 2026 and August 2027.");

  it("flags graduation dates clearly outside the window", () => {
    expect(graduationIssue(window, "2028-05")).toBe(
      "The posting asks for graduation between December 2026 and August 2027; your resume shows May 2028.",
    );
    expect(graduationIssue(window, "2026-05")).toMatch(/shows May 2026/);
    expect(graduationIssue(notes("graduating by Summer 2026"), "2028")).toMatch(/shows 2028/);
    expect(graduationIssue(notes("Must graduate in class of 2026 or 2027"), "2028-05")).toMatch(
      /graduation class of 2026 or 2027;/,
    );
  });

  it("passes dates inside the window, ambiguous years and missing data", () => {
    expect(graduationIssue(window, "2027-05")).toBeNull();
    expect(graduationIssue(window, "2027")).toBeNull();
    expect(graduationIssue(notes("graduating 2027 or later"), "2027-05")).toBeNull();
    expect(graduationIssue(window, null)).toBeNull();
    expect(graduationIssue(window, "May 2028")).toBeNull();
    expect(graduationIssue(null, "2028-05")).toBeNull();
  });
});

describe("applyGraduationCheck", () => {
  const result = (jobId: string, score: number): MatchResult => ({
    jobId,
    score,
    reasons: {
      matched_skills: ["Python"],
      missing_skills: [],
      eligibility_issues: [],
      explanation: "You fit.",
    },
  });

  it("caps only the jobs whose window excludes the resume", () => {
    const out = applyGraduationCheck(
      [result("a", 85), result("b", 80)],
      new Map([
        ["a", notes("graduating by Summer 2026")],
        ["b", notes("graduating in 2027 or later")],
      ]),
      "2028-05",
    );
    expect(out[0].score).toBe(40);
    expect(out[0].reasons.eligibility_issues[0]).toMatch(/by Summer 2026/);
    expect(out[1]).toEqual(result("b", 80));
  });
});
