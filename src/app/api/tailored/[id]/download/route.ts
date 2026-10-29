import { NextResponse, type NextRequest } from "next/server";

import { kindFromMimeType, RESUME_MIME_TYPES } from "@/lib/resumes/files";
import { createClient } from "@/lib/supabase/server";
import { applyDocxEdits } from "@/lib/tailor/docx";
import { applyLatexEdits } from "@/lib/tailor/latex";
import { downloadFileName, selectEdits } from "@/lib/tailor/download";
import type { TailorResult } from "@/lib/tailor/types";

export const dynamic = "force-dynamic";

/**
 * Builds the tailored resume file from the original upload plus the edits the student
 * accepted (`?accept=e1,e3`). Nothing is stored; RLS limits access to the owner.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tailored/[id]/download">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: row } = await supabase
    .from("tailored_resumes")
    .select("result_json, resumes(file_path, mime_type, file_name), jobs(companies(name))")
    .eq("id", id)
    .maybeSingle();
  if (!row?.resumes) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = row.result_json as unknown as TailorResult;
  const kind = kindFromMimeType(row.resumes.mime_type);
  if (kind === "pdf") {
    return NextResponse.json({ error: "PDF resumes can't be edited in place." }, { status: 400 });
  }
  const edits = selectEdits(result.edits, request.nextUrl.searchParams.get("accept"));

  const { data: blob, error } = await supabase.storage
    .from("resumes")
    .download(row.resumes.file_path);
  if (error)
    return NextResponse.json({ error: "Couldn't read the original file." }, { status: 502 });
  const original = new Uint8Array(await blob.arrayBuffer());

  const body =
    kind === "tex"
      ? new TextEncoder().encode(applyLatexEdits(new TextDecoder().decode(original), edits).output)
      : (await applyDocxEdits(original, edits)).output;
  const fileName = downloadFileName(row.resumes.file_name, row.jobs?.companies?.name ?? null, kind);

  return new NextResponse(Buffer.from(body), {
    headers: {
      "Content-Type":
        kind === "tex" ? `${RESUME_MIME_TYPES.tex}; charset=utf-8` : RESUME_MIME_TYPES.docx,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
