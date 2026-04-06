-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Embeddings store for semantic search across all entities
CREATE TABLE embeddings_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- client, contact, opportunity, dataset, note
  entity_id UUID NOT NULL,
  content_hash TEXT NOT NULL, -- SHA256 of source content to detect changes
  embedding extensions.vector(1536), -- OpenAI ada-002 dimensionality
  content_preview TEXT, -- first 500 chars of source content
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_type, entity_id, content_hash)
);

-- Indexes
CREATE INDEX idx_embeddings_entity ON embeddings_store(entity_type, entity_id);
CREATE INDEX idx_embeddings_vector ON embeddings_store USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

-- RLS
ALTER TABLE embeddings_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read embeddings" ON embeddings_store FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage embeddings" ON embeddings_store FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER set_embeddings_store_updated_at
  BEFORE UPDATE ON embeddings_store
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Semantic search function
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding extensions.vector(1536),
  match_count INT DEFAULT 10,
  filter_entity_type TEXT DEFAULT NULL,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  entity_type TEXT,
  entity_id UUID,
  content_preview TEXT,
  metadata_json JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.entity_type,
    e.entity_id,
    e.content_preview,
    e.metadata_json,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM embeddings_store e
  WHERE (filter_entity_type IS NULL OR e.entity_type = filter_entity_type)
    AND 1 - (e.embedding <=> query_embedding) > similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
