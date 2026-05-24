import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RESULTS = 12;
const TIMEOUT_PODCAST_INDEX = 30 * 1000; // 30 seconds

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
): Response {
  return new Response(
    JSON.stringify({ error: message, code }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function podcastIndexFetch(endpoint: string, params: Record<string, string>) {
  const apiKey = Deno.env.get("PODCAST_INDEX_KEY");
  const apiSecret = Deno.env.get("PODCAST_INDEX_SECRET");
  if (!apiKey || !apiSecret) {
    throw Object.assign(
      new Error("PODCAST_INDEX_KEY and PODCAST_INDEX_SECRET must be set"),
      { code: ErrorCode.CONFIG_ERROR, httpStatus: 500 },
    );
  }

  const ts = Math.floor(Date.now() / 1000).toString();
  const data = new TextEncoder().encode(apiKey + apiSecret + ts);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const authHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const url = new URL(`https://api.podcastindex.org/api/1.0${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_PODCAST_INDEX);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "PodcastBrain/1.0",
        "X-Auth-Key": apiKey,
        "X-Auth-Date": ts,
        "Authorization": authHash,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Podcast Index error:", errText);
      throw Object.assign(
        new Error(`Podcast Index API error: HTTP ${response.status}`),
        { code: ErrorCode.PODCAST_INDEX_FAILED, httpStatus: 500 },
      );
    }

    return response.json();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw Object.assign(
        new Error(`Podcast Index API timed out after ${TIMEOUT_PODCAST_INDEX / 1000}s`),
        { code: ErrorCode.PODCAST_INDEX_TIMEOUT, httpStatus: 500 },
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse("Request body must be valid JSON", ErrorCode.MISSING_PARAM, 400);
    }

    const { query } = body;
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return errorResponse("query is required", ErrorCode.MISSING_PARAM, 400);
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Podcast search error:", err);
    const error = err as Error & { code?: string; httpStatus?: number };
    return errorResponse(
      error.message,
      error.code || ErrorCode.INTERNAL_ERROR,
      error.httpStatus || 500,
    );
  }
});
