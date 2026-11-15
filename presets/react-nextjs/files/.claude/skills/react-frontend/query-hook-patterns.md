# Query Hook Patterns

Query hooks wrap `useQuery` for GET endpoints. One hook per query, colocated in a single file per domain entity.

## File Location

```
src/hooks/use<Name>.ts     — e.g., useProducts.ts, useOrders.ts
```

Each file exports multiple hooks for the same entity (list, detail, etc.).

## Query Key Factory

Query keys are the backbone of react-query's caching and invalidation. Define a key factory per domain entity, colocated with the API service or in the hooks file:

```typescript
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: ProductFilters) => [...productKeys.lists(), filters] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
};
```

### How it works

```
productKeys.all              → ['products']                           — invalidate everything
productKeys.lists()          → ['products', 'list']                   — invalidate all list variations
productKeys.list({ page: 1 })→ ['products', 'list', { page: 1 }]     — specific filtered list
productKeys.details()        → ['products', 'detail']                 — invalidate all details
productKeys.detail('abc')    → ['products', 'detail', 'abc']          — specific detail
```

### Naming Convention

| Entity | Key Factory Name | Root Key |
|--------|-----------------|----------|
| Product | `productKeys` | `['products']` |
| Order | `orderKeys` | `['orders']` |
| Category | `categoryKeys` | `['categories']` |

Rules:
- Root key is always the **plural** entity name as a lowercase string
- Factory name is `<entity>Keys` in camelCase
- Always use `as const` for type safety and autocomplete
- Do NOT use inline string arrays — always use the key factory
- Do NOT duplicate key definitions across files — import from one place
- Do NOT use non-serializable values (functions, class instances) in keys

## Basic List Query

```typescript
import { useQuery } from '@tanstack/react-query';
import { productApi } from '@/services/productApi';
import { productKeys } from '@/hooks/useProducts';
import type { ProductFilters } from '@/types/product';

export function useProducts(filters?: ProductFilters) {
  return useQuery({
    queryKey: productKeys.list(filters ?? {}),
    queryFn: () => productApi.getAll(filters),
  });
}
```

## Detail Query

```typescript
export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: productKeys.detail(id!),
    queryFn: () => productApi.getById(id!),
    enabled: !!id,
  });
}
```

Rules:
- `enabled: !!id` — prevents the query from firing when `id` is `undefined` (e.g., before a selection)
- Use non-null assertion (`id!`) inside `queryFn` because `enabled` guards the call

## Dependent/Chained Query

When one query depends on the result of another:

```typescript
export function useOrderItems(orderId: string | undefined) {
  return useQuery({
    queryKey: orderItemKeys.list(orderId!),
    queryFn: () => orderItemApi.getByOrderId(orderId!),
    enabled: !!orderId,
  });
}

// In the component:
const { data: order } = useOrder(orderId);
const { data: items } = useOrderItems(order?.id);
```

## Query with Select Transform

When the component needs a different shape than the API returns:

```typescript
export function useProductNames() {
  return useQuery({
    queryKey: productKeys.lists(),
    queryFn: () => productApi.getAll(),
    select: (data) => data.data.map((p) => ({ value: p.id, label: p.name })),
  });
}
```

Rules:
- Use `select` for lightweight transforms (mapping, filtering, sorting)
- Do NOT use `select` for heavy computation — use `useMemo` in the component instead
- `select` runs on every render if the function reference changes — define it outside the hook or wrap in `useCallback` if expensive

## Polling / Refetch Interval

For data that should auto-refresh — including the case where a contract's
async side-effect note says a result "appears asynchronously" after a Save
(see `../api-contracts/SKILL.md`), and the UI needs to reflect it without a
manual refresh:

```typescript
export function useActiveOrders() {
  return useQuery({
    queryKey: orderKeys.list({ status: 'active' }),
    queryFn: () => orderApi.getAll({ status: 'active' }),
    refetchInterval: 30_000,
  });
}
```

## Stale Time and GC Time Configuration

For rarely changing data:

```typescript
export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: () => categoryApi.getAll(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
```

Rules:
- Use `staleTime` for reference data that rarely changes (categories, roles, config)
- Default stale time is `0` — data is considered stale immediately
- Do NOT set global stale time too high — it's better to configure per hook
- `gcTime` (TanStack Query v5 — renamed from `cacheTime`) controls how long unused data stays in cache before garbage collection. Default is 5 minutes. Raise it for data you want to survive unmount/remount cycles (e.g., a detail page revisited after closing a modal).

## Suspense Queries (opt-in)

When the route/page already has a loading fallback via `<Suspense>` and an error boundary, use `useSuspenseQuery` to remove `isPending`/`isError` branches from the component:

```typescript
import { useSuspenseQuery } from '@tanstack/react-query';

export function useProductSuspense(id: string) {
  return useSuspenseQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => productApi.getById(id),
  });
}
```

```typescript
// In the parent
<ErrorBoundary fallback={<ErrorMessage />}>
  <Suspense fallback={<DetailSkeleton />}>
    <ProductDetail productId={id} />
  </Suspense>
</ErrorBoundary>

// In the component — data is guaranteed, no isPending check
const { data: product } = useProductSuspense(id);
return <ProductView product={product} />;
```

Rules:
- Use Suspense queries only when an `ErrorBoundary` wraps the tree — otherwise thrown errors crash the app
- Do NOT mix `useQuery` and `useSuspenseQuery` for the same data — pick one per feature
- `enabled: false` is not supported with `useSuspenseQuery`; guard by not rendering the component at all

## Error Boundary Integration

To delegate query errors to a boundary instead of rendering inline error UI, use `throwOnError`:

```typescript
export function useProduct(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => productApi.getById(id),
    throwOnError: true,
  });
}
```

Rules:
- Use `throwOnError` for route-level or section-level queries where a dedicated error boundary provides better UX than inline errors
- Keep inline `isError` handling for queries where the surrounding UI should still render (e.g., a sidebar widget)

## Placeholder Data

For instant UI while real data loads:

```typescript
export function useProduct(id: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => productApi.getById(id),
    placeholderData: () => {
      return queryClient
        .getQueryData<PaginatedResponse<Product>>(productKeys.lists())
        ?.data.find((p) => p.id === id);
    },
  });
}
```

This pulls the product from the cached list while the detail query loads.

## Hook Return Convention

Always destructure with clear names in components:

```typescript
const {
  data: products,
  isPending,
  isError,
  error,
} = useProducts(filters);
```

Rules:
- Prefer `isPending` for "no data yet" (first load) UI. In TanStack Query v5, `isPending` replaces v4's `isLoading` as the canonical first-load flag.
- `isLoading` still exists but is now derived as `isPending && isFetching` — use it only if you specifically want to show a spinner only during an active network request.
- Use `isFetching` (not `isPending`) to show a subtle "refreshing" indicator on already-rendered data during background refetches.

## What NOT to Do

- Do NOT call `useQuery` directly in components — always wrap in a custom hook
- Do NOT put API logic in the hook — the hook calls the service, the service calls the API
- Do NOT forget `enabled` for conditional queries — it prevents unnecessary network calls
- Do NOT use `refetchOnWindowFocus: false` globally — configure per-hook where needed
- Do NOT return raw `useQuery` result and then re-fetch manually — let react-query manage the lifecycle
