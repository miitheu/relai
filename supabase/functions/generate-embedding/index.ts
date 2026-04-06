import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse, optionsResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("generate-embedding");

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) return errorResponse("Unauthorized", 401);

    const { entity_type, entity_id, content } = await req.json();
    if (!entity_type || !entity_id) {
      return errorResponse("entity_type and entity_id are required", 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve content from entity if not provided directly
    let textContent = content;
    if (!textContent) {
      textContent = await resolveEntityContent(sb, entity_type, entity_id);
      if (!textContent) return errorResponse("Could not resolve content for entity", 404);
    }

    // Generate content hash
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(textContent));
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Check if embedding already exists for this hash
    const { data: existing } = await sb
      .from("embeddings_store")
      .select("id")
      .eq("entity_type", entity_type)
      .eq("entity_id", entity_id)
      .eq("content_hash", contentHash)
      .maybeSingle();

    if (existing) {
      log.info("Embedding already up to date", { entity_type, entity_id });
      return jsonResponse({ status: "unchanged", id: existing.id });
    }

    // Generate embedding via Voyage AI
    let embedding: number[];
    try {
      const { generateEmbedding } = await import("../_shared/ai.ts");
      embedding = await generateEmbedding(textContent);
      if (!embedding) return errorResponse("No embedding returned", 502);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log.error("Embedding API error", { error: errMsg });
      return errorResponse("Failed to generate embedding", 502);
    }

    // Delete old embeddings for this entity (content changed)
    await sb
      .from("embeddings_store")
      .delete()
      .eq("entity_type", entity_type)
      .eq("entity_id", entity_id);

    // Insert new embedding
    const { data: inserted, error: insertError } = await sb
      .from("embeddings_store")
      .insert({
        entity_type,
        entity_id,
        content_hash: contentHash,
        embedding: `[${embedding.join(",")}]`,
        content_preview: textContent.slice(0, 500),
        metadata_json: { generated_by: auth.userId },
      })
      .select("id")
      .single();

    if (insertError) {
      log.error("Insert failed", { error: insertError.message });
      return errorResponse("Failed to store embedding", 500);
    }

    log.info("Embedding generated", { entity_type, entity_id, id: inserted.id });
    return jsonResponse({ status: "created", id: inserted.id });
  } catch (e: unknown) {
    log.error("Unhandled error", { error: e instanceof Error ? e.message : String(e) });
    return errorResponse("An internal error occurred. Please try again.");
  }
});

async function resolveEntityContent(
  sb: ReturnType<typeof createClient>,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  switch (entityType) {
    case "client": {
      const { data } = await sb.from("clients").select("name, type, status, country, region, sub_region, description, aum_millions, strategy, investor_type").eq("id", entityId).single();
      if (!data) return null;
      return Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(". ");
    }
    case "contact": {
      const { data } = await sb.from("contacts").select("first_name, last_name, title, department, email, linkedin_url").eq("id", entityId).single();
      if (!data) return null;
      return Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(". ");
    }
    case "opportunity": {
      const { data } = await sb.from("opportunities").select("name, stage, value, currency, probability, expected_close_date, notes").eq("id", entityId).single();
      if (!data) return null;
      return Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(". ");
    }
    case "dataset": {
      const { data } = await sb.from("datasets").select("name, category, asset_class, description, coverage").eq("id", entityId).single();
      if (!data) return null;
      return Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(". ");
    }
    case "note": {
      const { data } = await sb.from("notes").select("content, note_type").eq("id", entityId).single();
      if (!data) return null;
      return `${data.note_type || "note"}: ${data.content}`;
    }
    default:
      return null;
  }
}
