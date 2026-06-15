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
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600 dark:text-indigo-300">
          Knowledge Base
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Manage RAG Documents
        </h1>
      </div>
      <Card className="border-white/80 dark:border-slate-700/70 bg-white/72 dark:bg-slate-900/58 backdrop-blur-md shadow-[0_16px_36px_-26px_rgba(15,23,42,0.5)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">RAG Document Management</CardTitle>
          <CardDescription>
            Upload PDF documents to enable Retrieval-Augmented Generation (RAG) for more accurate
            responses. PDFs need selectable text (not scanned images only). On a deployed server,
            indexes are in memory until restarted—use local dev for persistent testing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                className="w-full h-10 rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-600 text-white hover:brightness-110"
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
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Indexed Documents
              </h3>
              {isLoading ? (
                <div className="flex items-center justify-center py-6 rounded-lg border border-white/70 dark:border-slate-700/70 bg-white/45 dark:bg-slate-900/45">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="ml-2">Loading documents...</span>
                </div>
              ) : documents.length === 0 ? (
                <div className="rounded-lg border border-white/70 dark:border-slate-700/70 bg-white/45 dark:bg-slate-900/45 px-4 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No documents indexed yet. Upload a PDF to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.fileName}
                      className="flex items-center justify-between p-3 border border-white/75 dark:border-slate-700/70 rounded-lg bg-white/55 dark:bg-slate-900/45"
                    >
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm font-medium">{doc.fileName}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteDocument(doc.fileName)}
                        className="rounded-md border-white/70 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/50"
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
