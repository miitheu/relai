import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse, optionsResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("semantic-search");

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) return errorResponse("Unauthorized", 401);

    const { query, entity_type, match_count = 10, similarity_threshold = 0.5 } = await req.json();
    if (!query || typeof query !== "string") {
      return errorResponse("query is required", 400);
    }

    // Generate embedding for search query via Voyage AI
    let queryEmbedding: number[];
    try {
      const { generateEmbedding } = await import("../_shared/ai.ts");
      queryEmbedding = await generateEmbedding(query.slice(0, 2000), "voyage-3-lite");
      if (!queryEmbedding) return errorResponse("No embedding returned", 502);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log.error("Embedding API error", { error: errMsg });
      return errorResponse("Failed to generate search embedding", 502);
    }

    // Search using the database function
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: results, error: searchError } = await sb.rpc("match_embeddings", {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: Math.min(match_count, 50),
      filter_entity_type: entity_type || null,
      similarity_threshold,
    });

    if (searchError) {
      log.error("Search failed", { error: searchError.message });
      return errorResponse("Search failed", 500);
    }

    log.info("Search completed", {
      query: query.slice(0, 100),
      results_count: results?.length || 0,
    });

    return jsonResponse({ results: results || [] });
  } catch (e: unknown) {
    log.error("Unhandled error", { error: e instanceof Error ? e.message : String(e) });
    return errorResponse("An internal error occurred. Please try again.");
  }
});
