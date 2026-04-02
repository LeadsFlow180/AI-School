/**
 * Vector Store Implementation using in-memory storage
 * For production, replace with a proper vector database like Pinecone, Weaviate, or Chroma
 */

import type { DocumentChunk, RAGDocument } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('VectorStore');

export class VectorStore {
  private memoryStore: Map<string, { document: string; metadata: any; embedding: number[] }> =
    new Map();

  async initialize(): Promise<void> {
    log.info('Initialized in-memory vector store');
  }

  async addDocuments(chunks: DocumentChunk[]): Promise<void> {
    chunks.forEach((chunk) => {
      this.memoryStore.set(chunk.id, {
        document: chunk.content,
        metadata: chunk.metadata,
        embedding: chunk.embedding,
      });
    });

    log.info(`Added ${chunks.length} document chunks to vector store`);
  }

  async search(
    queryEmbedding: number[],
    limit: number = 5,
    threshold: number = 0.7,
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    for (const [id, data] of this.memoryStore.entries()) {
      const similarity = this.cosineSimilarity(queryEmbedding, data.embedding);
      if (similarity >= threshold) {
        chunks.push({
          id,
          content: data.document,
          metadata: data.metadata,
          embedding: data.embedding,
        });
      }
    }

    // Sort by similarity and limit results
    chunks.sort(
      (a, b) =>
        this.cosineSimilarity(queryEmbedding, b.embedding) -
        this.cosineSimilarity(queryEmbedding, a.embedding),
    );
    const result = chunks.slice(0, limit);
    log.info(`Found ${result.length} relevant chunks for query`);
    return result;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async deleteDocument(fileName: string): Promise<void> {
    const keysToDelete: string[] = [];
    for (const [id, data] of this.memoryStore.entries()) {
      if (data.metadata.fileName === fileName) {
        keysToDelete.push(id);
      }
    }
    keysToDelete.forEach((key) => this.memoryStore.delete(key));
    log.info(`Deleted ${keysToDelete.length} chunks for document: ${fileName}`);
  }

  async getAllDocuments(): Promise<string[]> {
    const fileNames = new Set<string>();
    for (const data of this.memoryStore.values()) {
      fileNames.add(data.metadata.fileName);
    }
    return Array.from(fileNames);
  }

  async clear(): Promise<void> {
    this.memoryStore.clear();
    log.info('Cleared all documents from vector store');
  }
}

// Singleton instance
let vectorStoreInstance: VectorStore | null = null;

export async function getVectorStore(): Promise<VectorStore> {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore();
    await vectorStoreInstance.initialize();
  }
  return vectorStoreInstance;
}
