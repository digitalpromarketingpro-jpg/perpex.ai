import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for optimized Docker deployments
  output: "standalone",

  // TypeScript errors now FAIL the build — no silent type issues in production
  typescript: {
    ignoreBuildErrors: false,
  },

  images: {
    unoptimized: true,
  },

  // Fix: point turbopack root explicitly to avoid multi-lockfile workspace warning
  turbopack: {
    root: __dirname,
  },

  // Security headers applied to every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer policy
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permissions policy — restrict sensitive APIs
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // HSTS — enforce HTTPS for 1 year
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // XSS protection (legacy browsers)
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // DNS prefetch control
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ]
  },
}

let _export = nextConfig;

try {
  const sentry = await import('@sentry/nextjs');
  if (sentry?.withSentryConfig) {
    _export = sentry.withSentryConfig(nextConfig, {
      org: "perpex",
      project: "perpex-terminal",
      silent: !process.env.CI,
      widenClientFileUpload: true,
      reactComponentAnnotation: { enabled: true },
      tunnelRoute: "/monitoring",
      hideSourceMaps: true,
      disableLogger: true,
      automaticVercelMonitors: true,
    });
  }
} catch (e) {
  // Sentry not installed or failed to load — fall back to plain config
  console.warn('Sentry not available, continuing without Sentry integration')
}

export default _export;
