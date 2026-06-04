import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { podcastIndexFetch } from "../_shared/podcast-index.ts";

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

const MAX_URLS = 50;
const BATCH_DELAY_MS = 200;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.feed_urls)) {
      return new Response(
        JSON.stringify({ error: "feed_urls array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const feedUrls: string[] = body.feed_urls.slice(0, MAX_URLS);
    const results: Array<{
      feedUrl: string;
      feedId: number;
      title: string;
      author: string;
      artwork: string;
      episodeCount: number;
    }> = [];
    const unresolved: string[] = [];

    for (let i = 0; i < feedUrls.length; i++) {
      const feedUrl = feedUrls[i];
      try {
        const data = await podcastIndexFetch("/podcasts/byfeedurl", {
          url: feedUrl,
        }) as {
          feed?: {
            id: number;
            title: string;
            author: string;
            artwork: string;
            image: string;
            url: string;
            episodeCount: number;
          };
        };

        if (data.feed && data.feed.id) {
          results.push({
            feedUrl,
            feedId: data.feed.id,
            title: data.feed.title || "",
            author: data.feed.author || "",
            artwork: data.feed.artwork || data.feed.image || "",
            episodeCount: data.feed.episodeCount || 0,
          });
        } else {
          unresolved.push(feedUrl);
        }
      } catch {
        unresolved.push(feedUrl);
      }

      if (i < feedUrls.length - 1 && BATCH_DELAY_MS > 0) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    return new Response(
      JSON.stringify({ results, unresolved }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("resolve-feeds error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
