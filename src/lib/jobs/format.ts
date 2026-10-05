const PERIOD_SUFFIX: Record<string, string> = {
  hour: "/hr",
  week: "/wk",
  month: "/mo",
  year: "/yr",
  total: " total",
};

function money(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    notation: n >= 100_000 ? "compact" : "standard",
  }).format(n);
}

export function formatPay(job: {
  pay_text: string | null;
  pay_min: number | null;
  pay_max: number | null;
  pay_currency: string | null;
  pay_period: string | null;
}): string | null {
  const { pay_min: min, pay_max: max } = job;
  if (min === null && max === null) return job.pay_text;
  const currency =
    job.pay_currency && /^[A-Z]{3}$/.test(job.pay_currency) ? job.pay_currency : "USD";
  const suffix = job.pay_period ? (PERIOD_SUFFIX[job.pay_period] ?? "") : "";
  try {
    const lo = money((min ?? max)!, currency);
    const hi = max !== null && min !== null && max !== min ? `–${money(max, currency)}` : "";
    return `${lo}${hi}${suffix}`;
  } catch {
    return job.pay_text;
  }
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", or a date for older items. */
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDate(isoDate: string): string {
  // Dates (YYYY-MM-DD) are calendar dates; format in UTC to avoid off-by-one.
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
