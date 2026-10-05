import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export const FIELD_LABELS: Record<Enums["job_field"], string> = {
  software: "Software",
  data_ml: "Data / ML / AI",
  hardware: "Hardware",
  product: "Product",
  design: "Design",
  quant_finance: "Quant / Finance",
  business: "Business",
  research: "Research",
  other: "Other",
};

export const REMOTE_LABELS: Record<Enums["remote_type"], string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Unspecified",
};

export const EMPLOYMENT_LABELS: Record<Enums["employment_type"], string> = {
  internship: "Internship",
  co_op: "Co-op",
  new_grad: "New grad",
  program: "Student program",
};

export const SOURCE_LABELS: Record<Enums["job_source_type"], string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  simplify: "SimplifyJobs list (GitHub)",
  manual: "Added manually",
};

export const POSTED_WITHIN_OPTIONS = [1, 3, 7, 14, 30, 60] as const;
