# Data Fetching & Caching

Consolidates fetching strategy and cache reasoning — in practice every
`fetch` call needs its cache option chosen in the same breath as its
placement, so these are treated as one topic.

## Default: fetch in the Server Component that renders the data

Move the fetch as close as possible to the consumer. No prop-drilling fetched data through three layers.

```tsx
// app/orders/[id]/page.tsx
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { OrderSummary } from './order-summary';
import { OrderItems } from './order-items';

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const { id } = parsed.data;

  // Parallel — fire both immediately, await once.
  const [order, items] = await Promise.all([
    getOrder(id),
    getOrderItems(id),
  ]);

  if (!order) notFound();

  return (
    <main className="space-y-6">
      <OrderSummary order={order} />
      <OrderItems items={items} />
    </main>
  );
}

async function getOrder(id: string) {
  const res = await fetch(`${process.env.API_URL}/orders/${id}`, {
    headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
    next: { tags: [`order:${id}`], revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getOrder failed: ${res.status}`);
  return res.json();
}

async function getOrderItems(id: string) {
  const res = await fetch(`${process.env.API_URL}/orders/${id}/items`, {
    headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
    next: { tags: [`order:${id}`, `order:${id}:items`], revalidate: 60 },
  });
  if (!res.ok) throw new Error(`getOrderItems failed: ${res.status}`);
  return res.json();
}
```

Match the endpoint's path, envelope, and field names to its
`docs/contracts/*.contract.md` file (see `SKILL.md`), not a guess.

## The four caches

Next.js has **four** distinct caches. Knowing which one you're hitting is the difference between a bug and a feature.

| Cache | Scope | Where | Lifetime | Invalidated by |
|---|---|---|---|---|
| **Request Memoization** | Single request, single render | React | One render | Render finishes — automatic, no API |
| **Data Cache** | All requests, all users | Server (persistent — disk on Vercel, filesystem on self-host) | Until revalidated | `revalidateTag`, `revalidatePath`, time-based `revalidate`, `cache: 'no-store'` (skips it) |
| **Full Route Cache** | All requests | Server | Until the route's data revalidates or you redeploy | Same as Data Cache (built on top of it) |
| **Router Cache** | One user's browser session | Client | Until navigation away (a few minutes) | `router.refresh()`, `revalidatePath` (signals it), `staleTimes` config |

### Request Memoization
Same `fetch(url, opts)` called twice in one render → one network call. Free, automatic, no opt-out needed. This is why fetching the same data in two sibling Server Components is fine — you get one network call, and it removes the need for a top-level "fetch once and prop-drill" pattern.

### Data Cache
Persistent server cache. Backs every `fetch` whose options allow caching. **This is what `revalidateTag` and `revalidatePath` invalidate.**

### Full Route Cache
A Server Component's rendered output. If a route is fully static — no dynamic APIs (`cookies()`, `headers()`, uncached `fetch`, dynamic `params`) — Next builds it once and serves the same HTML and RSC payload to everyone.

### Router Cache
Client-side cache of RSC payloads keyed by route. When the user clicks `<Link>` to go back, Next serves the cached payload instead of a server round-trip. This cache is **per-browser, per-tab** — not a server cache.

## Next 14 vs Next 15: the default that bites people

| | Next 14 | Next 15 |
|---|---|---|
| `fetch()` default | **Cached** (force-cache) | **Uncached** (no-store) |
| Route Handler default | Cached when no dynamic APIs | **Uncached** by default |
| `params`, `searchParams`, `cookies()`, `headers()` | Sync | **Async (Promise)** |

**Always check `package.json` for the Next major version.** Then set the cache option explicitly — never rely on the default for production data.

## Choose `cache` / `revalidate` / `tags` deliberately

| Need | Setting |
|---|---|
| Per-request (cookies, auth, real-time) | `{ cache: 'no-store' }` |
| Static, never changes | `{ cache: 'force-cache' }` (Next 14: default) |
| ISR, time-based | `{ next: { revalidate: 60 } }` |
| ISR, on-demand via tag | `{ next: { tags: ['posts'] } }` + `revalidateTag('posts')` after mutation |

```ts
// Per-request data — always fresh
fetch(url, { cache: 'no-store' });

// Static — cache forever, only updates on rebuild
fetch(url, { cache: 'force-cache' });

// ISR — time-based revalidation
fetch(url, { next: { revalidate: 60 } });

// Tagged — on-demand revalidation
fetch(url, { next: { tags: ['posts', `post:${id}`] } });

// Combined — tagged + time floor
fetch(url, { next: { tags: ['posts'], revalidate: 300 } });
```

## Setting cache behavior on a route segment

Place these exports at the top of `page.tsx`, `layout.tsx`, or `route.ts`:

```ts
// Force everything in this segment to be dynamic
export const dynamic = 'force-dynamic';

// Or: force-static, error (fail build if dynamic API used), auto (default)
export const dynamic = 'force-static';

// Time-based revalidation for the whole segment
export const revalidate = 60; // seconds, or false for never

// Force the runtime
export const runtime = 'nodejs'; // or 'edge'

// Force fetchCache behavior for the segment
export const fetchCache = 'default-cache'; // override per-fetch defaults
```

`force-dynamic` is the right call for any page that depends on the user's session, cookies, or per-request input.

## Validate everything that enters

Treat `params`, `searchParams`, request bodies, and external API responses as untrusted. Validate with Zod (or the project's chosen schema lib) at the boundary.

```ts
// src/server/posts.ts
import 'server-only';
import { z } from 'zod';

const postSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  publishedAt: z.string().datetime(),
});

export type Post = z.infer<typeof postSchema>;

export async function getPost(id: string): Promise<Post | null> {
  const res = await fetch(`${process.env.API_URL}/posts/${id}`, {
    next: { tags: [`post:${id}`], revalidate: 300 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getPost failed: ${res.status}`);
  return postSchema.parse(await res.json());
}
```

## Avoid waterfalls

The most common Next.js performance bug: sequential `await`s that could have run in parallel.

```tsx
// ❌ Waterfall — second fetch waits for the first
const user = await getUser(id);
const orders = await getOrdersForUser(id);

// ✅ Parallel — both start at once
const [user, orders] = await Promise.all([
  getUser(id),
  getOrdersForUser(id),
]);
```

If a child Server Component fetches independently, render it inside `<Suspense>` instead of awaiting in the parent — that lets the rest of the page stream:

```tsx
// app/users/[id]/page.tsx
import { Suspense } from 'react';
import { UserHeader } from './user-header';
import { UserOrders } from './user-orders';

export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main>
      <UserHeader id={id} /> {/* Server Component, awaits its own fetch */}
      <Suspense fallback={<p>Loading orders…</p>}>
        <UserOrders id={id} /> {/* streams in independently */}
      </Suspense>
    </main>
  );
}
```

## Route Handler vs Server Action

| Pick this | When |
|---|---|
| **Server Action** | Form submissions and button clicks **from your own UI**. You want progressive enhancement, automatic CSRF, and `revalidatePath` / `revalidateTag` after the mutation. |
| **Route Handler** | Webhooks, third-party callbacks, public REST/JSON APIs, mobile clients, anything called from outside this Next.js app. Also: streaming responses (SSE), file downloads, OAuth callbacks. |

If you find yourself writing `fetch('/api/posts', { method: 'POST' })` from a Client Component to mutate **your own** data, you almost certainly want a Server Action instead.

## Revalidating after a mutation

Always revalidate after a successful write. Pick the smallest blast radius that covers the affected views.

```ts
// app/posts/actions.ts
'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

export async function publishPost(id: string) {
  await db.post.update({ where: { id }, data: { publishedAt: new Date() } });

  // Invalidate every fetch tagged with these
  revalidateTag('posts');           // index/list pages
  revalidateTag(`post:${id}`);      // detail page

  // Or invalidate by route path
  revalidatePath('/posts');
  revalidatePath(`/posts/${id}`);

  // For dynamic segments, hit the layout level
  revalidatePath('/posts/[id]', 'page');
}
```

`revalidateTag` is usually preferable: tag your fetches once, target many routes from one call.

## Designing tags

A tag should describe what the data **is**, not where it's used. Two strong patterns:

```ts
// Collection + entity
fetch('/api/posts',     { next: { tags: ['posts'] } });
fetch(`/api/posts/${id}`, { next: { tags: [`post:${id}`, 'posts'] } });

// User-scoped
fetch(`/api/me/orders`, { next: { tags: [`user:${userId}:orders`] } });
```

After `db.post.update({ id })`:
```ts
revalidateTag(`post:${id}`); // detail
revalidateTag('posts');      // any list
```

## Static vs dynamic vs ISR — which one am I building?

| You want | Use | Notes |
|---|---|---|
| Marketing pages, blog posts, docs | Static | Default in App Router when no dynamic APIs are used. |
| Per-user dashboard, anything reading cookies | Dynamic (`force-dynamic` or implicit via `cookies()`) | No Full Route Cache; Data Cache still applies to individual fetches. |
| Public content that changes occasionally | ISR (`revalidate: N` or tagged + on-demand) | Best of both — fast like static, fresh like dynamic. |
| Public REST API | Route Handler with explicit `dynamic = 'force-dynamic'` or `cache: 'no-store'` | Defaults vary by Next version. |

## Reading the cache: what is actually happening?

Symptoms and the most likely cache:

- **"My update doesn't show until I hard-refresh."** → Router Cache (browser). After a Server Action, call `revalidatePath` so Next signals the client to discard the cached RSC payload. If you fetched manually, call `router.refresh()`.
- **"Tags aren't invalidating."** → The fetch isn't tagged, or you tagged a different string. Tags are case-sensitive exact matches. Log the tag at fetch time.
- **"My route is rendering once and never updating."** → Full Route Cache. The route is fully static. Either tag the underlying fetch + call `revalidateTag`, or make the route dynamic.
- **"Production is slow but dev is fast."** → Inverted: dev disables most caching. Test caching behavior with `next build && next start`.

## DO

- Co-locate fetches with the component that uses them.
- Set explicit cache behavior on every `fetch` that hits an external service.
- Tag fetches with `entity` and `entity:id` patterns so mutations can target them.
- Call `revalidateTag` / `revalidatePath` after every successful mutation.
- Parallelize independent fetches with `Promise.all`.
- Stream slow children with `<Suspense>` instead of blocking the page.
- Validate `params`, `searchParams`, request bodies, and external API responses with Zod.
- Test caching with a production build (`next build && next start`), not `next dev`.
- Verify the Next major version before assuming defaults.

## DON'T

- Don't fetch in `useEffect` for data a Server Component could fetch.
- Don't cache per-user data without a per-user tag or `cache: 'no-store'`. Leaking another user's dashboard is a data breach.
- Don't rely on `router.refresh()` to "fix" stale data — invalidate the source via `revalidateTag`.
- Don't tag with derived strings the mutation can't reproduce (e.g., `posts-${query.join(',')}`). Pick stable tags.
- Don't put `cache: 'no-store'` everywhere "to be safe" — you lose Request Memoization benefits and slow the app.
- Don't mix `cache: 'force-cache'` with `next.revalidate` — `next.revalidate` already implies caching.
- Don't `await` fetches sequentially when they don't depend on each other.
- Don't pass full DB rows to Client Components if only a few fields are needed.
- Don't trust external API shapes — parse with a schema.
