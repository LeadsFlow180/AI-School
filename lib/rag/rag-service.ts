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
      vectorDB: 'chroma',
      ...config,
    };
    this.processor = new DocumentProcessor(this.config);
  }

  async ingestPDF(file: File, apiKey?: string): Promise<RAGDocument> {
    return await this.processor.processPDF(file, apiKey);
  }

  async query(query: string, apiKey?: string): Promise<RAGQuery> {
    log.info(`Processing RAG query: ${query}`);

    // Search for relevant documents
    const retrievedChunks = await this.processor.searchDocuments(query, apiKey);

    // Log retrieved chunks
    if (retrievedChunks.length > 0) {
      console.log(`📚 RAG Retrieved ${retrievedChunks.length} chunks for query: "${query}"`);
      retrievedChunks.forEach((chunk, index) => {
        console.log(
          `  ${index + 1}. ${chunk.metadata.fileName} (page ${chunk.metadata.pageNumber})`,
        );
        console.log(
          `     "${chunk.content.substring(0, 150)}${chunk.content.length > 150 ? '...' : ''}"`,
        );
      });
      console.log('');
    } else {
      console.log(`📚 RAG: No chunks retrieved for query: "${query}"`);
    }

    // Determine if query is PDF-related
    const isPDFRelated = retrievedChunks.length > 0;

    // Create context from retrieved chunks
    const context = this.buildContext(retrievedChunks);

    // Create sources
    const sources = this.buildSources(retrievedChunks);

    const ragQuery: RAGQuery = {
      query,
      isPDFRelated,
      retrievedChunks,
      context,
      sources,
    };

    log.info(`RAG query processed: ${retrievedChunks.length} chunks retrieved`);
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
