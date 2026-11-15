# UI Wiring Patterns

The UI is already built from Figma/design. Your ONLY job is to replace static/placeholder data with live API data.

## Golden Rule

**NEVER create, redesign, or restyle UI components.** Only modify the data layer inside existing components:
- Swap hardcoded arrays/objects with hook data
- Add loading, error, and empty states
- Wire form submissions to mutation hooks
- Add `onSuccess`/`onError` callbacks

## Response Shape Convention

The examples below use two shapes depending on endpoint type:
- **List endpoints** return `PaginatedResponse<T>` — the array is at `data.data`, with pagination metadata (`totalPages`, `total`, etc.) on the envelope.
- **Detail endpoints** return `T` directly — no envelope, no `.data` unwrap.

Match whichever shape the endpoint's contract actually documents (see
`../api-contracts/SKILL.md`) — don't assume the pattern below applies
uniformly if the contract says otherwise.

## Before vs After

### List Component

**Before** (static data):
```typescript
const ProductList = () => {
  const products = MOCK_PRODUCTS; // or []

  return (
    <div>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
};
```

**After** (live data):
```typescript
const ProductList = () => {
  const { data, isPending, isError, error } = useProducts(filters);

  if (isPending) return <TableSkeleton rows={5} />;
  if (isError) return <ErrorMessage message={error.message} />;
  if (!data?.data.length) return <EmptyState message="No products found" />;

  return (
    <div>
      {data.data.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
};
```

### Detail Component

**Before**:
```typescript
const ProductDetail = ({ productId }: { productId: string }) => {
  const product = MOCK_PRODUCT;
  return <ProductView product={product} />;
};
```

**After**:
```typescript
const ProductDetail = ({ productId }: { productId: string }) => {
  const { data: product, isPending, isError } = useProduct(productId);

  if (isPending) return <DetailSkeleton />;
  if (isError) return <ErrorMessage message="Failed to load product" />;
  if (!product) return <NotFound message="Product not found" />;

  return <ProductView product={product} />;
};
```

### Form Component

**Before**:
```typescript
const ProductForm = ({ onClose }: { onClose: () => void }) => {
  const handleSubmit = (data: CreateProductRequest) => {
    console.log('Submitted:', data);
    onClose();
  };

  return <Form onSubmit={handleSubmit}>...</Form>;
};
```

**After**:
```typescript
const ProductForm = ({ onClose }: { onClose: () => void }) => {
  const createProduct = useCreateProduct();

  const handleSubmit = (data: CreateProductRequest) => {
    createProduct.mutate(data, {
      onSuccess: () => {
        toast.success('Product created');
        onClose();
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to create product');
      },
    });
  };

  return (
    <Form onSubmit={handleSubmit}>
      {/* existing form fields — do not modify */}
      <SubmitButton loading={createProduct.isPending} />
    </Form>
  );
};
```

### Delete Action

**Before**:
```typescript
const handleDelete = (id: string) => {
  console.log('Delete:', id);
};
```

**After**:
```typescript
const deleteProduct = useDeleteProduct();

const handleDelete = (id: string) => {
  deleteProduct.mutate(id, {
    onSuccess: () => {
      toast.success('Product deleted');
    },
    onError: () => {
      toast.error('Failed to delete product');
    },
  });
};
```

## Loading States

Use the project's existing loading components. Common patterns:

```typescript
// Table skeleton
if (isPending) return <TableSkeleton rows={5} columns={4} />;

// Spinner
if (isPending) return <Spinner />;

// Inline loading
<button disabled={mutation.isPending}>
  {mutation.isPending ? 'Saving...' : 'Save'}
</button>
```

Rules:
- Use skeleton loaders for initial page loads (better UX than spinners)
- Use inline loading states for buttons/actions
- If the project has existing loading components, use them — do NOT create new ones

## Error States

```typescript
// Full-page error
if (isError) return <ErrorMessage message={error.message} onRetry={refetch} />;

// Inline error
{mutation.isError && (
  <Alert variant="error">
    {mutation.error.response?.data?.message || 'Something went wrong'}
  </Alert>
)}

// Toast for mutation errors (in onError callback)
toast.error(error.response?.data?.message || 'Operation failed');
```

Rules:
- Query errors → show in-place error with retry option
- Mutation errors → show toast or inline alert
- Always show a human-readable message, never raw error objects
- If the backend returns a `message` field, prefer it over generic text
- A 403 caused by a chained-ownership mismatch (see `../owasp-security/SKILL.md`
  section 1) should read as "not found" to the user, not leak that a
  different parent/child pairing exists — match whatever the contract's
  Errors table actually specifies for that case, don't invent a more
  detailed message than the backend provides

## Empty States

```typescript
if (!data?.data.length) {
  return <EmptyState message="No products found" action={<Button onClick={openCreateForm}>Add Product</Button>} />;
}
```

Rules:
- Always handle the empty case — never render a blank page
- Include a call-to-action when appropriate (e.g., "Create your first product")
- Use the project's existing empty state components if available

## Pagination Wiring

```typescript
const [page, setPage] = useState(1);
const { data, isPending } = useProducts({ ...filters, page, limit: 10 });

return (
  <>
    <ProductTable data={data?.data ?? []} loading={isPending} />
    <Pagination
      currentPage={page}
      totalPages={data?.totalPages ?? 1}
      onPageChange={setPage}
    />
  </>
);
```

## Search/Filter Wiring

```typescript
const [filters, setFilters] = useState<ProductFilters>({});
const debouncedSearch = useDebounce(filters.search, 300);
const { data, isPending } = useProducts({ ...filters, search: debouncedSearch });

return (
  <>
    <SearchInput
      value={filters.search}
      onChange={(search) => setFilters((prev) => ({ ...prev, search, page: 1 }))}
    />
    <FilterBar filters={filters} onChange={setFilters} />
    <ProductTable data={data?.data ?? []} loading={isPending} />
  </>
);
```

Rules:
- Debounce search input to avoid excessive API calls
- Reset page to 1 when filters change

## Checklist When Wiring a Component

For every component you touch:
- [ ] Replaced static/mock data with the appropriate query hook
- [ ] Loading state renders (skeleton or spinner)
- [ ] Error state renders with message and retry
- [ ] Empty state renders with helpful message
- [ ] Forms wired to mutation hooks
- [ ] Submit buttons show loading during mutation
- [ ] `onSuccess` shows feedback (toast, redirect, close modal)
- [ ] `onError` shows user-friendly error
- [ ] No new UI components created — only data wiring changes
- [ ] Every field the form sends is one the current user's role may set, per the contract's role-boundary note (see `type-patterns.md`)
