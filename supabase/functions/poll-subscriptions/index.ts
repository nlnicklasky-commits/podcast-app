import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { podcastIndexFetch } from "../_shared/podcast-index.ts";

const MAX_SUBS_PER_RUN = 10;
const MAX_EPISODES_PER_FEED = 100;

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
      return new Response(JSON.stringify({ error: subError.message }), { status: 500 });
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ message: "No subscriptions to check", processed: 0 }));
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
            user_id: sub.user_id,
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

          if (sub.auto_process && insertedIds.length > 0) {
            for (const podcastId of insertedIds) {
              try {
                await fetch(`${supabaseUrl}/functions/v1/process-podcast`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${serviceRoleKey}`,
                  },
                  body: JSON.stringify({ podcast_id: podcastId }),
                });
              } catch (procErr) {
                console.error(`Auto-process failed for ${podcastId}:`, procErr);
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
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("poll-subscriptions error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
