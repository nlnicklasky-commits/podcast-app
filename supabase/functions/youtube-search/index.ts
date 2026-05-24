import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Uses YouTube's internal InnerTube API (same API the website uses).
 * No API key needed — just needs the right client context.
 */
async function searchYouTube(query: string) {
  const response = await fetch(
    "https://www.youtube.com/youtubei/v1/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20241126.01.00",
            hl: "en",
            gl: "US",
          },
        },
        query: query,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`YouTube search failed: ${response.status}`);
  }

  return await response.json();
}

function parseDuration(text: string): number {
  // Parse "1:23:45" or "23:45" to seconds
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function extractVideoResults(data: Record<string, unknown>): Array<{
  videoId: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt: string;
  duration: number;
  durationText: string;
}> {
  const results: Array<{
    videoId: string;
    url: string;
    title: string;
    channel: string;
    thumbnail: string;
    publishedAt: string;
    duration: number;
    durationText: string;
  }> = [];

  try {
    // Navigate the deeply nested InnerTube response
    const contents = (data as any)?.contents?.twoColumnSearchResultsRenderer
      ?.primaryContents?.sectionListRenderer?.contents;

    if (!contents) return results;

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents;
      if (!items) continue;

      for (const item of items) {
        const video = item?.videoRenderer;
        if (!video?.videoId) continue;

        const durationText = video.lengthText?.simpleText || "";
        const durationSec = parseDuration(durationText);

        // Skip short videos (< 10 min) — we want podcast-length content
        if (durationSec < 600) continue;

        const title =
          video.title?.runs?.map((r: { text: string }) => r.text).join("") ||
          "";
        const channel =
          video.ownerText?.runs?.map((r: { text: string }) => r.text).join("") ||
          "";
        const thumbnail =
          video.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || "";
        const publishedAt = video.publishedTimeText?.simpleText || "";

        results.push({
          videoId: video.videoId,
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          title,
          channel,
          thumbnail,
          publishedAt,
          duration: durationSec,
          durationText,
        });

        if (results.length >= 8) return results;
      }
    }
  } catch (err) {
    console.error("Error parsing YouTube response:", err);
  }

  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw new Error("query is required");
    }

    const searchQuery = query.trim() + " podcast";
    const data = await searchYouTube(searchQuery);
    const results = extractVideoResults(data);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("YouTube search error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
