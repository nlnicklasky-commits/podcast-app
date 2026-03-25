import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COBALT_URL = "https://cobalt-production-8df9.up.railway.app";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { podcast_id } = await req.json();
    if (!podcast_id) throw new Error("podcast_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not set");

    // 1. Get podcast record
    const { data: podcast, error: podErr } = await supabase
      .from("podcasts")
      .select("id, url, title, youtube_video_id")
      .eq("id", podcast_id)
      .limit(1);

    if (podErr || !podcast?.[0]) throw new Error("Podcast not found");
    const pod = podcast[0];

    async function setStatus(status: string, error_message?: string) {
      await supabase
        .from("podcasts")
        .update({ status, error_message: error_message || null, updated_at: new Date().toISOString() })
        .eq("id", pod.id);
    }

    async function setProgress(progress: number) {
      await supabase
        .from("podcasts")
        .update({ progress: Math.round(progress) })
        .eq("id", pod.id);
    }

    async function log(step: string, message: string) {
      await supabase.from("processing_logs").insert({
        podcast_id: pod.id,
        step,
        message,
      });
    }

    async function checkCancelled(): Promise<boolean> {
      const { data } = await supabase
        .from("podcasts")
        .select("status")
        .eq("id", pod.id)
        .limit(1);
      if (data?.[0]?.status === "cancelled") {
        await cleanup();
        return true;
      }
      return false;
    }

    async function cleanup() {
      await supabase.from("transcripts").delete().eq("podcast_id", pod.id);
      await supabase.from("chunks").delete().eq("podcast_id", pod.id);
      await supabase.from("insights").delete().eq("podcast_id", pod.id);
      await supabase.from("podcasts").update({ status: "pending", error_message: null, progress: 0 }).eq("id", pod.id);
      await log("cancelled", "Cleanup complete. Status reset to pending.");
    }

    // ============================================================
    // Overall progress layout:
    //   Cobalt download        =  0% – 15%
    //   Upload to Storage      = 15% – 30%
    //   Transcribe             = 30% – 55%
    //   Chunk+Embed            = 55% – 90%
    //   Insights               = 90% – 100%
    // ============================================================

    // 2. Download audio via Cobalt (Railway)
    await setStatus("downloading");
    await setProgress(0);
    await log("downloading", `Requesting audio from Cobalt for: ${pod.url}`);

    const cobaltResponse = await fetch(COBALT_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: pod.url,
        downloadMode: "audio",
        audioFormat: "mp3",
      }),
    });

    if (!cobaltResponse.ok) {
      const errText = await cobaltResponse.text();
      throw new Error(`Cobalt API error: ${cobaltResponse.status} ${errText}`);
    }

    const cobaltResult = await cobaltResponse.json();

    if (cobaltResult.status === "error") {
      throw new Error(`Cobalt error: ${cobaltResult.error?.code || "unknown"}`);
    }

    // Cobalt returns either a redirect URL or a tunnel URL
    const audioUrl = cobaltResult.url;
    if (!audioUrl) {
      throw new Error(`Cobalt did not return a download URL. Response: ${JSON.stringify(cobaltResult)}`);
    }

    await setProgress(5);
    await log("downloading", "Got download URL from Cobalt. Downloading audio...");

    // Download the actual audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio from Cobalt URL: ${audioResponse.status}`);
    }

    const audioBlob = await audioResponse.blob();
    const sizeMB = (audioBlob.size / 1024 / 1024).toFixed(1);
    await setProgress(15);
    await log("downloading", `Downloaded ${sizeMB}MB audio file.`);

    const MAX_SIZE = 25 * 1024 * 1024;
    if (audioBlob.size > MAX_SIZE) {
      throw new Error(
        `Audio file is ${sizeMB}MB, which exceeds OpenAI Whisper's 25MB limit. Try a shorter podcast.`
      );
    }

    if (await checkCancelled()) {
      return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2b. Upload to Supabase Storage (so we have a backup + can retry)
    await log("downloading", "Uploading audio to Supabase Storage...");
    const storagePath = `${pod.id}.mp3`;
    const audioBuffer = await audioBlob.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("podcast-audio")
      .upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    await setProgress(30);
    await log("downloading", `Uploaded to Storage: ${storagePath} (${sizeMB}MB). Download complete.`);

    if (await checkCancelled()) {
      return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Transcribe with OpenAI Whisper
    await setStatus("transcribing");
    await setProgress(30);
    await log("transcribing", "Sending audio to OpenAI Whisper...");

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    const whisperResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
      },
    );

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      throw new Error(`Whisper error: ${whisperResponse.status} ${errText}`);
    }

    const whisperResult = await whisperResponse.json();
    const fullText = whisperResult.text;
    if (!fullText) throw new Error("No transcript returned from Whisper");

    const segments = whisperResult.segments || [];
    const wordCount = fullText.split(/\s+/).length;

    await setProgress(55);
    await log("transcribing", `Transcription complete: ${wordCount.toLocaleString()} words, ${segments.length} segments.`);

    const paragraphs = segments.map((seg: { start: number; end: number; text: string }) => ({
      start: seg.start,
      end: seg.end,
      sentences: [{ text: seg.text.trim(), start: seg.start, end: seg.end }],
    }));

    await supabase.from("transcripts").insert({
      podcast_id: pod.id,
      full_text: fullText,
      segments: paragraphs,
      word_count: wordCount,
    });

    if (await checkCancelled()) {
      return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. Chunk + Embed
    await setStatus("processing");
    await setProgress(55);
    await log("processing", "Chunking transcript...");

    const chunks = createChunks(paragraphs, fullText, pod.id);
    const totalBatches = Math.ceil(chunks.length / 20);
    await log("processing", `Created ${chunks.length} chunks. Generating embeddings (${totalBatches} batches)...`);

    const BATCH_SIZE = 20;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      if (await checkCancelled()) {
        return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.text);

      const embResponse = await fetch(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: texts,
          }),
        },
      );

      if (!embResponse.ok) {
        const errText = await embResponse.text();
        throw new Error(`OpenAI embeddings error: ${embResponse.status} ${errText}`);
      }

      const embResult = await embResponse.json();
      const rows = batch.map((chunk, idx) => ({
        ...chunk,
        embedding: JSON.stringify(embResult.data[idx].embedding),
        token_count: embResult.usage?.total_tokens
          ? Math.round(embResult.usage.total_tokens / texts.length)
          : null,
      }));

      await supabase.from("chunks").insert(rows);

      const overallPct = Math.round(55 + (batchNum / totalBatches) * 35);
      await setProgress(overallPct);
      await log("processing", `Embedded batch ${batchNum}/${totalBatches}`);
    }

    if (await checkCancelled()) {
      return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 6. Generate insights via OpenAI GPT-4o
    await setProgress(90);
    await log("processing", "Generating insights with GPT-4o...");

    const truncated = fullText.length > 80000
      ? fullText.slice(0, 80000) + "\n[...transcript truncated...]"
      : fullText;

    const insightResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 4096,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You analyze podcast transcripts and return structured JSON.",
            },
            {
              role: "user",
              content: `Analyze this podcast transcript and return a JSON object with these fields:\n- \"summary\": A 2-3 paragraph summary of the main discussion\n- \"topics\": An array of 5-10 main topics discussed (strings)\n- \"key_points\": An array of 5-15 key takeaways or insights (strings)\n- \"entities\": An array of objects with \"name\" and \"type\" (person/company/product/concept) for notable entities mentioned\n\nTranscript:\n${truncated}`,
            },
          ],
        }),
      },
    );

    if (!insightResponse.ok) {
      const errText = await insightResponse.text();
      throw new Error(`OpenAI insights error: ${insightResponse.status} ${errText}`);
    }

    const insightResult = await insightResponse.json();
    const insightText = insightResult.choices?.[0]?.message?.content || "{}";

    let insights;
    try {
      insights = JSON.parse(insightText);
    } catch {
      insights = { summary: insightText, topics: [], key_points: [], entities: [] };
    }

    await supabase.from("insights").insert({
      podcast_id: pod.id,
      summary: insights.summary || "",
      topics: insights.topics || [],
      key_points: insights.key_points || [],
      entities: insights.entities || [],
    });

    await setProgress(100);
    await log("processing", "Insights generated successfully.");

    if (await checkCancelled()) {
      return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 7. Done!
    await setStatus("ready");
    await setProgress(100);
    await log("ready", `Processing complete! ${chunks.length} chunks, ${wordCount.toLocaleString()} words.`);

    // Clean up audio from storage
    await supabase.storage.from("podcast-audio").remove([storagePath]);

    return new Response(
      JSON.stringify({ success: true, chunks_count: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Process error:", err);

    try {
      const body = await req.clone().json().catch(() => ({})) as { podcast_id?: string };
      if (body.podcast_id) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data: current } = await supabase
          .from("podcasts")
          .select("status")
          .eq("id", body.podcast_id)
          .limit(1);

        if (current?.[0]?.status !== "cancelled") {
          await supabase
            .from("podcasts")
            .update({ status: "error", error_message: (err as Error).message, progress: 0 })
            .eq("id", body.podcast_id);
          await supabase.from("processing_logs").insert({
            podcast_id: body.podcast_id,
            step: "error",
            message: (err as Error).message,
          });
        }
      }
    } catch { /* best effort */ }

    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// --- Helper functions ---

interface Paragraph {
  start: number;
  end: number;
  sentences: { text: string; start: number; end: number }[];
}

interface ChunkRow {
  podcast_id: string;
  text: string;
  start_time: number;
  end_time: number;
}

function createChunks(
  paragraphs: Paragraph[],
  fullText: string,
  podcastId: string,
): ChunkRow[] {
  const MAX_TOKENS = 500;
  const TARGET_TOKENS = 300;
  const chunks: ChunkRow[] = [];

  if (!paragraphs || paragraphs.length === 0) {
    const charsPerToken = 4;
    const chunkSize = TARGET_TOKENS * charsPerToken;
    for (let i = 0; i < fullText.length; i += chunkSize) {
      chunks.push({
        podcast_id: podcastId,
        text: fullText.slice(i, i + chunkSize),
        start_time: 0,
        end_time: 0,
      });
    }
    return chunks;
  }

  let currentText = "";
  let currentStart = 0;
  let currentEnd = 0;

  for (const para of paragraphs) {
    const paraText = para.sentences?.map((s) => s.text).join(" ") || "";
    const estimatedTokens = (currentText + " " + paraText).length / 4;

    if (currentText && estimatedTokens > MAX_TOKENS) {
      chunks.push({
        podcast_id: podcastId,
        text: currentText.trim(),
        start_time: currentStart,
        end_time: currentEnd,
      });
      currentText = paraText;
      currentStart = para.start;
      currentEnd = para.end;
    } else {
      if (!currentText) currentStart = para.start;
      currentText += (currentText ? "\n\n" : "") + paraText;
      currentEnd = para.end;
    }
  }

  if (currentText.trim()) {
    chunks.push({
      podcast_id: podcastId,
      text: currentText.trim(),
      start_time: currentStart,
      end_time: currentEnd,
    });
  }

  return chunks;
}
