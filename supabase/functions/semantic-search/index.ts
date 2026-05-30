import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://podcast-app-ten-gamma.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_THRESHOLD = 0.3;
const TIMEOUT_EMBEDDING = 2 * 60 * 1000;

const ErrorCode = {
  MISSING_PARAM: "MISSING_PARAM",
  INVALID_PARAM: "INVALID_PARAM",
  CONFIG_ERROR: "CONFIG_ERROR",
  EMBEDDING_FAILED: "EMBEDDING_FAILED",
  EMBEDDING_TIMEOUT: "EMBEDDING_TIMEOUT",
  SEARCH_FAILED: "SEARCH_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

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
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { ...respHeaders, "Content-Type": "application/json" },
  });
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

/** Strip HTML tags and trim whitespace from user input before DB storage. */
function sanitizeInput(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const startTime = performance.now();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(
        "Request body must be valid JSON",
        ErrorCode.MISSING_PARAM,
        400,
        corsHeaders,
      );
    }

    const { query: rawQuery, scope, limit, offset, threshold } = body;

    if (!rawQuery || typeof rawQuery !== "string" || rawQuery.trim().length < 3) {
      return errorResponse(
        "query is required and must be at least 3 characters",
        ErrorCode.MISSING_PARAM,
        400,
        corsHeaders,
      );
    }
    const query = sanitizeInput(rawQuery);

    const searchLimit = Math.min(
      Math.max(1, limit ?? DEFAULT_LIMIT),
      MAX_LIMIT,
    );
    const searchOffset = Math.max(0, offset ?? 0);
    const searchThreshold = Math.min(
      0.95,
      Math.max(0.1, threshold ?? DEFAULT_THRESHOLD),
    );

    const scopeType = scope?.type || "all";
    const scopeId = scope?.id || null;

    if (
      scopeType !== "all" &&
      scopeType !== "knowledge_base" &&
      scopeType !== "podcast"
    ) {
      return errorResponse(
        "scope.type must be 'all', 'knowledge_base', or 'podcast'",
        ErrorCode.INVALID_PARAM,
        400,
        corsHeaders,
      );
    }

    if (scopeType !== "all" && !scopeId) {
      return errorResponse(
        "scope.id is required when scope.type is not 'all'",
        ErrorCode.INVALID_PARAM,
        400,
        corsHeaders,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Extract user_id from the incoming JWT for user-scoped writes
    let callingUserId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      callingUserId = user?.id ?? null;
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return errorResponse(
        "OPENAI_API_KEY not configured",
        ErrorCode.CONFIG_ERROR,
        500,
        corsHeaders,
      );
    }

    // 1. Embed the query
    let embResponse: Response;
    try {
      embResponse = await fetchWithTimeout(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: EMBEDDING_MODEL, input: query.trim() }),
          timeout: TIMEOUT_EMBEDDING,
        },
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return errorResponse(
          "Embedding request timed out",
          ErrorCode.EMBEDDING_TIMEOUT,
          500,
          corsHeaders,
        );
      }
      throw err;
    }

    if (!embResponse.ok) {
      const errText = await embResponse.text();
      return errorResponse(
        `Embedding failed: ${errText}`,
        ErrorCode.EMBEDDING_FAILED,
        500,
        corsHeaders,
      );
    }

    const embResult = await embResponse.json();
    const queryEmbedding = embResult.data[0].embedding;

    // 2. Vector search — choose RPC based on scope
    let chunks: Array<{
      id: string;
      podcast_id: string;
      text: string;
      start_time: number;
      end_time: number;
      token_count: number;
      similarity: number;
    }> | null = null;
    let searchErr: { message: string } | null = null;

    if (scopeType === "all") {
      const res = await supabase.rpc("match_chunks_global", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: searchLimit,
        match_threshold: searchThreshold,
        match_offset: searchOffset,
      });
      chunks = res.data;
      searchErr = res.error;
    } else if (scopeType === "knowledge_base") {
      const res = await supabase.rpc("match_chunks", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_kb_id: scopeId,
        match_count: searchLimit,
        match_threshold: searchThreshold,
        match_offset: searchOffset,
      });
      chunks = res.data;
      searchErr = res.error;
    } else if (scopeType === "podcast") {
      // For podcast scope, use global search then filter
      const res = await supabase.rpc("match_chunks_global", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: searchLimit + searchOffset,
        match_threshold: searchThreshold,
        match_offset: 0,
      });
      if (res.data) {
        chunks = res.data
          .filter(
            (c: { podcast_id: string }) => c.podcast_id === scopeId,
          )
          .slice(searchOffset, searchOffset + searchLimit);
      }
      searchErr = res.error;
    }

    if (searchErr) {
      return errorResponse(
        `Vector search failed: ${searchErr.message}`,
        ErrorCode.SEARCH_FAILED,
        500,
        corsHeaders,
      );
    }

    const matchedChunks = chunks || [];

    // 3. Fetch podcast metadata
    const podcastIds = [
      ...new Set(matchedChunks.map((c) => c.podcast_id)),
    ];

    let podcastMap = new Map<
      string,
      { title: string; channel: string; thumbnail_url: string | null }
    >();
    if (podcastIds.length > 0) {
      const { data: podcasts } = await supabase
        .from("podcasts")
        .select("id, title, channel, thumbnail_url")
        .in("id", podcastIds);
      podcastMap = new Map(
        (podcasts || []).map(
          (p: {
            id: string;
            title: string;
            channel: string;
            thumbnail_url: string | null;
          }) => [p.id, p],
        ),
      );
    }

    // 4. Fetch KB associations for each podcast
    let kbMap = new Map<
      string,
      Array<{ id: string; name: string }>
    >();
    if (podcastIds.length > 0) {
      const { data: kbLinks } = await supabase
        .from("knowledge_base_podcasts")
        .select("podcast_id, knowledge_base_id, knowledge_bases(id, name)")
        .in("podcast_id", podcastIds);

      for (const link of kbLinks || []) {
        const pid = link.podcast_id;
        if (!kbMap.has(pid)) kbMap.set(pid, []);
        const kb = link.knowledge_bases as unknown as {
          id: string;
          name: string;
        };
        if (kb) {
          kbMap.get(pid)!.push({ id: kb.id, name: kb.name });
        }
      }
    }

    // 5. Build results
    const results = matchedChunks.map((chunk) => {
      const pod = podcastMap.get(chunk.podcast_id);
      const kbs = kbMap.get(chunk.podcast_id) || [];
      return {
        chunk_id: chunk.id,
        podcast_id: chunk.podcast_id,
        podcast_title: pod?.title || "Unknown",
        podcast_channel: pod?.channel || "",
        thumbnail_url: pod?.thumbnail_url || null,
        text: chunk.text,
        start_time: chunk.start_time,
        end_time: chunk.end_time,
        similarity: chunk.similarity,
        knowledge_base_ids: kbs.map((k) => k.id),
        knowledge_base_names: kbs.map((k) => k.name),
      };
    });

    // 6. Save to search_history
    const historyEntry: Record<string, unknown> = {
      query: query.trim(),
      result_count: results.length,
      scope_type: scopeType,
      scope_id: scopeId,
    };
    if (callingUserId) historyEntry.user_id = callingUserId;

    await supabase.from("search_history").insert(historyEntry);

    const queryTimeMs = Math.round(performance.now() - startTime);

    return new Response(
      JSON.stringify({
        results,
        total_estimated: results.length,
        query_time_ms: queryTimeMs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Semantic search error:", err);
    return errorResponse(
      (err as Error).message,
      ErrorCode.INTERNAL_ERROR,
      500,
      corsHeaders,
    );
  }
});
