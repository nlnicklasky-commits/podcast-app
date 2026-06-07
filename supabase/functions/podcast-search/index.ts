import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { podcastIndexFetch } from "../_shared/podcast-index.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
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

const MAX_RESULTS = 12;

const ErrorCode = {
  MISSING_PARAM: "MISSING_PARAM",
  CONFIG_ERROR: "CONFIG_ERROR",
  PODCAST_INDEX_FAILED: "PODCAST_INDEX_FAILED",
  PODCAST_INDEX_TIMEOUT: "PODCAST_INDEX_TIMEOUT",
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

    const { query } = body;
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return errorResponse("query is required", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }

    const data = await podcastIndexFetch("/search/byterm", {
      q: query.trim(),
      max: String(MAX_RESULTS),
      clean: "1",
    });

    const results = (data.feeds || []).map(
      (feed: {
        id: number;
        title: string;
        author: string;
        description: string;
        artwork: string;
        image: string;
        url: string;
        episodeCount: number;
        language: string;
        categories: Record<string, string>;
      }) => ({
        id: feed.id,
        title: feed.title,
        author: feed.author,
        description: feed.description,
        artwork: feed.artwork || feed.image,
        feedUrl: feed.url,
        episodeCount: feed.episodeCount,
        language: feed.language,
        categories: feed.categories,
      }),
    );

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    console.error("Podcast search error:", err);
    const error = err as Error & { code?: string; httpStatus?: number };
    return errorResponse(
      error.message,
      error.code || ErrorCode.INTERNAL_ERROR,
      error.httpStatus || 500,
      corsHeaders,
    );
  }
});
