import { describe, expect, it } from "vitest";

import {
  FREE_LIMITS,
  formatResetIn,
  limitMessage,
  quotaStatus,
  SITE_LIMIT_MESSAGE,
  siteDailyLimit,
  windowStart,
} from "./limits";

const now = new Date("2026-10-29T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe("free limits", () => {
  it("are 3 tailorings per 30 days and 10 fit checks per day", () => {
    expect(FREE_LIMITS.tailor).toMatchObject({ count: 3, windowHours: 720 });
    expect(FREE_LIMITS.fit_check).toMatchObject({ count: 10, windowHours: 24 });
    expect(windowStart(FREE_LIMITS.fit_check!, now).toISOString()).toBe(hoursAgo(24));
  });

  it("caps resume ratings at 3 per 30 days and leaves parsing to the site-wide limit", () => {
    expect(FREE_LIMITS.review).toMatchObject({ count: 3, windowHours: 720 });
    expect(FREE_LIMITS.parse).toBeUndefined();
  });
});

describe("site-wide daily limit", () => {
  it("defaults to 300, can be changed, and 0 turns it off", () => {
    expect(siteDailyLimit({})).toBe(300);
    expect(siteDailyLimit({ AI_DAILY_LIMIT: " 50 " })).toBe(50);
    expect(siteDailyLimit({ AI_DAILY_LIMIT: "0" })).toBeNull();
    expect(siteDailyLimit({ AI_DAILY_LIMIT: "lots" })).toBe(300);
    expect(siteDailyLimit({ AI_DAILY_LIMIT: "-1" })).toBe(300);
  });

  it("explains a site-wide block instead of the user's own limit", () => {
    const status = { ...quotaStatus("free", "tailor", []), allowed: false, siteLimited: true };
    expect(limitMessage("tailor", status, now)).toBe(SITE_LIMIT_MESSAGE);
    expect(limitMessage("parse", status, now)).toBe(SITE_LIMIT_MESSAGE);
  });
});

describe("quotaStatus", () => {
  it("allows free users under the limit and counts remaining", () => {
    expect(quotaStatus("free", "tailor", [hoursAgo(5)])).toEqual({
      allowed: true,
      unlimited: false,
      used: 1,
      limit: 3,
      remaining: 2,
      resetsAt: null,
    });
  });

  it("blocks at the limit and reports when the oldest use expires", () => {
    const s = quotaStatus(
      "free",
      "fit_check",
      Array.from({ length: 10 }, (_, i) => hoursAgo(i + 1)),
    );
    expect(s.allowed).toBe(false);
    expect(s.remaining).toBe(0);
    expect(s.resetsAt).toBe(new Date(Date.parse(hoursAgo(10)) + 24 * 3_600_000).toISOString());
  });

  it("never limits the unlimited plan or unmetered features", () => {
    const many = Array.from({ length: 50 }, () => hoursAgo(1));
    expect(quotaStatus("unlimited", "tailor", many)).toMatchObject({
      allowed: true,
      unlimited: true,
    });
    expect(quotaStatus("free", "parse", many)).toMatchObject({ allowed: true, unlimited: true });
  });
});

describe("messages", () => {
  it("formats reset times", () => {
    expect(formatResetIn(new Date(now.getTime() + 30_000).toISOString(), now)).toBe("in a minute");
    expect(formatResetIn(new Date(now.getTime() + 25 * 60_000).toISOString(), now)).toBe(
      "in 25 minutes",
    );
    expect(formatResetIn(new Date(now.getTime() + 5.5 * 3_600_000).toISOString(), now)).toBe(
      "in 6 hours",
    );
    expect(formatResetIn(new Date(now.getTime() + 12 * 86_400_000).toISOString(), now)).toBe(
      "in 12 days",
    );
  });

  it("explains the limit", () => {
    const s = quotaStatus("free", "tailor", [hoursAgo(1), hoursAgo(2), hoursAgo(48)]);
    expect(limitMessage("tailor", s, now)).toBe(
      "You've used your free 3 tailored resumes per 30 days. More in 28 days. Paid plans with more are coming soon.",
    );
  });
});
