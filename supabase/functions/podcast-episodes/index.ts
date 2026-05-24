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
    const { feed_id, feed_url } = await req.json();
    if (!feed_id) {
      throw new Error("feed_id is required");
    }

    const data = await podcastIndexFetch("/episodes/byfeedid", {
      id: String(feed_id),
      max: "50",
      fulltext: "1",
    });

    // Fetch RSS feed to extract podcast:transcript tags (PI API doesn't expose them)
    const transcriptMap = new Map<string, { url: string; type: string }[]>();
    if (feed_url) {
      try {
        const rssResponse = await fetch(feed_url, {
          headers: { "User-Agent": "PodcastBrain/1.0" },
        });
        if (rssResponse.ok) {
          const rssText = await rssResponse.text();
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
      } catch (e) {
        console.error("RSS transcript fetch failed (non-fatal):", e);
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
        };
      },
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
