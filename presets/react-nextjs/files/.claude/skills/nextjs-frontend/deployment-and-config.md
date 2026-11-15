# Deployment & next.config

## `next.config.ts` — the canonical shape

```ts
// next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Standalone output is ideal for Docker / non-Vercel hosts.
  // Omit (or 'export') when deploying to Vercel directly.
  output: 'standalone',

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.acme.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    typedRoutes: true,
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        source: '/api/webhooks/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/old-blog/:slug',
        destination: '/posts/:slug',
        permanent: true,
      },
    ];
  },

  async rewrites() {
    return [
      // External API proxy — keeps the third-party host hidden from the browser
      {
        source: '/proxy/billing/:path*',
        destination: 'https://billing.example.com/:path*',
      },
    ];
  },

  modularizeImports: {
    'lodash-es': {
      transform: 'lodash-es/{{member}}',
    },
    'date-fns': {
      transform: 'date-fns/{{member}}',
    },
  },
};

export default config;
```

`.ts` config is supported in Next 15. For Next 14 stick with `next.config.mjs` or `next.config.js`.

## Images — `remotePatterns`

Every external image host the app renders **must** be allow-listed. Otherwise `next/image` 400s in production.

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
    { protocol: 'https', hostname: '**.amazonaws.com', pathname: '/my-bucket/**' },
  ],
},
```

Use `pathname` to scope wildcards — `**.amazonaws.com` without a pathname is too permissive.

## Headers, redirects, rewrites

| | Use for |
|---|---|
| `headers()` | Security headers, cache hints, custom response headers. |
| `redirects()` | URL changes that should also change the browser URL (with 301/302). |
| `rewrites()` | URL stays in the browser, but Next serves a different path internally — proxying, A/B routing, multi-zone. |

`rewrites()` runs **after** the file system, so an existing route wins. `headers()` and `redirects()` always run.

## Environment variables

Three categories, three rules:

| Prefix | Where it's available | Use for |
|---|---|---|
| `DATABASE_URL` (no prefix) | Server only | Secrets, server URLs, anything the browser must not see |
| `NEXT_PUBLIC_*` | Server **and** baked into client bundles at build time | Public site URL, public API keys, feature flags |
| `NEXT_PRIVATE_*` (informal convention) | Server only | Same as no-prefix; just clarifies intent |

Always validate at boot:

```ts
// src/env.ts
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_GA_ID: z.string().optional(),
});

export const env = schema.parse(process.env);
```

`NEXT_PUBLIC_*` values are inlined at **build time**. Changing them requires a rebuild — they cannot be swapped at runtime by editing a `.env`.

For runtime-mutable config (deploy once, swap value without rebuild), read from `process.env` in a Server Component or Route Handler at request time. Don't expose those to the browser.

## `output: 'standalone'` for self-hosting

Generates a minimal `.next/standalone/` directory with only the dependencies the app actually uses. Slimmer Docker images, no `node_modules` copy.

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

The `server.js` file is generated by `output: 'standalone'`. Don't write your own.

## Vercel vs self-host: the differences that matter

| Concern | Vercel | Self-host |
|---|---|---|
| Image optimization | Hosted, free up to a quota | Sharp at runtime, or a CDN like Cloudflare Images |
| ISR / Data Cache | Persistent across deploys, multi-region | Filesystem on the running container — disappears on restart unless you mount a volume |
| Edge runtime | Native | Self-host runs Edge in Node; lose some perf but not functionality |
| Logs | Built-in | You wire it up (Datadog, Loki, CloudWatch) |
| Cron / scheduled actions | `vercel.json` cron triggers | External scheduler (k8s CronJob, GitHub Actions) hitting a route handler |

The "ISR cache disappears on restart" gotcha is the most common self-host pitfall — for production, mount a persistent volume to `.next/cache` or use a shared cache backend.

## Cache headers

For a static asset at a known versioned path, set long-lived cache:

```ts
async headers() {
  return [
    {
      source: '/_next/static/:path*',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      source: '/api/:path*',
      headers: [{ key: 'Cache-Control', value: 'no-store' }],
    },
  ];
}
```

For Route Handlers that should be cached, set `Cache-Control` in the handler's `NextResponse`, not via `headers()` — page-level config is too coarse.

## Monitoring & error reporting

Wire a server-side error reporter (Sentry, Datadog, OpenTelemetry) at app boot. Two integration points:

1. `instrumentation.ts` at the project root — runs once per server cold start.
2. A client-side init in the root layout (Client Component wrapper) for browser errors.

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation-edge');
  }
}
```

## Pre-deployment checklist

- [ ] `next build` succeeds locally with the production env vars
- [ ] `next start` serves the production build correctly
- [ ] All external image hosts are in `images.remotePatterns`
- [ ] Security headers configured (HSTS, frame options, content-type)
- [ ] `metadataBase` is the production URL
- [ ] `robots.ts` and `sitemap.ts` reference production URLs
- [ ] No `console.log` in committed code
- [ ] All env vars validated by the typed `env` module at boot
- [ ] Error reporting wired in `instrumentation.ts`
- [ ] If self-hosting: persistent volume mounted for ISR cache, OR a shared cache backend configured

## DO

- Use `output: 'standalone'` for Docker / non-Vercel.
- Allow-list every external image host with a tight `pathname`.
- Validate env vars at boot via Zod.
- Set security headers in `next.config`.
- Mount or back the ISR cache with persistence on self-host.
- Test with `next build && next start` before deploying.

## DON'T

- Don't put secrets in `NEXT_PUBLIC_*`.
- Don't allow-list `*` for image hosts.
- Don't rely on filesystem ISR cache surviving container restarts on self-host.
- Don't ship without security headers.
- Don't change `NEXT_PUBLIC_*` without a rebuild and expect it to take effect.
