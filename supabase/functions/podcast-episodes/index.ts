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
    const { feed_id } = await req.json();
    if (!feed_id) {
      throw new Error("feed_id is required");
    }

    const data = await podcastIndexFetch("/episodes/byfeedid", {
      id: String(feed_id),
      max: "20",
      fulltext: "1",
    });

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
      }) => ({
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
      }),
    );

    return new Response(JSON.stringify({ episodes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Podcast episodes error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
