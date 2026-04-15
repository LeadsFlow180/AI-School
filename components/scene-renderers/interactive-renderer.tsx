'use client';

import { useEffect, useMemo, useState } from 'react';
import type { InteractiveContent } from '@/lib/types/stage';

interface InteractiveRendererProps {
  readonly content: InteractiveContent;
  readonly mode: 'autonomous' | 'playback';
  readonly sceneId: string;
}

export function InteractiveRenderer({ content, mode: _mode, sceneId }: InteractiveRendererProps) {
  const shouldUseUrlDirectly =
    content.url.startsWith('/api/gamma/export/') || content.url.startsWith('/api/gamma/launch/');
  const isPdfLike =
    content.url.startsWith('/api/gamma/export/') ||
    /\.pdf(\?|$)/i.test(content.url) ||
    content.url.includes('/export/pdf/');
  const patchedHtml = useMemo(() => {
    if (shouldUseUrlDirectly) return undefined;
    if (content.html) return patchHtmlForIframe(content.html);
    if (isGammaUrl(content.url)) return buildGammaLaunchHtml(content.url);
    return undefined;
  }, [content.html, content.url, shouldUseUrlDirectly]);

  if (isPdfLike) {
    if (content.url.startsWith('/api/gamma/export/')) {
      return <GammaSinglePagePdfRenderer url={content.url} sceneId={sceneId} />;
    }

    return (
      <div className="w-full h-full bg-white">
        <iframe
          key={`${sceneId}:${content.url}`}
          src={content.url}
          className="w-full h-full border-0"
          title={`PDF Scene ${sceneId}`}
        />
        <object data={content.url} type="application/pdf" className="w-0 h-0 opacity-0 pointer-events-none">
          <div className="w-full h-full flex items-center justify-center p-6 text-center">
            <div>
              <p className="text-sm text-slate-600 mb-3">PDF preview is unavailable in this browser.</p>
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md bg-violet-600 text-white px-3 py-2 text-sm"
              >
                Open PDF in new tab
              </a>
            </div>
          </div>
        </object>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <iframe
        srcDoc={patchedHtml}
        src={patchedHtml ? undefined : content.url}
        className="absolute inset-0 w-full h-full border-0"
        title={`Interactive Scene ${sceneId}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}

function parsePdfUrl(url: string): { baseUrl: string; page: number } {
  const [baseUrl, hash = ''] = url.split('#');
  const pageMatch = hash.match(/(?:^|&)page=(\d+)/i);
  const page = pageMatch ? Number.parseInt(pageMatch[1], 10) : 1;
  return { baseUrl, page: Number.isFinite(page) && page > 0 ? page : 1 };
}

async function loadPdfJsWithWorker() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  if (pdfjs.GlobalWorkerOptions?.workerSrc !== workerUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjs;
}

function parseGenerationIdFromGammaExportUrl(baseUrl: string): string | null {
  const match = baseUrl.match(/\/api\/gamma\/export\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function GammaSinglePagePdfRenderer({ url, sceneId }: { url: string; sceneId: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const { baseUrl, page } = parsePdfUrl(url);
  const generationId = parseGenerationIdFromGammaExportUrl(baseUrl);
  const pageImageUrl = generationId
    ? `/api/gamma/page-image/${encodeURIComponent(generationId)}/${page}`
    : null;

  useEffect(() => {
    setImageFailed(false);
    setRetryNonce(0);
  }, [url]);

  if (!pageImageUrl) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-slate-600 mb-3">Unable to render this slide page.</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md bg-violet-600 text-white px-3 py-2 text-sm"
          >
            Open PDF page
          </a>
        </div>
      </div>
    );
  }

  if (imageFailed) {
    return <GammaClientSinglePageFallback url={url} sceneId={sceneId} />;
  }

  return (
    <div className="w-full h-full bg-[#0f172a] flex items-center justify-center overflow-hidden">
      <img
        src={`${pageImageUrl}?v=${retryNonce}`}
        alt={`Gamma slide ${sceneId}`}
        className="max-w-full max-h-full object-contain"
        draggable={false}
        onError={() => {
          if (retryNonce < 2) {
            setRetryNonce((n) => n + 1);
            return;
          }
          setImageFailed(true);
        }}
      />
    </div>
  );
}

function GammaClientSinglePageFallback({ url, sceneId }: { url: string; sceneId: string }) {
  const [state, setState] = useState<{
    loading: boolean;
    imageUrl: string | null;
    error: string | null;
  }>({
    loading: true,
    imageUrl: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const run = async () => {
      try {
        setState({ loading: true, imageUrl: null, error: null });
        const { baseUrl, page } = parsePdfUrl(url);
        const pdfRes = await fetch(baseUrl, { method: 'GET' });
        if (!pdfRes.ok) throw new Error(`Failed to load PDF (${pdfRes.status})`);
        const bytes = new Uint8Array(await pdfRes.arrayBuffer());
        const pdfjs = await loadPdfJsWithWorker();
        const task = pdfjs.getDocument({
          data: bytes,
          useWorkerFetch: false,
          isEvalSupported: false,
        } as never);
        const pdf = await task.promise;
        const pageNo = Math.min(Math.max(1, page), Math.max(1, pdf.numPages || 1));
        const pdfPage = await pdf.getPage(pageNo);
        const viewport = pdfPage.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to create canvas context');
        await pdfPage.render({ canvasContext: ctx, viewport } as never).promise;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Failed to create image blob');
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setState({ loading: false, imageUrl: objectUrl, error: null });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setState({ loading: false, imageUrl: null, error: message });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (state.loading) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center text-sm text-slate-500">
        Loading slide...
      </div>
    );
  }

  if (state.imageUrl) {
    return (
      <div className="w-full h-full bg-[#0f172a] flex items-center justify-center overflow-hidden">
        <img
          src={state.imageUrl}
          alt={`Gamma slide ${sceneId}`}
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex items-center justify-center p-6 text-center">
      <div>
        <p className="text-sm text-slate-600 mb-3">Unable to render this slide image.</p>
        {state.error ? <p className="text-xs text-slate-500 mb-3">{state.error}</p> : null}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md bg-slate-200 text-slate-800 px-3 py-2 text-sm"
        >
          Open PDF page
        </a>
      </div>
    </div>
  );
}

function isGammaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('gamma.app');
  } catch {
    return false;
  }
}

function buildGammaLaunchHtml(gammaUrl: string): string {
  const escapedGammaUrl = gammaUrl.replace(/"/g, '&quot;');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gamma Slides</title>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; font-family: Inter, Arial, sans-serif; }
      .wrap { min-height: 100%; display: flex; align-items: center; justify-content: center; background: #f8fafc; color: #0f172a; }
      .card { max-width: 560px; background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 8px; font-size: 20px; }
      p { margin: 0 0 16px; color: #475569; line-height: 1.5; }
      a { text-decoration: none; display: inline-block; padding: 10px 14px; border-radius: 10px; font-size: 14px; font-weight: 600; background: #7c3aed; color: white; }
      code { display: block; margin-top: 14px; padding: 10px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; font-size: 12px; word-break: break-all; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Gamma Slides</h1>
        <p>Gamma blocks iframe embedding. Open slides in a new tab.</p>
        <a href="${escapedGammaUrl}" target="_blank" rel="noopener noreferrer">Open in Gamma</a>
        <code>${escapedGammaUrl}</code>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Patch embedded HTML to display correctly inside an iframe.
 *
 * Fixes:
 * - min-h-screen / h-screen → use 100% of iframe viewport
 * - Ensure html/body fill the iframe with no overflow issues
 * - Canvas elements use container sizing instead of viewport
 */
function patchHtmlForIframe(html: string): string {
  const iframeCss = `<style data-iframe-patch>
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }
  /* Fix min-h-screen: in iframes 100vh is the iframe height, which is correct,
     but ensure body actually fills it */
  body { min-height: 100vh; }
</style>`;

  // Insert right after <head> or at the start of the document
  const headIdx = html.indexOf('<head>');
  if (headIdx !== -1) {
    const insertPos = headIdx + 6; // after <head>
    return html.substring(0, insertPos) + '\n' + iframeCss + html.substring(insertPos);
  }

  const headWithAttrs = html.indexOf('<head ');
  if (headWithAttrs !== -1) {
    const closeAngle = html.indexOf('>', headWithAttrs);
    if (closeAngle !== -1) {
      const insertPos = closeAngle + 1;
      return html.substring(0, insertPos) + '\n' + iframeCss + html.substring(insertPos);
    }
  }

  // Fallback: prepend
  return iframeCss + html;
}
