# TypeScript Standards & Project Structure

Consolidates two closely related topics: how the project is typed at its
boundaries, and where things live — `server-only` enforcement spans both in
practice.

## Part 1 — TypeScript standards

### tsconfig — strict mode is non-negotiable

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "allowJs": false,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`noUncheckedIndexedAccess: true` is the single biggest win — `arr[0]` is `T | undefined`, forcing you to check.

### No `any`. Ever.

If you reach for `any`, the type is `unknown`. Narrow it.

```ts
// ❌
function parse(input: any) {
  return JSON.parse(input);
}

// ✅
function parse(input: unknown): unknown {
  if (typeof input !== 'string') {
    throw new Error('parse expects a string');
  }
  return JSON.parse(input);
}

// ✅✅ — validate the parsed shape with Zod
import { z } from 'zod';
const schema = z.object({ id: z.string(), value: z.number() });
type Parsed = z.infer<typeof schema>;

function parse(input: unknown): Parsed {
  if (typeof input !== 'string') throw new Error('expected string');
  return schema.parse(JSON.parse(input));
}
```

ESLint should enforce: `@typescript-eslint/no-explicit-any: error`, `@typescript-eslint/no-unsafe-*: error`.

### Next 15: `params` and `searchParams` are Promises

The type changed in Next 15. Routes must `await` them.

```tsx
// app/posts/[slug]/page.tsx
type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PostPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { tab } = await searchParams;
  // …
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  // …
}

export async function generateStaticParams() {
  return [{ slug: 'first-post' }];
}
```

For multi-segment dynamic routes, type each level:

```ts
type Params = Promise<{ category: string; slug: string }>;
```

For catch-all and optional catch-all:

```ts
type CatchAllParams = Promise<{ slug: string[] }>;
type OptionalCatchAllParams = Promise<{ slug?: string[] }>;
```

### Server Actions — type both arguments and return value

```ts
// app/posts/actions.ts
'use server';

export type CreatePostState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'success'; postId: string };

export async function createPost(
  _prev: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  // …
}
```

When wiring to `useActionState`, the types flow through:

```tsx
'use client';
import { useActionState } from 'react';
import { createPost, type CreatePostState } from './actions';

const initial: CreatePostState = { status: 'idle' };
const [state, action] = useActionState(createPost, initial);
// state is CreatePostState — narrow on state.status
```

### Route Handlers

```ts
// app/api/posts/route.ts
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const limit = Number(searchParams.get('limit') ?? 20);
  return NextResponse.json({ items: [] });
}

// Dynamic route handler — params is also a Promise in Next 15
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  return NextResponse.json({ deleted: id });
}
```

### Typed environment variables

`process.env.X` is `string | undefined` by default. Type a checked accessor and use it everywhere.

```ts
// src/env.ts
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

export const env = schema.parse(process.env);
```

Import `env` everywhere. Now `env.DATABASE_URL` is a guaranteed string and missing vars fail at boot, not at the first request.

`NEXT_PUBLIC_*` vars are inlined at build time — don't put secrets in them.

### Component prop types

Prefer `type` over `interface` for props. Always export the type if it leaves the file.

```ts
type ProductCardProps = {
  product: {
    id: string;
    name: string;
    price: number;
  };
  onAddToCart?: (id: string) => void;
};

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  // …
}
```

For `children`, prefer `React.ReactNode`. For "render anything that React renders," that's the right type.

### Discriminated unions for state

Replace boolean flags with a discriminated union — the compiler enforces correctness.

```ts
// ❌ ambiguous: error + data both possible?
type State = { isLoading: boolean; error?: string; data?: Order };

// ✅ exactly one shape at a time
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: Order };
```

---

## Part 2 — Project structure

### Top-level layout

```
.
├── public/                       # static assets served as-is
│   ├── favicon.ico
│   └── logo.svg
├── src/
│   ├── app/                      # routes — page/layout/route only
│   ├── components/               # cross-feature reusable components
│   │   ├── ui/                   # primitives (Button, Input, Card)
│   │   └── …                     # cross-cutting composites (Header, Footer)
│   ├── lib/                      # shared utilities, isomorphic
│   ├── server/                   # server-only modules — DB, auth, services
│   ├── styles/                   # global.css, tailwind base
│   ├── env.ts                    # validated environment variables
│   └── middleware.ts
├── tests/                        # if not co-located
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── package.json
└── README.md
```

If the project doesn't use a `src/` directory, the same shape applies one level up. Match the project's existing convention; don't introduce `src/` halfway through.

### What goes in `app/`

`app/` is for **routes only**. Special files (`page`, `layout`, `template`, `loading`, `error`, `not-found`, `route`) and route-local components (e.g. a `<NewPostForm>` only used by `app/posts/new/page.tsx`).

Co-locate route-local pieces:

```
app/posts/
├── page.tsx
├── loading.tsx
├── error.tsx
├── new/
│   ├── page.tsx
│   ├── new-post-form.tsx     # Client Component, only used here
│   └── actions.ts            # 'use server'
└── [slug]/
    ├── page.tsx
    ├── opengraph-image.tsx
    └── like-button.tsx       # Client Component, only used here
```

A component used by **two or more** routes graduates to `src/components/` (or a feature folder). Don't preemptively centralize.

### What goes in `src/components/`

Cross-route reusable components. Split by reuse pattern:

- `components/ui/` — primitives. Button, Input, Card, Modal, Badge. No domain knowledge.
- `components/<feature>/` — feature-shared composites. `components/cart/CartIcon.tsx` if cart exists in multiple routes.
- `components/layout/` — site chrome shared across many layouts: Header, Footer, Sidebar.

If you're tempted to put a component in `app/components/`, stop — that path conflicts with the routes folder convention. Use `src/components/`.

### What goes in `src/lib/`

Isomorphic utilities — functions safe to import from both Server and Client Components. Date helpers, formatters, URL builders, pure logic.

```
src/lib/
├── date.ts
├── currency.ts
├── url.ts
├── posts.ts                  # data accessors — only if pure / cacheable / no secrets
└── validation/
    └── post-schema.ts        # Zod schemas
```

Anything that opens a DB connection, reads a secret, or talks to a backend with credentials → `src/server/`, not `src/lib/`.

### What goes in `src/server/`

Server-only modules. Mark each entry point with `import 'server-only'` so a wayward Client Component import fails at build time.

```
src/server/
├── db.ts                     # DB client — server-only
├── auth.ts                   # session, RBAC — server-only
├── posts.ts                  # service layer — server-only
├── billing.ts
└── email.ts
```

```ts
// src/server/db.ts
import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/env';

export const db = drizzle(postgres(env.DATABASE_URL, { max: 10 }));
```

```ts
// src/server/posts.ts
import 'server-only';
import { db } from './db';
import { auth } from './auth';

export async function listPostsForCurrentUser() {
  const session = await auth();
  if (!session) return [];
  return db.query.posts.findMany({
    where: (p, { eq }) => eq(p.authorId, session.user.id),
  });
}
```

Server Components and Server Actions import from `@/server/*`. Client Components do not. The `server-only` import enforces this.

### Client-only modules

Anything that touches `window` / `document` / `localStorage` / browser-only libraries should live in a Client Component file (`'use client'` + the module that wraps the browser API):

```ts
// src/components/analytics/track.ts
import 'client-only';

declare global {
  interface Window {
    analytics?: { track: (event: string, props?: Record<string, unknown>) => void };
  }
}

export function track(event: string, props?: Record<string, unknown>) {
  window.analytics?.track(event, props);
}
```

Then import this from a `'use client'` component.

### Naming conventions

- Files: `kebab-case` (`new-post-form.tsx`, `like-button.tsx`).
- Components inside files: `PascalCase` (`export function NewPostForm() {}`).
- Hooks: `use-camel-case.ts` filename, `useCamelCase` export.
- Server Actions: `actions.ts` (or `<feature>-actions.ts`) — group by feature, not by type.
- Tests: `<file>.test.ts`/`<file>.test.tsx` co-located with the source, or a parallel `__tests__/` folder.

### Path aliases

Set up `@/` to point at `src/` in `tsconfig.json`. Use it consistently — import order: builtin → external → `@/` → relative.

```ts
import { useState } from 'react';                 // builtin/external
import { z } from 'zod';
import { auth } from '@/server/auth';             // alias
import { Button } from '@/components/ui/button';
import { LikeButton } from './like-button';       // local
```

Avoid deep relative chains (`../../../`). They're an indication that the module belongs in `src/lib/` or `src/components/`.

### Where do Server Actions live?

Inside `app/<feature>/actions.ts` — one file per feature, next to the routes that use it. Don't centralize all actions in `src/server/actions.ts` — they're tied to UI flows.

Server Actions can call into `src/server/<feature>.ts` for the actual database/business logic, keeping `actions.ts` as the thin adapter for `FormData` / progressive enhancement plumbing.

## DO

- `strict: true`, `noUncheckedIndexedAccess: true`.
- `unknown` + narrowing instead of `any`.
- Type `params` / `searchParams` as `Promise<…>` in Next 15.
- Validate environment variables once at boot.
- Discriminated unions for any state with multiple modes.
- Export action input/output types so client components type-check correctly.
- Keep `app/` for routes and their immediate components only.
- Put cross-route reusable components in `src/components/`.
- Put server-only modules in `src/server/` and mark them with `import 'server-only'`.
- Use `@/` path aliases consistently.
- Co-locate route-local components, actions, and forms next to their `page.tsx`.

## DON'T

- Don't use `as` casts to silence TypeScript — fix the type.
- Don't use `@ts-ignore` — use `@ts-expect-error` with a comment, and fix it.
- Don't define props as `interface` only to extend nothing — `type` is shorter and identical here.
- Don't read `process.env.X` directly throughout the app — go through the typed `env` module.
- Don't ship `NEXT_PUBLIC_` secrets — they're public.
- Don't put a `components/` folder inside `app/` — it shadows the routes pattern.
- Don't import DB/auth modules from `src/lib/` — those belong in `src/server/`.
- Don't centralize Server Actions away from their feature's routes.
- Don't introduce `src/` mid-project if the project doesn't already use it.
- Don't deep-relative-import (`../../../`); add an alias or move the file.
