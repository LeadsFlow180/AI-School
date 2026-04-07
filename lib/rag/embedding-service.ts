/**
 * Embedding Service for RAG
 * Supports both OpenAI embeddings and local Transformers.js
 */

import OpenAI from 'openai';
import { pipeline } from '@xenova/transformers';
import type { DocumentChunk } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('EmbeddingService');

export class EmbeddingService {
  private openai: OpenAI | null = null;
  private localPipeline: any = null;
  private model: 'openai' | 'local';

  constructor(model: 'openai' | 'local' = 'openai') {
    this.model = model;
  }

  async initialize(openaiApiKey?: string): Promise<void> {
    if (this.model === 'openai') {
      if (!openaiApiKey) {
        throw new Error('OpenAI API key required for OpenAI embeddings');
      }
      this.openai = new OpenAI({ apiKey: openaiApiKey });
      log.info('Initialized OpenAI embedding service');
    } else {
      // Initialize local pipeline only when needed
      log.info('Local embedding service will be initialized on first use');
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (this.model === 'openai') {
      return this.generateOpenAIEmbedding(text);
    } else {
      return this.generateLocalEmbedding(text);
    }
  }

  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      log.error('Error generating OpenAI embedding:', error);
      throw new Error('Failed to generate embedding with OpenAI');
    }
  }

  private async generateLocalEmbedding(text: string): Promise<number[]> {
    if (!this.localPipeline) {
      // Lazy initialization
      const { pipeline } = await import('@xenova/transformers');
      this.localPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      log.info('Initialized local embedding pipeline');
    }

    try {
      const output = await this.localPipeline(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      log.error('Error generating local embedding:', error);
      throw new Error('Failed to generate local embedding');
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  async processChunks(chunks: Omit<DocumentChunk, 'embedding'>[]): Promise<DocumentChunk[]> {
    const texts = chunks.map((chunk) => chunk.content);
    const embeddings = await this.generateEmbeddings(texts);

    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));
  }
}

// Singleton instances
let openaiEmbeddingService: EmbeddingService | null = null;
let localEmbeddingService: EmbeddingService | null = null;

export async function getEmbeddingService(
  model: 'openai' | 'local' = 'openai',
  apiKey?: string,
): Promise<EmbeddingService> {
  if (model === 'openai') {
    if (!openaiEmbeddingService) {
      openaiEmbeddingService = new EmbeddingService('openai');
      await openaiEmbeddingService.initialize(apiKey);
    }
    return openaiEmbeddingService;
  } else {
    if (!localEmbeddingService) {
      localEmbeddingService = new EmbeddingService('local');
      await localEmbeddingService.initialize();
    }
    return localEmbeddingService;
  }
}
