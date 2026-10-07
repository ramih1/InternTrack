import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** OAuth (Google) and PKCE redirect target: exchanges the code for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/jobs";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/jobs";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }
  const description = searchParams.get("error_description") ?? "Sign-in was cancelled.";
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(description)}`);
}
