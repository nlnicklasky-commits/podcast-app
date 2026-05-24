import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Models
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "llama-3.3-70b-versatile";

// Search parameters
const MAX_CHUNKS = 10;
const SIMILARITY_THRESHOLD = 0.3;
const MAX_HISTORY_MESSAGES = 20;
const CHAT_MAX_TOKENS = 2048;
const SOURCE_PREVIEW_LENGTH = 200;

// Timeouts (ms)
const TIMEOUT_EMBEDDING = 2 * 60 * 1000;  // 2 min
const TIMEOUT_CHAT = 2 * 60 * 1000;       // 2 min

// System prompt
const SYSTEM_PROMPT_TEMPLATE = `You are a helpful podcast research assistant. Answer questions based on the podcast transcript excerpts provided below. Always cite your sources using [Source N] notation. If the context doesn't contain enough information to answer fully, say so.

Relevant podcast excerpts:
`;

// Error codes
const ErrorCode = {
  MISSING_PARAM: "MISSING_PARAM",
  NOT_FOUND: "NOT_FOUND",
  CONFIG_ERROR: "CONFIG_ERROR",
  EMBEDDING_FAILED: "EMBEDDING_FAILED",
  EMBEDDING_TIMEOUT: "EMBEDDING_TIMEOUT",
  SEARCH_FAILED: "SEARCH_FAILED",
  CHAT_FAILED: "CHAT_FAILED",
  CHAT_TIMEOUT: "CHAT_TIMEOUT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(
  message: string,
  code: string,
  status: number,
): Response {
  return new Response(
    JSON.stringify({ error: message, code }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

function formatTimestamp(seconds: number): string {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse("Request body must be valid JSON", ErrorCode.MISSING_PARAM, 400);
    }

    const { knowledge_base_id, question, conversation_id } = body;
    if (!knowledge_base_id) {
      return errorResponse("knowledge_base_id is required", ErrorCode.MISSING_PARAM, 400);
    }
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return errorResponse("question is required", ErrorCode.MISSING_PARAM, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return errorResponse("OPENAI_API_KEY not configured", ErrorCode.CONFIG_ERROR, 500);
    }
    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) {
      return errorResponse("GROQ_API_KEY not configured", ErrorCode.CONFIG_ERROR, 500);
    }

    // 1. Generate embedding for the question
    let embResponse: Response;
    try {
      embResponse = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: question,
        }),
        timeout: TIMEOUT_EMBEDDING,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return errorResponse(
          "Question embedding timed out",
          ErrorCode.EMBEDDING_TIMEOUT,
          500,
        );
      }
      throw err;
    }

    if (!embResponse.ok) {
      const errText = await embResponse.text();
      return errorResponse(
        `Failed to generate question embedding: ${errText}`,
        ErrorCode.EMBEDDING_FAILED,
        500,
      );
    }

    const embResult = await embResponse.json();
    const queryEmbedding = embResult.data[0].embedding;

    // 2. Vector search for relevant chunks
    const { data: chunks, error: searchErr } = await supabase.rpc(
      "match_chunks",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_kb_id: knowledge_base_id,
        match_count: MAX_CHUNKS,
        match_threshold: SIMILARITY_THRESHOLD,
      },
    );

    if (searchErr) {
      return errorResponse(
        `Vector search failed: ${searchErr.message}`,
        ErrorCode.SEARCH_FAILED,
        500,
      );
    }

    // 3. Get podcast titles for context
    const podcastIds = [...new Set((chunks || []).map((c: { podcast_id: string }) => c.podcast_id))];
    const { data: podcasts } = await supabase
      .from("podcasts")
      .select("id, title, channel")
      .in("id", podcastIds);

    const podcastMap = new Map(
      (podcasts || []).map((p: { id: string; title: string; channel: string }) => [p.id, p]),
    );

    // 4. Build context from chunks
    const contextParts = (chunks || []).map(
      (chunk: { text: string; podcast_id: string; start_time: number; similarity: number }, i: number) => {
        const pod = podcastMap.get(chunk.podcast_id);
        const source = pod ? `"${pod.title}" by ${pod.channel}` : "Unknown podcast";
        const timestamp = formatTimestamp(chunk.start_time);
        return `[Source ${i + 1}: ${source} at ${timestamp}]\n${chunk.text}`;
      },
    );

    const context = contextParts.join("\n\n---\n\n");

    // 5. Get conversation history if provided
    let history: { role: string; content: string }[] = [];
    if (conversation_id) {
      const { data: prevMessages } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true })
        .limit(MAX_HISTORY_MESSAGES);

      history = (prevMessages || []).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));
    }

    // 6. Send to Groq
    const messages = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT_TEMPLATE}${context}`,
      },
      ...history,
      { role: "user", content: question },
    ];

    let chatResponse: Response;
    try {
      chatResponse = await fetchWithTimeout(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: CHAT_MODEL,
            max_tokens: CHAT_MAX_TOKENS,
            messages,
          }),
          timeout: TIMEOUT_CHAT,
        },
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return errorResponse(
          "Chat response timed out",
          ErrorCode.CHAT_TIMEOUT,
          500,
        );
      }
      throw err;
    }

    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      return errorResponse(
        `Chat model error: ${chatResponse.status} ${errText}`,
        ErrorCode.CHAT_FAILED,
        500,
      );
    }

    const chatResult = await chatResponse.json();
    const answer = chatResult.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

    // 7. Build source citations
    const sources = (chunks || []).map(
      (chunk: { id: string; podcast_id: string; text: string; start_time: number; end_time: number; similarity: number }) => {
        const pod = podcastMap.get(chunk.podcast_id);
        return {
          chunk_id: chunk.id,
          podcast_id: chunk.podcast_id,
          podcast_title: pod?.title || "Unknown",
          podcast_channel: pod?.channel || "",
          text: chunk.text.slice(0, SOURCE_PREVIEW_LENGTH) + (chunk.text.length > SOURCE_PREVIEW_LENGTH ? "..." : ""),
          start_time: chunk.start_time,
          end_time: chunk.end_time,
          similarity: chunk.similarity,
        };
      },
    );

    // 8. Save messages to conversation
    let convId = conversation_id;
    if (!convId) {
      const { data: conv } = await supabase
        .from("conversations")
        .insert({
          knowledge_base_id,
          title: question.slice(0, 100),
        })
        .select("id")
        .limit(1);
      convId = conv?.[0]?.id;
    }

    if (convId) {
      await supabase.from("messages").insert([
        { conversation_id: convId, role: "user", content: question },
        { conversation_id: convId, role: "assistant", content: answer, sources },
      ]);
    }

    return new Response(
      JSON.stringify({
        answer,
        sources,
        conversation_id: convId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Chat error:", err);
    return errorResponse(
      (err as Error).message,
      ErrorCode.INTERNAL_ERROR,
      500,
    );
  }
});
