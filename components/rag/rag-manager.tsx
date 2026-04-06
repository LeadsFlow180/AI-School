'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface RAGDocument {
  fileName: string;
}

export function RAGManager() {
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/rag/documents', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setDocuments(Array.isArray(data.documents) ? data.documents : []);
      } else {
        toast.error('Failed to load documents');
      }
    } catch (_error) {
      toast.error('Error loading documents');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      toast.error('Please select a PDF file');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch('/api/rag/ingest-pdf', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const uploadedName = data.document?.fileName as string | undefined;
        toast.success(`PDF "${file.name}" processed successfully`);
        await loadDocuments();
        // If list is still empty (e.g. cached GET or another serverless instance), show the name we know was ingested.
        if (uploadedName) {
          setDocuments((prev) =>
            prev.some((d) => d.fileName === uploadedName)
              ? prev
              : [...prev, { fileName: uploadedName }],
          );
        }
      } else {
        const errBody = await response.json().catch(() => ({} as Record<string, unknown>));
        const msg =
          typeof errBody.error === 'string'
            ? errBody.error
            : typeof errBody.message === 'string'
              ? errBody.message
              : 'Failed to process PDF';
        toast.error(msg);
      }
    } catch (_error) {
      toast.error('Error uploading PDF');
    } finally {
      setIsUploading(false);
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteDocument = async (fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;

    try {
      const response = await fetch(`/api/rag/documents?fileName=${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success(`Document "${fileName}" deleted`);
        loadDocuments(); // Refresh the list
      } else {
        toast.error('Failed to delete document');
      }
    } catch (_error) {
      toast.error('Error deleting document');
    }
  };

  // Load documents on component mount
  useEffect(() => {
    void loadDocuments();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>RAG Document Management</CardTitle>
          <CardDescription>
            Upload PDF documents to enable Retrieval-Augmented Generation (RAG) for more accurate
            responses. PDFs need selectable text (not scanned images only). On a deployed server,
            indexes are in memory until restarted—use local dev for persistent testing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing PDF...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload PDF
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Indexed Documents</h3>
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="ml-2">Loading documents...</span>
                </div>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No documents indexed yet. Upload a PDF to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.fileName}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span className="text-sm font-medium">{doc.fileName}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteDocument(doc.fileName)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
