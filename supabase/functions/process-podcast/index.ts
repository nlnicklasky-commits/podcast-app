import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// Models
const WHISPER_MODEL = "whisper-large-v3";
const EMBEDDING_MODEL = "text-embedding-3-small";
const INSIGHTS_MODEL = "gpt-4o-mini";

// Limits
const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB (Whisper limit)
const CHUNK_MAX_TOKENS = 500;
const CHUNK_TARGET_TOKENS = 300;
const EMBEDDING_BATCH_SIZE = 20;
const INSIGHTS_MAX_CHARS = 80_000;
const INSIGHTS_MAX_TOKENS = 4096;

// Timeouts (ms)
const TIMEOUT_AUDIO_DOWNLOAD = 5 * 60 * 1000;   // 5 min
const TIMEOUT_TRANSCRIPTION = 5 * 60 * 1000;     // 5 min
const TIMEOUT_EMBEDDING = 2 * 60 * 1000;         // 2 min
const TIMEOUT_INSIGHTS = 2 * 60 * 1000;          // 2 min
const TIMEOUT_TRANSCRIPT_FETCH = 2 * 60 * 1000;  // 2 min

// Progress breakpoints (percentage)
const PROGRESS = {
  DOWNLOAD_START: 0,
  DOWNLOAD_PROGRESS: 5,
  DOWNLOAD_COMPLETE: 15,
  UPLOAD_COMPLETE: 30,
  TRANSCRIBE_COMPLETE: 55,
  CHUNK_EMBED_START: 55,
  CHUNK_EMBED_END: 90,
  INSIGHTS_START: 90,
  DONE: 100,
} as const;

// Error codes
const ErrorCode = {
  MISSING_PARAM: "MISSING_PARAM",
  NOT_FOUND: "NOT_FOUND",
  CONFIG_ERROR: "CONFIG_ERROR",
  AUDIO_TOO_LARGE: "AUDIO_TOO_LARGE",
  DOWNLOAD_FAILED: "DOWNLOAD_FAILED",
  DOWNLOAD_TIMEOUT: "DOWNLOAD_TIMEOUT",
  UPLOAD_FAILED: "UPLOAD_FAILED",
  TRANSCRIPTION_FAILED: "TRANSCRIPTION_FAILED",
  TRANSCRIPTION_TIMEOUT: "TRANSCRIPTION_TIMEOUT",
  TRANSCRIPT_FETCH_FAILED: "TRANSCRIPT_FETCH_FAILED",
  EMBEDDING_FAILED: "EMBEDDING_FAILED",
  EMBEDDING_TIMEOUT: "EMBEDDING_TIMEOUT",
  INSIGHTS_FAILED: "INSIGHTS_FAILED",
  INSIGHTS_TIMEOUT: "INSIGHTS_TIMEOUT",
  CANCELLED: "CANCELLED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(
  message: string,
  code: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  const respHeaders = headers || {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  return new Response(
    JSON.stringify({ error: message, code }),
    { status, headers: { ...respHeaders, "Content-Type": "application/json" } },
  );
}

/** Wraps fetch with an AbortController timeout. */
async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit & { timeout?: number },
): Promise<Response> {
  const { timeout, ...fetchInit } = init;
  if (!timeout) return fetch(url, fetchInit);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...fetchInit, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let podcastId: string | undefined;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse("Request body must be valid JSON", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }

    const { podcast_id } = body;
    podcastId = podcast_id;
    if (!podcast_id) {
      return errorResponse("podcast_id is required", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return errorResponse("OPENAI_API_KEY not configured", ErrorCode.CONFIG_ERROR, 500, corsHeaders);
    }
    const groqKey = Deno.env.get("GROQ_API_KEY");

    // 1. Get podcast record
    const { data: podcast, error: podErr } = await supabase
      .from("podcasts")
      .select("id, url, title, enclosure_url, source, transcript_url")
      .eq("id", podcast_id)
      .limit(1);

    if (podErr) throw new Error(`Database error: ${podErr.message}`);
    if (!podcast?.[0]) {
      return errorResponse(`Podcast ${podcast_id} not found`, ErrorCode.NOT_FOUND, 404, corsHeaders);
    }
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
      console.log(`[${pod.id}] [${step}] ${message}`);
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

    function cancelledResponse(): Response {
      return new Response(
        JSON.stringify({ cancelled: true, code: ErrorCode.CANCELLED }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ============================================================
    // Overall progress layout:
    //   Download/Transcript    =  0% - 15%
    //   Upload to Storage      = 15% - 30%  (audio path only)
    //   Transcribe             = 30% - 55%
    //   Chunk+Embed            = 55% - 90%
    //   Insights               = 90% - 100%
    // ============================================================

    let fullText: string;
    let paragraphs: Paragraph[];
    let wordCount: number;
    let storagePath: string | null = null;

    if (pod.transcript_url) {
      // --- TRANSCRIPT PATH: fetch pre-existing transcript from RSS feed ---
      await setStatus("downloading");
      await setProgress(PROGRESS.DOWNLOAD_PROGRESS);
      await log("downloading", `Fetching transcript from RSS feed...`);

      let txResponse: Response;
      try {
        txResponse = await fetchWithTimeout(pod.transcript_url, {
          timeout: TIMEOUT_TRANSCRIPT_FETCH,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          throw Object.assign(
            new Error(`Transcript fetch timed out after ${TIMEOUT_TRANSCRIPT_FETCH / 1000}s`),
            { code: ErrorCode.TRANSCRIPT_FETCH_FAILED, httpStatus: 422 },
          );
        }
        throw err;
      }

      if (!txResponse.ok) {
        throw Object.assign(
          new Error(`Failed to fetch transcript: HTTP ${txResponse.status}`),
          { code: ErrorCode.TRANSCRIPT_FETCH_FAILED, httpStatus: 422 },
        );
      }

      const txText = await txResponse.text();
      const txSizeKB = (txText.length / 1024).toFixed(0);
      await setProgress(PROGRESS.DOWNLOAD_COMPLETE);
      await log("downloading", `Fetched transcript (${txSizeKB}KB).`);

      if (await checkCancelled()) return cancelledResponse();

      const isSRT = pod.transcript_url.includes(".srt") || pod.transcript_url.includes("subrip");

      if (isSRT) {
        const srtSegments = parseSRT(txText);
        fullText = srtSegments.map((s) => s.text).join(" ");
        paragraphs = srtSegments.map((seg) => ({
          start: seg.start,
          end: seg.end,
          sentences: [{ text: seg.text, start: seg.start, end: seg.end }],
        }));
      } else {
        fullText = txText.trim();
        paragraphs = [{ start: 0, end: 0, sentences: [{ text: fullText, start: 0, end: 0 }] }];
      }

      wordCount = fullText.split(/\s+/).length;

      await setStatus("transcribing");
      await setProgress(PROGRESS.UPLOAD_COMPLETE);
      await log("transcribing", `Transcript loaded: ${wordCount.toLocaleString()} words, ${paragraphs.length} segments.`);

      await supabase.from("transcripts").insert({
        podcast_id: pod.id,
        full_text: fullText,
        segments: paragraphs,
        word_count: wordCount,
      });

      await setProgress(PROGRESS.TRANSCRIBE_COMPLETE);
      await log("transcribing", "Transcript stored. Audio download and Whisper skipped.");

      if (await checkCancelled()) return cancelledResponse();

    } else {
    // --- AUDIO PATH: download audio + transcribe with Whisper ---

    // 2. Download audio
    await setStatus("downloading");
    await setProgress(PROGRESS.DOWNLOAD_START);

    let audioBlob: Blob;

    if (!pod.enclosure_url) {
      throw Object.assign(
        new Error("No audio source available. Only podcasts with RSS enclosure URLs are supported."),
        { code: ErrorCode.DOWNLOAD_FAILED, httpStatus: 422 },
      );
    }

    // PODCAST INDEX / RSS SOURCE -- direct download from enclosure URL
    await log("downloading", `Downloading audio directly from RSS feed: ${pod.enclosure_url.slice(0, 100)}...`);

    let audioResponse: Response;
    try {
      audioResponse = await fetchWithTimeout(pod.enclosure_url, {
        headers: { "User-Agent": "PodcastBrain/1.0" },
        timeout: TIMEOUT_AUDIO_DOWNLOAD,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw Object.assign(
          new Error(`Audio download timed out after ${TIMEOUT_AUDIO_DOWNLOAD / 1000}s`),
          { code: ErrorCode.DOWNLOAD_TIMEOUT, httpStatus: 422 },
        );
      }
      throw err;
    }

    if (!audioResponse.ok) {
      throw Object.assign(
        new Error(`Failed to download audio from RSS feed: HTTP ${audioResponse.status}`),
        { code: ErrorCode.DOWNLOAD_FAILED, httpStatus: 422 },
      );
    }

    audioBlob = await audioResponse.blob();
    await setProgress(PROGRESS.DOWNLOAD_PROGRESS);
    await log("downloading", `Downloaded ${(audioBlob.size / 1024 / 1024).toFixed(1)}MB from RSS feed.`);

    const sizeMB = (audioBlob.size / 1024 / 1024).toFixed(1);
    await setProgress(PROGRESS.DOWNLOAD_COMPLETE);
    await log("downloading", `Downloaded ${sizeMB}MB audio file.`);

    if (audioBlob.size > MAX_AUDIO_SIZE_BYTES) {
      throw Object.assign(
        new Error(`Audio file is ${sizeMB}MB, which exceeds the ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB limit. Try a shorter podcast.`),
        { code: ErrorCode.AUDIO_TOO_LARGE, httpStatus: 422 },
      );
    }

    if (await checkCancelled()) return cancelledResponse();

    // 2b. Upload to Supabase Storage (so we have a backup + can retry)
    await log("downloading", "Uploading audio to Supabase Storage...");
    storagePath = `${pod.id}.mp3`;
    const audioBuffer = await audioBlob.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("podcast-audio")
      .upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      throw Object.assign(
        new Error(`Storage upload failed: ${uploadError.message}`),
        { code: ErrorCode.UPLOAD_FAILED, httpStatus: 500 },
      );
    }

    await setProgress(PROGRESS.UPLOAD_COMPLETE);
    await log("downloading", `Uploaded to Storage: ${storagePath} (${sizeMB}MB). Download complete.`);

    if (await checkCancelled()) return cancelledResponse();

    // 3. Transcribe with Groq Whisper-Large-v3
    await setStatus("transcribing");
    await setProgress(PROGRESS.UPLOAD_COMPLETE);
    await log("transcribing", `Sending audio to Groq ${WHISPER_MODEL}...`);

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", WHISPER_MODEL);
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    let whisperResponse: Response;
    try {
      whisperResponse = await fetchWithTimeout(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: formData,
          timeout: TIMEOUT_TRANSCRIPTION,
        },
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw Object.assign(
          new Error(`Transcription timed out after ${TIMEOUT_TRANSCRIPTION / 1000}s`),
          { code: ErrorCode.TRANSCRIPTION_TIMEOUT, httpStatus: 500 },
        );
      }
      throw err;
    }

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      throw Object.assign(
        new Error(`Groq Whisper error: ${whisperResponse.status} ${errText}`),
        { code: ErrorCode.TRANSCRIPTION_FAILED, httpStatus: 500 },
      );
    }

    const whisperResult = await whisperResponse.json();
    fullText = whisperResult.text;
    if (!fullText) {
      throw Object.assign(
        new Error("No transcript returned from Whisper"),
        { code: ErrorCode.TRANSCRIPTION_FAILED, httpStatus: 500 },
      );
    }

    const segments = whisperResult.segments || [];
    wordCount = fullText.split(/\s+/).length;

    await setProgress(PROGRESS.TRANSCRIBE_COMPLETE);
    await log("transcribing", `Transcription complete: ${wordCount.toLocaleString()} words, ${segments.length} segments.`);

    paragraphs = segments.map((seg: { start: number; end: number; text: string }) => ({
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

    if (await checkCancelled()) return cancelledResponse();

    } // end audio path else block

    // 4. Chunk + Embed
    await setStatus("processing");
    await setProgress(PROGRESS.CHUNK_EMBED_START);
    await log("processing", "Chunking transcript...");

    const chunks = createChunks(paragraphs, fullText, pod.id);
    const totalBatches = Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE);
    await log("processing", `Created ${chunks.length} chunks. Generating embeddings (${totalBatches} batches)...`);

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      if (await checkCancelled()) return cancelledResponse();

      const batchNum = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1;
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map((c) => c.text);

      let embResponse: Response;
      try {
        embResponse = await fetchWithTimeout(
          "https://api.openai.com/v1/embeddings",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: EMBEDDING_MODEL,
              input: texts,
            }),
            timeout: TIMEOUT_EMBEDDING,
          },
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          throw Object.assign(
            new Error(`Embedding batch ${batchNum}/${totalBatches} timed out after ${TIMEOUT_EMBEDDING / 1000}s`),
            { code: ErrorCode.EMBEDDING_TIMEOUT, httpStatus: 500 },
          );
        }
        throw err;
      }

      if (!embResponse.ok) {
        const errText = await embResponse.text();
        throw Object.assign(
          new Error(`OpenAI embeddings error: ${embResponse.status} ${errText}`),
          { code: ErrorCode.EMBEDDING_FAILED, httpStatus: 500 },
        );
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

      const progressRange = PROGRESS.CHUNK_EMBED_END - PROGRESS.CHUNK_EMBED_START;
      const overallPct = Math.round(PROGRESS.CHUNK_EMBED_START + (batchNum / totalBatches) * progressRange);
      await setProgress(overallPct);
      await log("processing", `Embedded batch ${batchNum}/${totalBatches}`);
    }

    if (await checkCancelled()) return cancelledResponse();

    // 6. Generate insights via Groq Llama 3.3 70B
    await setProgress(PROGRESS.INSIGHTS_START);
    await log("processing", `Generating insights with ${INSIGHTS_MODEL}...`);

    const truncated = fullText.length > INSIGHTS_MAX_CHARS
      ? fullText.slice(0, INSIGHTS_MAX_CHARS) + "\n[...transcript truncated...]"
      : fullText;

    let insightResponse: Response;
    try {
      insightResponse = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: INSIGHTS_MODEL,
            max_tokens: INSIGHTS_MAX_TOKENS,
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
          timeout: TIMEOUT_INSIGHTS,
        },
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw Object.assign(
          new Error(`Insights generation timed out after ${TIMEOUT_INSIGHTS / 1000}s`),
          { code: ErrorCode.INSIGHTS_TIMEOUT, httpStatus: 500 },
        );
      }
      throw err;
    }

    if (!insightResponse.ok) {
      const errText = await insightResponse.text();
      throw Object.assign(
        new Error(`OpenAI insights error: ${insightResponse.status} ${errText}`),
        { code: ErrorCode.INSIGHTS_FAILED, httpStatus: 500 },
      );
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

    await setProgress(PROGRESS.DONE);
    await log("processing", "Insights generated successfully.");

    if (await checkCancelled()) return cancelledResponse();

    // 7. Done!
    await setStatus("ready");
    await setProgress(PROGRESS.DONE);
    await log("ready", `Processing complete! ${chunks.length} chunks, ${wordCount.toLocaleString()} words.`);

    // Clean up audio from storage (only if we uploaded audio)
    if (storagePath) {
      await supabase.storage.from("podcast-audio").remove([storagePath]);
    }

    return new Response(
      JSON.stringify({ success: true, chunks_count: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(`[${podcastId || "unknown"}] Process error:`, err);

    const error = err as Error & { code?: string; httpStatus?: number };
    const httpStatus = error.httpStatus || 500;
    const errorCode = error.code || ErrorCode.INTERNAL_ERROR;

    try {
      if (podcastId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data: current } = await supabase
          .from("podcasts")
          .select("status")
          .eq("id", podcastId)
          .limit(1);

        if (current?.[0]?.status !== "cancelled") {
          await supabase
            .from("podcasts")
            .update({ status: "error", error_message: error.message, progress: 0 })
            .eq("id", podcastId);
          await supabase.from("processing_logs").insert({
            podcast_id: podcastId,
            step: "error",
            message: `[${errorCode}] ${error.message}`,
          });
        }
      }
    } catch { /* best effort */ }

    return errorResponse(error.message, errorCode, httpStatus, corsHeaders);
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
  const chunks: ChunkRow[] = [];

  if (!paragraphs || paragraphs.length === 0) {
    const charsPerToken = 4;
    const chunkSize = CHUNK_TARGET_TOKENS * charsPerToken;
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

    if (currentText && estimatedTokens > CHUNK_MAX_TOKENS) {
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

function parseSRT(srt: string): { start: number; end: number; text: string }[] {
  const segments: { start: number; end: number; text: string }[] = [];
  const blocks = srt.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/,
    );
    if (!timeMatch) continue;

    const start = parseSRTTimestamp(timeMatch[1]);
    const end = parseSRTTimestamp(timeMatch[2]);
    const text = lines
      .slice(2)
      .join(" ")
      .replace(/^Speaker \d+:\s*/i, "")
      .trim();

    if (text) {
      segments.push({ start, end, text });
    }
  }

  return segments;
}

function parseSRTTimestamp(ts: string): number {
  const [timePart, msPart] = ts.replace(",", ".").split(".");
  const [h, m, s] = timePart.split(":").map(Number);
  return h * 3600 + m * 60 + s + parseInt(msPart) / 1000;
}
