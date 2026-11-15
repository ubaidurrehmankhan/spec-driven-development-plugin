# Server Actions & Mutations

Server Actions are the App Router answer to "I have a form/button that should change server state." They're typed RPC, run on the server, and integrate with revalidation and redirects.

## Anatomy of an action file

Always declare actions in a dedicated file with `'use server'` at the top. This makes them callable from Server **and** Client Components, and makes the boundary explicit.

```ts
// app/posts/actions.ts
'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db';

const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  body: z.string().min(1, 'Body is required'),
});

export type CreatePostState = {
  error?: string;
  fieldErrors?: Partial<Record<'title' | 'body', string[]>>;
};

export async function createPost(
  _prev: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  const session = await auth();
  if (!session) return { error: 'Not authenticated' };

  const parsed = createPostSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body'),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const post = await db.post.create({
    data: { ...parsed.data, authorId: session.user.id },
  });

  revalidateTag('posts');                // list pages
  revalidatePath(`/posts/${post.id}`);   // detail page
  redirect(`/posts/${post.id}`);         // throws — must be after writes
}
```

Notes:
- `redirect()` throws a special signal — never wrap it in `try/catch`. Any code after it does not run.
- `revalidate*` calls before `redirect()` are still applied.
- The first parameter is the previous state when wired up via `useActionState`.
- If this action calls a backend endpoint rather than a local DB, validate against and follow that endpoint's `docs/contracts/*.contract.md` file (see `SKILL.md`) for the request shape and error codes.

## Wire to a form (progressive enhancement)

Pass the action directly to `<form action={…}>`. The form works **without JavaScript** — server-rendered, submitted as a normal POST, redirected.

> If the project uses a component library, the canonical pattern is the library's form API (AntD `Form`, MUI/Chakra/Radix + `react-hook-form`, Mantine `useForm`, etc.) calling the Server Action imperatively — the action's typed return value drives field-level errors regardless of library. See [component-libraries.md](component-libraries.md) for per-library setup and the field-error mapping. Use the raw `<form action={…}>` pattern below when progressive enhancement matters (login, signup, contact) or in projects without a component library.

```tsx
// app/posts/new/page.tsx
import { createPost } from '../actions';
import { NewPostForm } from './new-post-form';

export default function NewPostPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">New post</h1>
      <NewPostForm action={createPost} />
    </main>
  );
}
```

```tsx
// app/posts/new/new-post-form.tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { CreatePostState } from '../actions';

const initialState: CreatePostState = {};

export function NewPostForm({
  action,
}: {
  action: (state: CreatePostState, formData: FormData) => Promise<CreatePostState>;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium">Title</label>
        <input id="title" name="title" required className="w-full rounded border p-2" />
        {state.fieldErrors?.title && (
          <p className="text-sm text-red-600">{state.fieldErrors.title.join(', ')}</p>
        )}
      </div>
      <div>
        <label htmlFor="body" className="block text-sm font-medium">Body</label>
        <textarea id="body" name="body" required rows={8} className="w-full rounded border p-2" />
        {state.fieldErrors?.body && (
          <p className="text-sm text-red-600">{state.fieldErrors.body.join(', ')}</p>
        )}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
    >
      {pending ? 'Publishing…' : 'Publish'}
    </button>
  );
}
```

`useFormStatus` must be called from a component **inside** the `<form>` — that's how it reads the parent form's submit state.

## Optimistic updates with `useOptimistic`

For interactions where the server result is predictable (toggle a like, mark as read), apply the change immediately and reconcile when the action resolves.

```tsx
// app/posts/[id]/like-button.tsx
'use client';

import { useOptimistic, useTransition } from 'react';
import { toggleLike } from '../actions';

export function LikeButton({
  postId,
  initialLiked,
  initialCount,
}: {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const [, startTransition] = useTransition();
  const [state, addOptimistic] = useOptimistic(
    { liked: initialLiked, count: initialCount },
    (current, next: boolean) => ({
      liked: next,
      count: current.count + (next ? 1 : -1),
    }),
  );

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          addOptimistic(!state.liked);
          await toggleLike(postId);
        })
      }
      aria-pressed={state.liked}
      className="flex items-center gap-2 rounded border px-3 py-1"
    >
      <span>{state.liked ? '♥' : '♡'}</span>
      <span>{state.count}</span>
    </button>
  );
}
```

`useOptimistic` mutations must run inside a transition. Without `startTransition`, React errors at runtime.

Don't apply an optimistic update for an action whose contract states the
real result appears only later (an async side-effect note per
`../api-contracts/SKILL.md`) — the optimistic value would be visibly wrong
for the gap between the request and the real result.

## Action invocation patterns

| How it's called | When |
|---|---|
| `<form action={action}>` | Best default. Progressive enhancement, no JS required. |
| `<button formAction={action}>` | Multiple actions on one form (e.g., "Save draft" + "Publish"). |
| Imperative call inside a Client Component | Optimistic flows, non-form interactions, complex UI. Wrap in `startTransition`. |
| Direct call from a Server Component | Only inside another Server Action — Server Components don't have client events. |

## Errors and validation

- Validation errors → return them in the action's return value, render under the input.
- Authentication failures → return an error state, do **not** throw — the user should see the message, not an error page.
- Unexpected errors → throw; `error.tsx` will catch them.
- For per-field errors, use Zod's `flatten().fieldErrors` shape and key by input name.
- If the backend contract documents a specific error code for this action's endpoint, map it to the field/message the contract implies — don't invent a generic message when the contract states something more specific.

## Revalidation contract

After **any** successful write:

- `revalidatePath('/path')` — invalidate that route's cache.
- `revalidateTag('tag')` — invalidate every fetch tagged with this string.
- `redirect('/somewhere')` — when the action navigates the user.

Tag your `fetch`es upstream (see `data-fetching-and-caching.md`) so mutations can target the right caches.

## DO

- Put `'use server'` at the top of an actions file (or as the first line of an inline async function).
- Validate input with Zod. Return field errors; don't throw for user input.
- Always revalidate the affected path or tag after a write.
- Use `useActionState` for form state, `useFormStatus` for the submit button.
- Use `useOptimistic` for predictable, fast-feedback interactions; wrap in `startTransition`.
- Authenticate inside the action, even if the route is protected upstream — actions can also be called from Client Components.

## DON'T

- Don't `try/catch` around `redirect()` or `notFound()` — they throw on purpose.
- Don't pass non-`FormData`-serializable values through a `<form action>` — for complex client state, call the action imperatively.
- Don't forget revalidation. Stale UI after a successful save is a bug.
- Don't mix Server Actions and `fetch('/api/...')` for the same mutation — pick one.
- Don't call `useFormStatus` outside the form it should observe.
- Don't expose database service-role keys to the client by accident — keep mutation logic server-side.
