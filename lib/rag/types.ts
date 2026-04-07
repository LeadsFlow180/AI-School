/**
 * RAG (Retrieval-Augmented Generation) Types
 */

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    fileName: string;
    pageNumber: number;
    chunkIndex: number;
    totalChunks: number;
    fileSize: number;
    mimeType: string;
    storagePath?: string; // Path to file in Supabase Storage
  };
  embedding: number[];
}

export interface RAGDocument {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  pageCount: number;
  chunks: DocumentChunk[];
  createdAt: Date;
  updatedAt: Date;
  storagePath?: string; // Path to file in Supabase Storage
}

export interface RAGQuery {
  query: string;
  isPDFRelated: boolean;
  retrievedChunks: DocumentChunk[];
  context: string;
  sources: RAGSource[];
}

export interface RAGSource {
  fileName: string;
  pageNumber: number;
  content: string;
  relevanceScore: number;
}

export interface RAGConfig {
  chunkSize: number;
  chunkOverlap: number;
  maxRetrievedChunks: number;
  similarityThreshold: number;
  embeddingModel: 'openai' | 'local';
  vectorDB: 'chroma' | 'memory' | 'supabase' | 'file';
}

export interface IngestPDFRequest {
  file: File;
  config?: Partial<RAGConfig>;
}

export interface IngestPDFResponse {
  document: RAGDocument;
  chunksProcessed: number;
  embeddingTime: number;
}

export interface SearchPDFRequest {
  query: string;
  limit?: number;
  threshold?: number;
}

export interface SearchPDFResponse {
  results: DocumentChunk[];
  sources: RAGSource[];
}
