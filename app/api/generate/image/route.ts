/**
 * Image Generation API
 *
 * Generates an image from a text prompt using the specified provider.
 * Called by the client during media generation after slides are produced.
 *
 * POST /api/generate/image
 *
 * Headers:
 *   x-image-provider: ImageProviderId (default: 'seedream')
 *   x-api-key: string (optional, server fallback)
 *   x-base-url: string (optional, server fallback)
 *
 * Body: { prompt, negativePrompt?, width?, height?, aspectRatio?, style? }
 * Response: { success: boolean, result?: ImageGenerationResult, error?: string }
 */

import { NextRequest } from 'next/server';
import { generateImage, aspectRatioToDimensions } from '@/lib/media/image-providers';
import { resolveImageApiKey, resolveImageBaseUrl } from '@/lib/server/provider-config';
import type { ImageProviderId, ImageGenerationOptions, ImageGenerationResult } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

const log = createLogger('ImageGeneration API');

export const maxDuration = 60;

/**
 * Fallback image generation using placeholder services when no API keys are configured
 */
async function generateFallbackImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const { width = 512, height = 512, prompt } = options;

  try {
    // Try to fetch a real image from Lorem Picsum based on prompt
    const seed = prompt ? Math.abs(prompt.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 1000 : Math.floor(Math.random() * 1000);
    const picsumUrl = `https://picsum.photos/seed/${seed}/${width}/${height}`;

    // Fetch the image and convert to base64
    const response = await fetch(picsumUrl, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      return {
        url: `data:${contentType};base64,${base64}`,
        width,
        height,
      };
    }
  } catch (error) {
    log.warn('Failed to fetch Lorem Picsum image, using SVG fallback:', error);
  }

  // Fallback to SVG placeholder if Lorem Picsum fails
  const placeholderSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#e0f2fe;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#f0f9ff;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)"/>
      <circle cx="${width/2}" cy="${height/2 - 20}" r="30" fill="#3b82f6" opacity="0.8"/>
      <rect x="${width/2 - 15}" y="${height/2 + 10}" width="30" height="20" rx="2" fill="#6b7280"/>
      <text x="50%" y="85%" font-family="Arial, sans-serif" font-size="12" fill="#6b7280" text-anchor="middle" opacity="0.7">
        Generated Image
      </text>
    </svg>
  `;

  const base64 = Buffer.from(placeholderSvg).toString('base64');

  return {
    url: `data:image/svg+xml;base64,${base64}`,
    width,
    height,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImageGenerationOptions;

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    const providerId = (request.headers.get('x-image-provider') || 'seedream') as ImageProviderId;
    const clientApiKey = request.headers.get('x-api-key') || undefined;
    const clientBaseUrl = request.headers.get('x-base-url') || undefined;
    const clientModel = request.headers.get('x-image-model') || undefined;

    log.info(`Image generation API called: provider=${providerId}, prompt="${body.prompt.slice(0, 50)}..."`);

    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = clientBaseUrl
      ? clientApiKey || ''
      : resolveImageApiKey(providerId, clientApiKey);

    const baseUrl = clientBaseUrl ? clientBaseUrl : resolveImageBaseUrl(providerId, clientBaseUrl);

    // Resolve dimensions from aspect ratio if not explicitly set
    if (!body.width && !body.height && body.aspectRatio) {
      const dims = aspectRatioToDimensions(body.aspectRatio);
      body.width = dims.width;
      body.height = dims.height;
    }

    // Try the configured provider first, fall back to placeholder if it fails
    let result;
    if (apiKey) {
      try {
        log.info(
          `Generating image with ${providerId}: model=${clientModel || 'default'}, ` +
            `prompt="${body.prompt.slice(0, 80)}..."`,
        );
        result = await generateImage({ providerId, apiKey, baseUrl, model: clientModel }, body);
      } catch (error) {
        log.warn(`Primary image provider ${providerId} failed, using fallback:`, error);
        result = await generateFallbackImage(body);
      }
    } else {
      log.info(`No API key for ${providerId}, using fallback image service`);
      result = await generateFallbackImage(body);
    }

    return apiSuccess({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Detect content safety filter rejections (e.g. Seedream OutputImageSensitiveContentDetected)
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Image blocked by content safety filter: ${message}`);
      return apiError('CONTENT_SENSITIVE', 400, message);
    }
    log.error('Image generation error:', error);
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
