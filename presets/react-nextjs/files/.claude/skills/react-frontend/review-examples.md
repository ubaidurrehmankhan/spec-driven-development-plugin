# React Frontend — Code Review Examples

Use these as templates for structured findings. Adapt paths and line numbers to the real diff.

---

## Example 1: `any`, raw `fetch`, and missing i18n

**Input diff** (simplified):

```tsx
// UserCard.tsx
export function UserCard({ user }: { user: any }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(`/api/users/${user.id}`).then((r) => r.json()).then(setData);
  }, [user.id]);
  return <div style={{ padding: 16 }}>Welcome {user.name}</div>;
}
```

**Review output:**

```
## Code Review Summary (Frontend)

**Tests**: Not run
**Lint**: Likely issues (`any`, inline style)

### Blocking
- [ ] `UserCard.tsx:2` — [TypeScript] Props use `any`. Replace with a typed `User` interface from `src/types/` matching the contract.
- [ ] `UserCard.tsx:5-7` — [API client] Uses raw `fetch` instead of the centralized API client + a query hook. Route through `useUser(id)`.
- [ ] `UserCard.tsx:10` — [Styling] Inline `style` object. Use Tailwind classes (e.g. `p-4`) per team standards.

### Warnings
- [ ] `UserCard.tsx:10` — [i18n] Visible string "Welcome" is not wrapped in `t()`.

### Suggestions
- [ ] `UserCard.tsx` — [Testing] Add a unit test for loading/success/error states when wiring the shared client.

### What looks good
- `useEffect` dependency includes `user.id`.
```

---

## Example 2: MSW and server-side table params

**Input diff** (simplified):

```tsx
// useOrders.ts — new hook, no MSW update
export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => apiClient.get('/orders'),
  });
}

// OrdersPage.tsx — sorts full list in memory
const sorted = useMemo(() => [...orders].sort((a, b) => a.date.localeCompare(b.date)), [orders]);
```

**Review output:**

```
## Code Review Summary (Frontend)

### Blocking
- [ ] `useOrders.ts` — [API client] Inline string array `['orders']` instead of the `orderKeys` factory (see query-hook-patterns.md).
- [ ] `handlers/` or `mocks/` — [MSW] New `/orders` usage requires a matching MSW handler so tests and local dev stay unblocked (see mock-and-msw-patterns.md).

### Warnings
- [ ] `OrdersPage.tsx` — [Architecture] Client-side sort of full `orders` list conflicts with server-side pagination/sorting/filtering rule. Prefer query params and API-supported sort for large lists.

### Suggestions
- [ ] `useOrders.ts` — [API client] Consider query key including filter/sort params when server-driven lists are added.

### What looks good
- Uses shared `apiClient` for the request.
```

---

## Example 3: Clean pattern — positive review

**Input diff** (simplified):

```tsx
// useProfile.ts
export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => apiClient.get<ProfileResponse>(`/users/${userId}`),
    enabled: Boolean(userId),
  });
}

// ProfileHeader.tsx
export function ProfileHeader({ userId }: { userId: string }) {
  const { data, isPending, isError } = useProfile(userId);
  if (isPending) return <AppLoader />;
  if (isError) return <AppNotice type="error" message={t('profile.loadError')} />;
  if (!data) return <AppNotice type="info" message={t('profile.empty')} />;
  return <h1 className="text-xl font-semibold">{t('profile.welcome', { name: data.name })}</h1>;
}
```

**Review output:**

```
## Code Review Summary (Frontend)

**Tests**: PASS (assumed)
**Lint**: Clean

### Blocking
(none)

### Warnings
- [ ] `useProfile.ts` — [API client] Use a `profileKeys` factory instead of the inline `['profile', userId]` array for consistency, even though this key is otherwise correct.

### Suggestions
(none)

### What looks good
- Typed API response; `apiClient` used consistently.
- `enabled` guards the query when `userId` is missing.
- Loading, error, and empty states handled; centralized loader/notice components.
- Copy uses `t()` with interpolation.
- Tailwind used instead of inline styles.
```

---

## Example 4: Secrets, storage, and a chained route

**Input diff** (simplified):

```tsx
const API_KEY = 'sk-live-xxxxx';
localStorage.setItem('token', accessToken);

// projectApi.ts — collapses two IDs into one on the client
save: (combinedId: string, data: SaveMilestoneRequest) =>
  apiClient.post(`/v1/projects/save/${combinedId}`, data),
```

**Review output:**

```
## Code Review Summary (Frontend)

### Blocking
- [ ] `…` — [Security] API key hardcoded. Move to env (e.g. `import.meta.env` / build-time injection) and never commit secrets.
- [ ] `…` — [Security] Token in `localStorage` must follow project encryption rules for non-dev environments; use the team's secure storage helper.
- [ ] `projectApi.ts` — [API client] Endpoint path doesn't match the contract's `/projects/:groupId/milestones/:milestoneId/save` shape — both IDs must be passed as documented so the backend's chained-ownership check (owasp-security §1) receives what it expects, not a client-side combined ID.

### Warnings
(none)

### Suggestions
(none)
```
