# Common Pitfalls

## 1. Hydration mismatch

**Symptom:** "Text content does not match server-rendered HTML" warning. UI flickers on first paint.

**Causes (most common first):**
- Rendering `Date.now()`, `Math.random()`, `new Date()`, or browser locale formatting in the initial render.
- Branching on `typeof window !== 'undefined'` for the initial markup.
- Reading `localStorage` / `sessionStorage` in render.
- Rendering different content for desktop vs mobile based on a window check, instead of CSS.
- Browser extensions (Grammarly) injecting attributes — usually harmless; can suppress on `<body>` with `suppressHydrationWarning`.
- Incorrect HTML nesting (`<p><div>…</div></p>`, `<a><a>…</a></a>`).

**Fix:**

```tsx
// ❌ — server renders "12:34", client renders "12:35"
<span>{new Date().toLocaleTimeString()}</span>

// ✅ — render once on the client
'use client';
import { useEffect, useState } from 'react';

export function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    setNow(new Date().toLocaleTimeString());
  }, []);
  return <span>{now ?? ''}</span>;
}
```

For "different on server vs client" content (themes, timezone-aware formatting), render a stable initial value and update after mount.

## 2. Stale UI after a mutation

**Symptom:** User saves something; UI shows the old value until they hard-refresh.

**Cause:** No `revalidatePath` / `revalidateTag` after the write. The Data Cache and/or Router Cache are still serving the old value.

**Fix:** Tag fetches, revalidate after writes (see `data-fetching-and-caching.md`):

```ts
// in the Server Action
revalidateTag(`order:${id}`);
revalidatePath('/orders');
```

If you're using `fetch('/api/...')` from a Client Component instead of a Server Action, call `router.refresh()` after the response. Better: convert it to a Server Action.

## 3. `"use client"` leakage

**Symptom:** Client bundle balloons; a leaf-looking component drags 200 KB of dependencies.

**Cause:** A high-up component has `"use client"`. Every descendant is now in the client bundle.

**Diagnose:**

```bash
# Build, then inspect
npx next build
# Look at the route's First Load JS in the build output.
# Set up @next/bundle-analyzer for a visual breakdown.
```

Search for `"use client"` in files where it shouldn't be — `page.tsx`, `layout.tsx`, large composites that should be Server.

**Fix:** Move `"use client"` to the smallest leaf. Use the children-pattern (see `routing-and-rendering.md`) to keep the surrounding tree on the server.

## 4. Fetch waterfalls

**Symptom:** Slow page loads. Network tab shows requests starting one at a time.

**Cause:** Sequential `await`s in a Server Component:

```ts
// ❌ — order is fetched, then items, then user
const order = await getOrder(id);
const items = await getOrderItems(id);
const user = await getUser(order.userId);
```

**Fix:** Parallelize independent fetches; only chain when the next call genuinely needs the prior result:

```ts
const [order, items] = await Promise.all([getOrder(id), getOrderItems(id)]);
const user = await getUser(order.userId); // depends on order
```

Or stream slow children with `<Suspense>` so the parent doesn't block.

## 5. Trying to use `request` / `response` objects in a Server Component

**Symptom:** "next/headers" error or "Headers cannot be modified."

**Cause:** Server Components can **read** cookies/headers but cannot **set** response headers. They don't have access to a mutable response object.

**Fix:**
- Read cookies/headers via `next/headers` (`cookies()`, `headers()` — async in Next 15).
- Set cookies/headers from a Server Action (`cookies().set(...)`), Route Handler, or middleware.

```ts
// In a Server Component (read only)
import { cookies, headers } from 'next/headers';
const c = await cookies();
const sessionId = c.get('session')?.value;

// In a Server Action (write)
'use server';
import { cookies } from 'next/headers';
export async function login(token: string) {
  const c = await cookies();
  c.set('session', token, { httpOnly: true, secure: true, sameSite: 'lax' });
}
```

## 6. Dynamic API misuse — accidentally opting into dynamic rendering

**Symptom:** A page you expected to be static is being rendered on every request, slowing things down.

**Cause:** Calling a dynamic function inside the page or any Server Component it renders:
- `cookies()` / `headers()` / `draftMode()`
- Reading `searchParams` (in Next 15, this also makes the page dynamic)
- `fetch` with `cache: 'no-store'` or `next: { revalidate: 0 }`

**Fix:** If the page should be static:
- Move per-user logic into a Client Component or a Suspense-wrapped child that uses `cookies()`.
- Use `revalidate` instead of `no-store` if you only need ISR.
- Remove `searchParams` reads from segments that should be static; pass them via Client Component props.

If the page genuinely depends on the request, accept dynamic rendering and tighten the rest of the page (cache the data, stream the slow parts).

## 7. Caching per-user data globally

**Symptom:** User A sees User B's dashboard. Hard to reproduce — appears under load.

**Cause:** A `fetch` for per-user data was tagged or cached with a global key, not a per-user key.

**Fix:**

```ts
// ❌
fetch('/api/me', { next: { tags: ['me'] } });

// ✅ — per-user tag
fetch(`/api/users/${userId}`, { next: { tags: [`user:${userId}`] } });

// or — opt out entirely for session-scoped data
fetch('/api/me', { cache: 'no-store' });
```

Audit every cached fetch: is the cache key user-scoped if the data is user-specific?

## 8. Server Action callable as a public API

**Symptom:** Someone notices `/_next/.../action_id` endpoints and calls them directly.

**Cause:** Server Actions are exposed to the client by design. Without auth checks inside the action, they're a public mutation endpoint.

**Fix:** Authenticate inside the action, even if the page route is protected:

```ts
'use server';
import { auth } from '@/server/auth';

export async function deletePost(id: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  // Authorize: owner-only delete
  await db.post.delete({ where: { id, authorId: session.user.id } });
}
```

## 9. `dynamic` import with `ssr: false` from a Server Component

**Symptom:** Build error: "ssr: false is not allowed in Server Components."

**Cause:** `next/dynamic`'s `ssr: false` only works from Client Components.

**Fix:** Wrap the consumer in a Client Component:

```tsx
// app/charts.tsx
'use client';
import dynamic from 'next/dynamic';
const Chart = dynamic(() => import('./chart'), { ssr: false });
export function Charts() { return <Chart />; }
```

## 10. `process.env.X` returning `undefined` on the client

**Symptom:** A client-side log shows `undefined` for what looks like a configured env var.

**Cause:** Only env vars prefixed `NEXT_PUBLIC_` are inlined into client bundles. Everything else is server-only.

**Fix:**
- Public values (site URL, public API keys): rename to `NEXT_PUBLIC_*`.
- Secrets: keep server-side; expose only what the client needs through a Server Component prop, Server Action result, or Route Handler response.

## 11. "Works in dev, breaks in prod"

**Symptom:** Bug that doesn't reproduce with `next dev`.

**Likely causes:**
- Caching: dev disables most caches. Test with `next build && next start`.
- Code stripping: `process.env.NODE_ENV === 'production'` branches behave differently.
- Strict-mode double-renders: dev double-invokes effects in strict mode; prod does not. If a hook depends on running once, it's a bug — fix it.
- Image / font optimization: production rewrites assets, dev sometimes serves them raw.

Always smoke-test with a production build before deploying.

## 12. `useEffect` for data fetching in Server Component world

**Symptom:** Loading spinner on every page navigation, even for data that could have been pre-fetched.

**Cause:** Initial data was fetched in `useEffect` instead of a Server Component.

**Fix:** Move the fetch to the Server Component that renders the data. If the data legitimately needs to be re-fetched after mount (polling, real-time, user-driven refresh), keep `useEffect` but seed the initial state from a Server Component prop.

## 13. Nested/chained route mismatched at the client only

**Symptom:** The frontend renders a detail page fine for one parent/child pairing but silently shows another parent's child data, or crashes only for certain IDs.

**Cause:** The client-side route or fetch call didn't pass both ID segments from the URL (e.g., dropped the parent ID and only sent the child ID), so the backend's chained-ownership check (see `../owasp-security/SKILL.md` section 1) either wasn't exercised the way the UI implies, or the UI is combining/deriving an ID incorrectly before calling the API.

**Fix:** Pass every path segment through explicitly from the dynamic route params to the fetch call — never reconstruct or infer one ID from the other on the client.

## DO

- Test with a production build before assuming caching works.
- Tag every cacheable fetch with a stable, scoped tag.
- Authenticate inside Server Actions, not just on the route.
- Search for `"use client"` audit hygiene in PR review.
- Use `Promise.all` for independent fetches.

## DON'T

- Don't ship unverified hydration warnings — every one is a real bug or suppression.
- Don't cache user-scoped data with a global tag.
- Don't `useEffect` for data the server could provide.
- Don't trust dev-only behavior — caching, strict mode, and minification differ in prod.
- Don't expose secrets via `NEXT_PUBLIC_*`.
