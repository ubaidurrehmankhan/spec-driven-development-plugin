# Middleware & Auth

## What `middleware.ts` is for

Code that runs **before a request reaches a route handler or page**, on every matching URL. Use it for:

- Auth redirects (logged-out user hitting a protected route)
- Locale detection / rewrite
- A/B routing and feature flags
- Adding/normalizing headers
- Bot or geolocation handling

Not for: rendering UI, accessing the database, anything slow. Middleware runs on the **Edge runtime by default** — no Node.js APIs (`fs`, native crypto), tight memory budget, Web APIs only.

## File structure

```ts
// middleware.ts (project root, NOT inside src/app — though src/middleware.ts works if src/ is your root)
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // …
}

export const config = {
  // Run on everything except static assets and Next internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
```

The `matcher` is checked at compile time — values must be string literals or arrays of literals. No dynamic computation.

## Auth-gating with `middleware`

Cheap auth check (cookie present? signed token valid?) belongs in middleware. Heavy verification (DB lookup, role check) belongs in the page or Server Action.

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);
const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('session')?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  try {
    await jwtVerify(token, SECRET);
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/public).*)'],
};
```

Use `jose` (Web Crypto–compatible) instead of `jsonwebtoken` (Node-only) — middleware is Edge.

## Auth.js v5 (NextAuth)

Auth.js v5 is the App-Router-native rewrite. The minimum setup:

```ts
// auth.ts
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      if (isOnDashboard) return isLoggedIn;
      return true;
    },
  },
});
```

```ts
// app/api/auth/[...nextauth]/route.ts
export { GET, POST } from '@/auth';
```

```ts
// middleware.ts
export { auth as middleware } from '@/auth';

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

Inside Server Components, get the session:

```tsx
// app/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/api/auth/signin');

  return <p>Hello, {session.user?.name}</p>;
}
```

In Server Actions and Route Handlers, call `auth()` the same way.

## Clerk

Clerk's middleware is a one-liner:

```ts
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/settings(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)', '/(api|trpc)(.*)'],
};
```

Inside Server Components:

```tsx
// app/dashboard/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) return null; // middleware already redirected
  const user = await currentUser();
  return <p>Hello, {user?.firstName}</p>;
}
```

## Route protection — defense in depth

Three layers, all of them:

1. **Middleware** — fast, cheap, redirects unauthenticated users. Cannot be the only layer (matcher misses, edge cases).
2. **Server Component / Route Handler** — `auth()` check at the top. Returns the user or redirects/404s. Always present on protected pages.
3. **Authorization in the data layer** — every DB query filters by `userId` / `organizationId`. Never trust the URL. For a nested route with 2+ ID segments, this is also where the chained-ownership check belongs — see `../owasp-security/SKILL.md` section 1.

```ts
// src/server/posts.ts
import 'server-only';
import { auth } from '@/auth';
import { db } from './db';

export async function getMyPost(postId: string) {
  const session = await auth();
  if (!session) return null;
  return db.post.findFirst({
    where: { id: postId, authorId: session.user.id }, // authorization in the query
  });
}
```

## Edge runtime caveats

- No Node-only APIs: `fs`, `child_process`, `crypto.createHash`, native bcrypt.
- Use Web APIs: `crypto.subtle`, `TextEncoder`, `fetch`, `URL`, `Headers`.
- `jose`, not `jsonwebtoken`. `bcrypt-ts` or `@noble/hashes`, not `bcrypt`.
- Tight package size (~1MB compiled). Don't import the world; import what you use.
- No streaming responses from middleware — middleware returns a quick decision (next/redirect/rewrite/json).

If your auth check genuinely needs Node (DB lookup, native crypto), do the heavy work in the Server Component, not middleware.

## A/B routing example

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';

const COOKIE = 'ab-bucket';

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/marketing/')) {
    return NextResponse.next();
  }

  let bucket = request.cookies.get(COOKIE)?.value;
  if (bucket !== 'a' && bucket !== 'b') {
    bucket = Math.random() < 0.5 ? 'a' : 'b';
  }

  const url = request.nextUrl.clone();
  url.pathname = `/marketing/${bucket}${url.pathname.replace('/marketing', '')}`;
  const response = NextResponse.rewrite(url);
  response.cookies.set(COOKIE, bucket, { maxAge: 60 * 60 * 24 * 30 });
  return response;
}

export const config = {
  matcher: ['/marketing/:path*'],
};
```

`rewrite` keeps the URL the user sees while serving a different route. `redirect` changes the URL.

## DO

- Place `middleware.ts` at the project root (or `src/middleware.ts` if `src/` is your root).
- Tighten `matcher` to skip `_next/static`, `_next/image`, and routes that don't need it.
- Use middleware for cheap checks; full auth in Server Components and queries.
- Use `jose` for JWT in middleware.
- Authorize in the database query (`where: { userId }`), not just at the boundary.

## DON'T

- Don't put heavy logic in middleware — it runs on every matched request.
- Don't use Node-only modules in middleware (`fs`, `bcrypt`, `crypto.createHash`).
- Don't rely solely on middleware for protection — also check in the page and the query.
- Don't compute `matcher` dynamically — Next.js requires literals.
- Don't read or write the database in middleware on the Edge runtime.
- Don't read `request.body` in middleware — middleware should not consume the body.

## See also

- `../owasp-security/SKILL.md` — chained ownership and role-based validation rules that apply to the data-layer authorization step above
