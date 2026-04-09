import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Only use standalone output on Vercel, otherwise let Next.js decide
  output: process.env.VERCEL ? 'standalone' : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: [],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
