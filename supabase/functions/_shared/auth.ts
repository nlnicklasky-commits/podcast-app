import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Resolve the identity of the caller hitting a data edge function.
 *
 * Edge functions run with the SERVICE ROLE key, which bypasses RLS. They must
 * therefore enforce ownership themselves. This helper inspects the incoming
 * Authorization header and reports who is calling:
 *
 *   - The cron / internal callers (e.g. poll-subscriptions) present the service
 *     role key directly. They get `isService: true` and `userId: null`, meaning
 *     "trusted, no per-user scoping".
 *   - The frontend presents the user's session JWT. We validate it against
 *     Supabase Auth and return the resolved `userId` so the function can scope
 *     queries to rows that user owns.
 *   - Anyone else (missing/invalid token) gets `userId: null, isService: false`,
 *     i.e. an anonymous caller the function should refuse to serve owned data.
 */
export async function resolveCaller(
  req: Request,
): Promise<{ userId: string | null; isService: boolean }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (token && token === serviceKey) {
    return { userId: null, isService: true };
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await userClient.auth.getUser();
  return { userId: user?.id ?? null, isService: false };
}
