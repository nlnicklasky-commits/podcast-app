import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { podcastIndexFetch } from "../_shared/podcast-index.ts";

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

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(
        JSON.stringify({ error: "Request body must be valid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { action } = body;

    if (action === "categories") {
      const data = await podcastIndexFetch("/categories/list", {}) as {
        feeds?: Array<{ id: number; name: string }>;
      };

      const categories = (data.feeds || []).map(
        (cat: { id: number; name: string }) => ({
          id: cat.id,
          name: cat.name,
        }),
      );

      return new Response(
        JSON.stringify({ categories }),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
      );
    }

    if (action === "trending") {
      const max = Math.min(Number(body.max) || 20, 50);
      const params: Record<string, string> = {
        max: String(max),
        lang: "en",
      };

      if (body.categoryId) {
        params.cat = String(body.categoryId);
      }

      const data = await podcastIndexFetch("/podcasts/trending", params) as {
        feeds?: Array<{
          id: number;
          title: string;
          author: string;
          description: string;
          artwork: string;
          image: string;
          url: string;
          episodeCount: number;
          trendScore: number;
          language: string;
          categories: Record<string, string>;
        }>;
      };

      const shows = (data.feeds || []).map(
        (feed: {
          id: number;
          title: string;
          author: string;
          description: string;
          artwork: string;
          image: string;
          url: string;
          episodeCount: number;
          trendScore: number;
        }) => ({
          id: feed.id,
          title: feed.title,
          author: feed.author,
          description: feed.description,
          artwork: feed.artwork || feed.image,
          feedUrl: feed.url,
          episodeCount: feed.episodeCount,
          trendScore: feed.trendScore,
        }),
      );

      return new Response(
        JSON.stringify({ shows }),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
      );
    }

    return new Response(
      JSON.stringify({ error: 'action must be "categories" or "trending"' }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("podcast-discover error:", err);
    const error = err as Error & { code?: string; httpStatus?: number };
    return new Response(
      JSON.stringify({ error: error.message, code: error.code }),
      { status: error.httpStatus || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
