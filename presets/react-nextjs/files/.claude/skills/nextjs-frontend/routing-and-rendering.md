# Routing, File Conventions & the Server/Client Boundary

Consolidates two closely related decisions: which special file governs a
piece of UI, and whether that UI is a Server or Client Component.

## Part 1 — File-name contract

Every special filename inside `app/` has a fixed role. Do not invent variants — Next.js only recognizes these names.

| File | Role | Default boundary |
|---|---|---|
| `page.tsx` | Public route segment. Required to make a route addressable. | Server Component |
| `layout.tsx` | Wraps `page.tsx` + children. Persists across navigation. | Server Component |
| `template.tsx` | Like `layout`, but re-mounts on navigation. Use only when state must reset. | Server Component |
| `loading.tsx` | Suspense fallback for the segment. | Server Component |
| `error.tsx` | Error boundary for the segment. **Must be a Client Component**. | Client Component (`"use client"`) |
| `global-error.tsx` | Replaces the root layout when the root throws. **Must be a Client Component**. | Client Component |
| `not-found.tsx` | UI for `notFound()` calls within the segment. | Server Component |
| `route.ts` | HTTP handler (GET/POST/…). Cannot coexist with `page.tsx` in the same folder. | Server (Node or Edge) |
| `default.tsx` | Fallback for unmatched parallel route slots. | Server Component |

## Route segments

```
app/
├── layout.tsx                  // root layout, defines <html>/<body>
├── page.tsx                    // /
├── (marketing)/                // route group — does not affect URL
│   ├── page.tsx                // /
│   └── pricing/page.tsx        // /pricing
├── dashboard/
│   ├── layout.tsx              // /dashboard/*
│   ├── page.tsx                // /dashboard
│   ├── loading.tsx
│   ├── error.tsx               // "use client"
│   └── settings/page.tsx       // /dashboard/settings
├── posts/
│   └── [slug]/
│       ├── page.tsx            // /posts/:slug
│       └── opengraph-image.tsx
└── api/
    └── webhooks/stripe/route.ts // POST /api/webhooks/stripe
```

## Dynamic segments

Use `[param]`, `[...slug]` (catch-all), `[[...slug]]` (optional catch-all).

In **Next 15**, `params` is async — always `await` it.

```tsx
// app/posts/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { getPostBySlug } from '@/lib/posts';

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
    </article>
  );
}
```

## Static generation with `generateStaticParams`

Use this to pre-render dynamic routes at build time. It replaces `getStaticPaths`.

```tsx
// app/posts/[slug]/page.tsx
import { listPostSlugs } from '@/lib/posts';

export async function generateStaticParams() {
  const slugs = await listPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

// Optional: behavior for slugs not returned above
export const dynamicParams = true; // default — generate on demand
// export const dynamicParams = false; // 404 on unknown slugs
```

## Route handlers

`route.ts` exports HTTP method handlers. Always validate input against the
endpoint's contract shape (see `SKILL.md`'s contract dependency note) and set
explicit cache behavior.

```ts
// app/api/posts/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listPosts, createPost } from '@/server/posts';

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});

export const dynamic = 'force-dynamic'; // never cache the list

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? 20);
  const posts = await listPosts({ limit });
  return NextResponse.json(posts);
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = createPostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const post = await createPost(parsed.data);
  return NextResponse.json(post, { status: 201 });
}
```

## Route groups

`(name)` folders organize without changing the URL. Use them to scope a different layout to a subset of routes (e.g., marketing vs. authenticated app).

```
app/
├── (marketing)/layout.tsx     // public site chrome
├── (marketing)/page.tsx       // /
├── (app)/layout.tsx           // authenticated chrome
└── (app)/dashboard/page.tsx   // /dashboard
```

## Parallel routes

Named slots prefixed `@`. Render multiple pages in one layout; each slot can stream independently.

```
app/dashboard/
├── layout.tsx                 // receives { children, analytics, team } props
├── page.tsx
├── @analytics/
│   ├── default.tsx            // required fallback
│   └── page.tsx
└── @team/
    ├── default.tsx
    └── page.tsx
```

```tsx
// app/dashboard/layout.tsx
export default function DashboardLayout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode;
  analytics: React.ReactNode;
  team: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-6">
      <section className="col-span-3">{children}</section>
      <section>{analytics}</section>
      <section className="col-span-2">{team}</section>
    </div>
  );
}
```

`default.tsx` is **required** in each parallel slot for navigations that don't target it — otherwise the slot 404s.

## Intercepting routes

`(.)`, `(..)`, `(..)(..)`, `(...)` intercept a route to render it in the current layout (e.g., a modal that shares its URL with a full page).

```
app/
├── feed/page.tsx
└── feed/
    └── (..)photo/[id]/page.tsx   // intercepts /photo/:id when navigated from /feed
└── photo/[id]/page.tsx           // full page when navigated to directly
```

Pair with parallel routes (`@modal`) to keep the intercepted view in a slot.

---

## Part 2 — Server vs Client Components

### The default is Server

Every component under `app/` is a Server Component unless it (or an ancestor in the import graph) starts with `"use client"`. Server Components:

- Render on the server, never ship JS for themselves to the client.
- Can `await` async work directly (DB, fetch, file system).
- Can read cookies and headers (`next/headers`).
- **Cannot** use `useState`, `useEffect`, refs, browser-only APIs, event handlers (`onClick`, `onChange`), or React Context as a consumer of a Client-defined provider.

A Client Component is anything you need a hook, an event listener, or a browser API for.

### Where to put `"use client"`

**At the smallest leaf that actually needs interactivity.** Not at the page. Not at the layout. Not "just in case."

```
app/products/[id]/page.tsx        // Server — fetches the product
└─ <ProductDetails />             // Server — composes the view
   ├─ <PriceBlock price={…} />    // Server — pure display
   ├─ <RelatedItems />            // Server — fetches related list
   └─ <AddToCartButton id={…} />  // Client ← "use client" lives here
```

Once a file has `"use client"`, **every component imported from it is in the client bundle**, and any descendant rendered through normal JSX is too. So the cheapest way to keep server-side rendering is to keep `"use client"` on the smallest component that needs it.

### Pass Server nodes through Client trees as children

A Client Component cannot import a Server Component. But it can **render** one if the Server node is passed as `children` (or any prop) from a server parent:

```tsx
// app/dashboard/page.tsx (Server)
import { ClientShell } from './client-shell';
import { ServerStats } from './server-stats';

export default function DashboardPage() {
  return (
    <ClientShell>
      <ServerStats /> {/* still Server-rendered */}
    </ClientShell>
  );
}
```

```tsx
// app/dashboard/client-shell.tsx
'use client';
import { useState } from 'react';

export function ClientShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show'}</button>
      {open && <div className="rounded border p-4">{children}</div>}
    </div>
  );
}
```

This is the single most useful pattern for keeping the client bundle small while still using interactivity.

### Enforce the boundary with `server-only` / `client-only`

Install once: `npm i server-only client-only`.

Mark sensitive server modules so a wayward import into a Client Component fails the build:

```ts
// src/server/db.ts
import 'server-only';
import { Pool } from 'pg';

export const db = new Pool({ connectionString: process.env.DATABASE_URL });
```

Mark browser-only modules so they can't sneak into Server Components:

```ts
// src/client/analytics.ts
import 'client-only';

export function track(event: string, props?: Record<string, unknown>) {
  window.analytics?.track(event, props);
}
```

### Common boundary mistakes

#### Putting `"use client"` on a page just to use a hook

```tsx
// ❌ The whole page becomes a Client Component
'use client';
import { useState } from 'react';

export default function Page() {
  const [filter, setFilter] = useState('');
  return <input value={filter} onChange={(e) => setFilter(e.target.value)} />;
}
```

```tsx
// ✅ Page stays Server; only the input is Client
// app/page.tsx (Server)
import { Filter } from './filter';

export default function Page() {
  return (
    <div>
      <h1>Catalog</h1>
      <Filter />
    </div>
  );
}

// app/filter.tsx
'use client';
import { useState } from 'react';

export function Filter() {
  const [filter, setFilter] = useState('');
  return <input value={filter} onChange={(e) => setFilter(e.target.value)} />;
}
```

#### Passing non-serializable props from Server to Client

Props crossing the server→client boundary must be serializable. **Functions, class instances, Dates as instances, Maps, Sets** do not cross. (Plain `Date` objects work because Next serializes them; class instances do not.)

```tsx
// ❌ Server → Client: function prop
<ClientButton onClick={() => doStuff()} />

// ✅ Define the handler inside the Client Component, or pass a Server Action reference
import { saveDraft } from './actions';
<ClientButton action={saveDraft} />
```

#### Reading cookies/headers in a Client Component

Cookies and headers are server primitives. From the client, hit a Route Handler or call a Server Action.

## DO

- Put `error.tsx` next to any segment that fetches data — without it the error bubbles to the nearest ancestor.
- Use route groups to share layouts without polluting URLs.
- Always provide `default.tsx` for every parallel slot.
- In Next 15, `await params` and `await searchParams`. Always.
- Use `generateStaticParams` for dynamic routes whose set of values is known at build time.
- Keep `"use client"` at the smallest leaf possible.
- Compose: pass Server nodes into Client Components via `children`.
- Use `server-only` on DB/secrets modules and `client-only` on `window`/`document` modules.
- Co-locate small Client subcomponents next to the Server file that uses them (e.g., `./filter.tsx` in the same folder).

## DON'T

- Don't put a `route.ts` and `page.tsx` in the same folder — the build fails.
- Don't add `"use client"` to `page.tsx` or `layout.tsx` to "make a hook work." Push the client boundary to the leaf component instead.
- Don't read `params` / `searchParams` synchronously in Next 15 — they're `Promise`s.
- Don't catch errors with try/catch in a Server Component just to render fallback UI; let `error.tsx` handle it.
- Don't use `template.tsx` unless you genuinely need state to reset on navigation — it costs a re-mount.
- Don't import a Server Component from a Client Component — pass it as `children` instead.
- Don't pass functions, class instances, or other non-serializable props across the boundary.
- Don't use `useEffect` to fetch initial data when a Server Component could fetch it during render.
- Don't rely on a comment to mark a file as "server only" — use the `server-only` import.
