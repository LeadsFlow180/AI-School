# RAG (Retrieval-Augmented Generation) System

This system enables Retrieval-Augmented Generation for PDF documents, allowing the AI to answer questions based on uploaded PDF content.

## Features

- **PDF Ingestion**: Upload and process PDF documents
- **Text Chunking**: Automatically split documents into manageable chunks
- **Vector Embeddings**: Generate embeddings using OpenAI or local models
- **Similarity Search**: Find relevant document chunks for user queries
- **Context Integration**: Automatically include relevant context in chat responses
- **Document Management**: List and delete indexed documents

## API Endpoints

### POST /api/rag/ingest-pdf
Upload and process a PDF document for RAG.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `pdf` (File) - The PDF file to process

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "document-id",
    "fileName": "example.pdf",
    "fileSize": 12345,
    "pageCount": 10,
    "chunksProcessed": 25,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### POST /api/rag/query
Query the RAG system for relevant information.

**Request:**
```json
{
  "query": "What is machine learning?",
  "apiKey": "your-openai-api-key" // optional, uses server config if not provided
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "What is machine learning?",
    "isPDFRelated": true,
    "context": "Relevant information from documents...",
    "sources": [
      {
        "fileName": "ai-guide.pdf",
        "pageNumber": 5,
        "content": "Machine learning is...",
        "relevanceScore": 0.95
      }
    ],
    "retrievedChunksCount": 3
  }
}
```

### GET /api/rag/documents
List all indexed documents.

**Response:**
```json
{
  "success": true,
  "data": {
    "documents": [
      { "fileName": "document1.pdf" },
      { "fileName": "document2.pdf" }
    ]
  }
}
```

### DELETE /api/rag/documents?fileName=document.pdf
Delete a document from the index.

## Chat Integration

The RAG system is automatically integrated with the chat API. To enable RAG in chat:

**Request to /api/chat:**
```json
{
  "messages": [...],
  "storeState": {...},
  "config": {...},
  "enableRAG": true,
  "apiKey": "your-api-key"
}
```

When `enableRAG` is true, the system will:
1. Extract the last user message
2. Search for relevant PDF content
3. Append context to the message before processing
4. Generate response with PDF knowledge

## Configuration

### Environment Variables
- `OPENAI_API_KEY`: Required for embeddings (can also be provided per request)

### Default Settings
- **Chunk Size**: 1000 characters
- **Chunk Overlap**: 200 characters
- **Max Retrieved Chunks**: 5
- **Similarity Threshold**: 0.7
- **Embedding Model**: OpenAI (`text-embedding-3-small`)

## File Structure

```
lib/rag/
├── types.ts              # TypeScript interfaces
├── vector-store.ts       # In-memory vector storage
├── embedding-service.ts  # Embedding generation
├── document-processor.ts # PDF processing and chunking
├── rag-service.ts        # Main RAG orchestration
└── index.ts              # Exports

app/api/rag/
├── ingest-pdf/route.ts   # PDF upload endpoint
├── query/route.ts        # Query endpoint
└── documents/route.ts    # Document management

components/rag/
└── rag-manager.tsx       # UI component for managing PDFs
```

## Usage Example

1. **Upload a PDF:**
```bash
curl -X POST -F "pdf=@document.pdf" http://localhost:3000/api/rag/ingest-pdf
```

2. **Query with RAG:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"query": "What is the main topic?", "apiKey": "your-key"}' \
  http://localhost:3000/api/rag/query
```

3. **Chat with RAG enabled:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"messages": [...], "enableRAG": true, ...}' \
  http://localhost:3000/api/chat
```

## Limitations

- Currently uses in-memory storage (documents are lost on restart)
- For production, implement persistent vector database (Pinecone, Weaviate, etc.)
- Large documents may take time to process
- Local embeddings require significant memory and may be slower

## Future Enhancements

- Persistent vector database integration
- Support for multiple document formats
- Advanced chunking strategies
- Query expansion and re-ranking
- Multi-modal RAG (images, tables)
- Document versioning and updates