const TIMEOUT_MS = 30 * 1000;

export async function podcastIndexFetch(
  endpoint: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("PODCAST_INDEX_KEY");
  const apiSecret = Deno.env.get("PODCAST_INDEX_SECRET");
  if (!apiKey || !apiSecret) {
    throw Object.assign(
      new Error("PODCAST_INDEX_KEY and PODCAST_INDEX_SECRET must be set"),
      { code: "CONFIG_ERROR", httpStatus: 500 },
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
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
        { code: "PODCAST_INDEX_FAILED", httpStatus: 500 },
      );
    }

    return await response.json();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw Object.assign(
        new Error(`Podcast Index API timed out after ${TIMEOUT_MS / 1000}s`),
        { code: "PODCAST_INDEX_TIMEOUT", httpStatus: 500 },
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
