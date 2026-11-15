# Metadata & SEO

## Static metadata

Export a `Metadata` object from `layout.tsx` or `page.tsx`. Children inherit and can override.

```ts
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://example.com'),
  title: {
    default: 'Acme — Industrial widgets, delivered',
    template: '%s · Acme',
  },
  description: 'Custom-machined widgets for industrial buyers. Made in Hamburg.',
  openGraph: {
    type: 'website',
    siteName: 'Acme',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@acme',
  },
  robots: {
    index: true,
    follow: true,
  },
};
```

`metadataBase` is **required** for relative URLs in `openGraph.images`, `twitter.images`, and the sitemap to resolve correctly. Set it once at the root.

`title.template` automatically wraps child titles: a child page that exports `title: 'Pricing'` becomes `Pricing · Acme`.

## Dynamic metadata with `generateMetadata`

For routes whose metadata depends on the data (post titles, product names, OG images), export `generateMetadata`. It receives the same `params`/`searchParams` as the page.

```ts
// app/posts/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPostBySlug } from '@/lib/posts';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    alternates: {
      canonical: `/posts/${slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author.name],
      url: `/posts/${slug}`,
      images: [
        {
          url: post.coverImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage],
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();
  return <article>…</article>;
}
```

The `getPostBySlug` call here and the call in `PostPage` are **deduplicated by Request Memoization** — same fetch, same render, one network call. Co-locating both is fine.

## Generated `opengraph-image` and `twitter-image`

Drop a file named `opengraph-image.tsx` (or `.png`/`.jpg`) into the same folder as `page.tsx` and Next wires it up automatically. The dynamic version uses React + Edge runtime to render an OG image at request time.

```tsx
// app/posts/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import { getPostBySlug } from '@/lib/posts';

export const runtime = 'edge';
export const alt = 'Post preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: 'white',
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 700, color: '#111' }}>
          {post?.title ?? 'Acme'}
        </div>
        <div style={{ marginTop: 24, fontSize: 28, color: '#666' }}>
          {post?.author.name ?? 'acme.example'}
        </div>
      </div>
    ),
    { ...size },
  );
}
```

Note: in `opengraph-image.tsx`, `params` is **not** a Promise (it's the special metadata route handler signature, distinct from the page convention).

## `robots.ts`

```ts
// app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://example.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/draft/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
```

## `sitemap.ts`

```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { listPosts } from '@/lib/posts';

const BASE_URL = 'https://example.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listPosts({ limit: 1000 });

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
  ];

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE_URL}/posts/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...postRoutes];
}
```

For sites with >50,000 URLs, return an array of sitemap indexes via the multi-sitemap variant.

## Canonical URLs

Always set `alternates.canonical` for any page reachable via multiple URLs (with/without trailing slash, query strings, pagination):

```ts
return {
  alternates: {
    canonical: `/posts/${slug}`,
    languages: {
      'en-US': `/en/posts/${slug}`,
      'de-DE': `/de/posts/${slug}`,
    },
  },
};
```

## Structured data (JSON-LD)

Render JSON-LD with a `<script>` tag in the page itself. Don't try to put it in `metadata`.

```tsx
// app/posts/[slug]/page.tsx
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.publishedAt,
    author: { '@type': 'Person', name: post.author.name },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>…</article>
    </>
  );
}
```

## DO

- Set `metadataBase` once on the root layout.
- Use `title.template` for site-wide title suffixes.
- Use `generateMetadata` for dynamic routes; rely on Request Memoization to avoid double-fetching.
- Set `alternates.canonical` on every public page.
- Provide a `sitemap.ts` and `robots.ts` for any site you want indexed.
- Provide OG images at 1200×630.

## DON'T

- Don't hand-roll `<head>` tags inside `layout.tsx` — use the `Metadata` API.
- Don't return relative `openGraph.images` URLs without `metadataBase` set.
- Don't ship JSON-LD via `dangerouslySetInnerHTML` of an unsanitized template — `JSON.stringify` is the safe path.
- Don't put `noindex: true` on production routes by accident — verify `robots` after every deploy.
- Don't forget to update the sitemap when a content type is added.
