import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { podcastIndexFetch } from "../_shared/podcast-index.ts";

const MAX_SUBS_PER_RUN = 10;
const MAX_EPISODES_PER_FEED = 100;

Deno.serve(async (req: Request) => {
  // JSON content type used on every response from this function. This is a
  // cron/internal endpoint with no browser callers, so it intentionally has no
  // CORS headers; error responses below reuse this same header shape.
  const jsonHeaders = { "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth gate: this runs as a cron job with no end user. Accept the call only
    // if it presents the shared cron secret (X-Cron-Secret) OR the service role
    // key as a bearer token. Never call getUser here — there is no user to
    // resolve. verify_jwt stays false so the cron can reach us unauthenticated
    // at the platform layer; we enforce trust ourselves below.
    const cronSecret = Deno.env.get("CRON_SECRET");
    const cronHeader = req.headers.get("X-Cron-Secret");
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");

    const isAuthorized =
      (!!cronSecret && cronHeader === cronSecret) ||
      bearer === serviceRoleKey;

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: jsonHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: subs, error: subError } = await supabase
      .from("feed_subscriptions")
      .select("*")
      .eq("is_active", true)
      .or("last_checked_at.is.null,last_checked_at.lt." + new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .limit(MAX_SUBS_PER_RUN);

    if (subError) {
      console.error("Failed to fetch subscriptions:", subError);
      return new Response(
        JSON.stringify({ error: subError.message }),
        { status: 500, headers: jsonHeaders },
      );
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No subscriptions to check", processed: 0 }),
        { headers: jsonHeaders },
      );
    }

    const results = [];

    for (const sub of subs) {
      try {
        const piParams: Record<string, string> = {
          id: String(sub.feed_id),
          max: String(MAX_EPISODES_PER_FEED),
          fulltext: "1",
        };

        if (sub.last_episode_at) {
          const sinceTs = Math.floor(new Date(sub.last_episode_at).getTime() / 1000);
          piParams.since = String(sinceTs);
        }

        const data = await podcastIndexFetch("/episodes/byfeedid", piParams) as {
          items?: Array<{
            id: number;
            title: string;
            description: string;
            datePublished: number;
            duration: number;
            enclosureUrl: string;
            image: string;
            link: string;
            feedId: number;
          }>;
        };

        const episodes = data.items || [];

        if (episodes.length === 0) {
          await supabase
            .from("feed_subscriptions")
            .update({ last_checked_at: new Date().toISOString() })
            .eq("id", sub.id);

          results.push({ feedId: sub.feed_id, title: sub.feed_title, added: 0 });
          continue;
        }

        const episodeIds = episodes.map(ep => ep.id);
        const { data: existing } = await supabase
          .from("podcasts")
          .select("episode_index_id")
          .in("episode_index_id", episodeIds);

        const existingSet = new Set((existing || []).map(r => Number(r.episode_index_id)));

        const newEpisodes = episodes.filter(ep => !existingSet.has(ep.id));

        if (newEpisodes.length > 0) {
          // podcasts is a SHARED catalog table — it has no user_id column. A user
          // "owns" a podcast transitively by owning a knowledge base that links to
          // it via knowledge_base_podcasts. Do NOT set user_id here.
          const rows = newEpisodes.map(ep => ({
            title: ep.title,
            channel: sub.feed_title,
            thumbnail_url: ep.image || sub.feed_artwork,
            url: ep.link || ep.enclosureUrl,
            enclosure_url: ep.enclosureUrl,
            podcast_index_id: sub.feed_id,
            episode_index_id: ep.id,
            feed_url: sub.feed_url,
            source: "podcast_index",
            duration_seconds: ep.duration || null,
            status: "pending",
          }));

          const BATCH = 50;
          const insertedIds: string[] = [];
          for (let i = 0; i < rows.length; i += BATCH) {
            const { data: inserted, error: insertErr } = await supabase
              .from("podcasts")
              .insert(rows.slice(i, i + BATCH))
              .select("id");

            if (insertErr) {
              console.error(`Insert error for feed ${sub.feed_id}:`, insertErr);
            } else if (inserted) {
              insertedIds.push(...inserted.map((r: { id: string }) => r.id));
            }
          }

          // TODO(ownership): These new podcasts are inserted into the shared
          // catalog but are not yet associated with the subscriber. A user only
          // "owns" a podcast by owning a knowledge base linked to it via
          // knowledge_base_podcasts. feed_subscriptions has no knowledge_base_id
          // column today, so there is no target KB to link these episodes to.
          // When the subscription model gains a target KB (e.g. a
          // feed_subscriptions.knowledge_base_id owned by sub.user_id), insert a
          // knowledge_base_podcasts row { knowledge_base_id, podcast_id } for each
          // id in insertedIds here. Do not invent that schema in this function.

          if (sub.auto_process && insertedIds.length > 0) {
            // Fire-and-forget: don't await process-podcast calls.
            // Each call triggers a full pipeline (download + transcribe + embed + insights)
            // that can take minutes. Awaiting sequentially would cause this function to
            // exceed Deno Deploy's execution time limit with multiple episodes.
            // The process-podcast function manages its own status/progress tracking.
            for (const podcastId of insertedIds) {
              try {
                fetch(`${supabaseUrl}/functions/v1/process-podcast`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${serviceRoleKey}`,
                  },
                  body: JSON.stringify({ podcast_id: podcastId }),
                }).catch((procErr) => {
                  console.error(`Auto-process failed for ${podcastId}:`, procErr);
                });
              } catch (procErr) {
                console.error(`Auto-process dispatch failed for ${podcastId}:`, procErr);
              }
            }
          }
        }

        const newestTimestamp = Math.max(...episodes.map(ep => ep.datePublished || 0));
        const lastEpisodeAt = newestTimestamp > 0
          ? new Date(newestTimestamp * 1000).toISOString()
          : sub.last_episode_at;

        await supabase
          .from("feed_subscriptions")
          .update({
            last_checked_at: new Date().toISOString(),
            last_episode_at: lastEpisodeAt,
          })
          .eq("id", sub.id);

        results.push({
          feedId: sub.feed_id,
          title: sub.feed_title,
          added: newEpisodes.length,
        });
      } catch (feedErr) {
        console.error(`Error processing feed ${sub.feed_id}:`, feedErr);
        await supabase
          .from("feed_subscriptions")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", sub.id);

        results.push({ feedId: sub.feed_id, title: sub.feed_title, error: (feedErr as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("poll-subscriptions error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
