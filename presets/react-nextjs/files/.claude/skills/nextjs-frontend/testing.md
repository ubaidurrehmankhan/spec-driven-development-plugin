# Testing

## Three layers

| Layer | Tool | What to test |
|---|---|---|
| Unit | Vitest or Jest | Pure logic, schema validation, server-side service functions |
| Component | Testing Library + Vitest/Jest (jsdom) | Client Component rendering and interaction |
| E2E | Playwright | Real-browser flows: routing, server rendering, Server Actions, auth |

Server Components, Route Handlers, middleware, and full caching behavior are **best tested with Playwright**, not jsdom — they need a real Next.js runtime.

## Vitest setup (preferred for new projects)

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
```

## Unit test — pure logic

```ts
// src/lib/currency.test.ts
import { describe, expect, it } from 'vitest';
import { formatPrice } from './currency';

describe('formatPrice', () => {
  it('formats USD with two decimals', () => {
    expect(formatPrice(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('rounds half to even by default', () => {
    expect(formatPrice(1.005, 'USD')).toBe('$1.00');
  });

  it('throws on unknown currency', () => {
    expect(() => formatPrice(1, 'XXX')).toThrow(/unknown currency/i);
  });
});
```

## Unit test — server-side service

```ts
// src/server/posts.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listPostsForCurrentUser } from './posts';

vi.mock('./auth', () => ({
  auth: vi.fn(),
}));
vi.mock('./db', () => ({
  db: {
    query: { posts: { findMany: vi.fn() } },
  },
}));

const { auth } = await import('./auth');
const { db } = await import('./db');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listPostsForCurrentUser', () => {
  it('returns [] when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    expect(await listPostsForCurrentUser()).toEqual([]);
    expect(db.query.posts.findMany).not.toHaveBeenCalled();
  });

  it('queries by the authenticated user id', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user_123' } });
    vi.mocked(db.query.posts.findMany).mockResolvedValue([
      { id: 'p1', authorId: 'user_123', title: 'Hi', body: '…' },
    ]);
    const posts = await listPostsForCurrentUser();
    expect(posts).toHaveLength(1);
    expect(db.query.posts.findMany).toHaveBeenCalledOnce();
  });
});
```

## Component test — Client Component

Server Components are not unit-test-friendly (they often `await` real services). Test Client Components with Testing Library; test Server Components via E2E.

```tsx
// app/posts/[id]/like-button.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LikeButton } from './like-button';

vi.mock('../actions', () => ({
  toggleLike: vi.fn(async () => {}),
}));

describe('<LikeButton>', () => {
  it('toggles aria-pressed and increments count optimistically', async () => {
    const user = userEvent.setup();
    render(<LikeButton postId="p1" initialLiked={false} initialCount={5} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('5');

    await user.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('6');
  });
});
```

Query by **role and accessible name** — `getByRole('button', { name: /publish/i })`. Falling back to `getByTestId` is a smell.

## Route Handler test

```ts
// app/api/posts/route.test.ts
import { describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/server/posts', () => ({
  createPost: vi.fn(async (input) => ({ id: 'p1', ...input })),
}));

describe('POST /api/posts', () => {
  it('returns 400 on invalid body', async () => {
    const req = new Request('http://test/api/posts', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 201 on valid body', async () => {
    const req = new Request('http://test/api/posts', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', body: 'Body' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('p1');
  });
});
```

## Playwright — the workhorse for App Router behavior

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run start',          // production build, not dev
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Always run E2E against a **production build** (`next build && next start`). Dev mode skips most caching, and you'll miss the bugs that matter.

```ts
// e2e/posts/create.spec.ts
import { test, expect } from '@playwright/test';

test('user can create a post and see it in the list', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.goto('/posts/new');
  await page.getByLabel('Title').fill('My first post');
  await page.getByLabel('Body').fill('Hello, world.');
  await page.getByRole('button', { name: /publish/i }).click();

  await expect(page).toHaveURL(/\/posts\/[\w-]+$/);
  await expect(page.getByRole('heading', { name: 'My first post' })).toBeVisible();

  await page.goto('/posts');
  await expect(page.getByRole('link', { name: 'My first post' })).toBeVisible();
});
```

This test exercises: middleware auth, Server Action, `revalidateTag`, navigation, and Router Cache invalidation — all the things a unit test cannot reach.

## Mocking external services

For Route Handler / Server Action tests, mock the network at the boundary (`vi.mock('@/server/db')`, `msw` for outgoing `fetch` calls).

For E2E, prefer a dedicated test database that's seeded and reset between runs over mocking. Mocked E2E is brittle; real backend E2E catches integration bugs.

## What to test where

- **Pure logic** → unit. `formatPrice`, Zod schemas, reducers.
- **Server services** → unit with mocked DB. `listPostsForCurrentUser`, authorization rules.
- **Client Components** → component with Testing Library. Buttons, forms, optimistic UI.
- **Server Components, layouts, full page renders** → Playwright. Don't try to render them in jsdom.
- **Server Actions end-to-end** → Playwright. Submit the form, assert the change is reflected.
- **Middleware** → Playwright. `expect(page).toHaveURL('/login')` after visiting a protected route.
- **Cache behavior** → Playwright with a production build.
- **Chained-ownership behavior** (see `../owasp-security/SKILL.md` section 1) → Playwright/E2E with a real mismatched-pair fixture, plus a Route Handler/Server Action unit test asserting the correct not-found/forbidden response.

## Note on this plugin's single verify pass

Tests written per this file back `implement-batch`'s build+lint+test gate
for the batch. Cross-batch and contract-conformance checks (does the actual
Route Handler match its `docs/contracts/*.contract.md` file) happen once,
across all batches, in `verify-and-test` — not repeated per batch.

## DO

- Run E2E against `next build && next start`.
- Query by role and accessible name in component tests.
- Mock at the network boundary (DB, fetch), not internal modules.
- Reset the test DB between Playwright runs.
- Set coverage thresholds in CI; let the threshold rise over time.

## DON'T

- Don't try to render Server Components in jsdom — limited React server runtime, no fetch, no cookies.
- Don't run E2E against `next dev` — caching behavior differs.
- Don't rely on `getByTestId` as a default — it's an escape hatch.
- Don't unit-test middleware — the runtime context is hard to fake; use Playwright.
- Don't ship a feature without at least one Playwright check covering the happy path.
