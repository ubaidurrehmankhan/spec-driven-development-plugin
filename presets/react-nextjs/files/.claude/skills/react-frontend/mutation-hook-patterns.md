# Mutation Hook Patterns

Mutation hooks wrap `useMutation` for POST, PATCH, PUT, and DELETE operations. They handle cache invalidation and user feedback.

## File Location

Mutations are colocated with queries in the same hook file:

```
src/hooks/useProducts.ts   — contains both useProducts (query) and useCreateProduct (mutation)
```

## Basic Create Mutation

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi } from '@/services/productApi';
import { productKeys } from '@/hooks/useProducts';
import type { CreateProductRequest } from '@/types/product';

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductRequest) => productApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}
```

## Update Mutation

```typescript
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductRequest }) =>
      productApi.update(id, data),
    onSuccess: (updatedProduct) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(updatedProduct.id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}
```

## Delete Mutation

```typescript
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}
```

## Nested/chained mutation (2+ ID segments)

When the contract's endpoint is nested (e.g. `/projects/:groupId/milestones/:milestoneId/save`),
pass every segment through explicitly — mirroring how the API client
function takes them (see `api-client-patterns.md`):

```typescript
export function useSaveMilestone(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ milestoneId, data }: { milestoneId: string; data: SaveMilestoneRequest }) =>
      projectApi.save(groupId, milestoneId, data),
    onSuccess: (_result, { milestoneId }) => {
      queryClient.invalidateQueries({ queryKey: milestoneKeys.detail(milestoneId) });
      queryClient.invalidateQueries({ queryKey: projectGroupKeys.detail(groupId) });
    },
  });
}
```

## Mutation with Callbacks (component-level)

Hooks define cache logic. Components define UI feedback:

```typescript
// In the hook — only cache concerns
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductRequest) => productApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

// In the component — UI feedback
const createProduct = useCreateProduct();

const handleSubmit = (formData: CreateProductRequest) => {
  createProduct.mutate(formData, {
    onSuccess: () => {
      toast.success('Product created successfully');
      navigate('/products');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create product');
    },
  });
};
```

Rules:
- **Hook-level `onSuccess`**: cache invalidation, refetching — always runs
- **Component-level `onSuccess`/`onError`**: toasts, navigation, modals — context-specific
- This separation lets the same hook be reused across different UIs with different feedback
- TanStack Query v5 note: callback options on `mutate(data, { onSuccess, onError, onSettled })` are still supported (only `useQuery` callbacks were removed in v5). Do not "fix" this pattern to use `useEffect` on `isSuccess`/`isError` — the callback form is the canonical way.

## Invalidation Scope

Choose the narrowest key that still covers every affected view:

- `queryClient.invalidateQueries({ queryKey: productKeys.lists() })` — invalidates every list variant (all filter combinations) but leaves detail caches alone. Use after create/delete.
- `queryClient.invalidateQueries({ queryKey: productKeys.detail(id) })` — invalidates a single detail. Use after a targeted update.
- `queryClient.invalidateQueries({ queryKey: productKeys.all })` — nuclear option. Use only when the mutation affects both lists and details in ways you cannot predict (e.g., bulk actions).

Rule: do not invalidate `productKeys.all` when the narrower `lists()` or `detail(id)` will do — it triggers unnecessary refetches and cache churn.

### Cross-entity invalidation

When a mutation on one entity affects another (e.g., deleting a category should refresh products):

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: categoryKeys.all });
  queryClient.invalidateQueries({ queryKey: productKeys.lists() });
};
```

## Optimistic Update

For instant UI feedback before the server responds:

```typescript
export function useToggleProductStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      productApi.update(id, { isActive }),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: productKeys.detail(id) });
      const previous = queryClient.getQueryData(productKeys.detail(id));

      queryClient.setQueryData(productKeys.detail(id), (old: Product | undefined) =>
        old ? { ...old, isActive } : old,
      );

      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(productKeys.detail(id), context.previous);
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
    },
  });
}
```

Rules for optimistic updates:
- Cancel in-flight queries first (`cancelQueries`)
- Save previous state for rollback
- Rollback on error
- Always invalidate on settled (success or error) to sync with server truth
- Only use for simple toggles or status changes — not complex multi-field updates
- Never use an optimistic update for a mutation whose contract has an async
  side-effect note stating the visible result only appears later (see
  `../api-contracts/SKILL.md`) — the optimistic value would be wrong for the
  window between the request and the real result

## Mutation State in Components

Use mutation state for UI feedback:

```typescript
const createProduct = useCreateProduct();

return (
  <form onSubmit={handleSubmit}>
    {/* form fields */}
    <button type="submit" disabled={createProduct.isPending}>
      {createProduct.isPending ? 'Saving...' : 'Save'}
    </button>
    {createProduct.isError && (
      <p className="error">{createProduct.error.response?.data?.message || 'Something went wrong'}</p>
    )}
  </form>
);
```

## Multi-Step Mutation

When a workflow involves multiple sequential API calls:

```typescript
export function useCreateOrderWithItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { order: CreateOrderRequest; items: CreateOrderItemRequest[] }) => {
      const order = await orderApi.create(data.order);
      await Promise.all(
        data.items.map((item) => orderItemApi.create({ ...item, orderId: order.id })),
      );
      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}
```

## Naming Convention

| Operation | Hook Name | Example |
|-----------|-----------|---------|
| Create | `useCreate<Entity>` | `useCreateProduct` |
| Update | `useUpdate<Entity>` | `useUpdateProduct` |
| Delete | `useDelete<Entity>` | `useDeleteProduct` |
| Toggle/action | `use<Action><Entity>` | `useToggleProductStatus` |
| Multi-step | `use<Action>With<Related>` | `useCreateOrderWithItems` |

## What NOT to Do

- Do NOT call `mutate()` inside `useEffect` — mutations are user-triggered, not lifecycle-triggered
- Do NOT forget cache invalidation — stale data after mutations is the #1 react-query bug
- Do NOT put toast/navigation in the hook — put it in the component's `onSuccess`/`onError`
- Do NOT use `mutateAsync` unless you genuinely need to `await` the result (e.g., multi-step flows) — `mutate` with callbacks is the standard pattern
- Do NOT swallow errors — always handle `onError` for user feedback
