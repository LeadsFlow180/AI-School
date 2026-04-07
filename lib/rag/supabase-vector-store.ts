/**
 * Supabase Vector Store Implementation
 * Uses Supabase with pgvector extension for vector similarity search
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DocumentChunk } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('SupabaseVectorStore');

interface StoredChunk {
  id: string;
  content: string;
  metadata: any;
  embedding: number[];
  created_at?: string;
  updated_at?: string;
}

export class SupabaseVectorStore {
  private supabase: SupabaseClient;
  private tableName: string;

  constructor(supabaseUrl: string, supabaseKey: string, tableName: string = 'document_chunks') {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.tableName = tableName;
  }

  async initialize(): Promise<void> {
    // Check if the table exists and has the correct structure
    try {
      // Test connection and table existence
      const { data, error } = await this.supabase.from(this.tableName).select('id').limit(1);

      if (error) {
        if (error.code === 'PGRST116') {
          // Table doesn't exist
          log.error(`❌ Table ${this.tableName} does not exist in Supabase!`);
          log.error(
            '📋 Please run the SQL migration from supabase-schema.sql in your Supabase dashboard',
          );
          log.error(
            '🔗 Go to: https://supabase.com/dashboard/project/sdgruffbgmighsqzfrvw -> SQL Editor',
          );
          log.error('📄 Copy and paste the contents of supabase-schema.sql and run it');
          throw new Error(
            `Table ${this.tableName} does not exist. Please create it with the schema from supabase-schema.sql`,
          );
        } else {
          // Other connection error
          log.error('❌ Supabase connection error:', error.message);
          throw new Error(`Supabase connection failed: ${error.message}`);
        }
      }

      log.info('✅ Supabase vector store initialized successfully');
    } catch (error) {
      log.error('❌ Error initializing Supabase vector store:', error);
      throw error;
    }
  }

  async addDocuments(chunks: DocumentChunk[]): Promise<void> {
    try {
      const records: StoredChunk[] = chunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        metadata: chunk.metadata,
        embedding: chunk.embedding,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await this.supabase
        .from(this.tableName)
        .upsert(records, { onConflict: 'id' });

      if (error) {
        throw error;
      }

      log.info(`Added ${chunks.length} document chunks to Supabase vector store`);
    } catch (error) {
      log.error('Error adding documents to Supabase:', error);
      throw new Error('Failed to add documents to vector store');
    }
  }

  async search(
    queryEmbedding: number[],
    limit: number = 5,
    threshold: number = 0.7,
  ): Promise<DocumentChunk[]> {
    try {
      // Use Supabase's vector similarity search
      const { data, error } = await this.supabase.rpc('similarity_search', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        table_name: this.tableName,
      });

      if (error) {
        // Fallback to manual similarity calculation if RPC function doesn't exist
        log.warn('RPC function not available, falling back to manual search');
        return this.manualSearch(queryEmbedding, limit, threshold);
      }

      const chunks: DocumentChunk[] = data.map((row: any) => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        embedding: row.embedding,
      }));

      log.info(`Found ${chunks.length} relevant chunks using Supabase vector search`);
      return chunks;
    } catch (error) {
      log.error('Error searching Supabase vector store:', error);
      // Fallback to manual search
      return this.manualSearch(queryEmbedding, limit, threshold);
    }
  }

  private async manualSearch(
    queryEmbedding: number[],
    limit: number = 5,
    threshold: number = 0.7,
  ): Promise<DocumentChunk[]> {
    try {
      // Get all chunks (in production, you'd want to limit this or use pagination)
      const { data, error } = await this.supabase.from(this.tableName).select('*');

      if (error) {
        throw error;
      }

      const chunks: DocumentChunk[] = [];
      const allSimilarities: Array<{
        id: string;
        similarity: number;
        content: string;
        fileName: string;
      }> = [];

      for (const row of data) {
        const similarity = this.cosineSimilarity(queryEmbedding, row.embedding);
        allSimilarities.push({
          id: row.id,
          similarity,
          content: row.content.substring(0, 100),
          fileName: row.metadata.fileName,
        });

        if (similarity >= threshold) {
          chunks.push({
            id: row.id,
            content: row.content,
            metadata: row.metadata,
            embedding: row.embedding,
          });
        }
      }

      // Log similarities for debugging
      console.log(`📊 Supabase RAG Similarity Scores (all ${allSimilarities.length} chunks):`);
      allSimilarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10)
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

      // Log matched chunks
      if (result.length > 0) {
        console.log(`🔍 Supabase RAG Search Results (${result.length} chunks found):`);
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
          `❌ Supabase RAG Search: No chunks found above threshold ${threshold} (checked ${data.length} total chunks)`,
        );
      }

      log.info(`Found ${result.length} relevant chunks (manual search)`);
      return result;
    } catch (error) {
      log.error('Error in manual search:', error);
      throw new Error('Failed to search vector store');
    }
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
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('metadata->>fileName', fileName);

      if (error) {
        throw error;
      }

      log.info(`Deleted chunks for document: ${fileName}`);
    } catch (error) {
      log.error('Error deleting document from Supabase:', error);
      throw new Error('Failed to delete document from vector store');
    }
  }

  async getAllDocuments(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase.from(this.tableName).select('metadata');

      if (error) {
        throw error;
      }

      const fileNames = new Set<string>();
      data.forEach((row: any) => {
        if (row.metadata?.fileName) {
          fileNames.add(row.metadata.fileName);
        }
      });

      const fileList = Array.from(fileNames);
      log.info(`📋 Found ${fileList.length} documents in Supabase: ${fileList.join(', ')}`);
      return fileList;
    } catch (error) {
      log.error('Error getting all documents from Supabase:', error);
      throw new Error('Failed to get all documents from Supabase');
    }
  }

  async getAllChunks(): Promise<DocumentChunk[]> {
    try {
      const { data, error } = await this.supabase.from(this.tableName).select('*');

      if (error) {
        throw error;
      }

      return data.map((row: any) => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        embedding: row.embedding,
      }));
    } catch (error) {
      log.error('Error getting all chunks from Supabase:', error);
      throw new Error('Failed to get all chunks');
    }
  }

  async clearAll(): Promise<void> {
    try {
      const { error } = await this.supabase.from(this.tableName).delete().neq('id', ''); // Delete all rows

      if (error) {
        throw error;
      }

      log.info('Cleared all chunks from Supabase vector store');
    } catch (error) {
      log.error('Error clearing Supabase vector store:', error);
      throw new Error('Failed to clear vector store');
    }
  }
}
