import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const MAX_EPISODES = 50;
const TIMEOUT_PODCAST_INDEX = 30 * 1000; // 30 seconds
const TIMEOUT_RSS_FEED = 30 * 1000;      // 30 seconds

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
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse("Request body must be valid JSON", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }

    const { feed_id, feed_url } = body;
    if (!feed_id) {
      return errorResponse("feed_id is required", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }

    const data = await podcastIndexFetch("/episodes/byfeedid", {
      id: String(feed_id),
      max: String(MAX_EPISODES),
      fulltext: "1",
    });

    // Fetch RSS feed to extract podcast:transcript and podcast:locked tags (PI API doesn't expose them)
    const transcriptMap = new Map<string, { url: string; type: string }[]>();
    let feedLocked = false;
    if (feed_url) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_RSS_FEED);

        try {
          const rssResponse = await fetch(feed_url, {
            headers: { "User-Agent": "PodcastBrain/1.0" },
            signal: controller.signal,
          });

          if (rssResponse.ok) {
            const rssText = await rssResponse.text();

            // Check for <podcast:locked>yes</podcast:locked> at channel level
            // Extract the channel-level content (before the first <item>)
            const channelContent = rssText.split(/<item[\s>]/i)[0] || "";
            const lockedMatch = channelContent.match(/<podcast:locked[^>]*>\s*(yes)\s*<\/podcast:locked>/i);
            if (lockedMatch) {
              feedLocked = true;
            }

            // Split by <item> to process each episode
            const items = rssText.split(/<item[\s>]/i).slice(1);
            for (const item of items) {
              // Extract enclosure URL to use as key for matching
              const encMatch = item.match(/enclosureUrl="([^"]+)"|<enclosure[^>]+url="([^"]+)"/i);
              const encUrl = encMatch?.[1] || encMatch?.[2] || "";

              // Extract all podcast:transcript tags
              const txRegex = /<podcast:transcript\s+([^>]+?)\/?\s*>/gi;
              const transcripts: { url: string; type: string }[] = [];
              let txMatch;
              while ((txMatch = txRegex.exec(item)) !== null) {
                const attrs = txMatch[1];
                const urlMatch = attrs.match(/url="([^"]+)"/);
                const typeMatch = attrs.match(/type="([^"]+)"/);
                if (urlMatch) {
                  transcripts.push({
                    url: urlMatch[1],
                    type: typeMatch?.[1] || "text/plain",
                  });
                }
              }
              if (transcripts.length > 0 && encUrl) {
                // Normalize URL for matching (strip tracking redirects)
                const normalizedKey = encUrl.split("/").pop() || encUrl;
                transcriptMap.set(normalizedKey, transcripts);
              }
            }
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        // RSS transcript fetch is non-fatal -- episodes still work without transcripts
        const errMsg = (e as Error).name === "AbortError"
          ? `RSS feed fetch timed out after ${TIMEOUT_RSS_FEED / 1000}s (non-fatal)`
          : `RSS transcript fetch failed (non-fatal): ${(e as Error).message}`;
        console.error(errMsg);
      }
    }

    const episodes = (data.items || []).map(
      (ep: {
        id: number;
        title: string;
        description: string;
        datePublished: number;
        duration: number;
        enclosureUrl: string;
        enclosureType: string;
        enclosureLength: number;
        image: string;
        link: string;
        feedId: number;
      }) => {
        // Match transcript data from RSS feed by enclosure URL filename
        const epFilename = ep.enclosureUrl?.split("/").pop() || "";
        const rssTranscripts = transcriptMap.get(epFilename) || [];

        return {
          id: ep.id,
          title: ep.title,
          description: ep.description,
          datePublished: ep.datePublished,
          duration: ep.duration,
          enclosureUrl: ep.enclosureUrl,
          enclosureType: ep.enclosureType,
          fileSize: ep.enclosureLength,
          image: ep.image,
          link: ep.link,
          feedId: ep.feedId,
          transcripts: rssTranscripts,
          locked: feedLocked,
        };
      },
    );

    return new Response(JSON.stringify({ episodes, locked: feedLocked }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Podcast episodes error:", err);
    const error = err as Error & { code?: string; httpStatus?: number };
    return errorResponse(
      error.message,
      error.code || ErrorCode.INTERNAL_ERROR,
      error.httpStatus || 500,
      corsHeaders,
    );
  }
});
