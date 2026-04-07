/**
 * Document Processor for RAG
 * Handles PDF parsing, text chunking, and document ingestion
 */

import { parsePDF } from '@/lib/pdf/pdf-providers';
import { splitTextIntoChunks } from './chunk-text';
import type { RAGDocument, DocumentChunk, RAGConfig } from './types';
import { getEmbeddingService } from './embedding-service';
import { getVectorStore } from './vector-store';
import { createLogger } from '@/lib/logger';
import { nanoid } from 'nanoid';

const log = createLogger('DocumentProcessor');

const DEFAULT_CONFIG: RAGConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
  maxRetrievedChunks: 5,
  similarityThreshold: 0.7,
  embeddingModel: 'openai',
  vectorDB: 'file', // Changed from 'chroma' to 'file' for clarity
};

export class DocumentProcessor {
  private config: RAGConfig;

  constructor(config: Partial<RAGConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async processPDF(file: File, apiKey?: string, storagePath?: string): Promise<RAGDocument> {
    const startTime = Date.now();

    log.info(`Processing PDF: ${file.name} (${file.size} bytes)`);

    // Parse PDF content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parseResult = await parsePDF(
      {
        providerId: 'unpdf',
        apiKey: apiKey || '',
        baseUrl: '',
      },
      buffer,
    );

    // Extract text content
    const fullText = this.extractTextFromParsedPDF(parseResult);
    log.info(`Extracted ${fullText.length} characters from PDF`);

    if (!fullText.trim()) {
      throw new Error(
        'No text could be extracted from this PDF. It may be image-only, encrypted, or empty.',
      );
    }

    // Split into chunks
    const chunks = await this.chunkText(
      fullText,
      file.name,
      parseResult.metadata?.pageCount || 1,
      file.size,
      storagePath,
    );

    console.log(
      `📝 RAG Chunking: Created ${chunks.length} chunks from "${file.name}" (${fullText.length} characters)`,
    );

    // Generate embeddings
    const embeddingService = await getEmbeddingService(this.config.embeddingModel, apiKey);
    const chunksWithEmbeddings = await embeddingService.processChunks(chunks);

    console.log(
      `🧠 RAG Embeddings: Generated embeddings for ${chunksWithEmbeddings.length} chunks`,
    );

    // Create document object
    const document: RAGDocument = {
      id: nanoid(),
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      pageCount: parseResult.metadata?.pageCount || 1,
      chunks: chunksWithEmbeddings,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store in vector database
    const vectorStore = await getVectorStore(this.config.vectorDB);
    await vectorStore.addDocuments(chunksWithEmbeddings);

    const processingTime = Date.now() - startTime;
    log.info(`Processed PDF in ${processingTime}ms: ${chunksWithEmbeddings.length} chunks`);

    return document;
  }

  private extractTextFromParsedPDF(parseResult: any): string {
    // Handle different PDF parser response formats
    if (parseResult.text) {
      return parseResult.text;
    }

    if (parseResult.pages && Array.isArray(parseResult.pages)) {
      return parseResult.pages.map((page: any) => page.text || '').join('\n\n');
    }

    if (typeof parseResult === 'string') {
      return parseResult;
    }

    log.warn('Unexpected PDF parse result format:', parseResult);
    return '';
  }

  private async chunkText(
    text: string,
    fileName: string,
    pageCount: number,
    fileSize: number,
    storagePath?: string,
  ): Promise<Omit<DocumentChunk, 'embedding'>[]> {
    const parts = splitTextIntoChunks(text, this.config.chunkSize, this.config.chunkOverlap);

    const chunks: Omit<DocumentChunk, 'embedding'>[] = [];
    let chunkIndex = 0;

    for (const content of parts) {
      // Estimate page number based on chunk position
      const estimatedPage = Math.min(
        Math.floor((chunkIndex * pageCount) / parts.length) + 1,
        pageCount,
      );

      chunks.push({
        id: `${fileName}_${chunkIndex}`,
        content,
        metadata: {
          fileName,
          pageNumber: estimatedPage,
          chunkIndex,
          totalChunks: parts.length,
          fileSize,
          mimeType: 'application/pdf',
          ...(storagePath && { storagePath }),
        },
      });

      chunkIndex++;
    }

    return chunks;
  }

  async searchDocuments(query: string, apiKey?: string): Promise<DocumentChunk[]> {
    // Generate embedding for query
    const embeddingService = await getEmbeddingService(this.config.embeddingModel, apiKey);
    const queryEmbedding = await embeddingService.generateEmbedding(query);

    // Search vector store
    const vectorStore = await getVectorStore(this.config.vectorDB);
    const results = await vectorStore.search(
      queryEmbedding,
      this.config.maxRetrievedChunks,
      this.config.similarityThreshold,
    );

    return results;
  }

  async deleteDocument(fileName: string): Promise<void> {
    const vectorStore = await getVectorStore(this.config.vectorDB);
    await vectorStore.deleteDocument(fileName);
    log.info(`Deleted document: ${fileName}`);
  }

  async getAllDocuments(): Promise<string[]> {
    const vectorStore = await getVectorStore(this.config.vectorDB);
    return await vectorStore.getAllDocuments();
  }
}
