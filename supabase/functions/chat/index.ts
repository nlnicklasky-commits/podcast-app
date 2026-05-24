import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { knowledge_base_id, question, conversation_id } = await req.json();
    if (!knowledge_base_id || !question) {
      throw new Error("knowledge_base_id and question are required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const groqKey = Deno.env.get("GROQ_API_KEY")!;

    // 1. Generate embedding for the question
    const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: question,
      }),
    });

    if (!embResponse.ok) throw new Error("Failed to generate question embedding");
    const embResult = await embResponse.json();
    const queryEmbedding = embResult.data[0].embedding;

    // 2. Vector search for relevant chunks
    const { data: chunks, error: searchErr } = await supabase.rpc(
      "match_chunks",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_kb_id: knowledge_base_id,
        match_count: 10,
        match_threshold: 0.3,
      },
    );

    if (searchErr) throw new Error(`Search error: ${searchErr.message}`);

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
        .limit(20);

      history = (prevMessages || []).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));
    }

    // 6. Send to Groq Llama 3.3 70B (fast, capable, free tier for personal use)
    const messages = [
      {
        role: "system",
        content: `You are a helpful podcast research assistant. Answer questions based on the podcast transcript excerpts provided below. Always cite your sources using [Source N] notation. If the context doesn't contain enough information to answer fully, say so.\n\nRelevant podcast excerpts:\n${context}`,
      },
      ...history,
      { role: "user", content: question },
    ];

    const chatResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 2048,
          messages,
        }),
      },
    );

    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      throw new Error(`Groq chat error: ${chatResponse.status} ${errText}`);
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
          text: chunk.text.slice(0, 200) + (chunk.text.length > 200 ? "..." : ""),
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
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

function formatTimestamp(seconds: number): string {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
