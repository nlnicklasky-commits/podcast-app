import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/auth.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  "https://www.podbrain.space",
  "https://podbrain.space",
  "https://podcast-app-ten-gamma.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

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

After your answer, suggest 2-3 brief follow-up questions the user might want to ask next. Format them on the last line as: FOLLOW_UPS: question 1 | question 2 | question 3

Relevant podcast excerpts:
`;

// Error codes
const ErrorCode = {
  MISSING_PARAM: "MISSING_PARAM",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
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

function formatTimestamp(seconds: number): string {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Strip HTML tags and trim whitespace from user input before DB storage. */
function sanitizeInput(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse("Request body must be valid JSON", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }

    const { knowledge_base_id, question: rawQuestion, conversation_id } = body;
    if (!knowledge_base_id) {
      return errorResponse("knowledge_base_id is required", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }
    if (!rawQuestion || typeof rawQuestion !== "string" || rawQuestion.trim().length === 0) {
      return errorResponse("question is required", ErrorCode.MISSING_PARAM, 400, corsHeaders);
    }
    const question = sanitizeInput(rawQuestion);

    // Resolve and require an authenticated user. Edge functions run with the
    // service role key (bypasses RLS), so ownership must be enforced here.
    const { userId: callingUserId } = await resolveCaller(req);
    if (!callingUserId) {
      return errorResponse("Not signed in", ErrorCode.UNAUTHORIZED, 401, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the caller owns the target knowledge base before doing any work.
    const { data: kbRows, error: kbErr } = await supabase
      .from("knowledge_bases")
      .select("id, user_id")
      .eq("id", knowledge_base_id)
      .limit(1);
    if (kbErr) {
      return errorResponse(
        `Failed to load knowledge base: ${kbErr.message}`,
        ErrorCode.INTERNAL_ERROR,
        500,
        corsHeaders,
      );
    }
    const kb = kbRows?.[0];
    if (!kb) {
      return errorResponse("Knowledge base not found", ErrorCode.NOT_FOUND, 404, corsHeaders);
    }
    if (kb.user_id !== callingUserId) {
      return errorResponse(
        "You do not have access to this knowledge base",
        ErrorCode.FORBIDDEN,
        403,
        corsHeaders,
      );
    }

    // If continuing an existing conversation, verify the caller owns it.
    if (conversation_id) {
      const { data: convRows, error: convErr } = await supabase
        .from("conversations")
        .select("id, user_id")
        .eq("id", conversation_id)
        .limit(1);
      if (convErr) {
        return errorResponse(
          `Failed to load conversation: ${convErr.message}`,
          ErrorCode.INTERNAL_ERROR,
          500,
          corsHeaders,
        );
      }
      const conv = convRows?.[0];
      if (!conv) {
        return errorResponse("Conversation not found", ErrorCode.NOT_FOUND, 404, corsHeaders);
      }
      if (conv.user_id !== callingUserId) {
        return errorResponse(
          "You do not have access to this conversation",
          ErrorCode.FORBIDDEN,
          403,
          corsHeaders,
        );
      }
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return errorResponse("OPENAI_API_KEY not configured", ErrorCode.CONFIG_ERROR, 500, corsHeaders);
    }
    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) {
      return errorResponse("GROQ_API_KEY not configured", ErrorCode.CONFIG_ERROR, 500, corsHeaders);
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
          corsHeaders,
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
        corsHeaders,
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
        corsHeaders,
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

    // 6. Send to Groq — with context length guard
    // Estimate total tokens using length/4 heuristic. Llama 3.3 has 128K context.
    const TOKEN_BUDGET = 100_000; // leave headroom below 128K for response + safety
    const systemContent = `${SYSTEM_PROMPT_TEMPLATE}${context}`;
    let estimatedTokens = Math.ceil(systemContent.length / 4) + Math.ceil(question.length / 4);

    // Truncate history first if over budget
    let trimmedHistory = [...history];
    for (const msg of trimmedHistory) {
      estimatedTokens += Math.ceil(msg.content.length / 4);
    }
    while (estimatedTokens > TOKEN_BUDGET && trimmedHistory.length > 0) {
      const removed = trimmedHistory.shift()!;
      estimatedTokens -= Math.ceil(removed.content.length / 4);
    }

    // If still over budget after removing all history, reduce chunk count
    let finalContext = context;
    if (estimatedTokens > TOKEN_BUDGET && contextParts.length > 1) {
      // Rebuild context with fewer chunks until within budget
      let reducedParts = [...contextParts];
      while (estimatedTokens > TOKEN_BUDGET && reducedParts.length > 1) {
        const removed = reducedParts.pop()!;
        estimatedTokens -= Math.ceil(removed.length / 4);
      }
      finalContext = reducedParts.join("\n\n---\n\n");
    }

    const messages = [
      {
        role: "system",
        content: finalContext === context ? systemContent : `${SYSTEM_PROMPT_TEMPLATE}${finalContext}`,
      },
      ...trimmedHistory,
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
          corsHeaders,
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
        corsHeaders,
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
      const convInsert: Record<string, unknown> = {
        knowledge_base_id,
        title: question.slice(0, 100),
        user_id: callingUserId,
      };

      const { data: conv } = await supabase
        .from("conversations")
        .insert(convInsert)
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
      corsHeaders,
    );
  }
});
