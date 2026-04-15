import { type NextRequest } from 'next/server';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ generationId: string }> },
) {
  const { generationId } = await ctx.params;
  const safeId = encodeURIComponent(generationId || '');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gamma Slides</title>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; font-family: Inter, Arial, sans-serif; background: #f8fafc; color: #0f172a; }
      .root { width: 100%; height: 100%; display: flex; flex-direction: column; }
      .bar { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; background: #ffffff; font-size: 13px; color: #334155; }
      .content { flex: 1; min-height: 0; position: relative; }
      .state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; }
      .spinner { width: 26px; height: 26px; border: 3px solid #e2e8f0; border-top-color: #7c3aed; border-radius: 50%; animation: spin 1s linear infinite; }
      .msg { font-size: 14px; color: #475569; }
      iframe { width: 100%; height: 100%; border: 0; display: none; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="root">
      <div class="bar">Gamma Slides (embedded via server export proxy)</div>
      <div class="content">
        <div id="state" class="state">
          <div class="spinner"></div>
          <div id="msg" class="msg">Preparing Gamma export...</div>
        </div>
      </div>
    </div>
    <script>
      const state = document.getElementById('state');
      const msg = document.getElementById('msg');
      const exportUrl = '/api/gamma/export/${safeId}';

      async function loadExport() {
        for (let i = 0; i < 120; i++) {
          try {
            const res = await fetch(exportUrl, { method: 'GET' });
            if (res.ok) {
              // Navigate this iframe directly to the PDF response.
              // Reason: nested iframe/blob PDF rendering may be blocked by Chrome.
              window.location.replace(exportUrl);
              return;
            }
            msg.textContent = 'Gamma export is still preparing...';
          } catch (_) {
            msg.textContent = 'Retrying export fetch...';
          }
          await new Promise((r) => setTimeout(r, 2500));
        }
        msg.textContent = 'Export timed out. Please regenerate.';
      }
      loadExport();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
