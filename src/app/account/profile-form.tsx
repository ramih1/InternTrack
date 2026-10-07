"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD_LABELS } from "@/lib/jobs/labels";
import type { Database } from "@/lib/supabase/database.types";

import { updateProfile, type ProfileState } from "./actions";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
interface Preferences {
  locations?: string[];
  fields?: string[];
  remote_ok?: boolean;
}

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const prefs = (profile?.preferences ?? {}) as Preferences;

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="full_name"
          label="Full name"
          defaultValue={profile?.full_name ?? undefined}
        />
        <TextField name="school" label="School" defaultValue={profile?.school ?? undefined} />
        <TextField name="major" label="Major" defaultValue={profile?.major ?? undefined} />
        <TextField
          name="grad_date"
          label="Expected graduation"
          type="date"
          defaultValue={profile?.grad_date ?? undefined}
        />
        <TextField
          name="work_auth"
          label="Work authorization"
          placeholder="e.g. US citizen, F-1 (needs sponsorship)"
          defaultValue={profile?.work_auth ?? undefined}
        />
        <TextField
          name="pref_locations"
          label="Preferred locations"
          placeholder="Comma-separated, e.g. New York, Toronto"
          defaultValue={prefs.locations?.join(", ")}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Fields you&apos;re interested in</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {Object.entries(FIELD_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="pref_fields"
                value={value}
                defaultChecked={prefs.fields?.includes(value)}
                className="accent-primary size-4"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="remote_ok"
          defaultChecked={prefs.remote_ok}
          className="accent-primary size-4"
        />
        Open to remote roles
      </label>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.saved && (
        <Alert>
          <AlertDescription>Profile saved.</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

function TextField({
  name,
  label,
  defaultValue,
  ...props
}: { name: string; label: string; defaultValue?: string } & React.ComponentProps<"input">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue ?? ""} {...props} />
    </div>
  );
}
