/**
 * Test script for RAG functionality
 */

import { RAGService } from '../lib/rag/rag-service';
import { getEmbeddingService } from '../lib/rag/embedding-service';
import fs from 'fs';
import path from 'path';

async function testRAG() {
  console.log('Testing RAG functionality...');

  try {
    // Initialize embedding service
    const embeddingService = await getEmbeddingService('local');
    console.log('✓ Embedding service initialized');

    // Create a test document
    const testContent = `
    Artificial Intelligence (AI) is a field of computer science that aims to create machines capable of intelligent behavior.
    Machine Learning is a subset of AI that focuses on algorithms that can learn from data.
    Deep Learning uses neural networks with multiple layers to solve complex problems.
    Natural Language Processing (NLP) enables computers to understand and generate human language.
    Computer Vision allows machines to interpret and understand visual information from the world.
    `;

    // Create mock chunks
    const chunks = [
      {
        id: 'test_chunk_1',
        content:
          'Artificial Intelligence (AI) is a field of computer science that aims to create machines capable of intelligent behavior.',
        metadata: {
          fileName: 'test.pdf',
          pageNumber: 1,
          chunkIndex: 0,
          totalChunks: 5,
          fileSize: 1024,
          mimeType: 'application/pdf',
        },
      },
      {
        id: 'test_chunk_2',
        content:
          'Machine Learning is a subset of AI that focuses on algorithms that can learn from data.',
        metadata: {
          fileName: 'test.pdf',
          pageNumber: 1,
          chunkIndex: 1,
          totalChunks: 5,
          fileSize: 1024,
          mimeType: 'application/pdf',
        },
      },
      {
        id: 'test_chunk_3',
        content:
          'Deep Learning uses neural networks with multiple layers to solve complex problems.',
        metadata: {
          fileName: 'test.pdf',
          pageNumber: 2,
          chunkIndex: 2,
          totalChunks: 5,
          fileSize: 1024,
          mimeType: 'application/pdf',
        },
      },
    ];

    // Generate embeddings
    const chunksWithEmbeddings = await embeddingService.processChunks(chunks);
    console.log('✓ Generated embeddings for test chunks');

    // Test RAG service
    const ragService = new RAGService();

    // Manually add test chunks to vector store (since we don't have Chroma running)
    const vectorStore = await import('../lib/rag/vector-store').then((m) => m.getVectorStore());
    await vectorStore.addDocuments(chunksWithEmbeddings);
    console.log('✓ Added test chunks to vector store');

    // Test query
    const query = 'What is machine learning?';
    const result = await ragService.query(query);
    console.log('✓ Query processed:', result.isPDFRelated);
    console.log('Retrieved chunks:', result.retrievedChunks.length);
    console.log('Context length:', result.context.length);

    console.log('RAG test completed successfully!');
  } catch (error) {
    console.error('RAG test failed:', error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testRAG();
}

export { testRAG };
