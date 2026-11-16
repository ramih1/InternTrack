-- InternTrack — only server code (service role) reads the site-wide AI usage total.
-- Signed-in users don't need it, and a SECURITY DEFINER function shouldn't be callable
-- from the public API without a reason.

revoke execute on function public.ai_usage_last_24h() from authenticated;
