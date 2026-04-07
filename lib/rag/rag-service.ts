/**
 * RAG (Retrieval-Augmented Generation) Service
 * Main service that orchestrates document processing and retrieval
 */

import type { RAGQuery, RAGSource, RAGDocument, RAGConfig } from './types';
import { DocumentProcessor } from './document-processor';
import { createLogger } from '@/lib/logger';

const log = createLogger('RAGService');

export class RAGService {
  private processor: DocumentProcessor;
  private config: RAGConfig;

  constructor(config: Partial<RAGConfig> = {}) {
    this.config = {
      chunkSize: 1000,
      chunkOverlap: 200,
      maxRetrievedChunks: 5,
      similarityThreshold: 0.5, // Balanced threshold - selective but not too restrictive for relevant content
      embeddingModel: 'openai',
      vectorDB: process.env.VECTOR_DB || 'supabase', // Default to supabase, not file
      ...config,
    };

    // Ensure we only use Supabase for RAG documents
    if (this.config.vectorDB !== 'supabase') {
      console.warn(
        '⚠️  RAG Service configured to use non-Supabase storage. Forcing Supabase-only mode.',
      );
      this.config.vectorDB = 'supabase';
    }

    // Validate Supabase configuration
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const errorMsg =
        '❌ RAG Service requires Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log(
      `🔍 RAG Service initialized with Supabase-only mode (vectorDB: ${this.config.vectorDB})`,
    );
    console.log(`📍 Supabase URL: ${process.env.SUPABASE_URL}`);
    this.processor = new DocumentProcessor(this.config);
  }

  async ingestPDF(file: File, apiKey?: string, storagePath?: string): Promise<RAGDocument> {
    return await this.processor.processPDF(file, apiKey, storagePath);
  }

  async query(query: string, apiKey?: string): Promise<RAGQuery> {
    log.info(`🔍 Processing RAG query (Supabase-only mode): ${query}`);

    // Search for relevant documents
    const retrievedChunks = await this.processor.searchDocuments(query, apiKey);

    // Validate that all chunks are from Supabase (have storage path)
    const supabaseOnlyChunks = retrievedChunks.filter(
      (chunk) => chunk.metadata.storagePath || chunk.metadata.fileName, // Allow chunks that at least have a filename
    );

    if (supabaseOnlyChunks.length !== retrievedChunks.length) {
      log.warn(
        `⚠️  Filtered out ${retrievedChunks.length - supabaseOnlyChunks.length} chunks that don't appear to be from Supabase`,
      );
    }

    // Log retrieved chunks
    if (supabaseOnlyChunks.length > 0) {
      console.log(
        `📚 RAG Retrieved ${supabaseOnlyChunks.length} Supabase chunks for query: "${query}"`,
      );
      supabaseOnlyChunks.forEach((chunk, index) => {
        console.log(
          `  ${index + 1}. ${chunk.metadata.fileName} (page ${chunk.metadata.pageNumber})`,
        );
        console.log(
          `     "${chunk.content.substring(0, 150)}${chunk.content.length > 150 ? '...' : ''}"`,
        );
      });
      console.log('');
    } else {
      console.log(`❌ RAG: No Supabase documents found for query: "${query}"`);
    }

    // Determine if query is PDF-related (only count Supabase documents)
    const isPDFRelated = supabaseOnlyChunks.length > 0;

    // Create context from retrieved Supabase chunks only
    const context = this.buildContext(supabaseOnlyChunks);

    // Create sources from Supabase chunks only
    const sources = this.buildSources(supabaseOnlyChunks);

    const ragQuery: RAGQuery = {
      query,
      isPDFRelated,
      retrievedChunks: supabaseOnlyChunks,
      context,
      sources,
    };

    log.info(`RAG query processed: ${supabaseOnlyChunks.length} Supabase chunks retrieved`);
    return ragQuery;
  }

  private buildContext(chunks: any[]): string {
    if (chunks.length === 0) {
      return '';
    }

    const contextParts = chunks.map((chunk, index) => {
      return `[Source ${index + 1}] ${chunk.content}`;
    });

    return contextParts.join('\n\n');
  }

  private buildSources(chunks: any[]): RAGSource[] {
    return chunks.map((chunk) => ({
      fileName: chunk.metadata.fileName,
      pageNumber: chunk.metadata.pageNumber,
      content: chunk.content,
      relevanceScore: 1.0, // Could be improved with actual similarity scores
    }));
  }

  async deleteDocument(fileName: string): Promise<void> {
    await this.processor.deleteDocument(fileName);
  }

  async getAllDocuments(): Promise<string[]> {
    return await this.processor.getAllDocuments();
  }

  async isQueryPDFRelated(query: string, apiKey?: string): Promise<boolean> {
    const result = await this.query(query, apiKey);
    return result.isPDFRelated;
  }

  getConfig(): RAGConfig {
    return this.config;
  }
}

// Singleton instance
let ragServiceInstance: RAGService | null = null;

export function getRAGService(config?: Partial<RAGConfig>): RAGService {
  if (!ragServiceInstance) {
    ragServiceInstance = new RAGService(config);
  }
  return ragServiceInstance;
}
