"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface ProfileState {
  error?: string;
  saved?: boolean;
}

const text = (v: FormDataEntryValue | null, max = 200) => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
};

export async function updateProfile(_: ProfileState, formData: FormData): Promise<ProfileState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login?next=/account");

  const gradDate = text(formData.get("grad_date"), 10);
  if (gradDate && !/^\d{4}-\d{2}-\d{2}$/.test(gradDate))
    return { error: "Invalid graduation date." };

  const list = (key: string) =>
    String(formData.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

  const { error } = await supabase.from("profiles").upsert({
    user_id: userId,
    full_name: text(formData.get("full_name")),
    school: text(formData.get("school")),
    major: text(formData.get("major")),
    grad_date: gradDate,
    work_auth: text(formData.get("work_auth")),
    preferences: {
      locations: list("pref_locations"),
      fields: formData.getAll("pref_fields").map(String),
      remote_ok: formData.get("remote_ok") === "on",
    },
  });
  if (error) return { error: error.message };
  revalidatePath("/account");
  return { saved: true };
}
