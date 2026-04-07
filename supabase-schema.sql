-- Supabase Vector Database Schema for RAG Document Chunks
-- This script sets up the necessary tables and functions for vector similarity search

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the document_chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small has 1536 dimensions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for vector similarity search
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
ON document_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create an index on metadata for faster filtering
CREATE INDEX IF NOT EXISTS document_chunks_metadata_idx
ON document_chunks USING gin (metadata);

-- Create a function for similarity search
CREATE OR REPLACE FUNCTION similarity_search(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  table_name text DEFAULT 'document_chunks'
)
RETURNS TABLE(
  id text,
  content text,
  metadata jsonb,
  embedding vector(1536),
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  EXECUTE format('
    SELECT
      t.id,
      t.content,
      t.metadata,
      t.embedding,
      1 - (t.embedding <=> $1) as similarity
    FROM %I t
    WHERE 1 - (t.embedding <=> $1) > $2
    ORDER BY t.embedding <=> $1
    LIMIT $3
  ', table_name)
  USING query_embedding, match_threshold, match_count;
END;
$$;

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_chunks_updated_at
  BEFORE UPDATE ON document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a view for easier querying
CREATE OR REPLACE VIEW document_chunks_view AS
SELECT
  id,
  content,
  metadata->>'fileName' as file_name,
  (metadata->>'pageNumber')::int as page_number,
  (metadata->>'chunkIndex')::int as chunk_index,
  (metadata->>'totalChunks')::int as total_chunks,
  (metadata->>'fileSize')::bigint as file_size,
  metadata->>'mimeType' as mime_type,
  embedding,
  created_at,
  updated_at
FROM document_chunks;

-- Grant necessary permissions (adjust as needed for your RLS policies)
-- ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;