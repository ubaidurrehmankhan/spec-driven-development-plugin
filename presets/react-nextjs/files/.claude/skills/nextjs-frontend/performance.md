# Performance

The App Router does most of the heavy lifting (Server Components ship no JS for themselves; static segments cache). The remaining wins are images, fonts, scripts, streaming, and bundle discipline.

## `next/image`

Always use `next/image` for raster images. It serves modern formats (AVIF/WebP), generates srcsets, lazy-loads by default, and reserves layout to prevent CLS — but **only if you size it correctly**.

```tsx
import Image from 'next/image';

// 1) Known intrinsic dimensions (preferred)
<Image
  src="/products/widget.jpg"
  alt="Industrial widget, side view"
  width={800}
  height={600}
  className="rounded"
/>

// 2) Fill mode — when the parent governs size (must be `position: relative`)
<div className="relative aspect-[4/3] w-full">
  <Image
    src={product.imageUrl}
    alt={product.name}
    fill
    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
    className="object-cover"
  />
</div>

// 3) Above-the-fold hero — opt out of lazy loading
<Image
  src="/hero.jpg"
  alt="Spring collection 2026"
  width={1600}
  height={900}
  priority
  sizes="100vw"
/>
```

Rules:
- `width` + `height` reserve space → no CLS.
- `fill` requires a positioned parent and `sizes` (otherwise the browser downloads the largest variant).
- `priority` on the **single** above-the-fold LCP image. Never on more than 1–2 per page.
- Remote images need their host in `next.config.images.remotePatterns`.

## `next/font`

Self-hosted fonts, no extra network calls, no FOUT. Use the variable form so `font-display: swap` works cleanly.

```ts
// app/fonts.ts
import { Inter, JetBrains_Mono } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});
```

```tsx
// app/layout.tsx
import { inter, mono } from './fonts';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

For local fonts, use `next/font/local` and point at the file. Only load the subsets you use — `'latin'` alone often saves >100 KB over `'latin-ext', 'cyrillic', ...`.

## `next/link`

Use `<Link>` for any in-app navigation. It prefetches the route's RSC payload on viewport entry (production only) and uses the Router Cache.

```tsx
import Link from 'next/link';

<Link href="/dashboard" className="text-blue-600 hover:underline">
  Dashboard
</Link>

// Disable prefetch for low-value links (e.g. footer)
<Link href="/legal/terms" prefetch={false}>Terms</Link>

// Force a fresh fetch (ignore Router Cache)
<Link href="/orders" prefetch>Orders</Link>
```

Plain `<a href>` triggers a full document navigation — drops React state, refetches everything. Use it only for external links or intentional reloads.

## `next/script`

Third-party scripts. Pick the strategy by what the script needs:

```tsx
import Script from 'next/script';

// Defer until after page becomes interactive — analytics, error tracking
<Script src="https://cdn.example.com/analytics.js" strategy="afterInteractive" />

// Defer until idle — chat widgets, marketing pixels
<Script src="https://widget.example.com/chat.js" strategy="lazyOnload" />

// Block until loaded — only for scripts the page cannot render without
<Script src="https://maps.example.com/api.js" strategy="beforeInteractive" />
```

Default to `afterInteractive`. Reach for `beforeInteractive` only when something visible breaks without it.

## Suspense + streaming

Streaming lets the shell render before slow data resolves. Wrap any independently slow Server Component subtree in `<Suspense>`:

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { RecentActivity } from './recent-activity';
import { Stats } from './stats';

export default function DashboardPage() {
  return (
    <main>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Suspense fallback={<div className="h-32 animate-pulse rounded bg-gray-100" />}>
        <Stats />
      </Suspense>
      <Suspense fallback={<p>Loading recent activity…</p>}>
        <RecentActivity />
      </Suspense>
    </main>
  );
}
```

Each Suspense boundary streams independently. The `loading.tsx` file is just a Suspense boundary one level up.

## Dynamic imports

Code-split Client Components that are large or rarely visible.

```tsx
import dynamic from 'next/dynamic';

// Heavy chart library — only load when this component mounts
const RevenueChart = dynamic(() => import('./revenue-chart'), {
  loading: () => <p>Loading chart…</p>,
  ssr: false, // skip on the server when SSR isn't useful (canvas, charts)
});
```

`ssr: false` is **only valid in Client Components**. From a Server Component, omit it.

For Server Components, plain `import` is already optimal — splitting happens via the Suspense boundary, not `dynamic()`.

## Bundle hygiene

- `npx next build && npx @next/bundle-analyzer` (or set up `@next/bundle-analyzer`) — look at the **client** bundles.
- Search for `"use client"` in files that don't actually need it. Each one expands the client tree.
- Replace `lodash` with `lodash-es` named imports, or scoped packages (`lodash.debounce`).
- Replace `moment` with `date-fns` (named imports) or `dayjs`.
- Replace `react-icons` whole-package imports with the per-icon path.
- Avoid client-side parsing of large JSON — fetch/parse on the server, pass derived data.
- Tree-shake icon libraries with `modularizeImports` in `next.config`.

## Core Web Vitals targets

- **LCP < 2.5s** — `priority` on hero image; preload critical fonts; static or ISR for landing.
- **CLS < 0.1** — always set `width`/`height` on images; reserve ad slots; avoid late-injected banners.
- **INP < 200ms** — keep client bundles small, defer non-critical scripts, avoid heavy `useEffect` chains.

## DO

- Use `next/image` for every raster image. Always provide `alt`, `width`/`height` or `fill` + `sizes`.
- Use `next/font` with explicit `subsets` and `display: 'swap'`.
- Use `next/link` for in-app navigation.
- Default third-party `<Script>` to `afterInteractive`.
- Wrap independently slow Server Components in `<Suspense>` so the shell streams.
- Run a production build and inspect the bundle before shipping a perf-sensitive change.

## DON'T

- Don't use `<img>` for content images on Next.js routes.
- Don't ship `priority` on every image — it forces eager loading and tanks the loading budget.
- Don't import the full lodash or moment in a Client Component.
- Don't use `dynamic(..., { ssr: false })` from a Server Component — it's a runtime error.
- Don't rely on `next dev` numbers for perf decisions — caching, minification, and font optimization differ in production.
- Don't add `<Suspense>` around something that finishes in <50ms — the boundary itself has overhead.
