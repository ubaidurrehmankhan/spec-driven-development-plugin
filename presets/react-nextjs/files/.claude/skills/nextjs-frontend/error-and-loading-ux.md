# Error & Loading UX

## File roles, recapped

| File | Purpose | Boundary |
|---|---|---|
| `loading.tsx` | Implicit Suspense fallback for the segment | Server |
| `error.tsx` | Error boundary for the segment | **Client** (`"use client"` required) |
| `global-error.tsx` | Replaces the **root layout** when the root throws | **Client**, must define its own `<html>`/`<body>` |
| `not-found.tsx` | Renders when `notFound()` is called or a route 404s | Server |

## `loading.tsx`

Place at the segment level. Next wraps `page.tsx` (and nested segments below it) in `<Suspense fallback={Loading}>` automatically.

```tsx
// app/orders/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
      <div className="h-32 w-full animate-pulse rounded bg-gray-100" />
      <div className="h-32 w-full animate-pulse rounded bg-gray-100" />
    </div>
  );
}
```

Make the skeleton resemble the final layout — same widths, same spacing — to avoid a layout shift when the content arrives.

## Granular streaming with `<Suspense>`

`loading.tsx` covers the whole segment. For finer streaming (slow part loads independently of fast part), use explicit `<Suspense>` boundaries inside the page:

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { Greeting } from './greeting';   // fast — synchronous
import { Stats } from './stats';         // slow — fetches metrics
import { Activity } from './activity';   // slow — fetches activity feed

export default function DashboardPage() {
  return (
    <main className="space-y-6 p-6">
      <Greeting />
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>
      <Suspense fallback={<ActivitySkeleton />}>
        <Activity />
      </Suspense>
    </main>
  );
}
```

## `error.tsx`

Catches errors thrown during render of the segment's `page.tsx` or descendants. Must be a Client Component because it needs `useEffect` (to log the error) and event handlers (to retry).

```tsx
// app/orders/error.tsx
'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

export default function OrdersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Orders route error', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h2 className="text-lg font-semibold">Something went wrong loading your orders.</h2>
      <p className="mt-2 text-sm text-gray-600">
        We've logged the issue. You can retry, or reach out if it keeps happening.
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded bg-black px-4 py-2 text-sm text-white"
      >
        Try again
      </button>
    </div>
  );
}
```

Notes:
- `error.digest` is a stable hash — log it, support staff can grep server logs by it.
- The actual error message is **redacted in production**. Do not surface `error.message` to users.
- `reset()` retries the segment by re-rendering it.
- `error.tsx` does **not** catch errors thrown in the segment's own `layout.tsx` — those bubble up to a parent boundary (or `global-error.tsx`).

## `global-error.tsx`

The root layout's last line of defense. Renders a full HTML document because the root layout itself failed.

```tsx
// app/global-error.tsx
'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Something went wrong.</h2>
          <button
            onClick={reset}
            className="mt-4 rounded bg-black px-4 py-2 text-sm text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
```

Only fires in production. In dev, root errors render the standard Next.js error overlay.

## `notFound()`

For "this resource doesn't exist." Throws a special signal that renders the nearest `not-found.tsx`.

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

  return <article>…</article>;
}
```

```tsx
// app/posts/[slug]/not-found.tsx
import Link from 'next/link';

export default function PostNotFound() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h2 className="text-lg font-semibold">Post not found</h2>
      <p className="mt-2 text-sm text-gray-600">It may have been deleted or moved.</p>
      <Link href="/posts" className="mt-4 inline-block text-blue-600 hover:underline">
        Back to all posts
      </Link>
    </div>
  );
}
```

`notFound()` is also valid inside Route Handlers and Server Actions — but the response code is 404 only when called from a Server Component during render.

Use `notFound()` for a chained-ownership mismatch too (see
`../owasp-security/SKILL.md` section 1) — a child ID that exists but doesn't
belong to the parent in the URL should read as "not found," the same as a
child ID that doesn't exist at all. Don't leak the distinction in the UI.

## Error categorization

| Error type | What to do |
|---|---|
| Validation error (user input) | Don't throw. Return a typed error state from your Server Action and render it under the input. |
| Resource not found | `notFound()` from the Server Component. |
| Auth required | `redirect('/login')` from the Server Component (or middleware). |
| Server failure | Throw. `error.tsx` will catch. |
| Programmer bug | Throw. Same. |

## DO

- Place `loading.tsx` at every segment that fetches.
- Place `error.tsx` at every segment that fetches — don't rely on a higher boundary catching everything.
- Log `error.digest` so support can correlate with server logs.
- Use `notFound()` instead of returning a "Not found" component — keeps SEO and status codes correct.
- Make skeletons match the final layout's dimensions to prevent CLS.

## DON'T

- Don't omit `'use client'` from `error.tsx` or `global-error.tsx`.
- Don't render `error.message` in production — it's already redacted, and surfacing it hides a real fix.
- Don't try/catch `notFound()` or `redirect()` — they throw on purpose to short-circuit the render.
- Don't use `error.tsx` to catch validation errors — those belong in the form's own state.
- Don't wrap every Server Component in `<Suspense>`. Use it where the wait is long enough for streaming to matter (>200ms).
