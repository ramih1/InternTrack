import { describe, expect, it } from "vitest";

import {
  filtersToQuery,
  likePattern,
  normalizeLocationQuery,
  parseJobFilters,
  upcomingTerms,
} from "./filters";
import { formatPay, formatRelativeDate, formatYearMonth } from "./format";

describe("parseJobFilters", () => {
  it("parses valid params", () => {
    const f = parseJobFilters({
      q: " software ",
      location: "Toronto",
      remote: "remote",
      term: "Summer 2027",
      field: "data_ml",
      type: "co_op",
      days: "7",
      sponsorship: "1",
      page: "3",
    });
    expect(f).toEqual({
      q: "software",
      company: null,
      location: "Toronto",
      remote: "remote",
      term: "Summer 2027",
      field: "data_ml",
      type: "co_op",
      days: 7,
      sponsorship: true,
      page: 3,
    });
  });

  it("ignores invalid values", () => {
    const f = parseJobFilters({
      remote: "moon",
      term: "Summer; drop table",
      field: "chef",
      days: "5",
      page: "-2",
    });
    expect(f).toMatchObject({ remote: null, term: null, field: null, days: null, page: 1 });
  });

  it("round-trips through the query string", () => {
    const f = parseJobFilters({ q: "swe", term: "Fall 2027", page: "2" });
    expect(filtersToQuery(f)).toBe("?q=swe&term=Fall+2027&page=2");
    expect(filtersToQuery(f, { page: 1 })).toBe("?q=swe&term=Fall+2027");
  });
});

describe("likePattern", () => {
  it("escapes wildcards", () => {
    expect(likePattern("50%_off")).toBe("%50\\%\\_off%");
  });
});

describe("upcomingTerms", () => {
  it("starts at the current season and rolls the year after Fall", () => {
    expect(upcomingTerms(new Date("2026-10-05T00:00:00Z"), 5)).toEqual([
      "Fall 2026",
      "Winter 2027",
      "Spring 2027",
      "Summer 2027",
      "Fall 2027",
    ]);
  });
});

describe("formatPay", () => {
  const base = {
    pay_text: null,
    pay_min: null,
    pay_max: null,
    pay_currency: null,
    pay_period: null,
  };
  it("formats ranges with period", () => {
    expect(
      formatPay({ ...base, pay_min: 45, pay_max: 55, pay_currency: "USD", pay_period: "hour" }),
    ).toBe("$45–$55/hr");
  });
  it("falls back to the source text", () => {
    expect(formatPay({ ...base, pay_text: "Competitive" })).toBe("Competitive");
    expect(formatPay(base)).toBeNull();
  });
});

describe("formatRelativeDate", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  it("formats recent dates", () => {
    expect(formatRelativeDate("2026-10-05T01:00:00Z", now)).toBe("today");
    expect(formatRelativeDate("2026-10-04T01:00:00Z", now)).toBe("yesterday");
    expect(formatRelativeDate("2026-09-30T12:00:00Z", now)).toBe("5 days ago");
    expect(formatRelativeDate("2026-09-01T12:00:00Z", now)).toBe("4 weeks ago");
  });
});

describe("normalizeLocationQuery", () => {
  it("maps shorthand to stored names", () => {
    expect(normalizeLocationQuery(" NYC ")).toBe("new york");
    expect(normalizeLocationQuery("S.F.")).toBe("san francisco");
    expect(normalizeLocationQuery("Toronto")).toBe("toronto");
  });
});

describe("formatYearMonth", () => {
  it("formats YYYY-MM and passes other values through", () => {
    expect(formatYearMonth("2029-04")).toBe("Apr 2029");
    expect(formatYearMonth("Spring 2029")).toBe("Spring 2029");
  });
});
