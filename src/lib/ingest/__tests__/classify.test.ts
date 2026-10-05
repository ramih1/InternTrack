import { describe, expect, it } from "vitest";

import {
  detectEmploymentType,
  detectField,
  detectRemote,
  extractPay,
  extractTerms,
  isStudentRole,
  normalizeTermLabels,
  sponsorshipFromLabel,
} from "../classify";
import { cleanUrl, htmlToText, slugify, splitLocations } from "../text";

describe("isStudentRole", () => {
  it.each([
    "Software Engineering Intern",
    "Summer 2027 Internship - Data",
    "Co-op, Hardware Engineering (Fall 2027)",
    "Coop Student - Firmware",
    "Quantitative Trader Summer Analyst",
    "New Grad Software Engineer",
    "Apprenticeship Program, IT",
    "Research Fellowship 2027",
  ])("accepts %s", (title) => expect(isStudentRole(title)).toBe(true));

  it.each([
    "Senior Software Engineer",
    "Internal Tools Engineer",
    "International Tax Manager",
    "Staff Data Scientist",
  ])("rejects %s", (title) => expect(isStudentRole(title)).toBe(false));

  it("accepts an 'Intern' employment type even if the title lacks it", () => {
    expect(isStudentRole("Platform Engineer", "Intern")).toBe(true);
    expect(isStudentRole("Platform Engineer", "Full-time")).toBe(false);
  });
});

describe("extractTerms", () => {
  it("normalizes seasons and two-digit years", () => {
    expect(extractTerms("Summer '27 or Fall 2027, maybe autumn 27")).toEqual([
      "Summer 2027",
      "Fall 2027",
    ]);
  });

  it("sorts chronologically", () => {
    expect(extractTerms("Fall 2027, Winter 2027, Summer 2026")).toEqual([
      "Summer 2026",
      "Winter 2027",
      "Fall 2027",
    ]);
  });

  it("drops placeholder labels from community lists", () => {
    expect(normalizeTermLabels(["N/A", "Summer 2027", "Summer 2027"])).toEqual(["Summer 2027"]);
  });
});

describe("detectEmploymentType", () => {
  it("classifies titles", () => {
    expect(detectEmploymentType("Data Science Co-op")).toBe("co_op");
    expect(detectEmploymentType("SWE Intern")).toBe("internship");
    expect(detectEmploymentType("New Grad Software Engineer")).toBe("new_grad");
    expect(detectEmploymentType("Research Fellowship")).toBe("program");
  });
});

describe("detectRemote", () => {
  it("uses an explicit hint first", () => {
    expect(detectRemote(["New York, NY"], "", "remote")).toBe("remote");
  });
  it("infers from locations", () => {
    expect(detectRemote(["Remote - US"])).toBe("remote");
    expect(detectRemote(["Remote - US", "New York, NY"])).toBe("hybrid");
    expect(detectRemote(["New York, NY (Hybrid)"])).toBe("hybrid");
    expect(detectRemote(["Seattle, WA"])).toBe("onsite");
    expect(detectRemote([])).toBe("unknown");
  });
});

describe("detectField", () => {
  it("prefers community-list categories", () => {
    expect(detectField("Intern", [], "AI/ML/Data")).toBe("data_ml");
    expect(detectField("Intern", [], "Quant")).toBe("quant_finance");
  });
  it("falls back to title keywords, then departments", () => {
    expect(detectField("Software Engineering Intern")).toBe("software");
    expect(detectField("Quantitative Research Intern")).toBe("quant_finance");
    expect(detectField("Mechanical Engineering Co-op")).toBe("hardware");
    expect(detectField("Product Design Intern")).toBe("design");
    expect(detectField("Associate Product Manager Intern")).toBe("product");
    expect(detectField("Summer Intern", ["Marketing"])).toBe("business");
    expect(detectField("Summer Intern")).toBe("other");
  });
});

describe("extractPay", () => {
  it("parses hourly ranges", () => {
    expect(extractPay("The hourly rate for this role is $50 - $58/hr.")).toMatchObject({
      min: 50,
      max: 58,
      currency: "USD",
      period: "hour",
    });
  });
  it("parses monthly amounts with thousands separators", () => {
    expect(extractPay("Stipend: $8,000 per month")).toMatchObject({
      min: 8000,
      max: 8000,
      period: "month",
    });
  });
  it("parses k-suffixed annual ranges", () => {
    expect(extractPay("Base salary $120k–$150k per year")).toMatchObject({
      min: 120000,
      max: 150000,
      period: "year",
    });
  });
  it("returns null without an amount", () => {
    expect(extractPay("Competitive pay")).toBeNull();
  });
});

describe("sponsorshipFromLabel", () => {
  it("maps community-list labels", () => {
    expect(sponsorshipFromLabel("Offers Sponsorship")).toBe("yes");
    expect(sponsorshipFromLabel("Does Not Offer Sponsorship")).toBe("no");
    expect(sponsorshipFromLabel("U.S. Citizenship is Required")).toBe("no");
    expect(sponsorshipFromLabel("Other")).toBe("unknown");
  });
});

describe("text helpers", () => {
  it("htmlToText handles lists and entities", () => {
    expect(htmlToText("<p>A &amp; B</p><ul><li>One</li><li>Two</li></ul>")).toBe(
      "A & B\n• One\n• Two",
    );
  });
  it("slugify", () => {
    expect(slugify("Jane Street & Co.")).toBe("jane-street-and-co");
    expect(slugify("Société Générale")).toBe("societe-generale");
  });
  it("splitLocations", () => {
    expect(splitLocations("NYC; SF | Remote")).toEqual(["NYC", "SF", "Remote"]);
    expect(splitLocations(null)).toEqual([]);
  });
  it("cleanUrl strips tracking params", () => {
    expect(cleanUrl("https://jobs.lever.co/a/b?utm_source=Simplify&ref=Simplify&x=1")).toBe(
      "https://jobs.lever.co/a/b?x=1",
    );
  });
});
