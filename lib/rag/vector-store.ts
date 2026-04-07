/**
 * Vector Store Factory
 * Supports both file-based persistence and Supabase vector database
 */

import type { DocumentChunk } from './types';
import { createLogger } from '@/lib/logger';
import * as fs from 'fs';
import * as path from 'path';
import { SupabaseVectorStore } from './supabase-vector-store';

const log = createLogger('VectorStore');

interface StoredChunk {
  id: string;
  content: string;
  metadata: any;
  embedding: number[];
}

class FileBasedVectorStore {
  private memoryStore: Map<string, StoredChunk> = new Map();
  private storagePath: string;

  constructor(storagePath: string = './data/vector-store.json') {
    this.storagePath = path.resolve(storagePath);
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing data
    await this.loadFromDisk();
    log.info(`Initialized file-based vector store with ${this.memoryStore.size} chunks`);
  }

  private async loadFromDisk(): Promise<void> {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf-8');
        const chunks: StoredChunk[] = JSON.parse(data);
        chunks.forEach((chunk) => {
          this.memoryStore.set(chunk.id, chunk);
        });
        log.info(`Loaded ${chunks.length} chunks from disk`);
      }
    } catch (error) {
      log.error('Error loading vector store from disk:', error);
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      const chunks = Array.from(this.memoryStore.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(chunks, null, 2));
    } catch (error) {
      log.error('Error saving vector store to disk:', error);
    }
  }

  async addDocuments(chunks: DocumentChunk[]): Promise<void> {
    chunks.forEach((chunk) => {
      this.memoryStore.set(chunk.id, {
        id: chunk.id,
        content: chunk.content,
        metadata: chunk.metadata,
        embedding: chunk.embedding,
      });
    });

    await this.saveToDisk();
    log.info(`Added ${chunks.length} document chunks to file-based vector store`);
  }

  async search(
    queryEmbedding: number[],
    limit: number = 5,
    threshold: number = 0.7,
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    const allSimilarities: Array<{
      id: string;
      similarity: number;
      content: string;
      fileName: string;
    }> = [];

    for (const data of this.memoryStore.values()) {
      const similarity = this.cosineSimilarity(queryEmbedding, data.embedding);
      allSimilarities.push({
        id: data.id,
        similarity,
        content: data.content.substring(0, 100),
        fileName: data.metadata.fileName,
      });

      log.debug(`Chunk ${data.id} similarity: ${similarity} (threshold: ${threshold})`);
      if (similarity >= threshold) {
        chunks.push({
          id: data.id,
          content: data.content,
          metadata: data.metadata,
          embedding: data.embedding,
        });
      }
    }

    // Log all similarities for debugging
    console.log(`📊 RAG Similarity Scores (all ${allSimilarities.length} chunks):`);
    allSimilarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10) // Show top 10
      .forEach((item, index) => {
        console.log(
          `  ${index + 1}. ${item.id} (${item.fileName}): ${item.similarity.toFixed(4)} - "${item.content}..."`,
        );
      });
    console.log('');

    // Sort by similarity and limit results
    chunks.sort(
      (a, b) =>
        this.cosineSimilarity(queryEmbedding, b.embedding) -
        this.cosineSimilarity(queryEmbedding, a.embedding),
    );
    const result = chunks.slice(0, limit);

    // Log matched chunks for debugging
    if (result.length > 0) {
      console.log(`🔍 RAG Search Results (${result.length} chunks found):`);
      result.forEach((chunk, index) => {
        const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        console.log(`  ${index + 1}. Chunk ${chunk.id} (similarity: ${similarity.toFixed(4)})`);
        console.log(`     File: ${chunk.metadata.fileName}, Page: ${chunk.metadata.pageNumber}`);
        console.log(
          `     Content: ${chunk.content.substring(0, 200)}${chunk.content.length > 200 ? '...' : ''}`,
        );
        console.log('');
      });
    } else {
      console.log(
        `❌ RAG Search: No chunks found above threshold ${threshold} (checked ${this.memoryStore.size} total chunks) - try lowering threshold or rephrasing query`,
      );
    }

    log.info(
      `Found ${result.length} relevant chunks for query (checked ${this.memoryStore.size} total chunks)`,
    );
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
    await this.saveToDisk();
    log.info(`Deleted ${keysToDelete.length} chunks for document: ${fileName}`);
  }

  async getAllDocuments(): Promise<string[]> {
    const fileNames = new Set<string>();
    for (const data of this.memoryStore.values()) {
      fileNames.add(data.metadata.fileName);
    }
    return Array.from(fileNames);
  }

  async getAllChunks(): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    for (const data of this.memoryStore.values()) {
      chunks.push({
        id: data.id,
        content: data.content,
        metadata: data.metadata,
        embedding: data.embedding,
      });
    }
    return chunks;
  }
}

// Common interface for all vector stores
export interface VectorStore {
  initialize(): Promise<void>;
  addDocuments(chunks: DocumentChunk[]): Promise<void>;
  search(queryEmbedding: number[], limit?: number, threshold?: number): Promise<DocumentChunk[]>;
  deleteDocument(fileName: string): Promise<void>;
  getAllDocuments(): Promise<string[]>;
  getAllChunks(): Promise<DocumentChunk[]>;
}

let vectorStoreInstance: VectorStore | null = null;

export async function getVectorStore(vectorDB?: string): Promise<VectorStore> {
  if (vectorStoreInstance) {
    return vectorStoreInstance;
  }

  // Determine which vector store to use
  const dbType = vectorDB || process.env.VECTOR_DB || 'supabase';

  console.log('🔍 VECTOR STORE DEBUG:');
  console.log('  - vectorDB param:', vectorDB);
  console.log('  - process.env.VECTOR_DB:', process.env.VECTOR_DB);
  console.log('  - Final dbType:', dbType);
  console.log('  - SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ set' : '❌ not set');
  console.log('  - SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ set' : '❌ not set');

  // Force Supabase-only mode for RAG documents
  if (dbType !== 'supabase') {
    console.log(
      '⚠️  Non-Supabase vector DB requested, but RAG system requires Supabase. Forcing Supabase mode.',
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const errorMsg =
      '❌ Supabase credentials not found! RAG system requires Supabase for document storage.';
    console.error(errorMsg);
    throw new Error(
      'Supabase configuration required for RAG documents. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    );
  }

  try {
    console.log('🔄 Initializing Supabase vector store for RAG documents...');
    vectorStoreInstance = new SupabaseVectorStore(supabaseUrl, supabaseKey);
    await vectorStoreInstance.initialize();
    console.log('✅ Using Supabase vector store for RAG documents');
  } catch (error) {
    console.error('❌ Supabase initialization failed:', error.message);
    console.error('💡 Make sure:');
    console.error('   1. SUPABASE_SERVICE_ROLE_KEY is set in .env.local');
    console.error('   2. document_chunks table exists in Supabase (run supabase-schema.sql)');
    console.error('   3. pgvector extension is enabled in Supabase');
    throw new Error(`Supabase vector store initialization failed: ${error.message}`);
  }

  return vectorStoreInstance;
}
