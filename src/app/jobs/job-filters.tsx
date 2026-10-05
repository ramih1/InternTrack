"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { JobFilters } from "@/lib/jobs/filters";
import {
  EMPLOYMENT_LABELS,
  FIELD_LABELS,
  POSTED_WITHIN_OPTIONS,
  REMOTE_LABELS,
} from "@/lib/jobs/labels";

/**
 * A plain GET form (works without JavaScript); with JS, selects apply immediately and text inputs
 * apply on submit/Enter.
 */
export function JobFiltersForm({ filters, terms }: { filters: JobFilters; terms: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    const qs = params.toString();
    if (qs === searchParams.toString()) return;
    startTransition(() => router.push(qs ? `/jobs?${qs}` : "/jobs"));
  }

  return (
    <form
      action="/jobs"
      method="get"
      className="space-y-4"
      data-pending={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
      onChange={(e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "SELECT" || (target as HTMLInputElement).type === "checkbox") {
          apply(e.currentTarget);
        }
      }}
    >
      <Field id="q" label="Role">
        <Input id="q" name="q" placeholder="e.g. software, data" defaultValue={filters.q ?? ""} />
      </Field>
      <Field id="company" label="Company">
        <Input
          id="company"
          name="company"
          placeholder="Any company"
          defaultValue={filters.company ?? ""}
        />
      </Field>
      <Field id="location" label="Location">
        <Input
          id="location"
          name="location"
          placeholder="City, state, or country"
          defaultValue={filters.location ?? ""}
        />
      </Field>
      <Field id="remote" label="Work arrangement">
        <NativeSelect id="remote" name="remote" defaultValue={filters.remote ?? ""}>
          <NativeSelectOption value="">Any</NativeSelectOption>
          {(["remote", "hybrid", "onsite"] as const).map((v) => (
            <NativeSelectOption key={v} value={v}>
              {REMOTE_LABELS[v]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field id="term" label="Term">
        <NativeSelect id="term" name="term" defaultValue={filters.term ?? ""}>
          <NativeSelectOption value="">Any term</NativeSelectOption>
          {terms.map((t) => (
            <NativeSelectOption key={t} value={t}>
              {t}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field id="field" label="Field">
        <NativeSelect id="field" name="field" defaultValue={filters.field ?? ""}>
          <NativeSelectOption value="">All fields</NativeSelectOption>
          {Object.entries(FIELD_LABELS).map(([v, label]) => (
            <NativeSelectOption key={v} value={v}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field id="type" label="Type">
        <NativeSelect id="type" name="type" defaultValue={filters.type ?? ""}>
          <NativeSelectOption value="">All types</NativeSelectOption>
          {Object.entries(EMPLOYMENT_LABELS).map(([v, label]) => (
            <NativeSelectOption key={v} value={v}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field id="days" label="Posted within">
        <NativeSelect id="days" name="days" defaultValue={filters.days ? String(filters.days) : ""}>
          <NativeSelectOption value="">Any time</NativeSelectOption>
          {POSTED_WITHIN_OPTIONS.map((d) => (
            <NativeSelectOption key={d} value={d}>
              {d === 1 ? "Last 24 hours" : `Last ${d} days`}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="sponsorship"
          value="1"
          defaultChecked={filters.sponsorship}
          className="border-input accent-primary size-4 rounded"
        />
        Offers visa sponsorship
      </label>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? "Searching…" : "Search"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => startTransition(() => router.push("/jobs"))}
        >
          Reset
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
