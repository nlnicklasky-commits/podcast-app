import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function podcastIndexFetch(endpoint: string, params: Record<string, string>) {
  const apiKey = Deno.env.get("PODCAST_INDEX_KEY");
  const apiSecret = Deno.env.get("PODCAST_INDEX_SECRET");
  if (!apiKey || !apiSecret) {
    throw new Error("PODCAST_INDEX_KEY and PODCAST_INDEX_SECRET must be set");
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

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "PodcastBrain/1.0",
      "X-Auth-Key": apiKey,
      "X-Auth-Date": ts,
      "Authorization": authHash,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Podcast Index error:", errText);
    throw new Error(`Podcast Index API error: ${response.status}`);
  }

  return response.json();
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

    const data = await podcastIndexFetch("/search/byterm", {
      q: query.trim(),
      max: "12",
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
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
