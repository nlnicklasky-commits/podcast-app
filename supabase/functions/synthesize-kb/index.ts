import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/auth.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  "https://www.podbrain.space",
  "https://podbrain.space",
  "https://podcast-app-ten-gamma.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const SYNTHESIS_MODEL = "gpt-4o";
const SYNTHESIS_MAX_TOKENS = 4096;
const TIMEOUT_SYNTHESIS = 3 * 60 * 1000; // 3 min

const ErrorCode = {
  MISSING_PARAM: "MISSING_PARAM",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFIG_ERROR: "CONFIG_ERROR",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  SYNTHESIS_FAILED: "SYNTHESIS_FAILED",
  SYNTHESIS_TIMEOUT: "SYNTHESIS_TIMEOUT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(
  message: string,
  code: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  const respHeaders = headers || {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  return new Response(
    JSON.stringify({ error: message, code }),
    { status, headers: { ...respHeaders, "Content-Type": "application/json" } },
  );
}

async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit & { timeout?: number },
): Promise<Response> {
  const { timeout, ...fetchInit } = init;
  if (!timeout) return fetch(url, fetchInit);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...fetchInit, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Synthesis prompt
// ---------------------------------------------------------------------------

const SYNTHESIS_SYSTEM_PROMPT = `You are a podcast research analyst. You will receive insights (summaries, topics, key points, and entities) from multiple podcast episodes within a knowledge base. Your job is to synthesize cross-episode patterns.

Return a JSON object with exactly this structure:
{
  "themes": [
    {
      "title": "Theme title",
      "description": "2-3 sentence description of the theme",
      "episodes": ["Episode Title 1", "Episode Title 2"],
      "type": "theme"
    }
  ],
  "cross_references": [
    {
      "title": "Brief description of agreement or disagreement",
      "description": "Detailed explanation with specific references",
      "episodes": ["Episode Title 1", "Episode Title 2"],
      "type": "agreement" | "disagreement" | "complement"
    }
  ]
}

Guidelines:
- Identify 3-8 major themes that span multiple episodes
- Find specific points of agreement where multiple episodes/speakers reach similar conclusions
- Find specific points of disagreement or contrasting viewpoints between episodes
- Find complementary perspectives where episodes build on each other
- Always reference specific episode titles in the episodes array
- Keep descriptions concise but specific — cite concrete examples from the insights
- type for cross_references must be one of: "agreement", "disagreement", or "complement"

Return ONLY valid JSON, no markdown, no code fences.`;

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse("Request body must be valid JSON", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }

    const { knowledgeBaseId } = body;
    if (!knowledgeBaseId) {
      return errorResponse("knowledgeBaseId is required", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }

    // Resolve the caller. The cron / internal path presents the service role key
    // (isService=true). The frontend presents the user's session JWT, which we
    // validate into a userId. Anyone else is anonymous and gets refused.
    const { userId, isService } = await resolveCaller(req);
    if (!isService && !userId) {
      return errorResponse("Authentication required", ErrorCode.UNAUTHORIZED, 401, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return errorResponse("OPENAI_API_KEY not configured", ErrorCode.CONFIG_ERROR, 500, corsHeaders);
    }

    // 1. Verify KB exists
    const { data: kbData, error: kbError } = await supabase
      .from("knowledge_bases")
      .select("id, name, user_id")
      .eq("id", knowledgeBaseId)
      .limit(1);

    if (kbError) {
      return errorResponse(`Failed to fetch knowledge base: ${kbError.message}`, ErrorCode.INTERNAL_ERROR, 500, corsHeaders);
    }
    if (!kbData || kbData.length === 0) {
      return errorResponse("Knowledge base not found", ErrorCode.NOT_FOUND, 404, corsHeaders);
    }

    // Ownership enforcement for user callers. Knowledge bases carry a user_id;
    // the caller must own this KB before we spend money on GPT synthesis. The
    // service-role cron path bypasses this check.
    if (!isService && kbData[0].user_id !== userId) {
      return errorResponse(
        "You do not have access to this knowledge base",
        ErrorCode.FORBIDDEN,
        403,
        corsHeaders,
      );
    }

    // 2. Get all processed podcasts in this KB
    const { data: kbPodcasts, error: kbpError } = await supabase
      .from("knowledge_base_podcasts")
      .select("podcast_id, podcasts(id, title, channel, status)")
      .eq("knowledge_base_id", knowledgeBaseId);

    if (kbpError) {
      return errorResponse(`Failed to fetch podcasts: ${kbpError.message}`, ErrorCode.INTERNAL_ERROR, 500, corsHeaders);
    }

    const readyPodcasts = (kbPodcasts || [])
      .map((row: { podcasts: { id: string; title: string; channel: string; status: string } }) => row.podcasts)
      .filter((p: { status: string }) => p.status === "ready");

    if (readyPodcasts.length < 2) {
      return errorResponse(
        "At least 2 processed podcasts are required for synthesis",
        ErrorCode.INSUFFICIENT_DATA,
        400,
        corsHeaders,
      );
    }

    // 3. Fetch insights for all ready podcasts
    const podcastIds = readyPodcasts.map((p: { id: string }) => p.id);
    const { data: insights, error: insightsError } = await supabase
      .from("insights")
      .select("podcast_id, summary, topics, key_points, entities")
      .in("podcast_id", podcastIds);

    if (insightsError) {
      return errorResponse(`Failed to fetch insights: ${insightsError.message}`, ErrorCode.INTERNAL_ERROR, 500, corsHeaders);
    }

    if (!insights || insights.length < 2) {
      return errorResponse(
        "At least 2 podcasts with insights are required for synthesis",
        ErrorCode.INSUFFICIENT_DATA,
        400,
        corsHeaders,
      );
    }

    // 4. Build the insights context for GPT-4o
    const podcastMap = new Map(
      readyPodcasts.map((p: { id: string; title: string; channel: string }) => [p.id, p]),
    );

    const insightsContext = insights.map((ins: {
      podcast_id: string;
      summary: string;
      topics: string[];
      key_points: string[];
      entities: Array<{ name: string; type: string }>;
    }) => {
      const pod = podcastMap.get(ins.podcast_id);
      return {
        episode_title: pod?.title || "Unknown",
        channel: pod?.channel || "Unknown",
        summary: ins.summary,
        topics: ins.topics,
        key_points: ins.key_points,
        entities: ins.entities,
      };
    });

    // 5. Call GPT-4o for synthesis
    let synthResponse: Response;
    try {
      synthResponse = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: SYNTHESIS_MODEL,
          max_tokens: SYNTHESIS_MAX_TOKENS,
          messages: [
            { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Here are the insights from ${insights.length} podcast episodes in the "${kbData[0].name}" knowledge base:\n\n${JSON.stringify(insightsContext, null, 2)}\n\nSynthesize cross-episode themes, agreements, and disagreements.`,
            },
          ],
        }),
        timeout: TIMEOUT_SYNTHESIS,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return errorResponse("Synthesis request timed out", ErrorCode.SYNTHESIS_TIMEOUT, 500, corsHeaders);
      }
      throw err;
    }

    if (!synthResponse.ok) {
      const errText = await synthResponse.text();
      return errorResponse(
        `Synthesis model error: ${synthResponse.status} ${errText}`,
        ErrorCode.SYNTHESIS_FAILED,
        500,
        corsHeaders,
      );
    }

    const synthResult = await synthResponse.json();
    const rawContent = synthResult.choices?.[0]?.message?.content || "{}";

    // 6. Parse the JSON response
    let synthesis: { themes: unknown[]; cross_references: unknown[] };
    try {
      synthesis = JSON.parse(rawContent);
    } catch {
      // Try to extract JSON from markdown code fences
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        synthesis = JSON.parse(jsonMatch[1].trim());
      } else {
        return errorResponse(
          "Failed to parse synthesis response as JSON",
          ErrorCode.SYNTHESIS_FAILED,
          500,
          corsHeaders,
        );
      }
    }

    const themes = synthesis.themes || [];
    const crossReferences = synthesis.cross_references || [];

    // 7. Upsert into kb_syntheses
    // Delete any existing synthesis for this KB, then insert new one
    await supabase
      .from("kb_syntheses")
      .delete()
      .eq("knowledge_base_id", knowledgeBaseId);

    const { data: savedSynthesis, error: upsertError } = await supabase
      .from("kb_syntheses")
      .insert({
        knowledge_base_id: knowledgeBaseId,
        themes,
        cross_references: crossReferences,
        generated_at: new Date().toISOString(),
      })
      .select()
      .limit(1);

    if (upsertError) {
      return errorResponse(
        `Failed to save synthesis: ${upsertError.message}`,
        ErrorCode.INTERNAL_ERROR,
        500,
        corsHeaders,
      );
    }

    return new Response(
      JSON.stringify({
        synthesis: savedSynthesis?.[0] || { themes, cross_references: crossReferences },
        episode_count: insights.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Synthesis error:", err);
    return errorResponse(
      (err as Error).message,
      ErrorCode.INTERNAL_ERROR,
      500,
      corsHeaders,
    );
  }
});
