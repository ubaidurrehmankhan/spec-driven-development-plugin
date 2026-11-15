# API Client Patterns

The API client is the single point of contact with the backend. All HTTP calls go through it.

## Shared Client Setup

File: `src/services/apiClient.ts`

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default apiClient;
```

Rules:
- If the project already has an API client, use it — do NOT create a second one
- Base URL comes from environment variables, never hardcoded
- Auth token attached via request interceptor
- 401 handling via response interceptor (redirect to login)
- Adjust the interceptor logic to match the project's auth flow and the contract's stated default auth (see `../api-contracts/SKILL.md`)

## API Service Files

File: `src/services/<name>Api.ts` — one per domain entity. Base paths,
methods, and exact field names come from `docs/contracts/[module].contract.md`
(see `../api-contracts/SKILL.md`) — read the contract before writing this
file, not after.

```typescript
import apiClient from './apiClient';
import type { Product, CreateProductRequest, UpdateProductRequest, ProductFilters, PaginatedResponse } from '@/types/product';

export const productApi = {
  getAll: (filters?: ProductFilters) =>
    apiClient.get<PaginatedResponse<Product>>('/v1/products', { params: filters }).then((res) => res.data),

  getById: (id: string) =>
    apiClient.get<Product>(`/v1/products/${id}`).then((res) => res.data),

  create: (data: CreateProductRequest) =>
    apiClient.post<Product>('/v1/products', data).then((res) => res.data),

  update: (id: string, data: UpdateProductRequest) =>
    apiClient.patch<Product>(`/v1/products/${id}`, data).then((res) => res.data),

  delete: (id: string) =>
    apiClient.delete(`/v1/products/${id}`).then((res) => res.data),
};
```

### Key Patterns

**Always unwrap `.data`** — return the response body, not the Axios wrapper:
```typescript
// Good — hooks receive clean data
apiClient.get<Product[]>('/v1/products').then((res) => res.data)

// Bad — hooks receive AxiosResponse, components must dig into .data
apiClient.get<Product[]>('/v1/products')
```

**Typed generics** — every call has explicit request/response types:
```typescript
apiClient.get<Product>(`/v1/products/${id}`)
apiClient.post<Product>('/v1/products', data)
```

**Query params via `params`** — never build URL strings manually:
```typescript
// Good
apiClient.get('/v1/products', { params: { page: 1, limit: 10, search: 'widget' } })

// Bad
apiClient.get(`/v1/products?page=1&limit=10&search=widget`)
```

**Nested/chained routes** — when the contract's path has 2+ ID segments
(e.g. `/projects/:groupId/milestones/:milestoneId/save`), pass every ID
segment explicitly; don't collapse them into a single combined ID on the
frontend even if that would be more convenient — the backend needs both to
do its chained-ownership check (see `../owasp-security/SKILL.md` section 1).

```typescript
save: (groupId: string, milestoneId: string, data: SaveMilestoneRequest) =>
  apiClient
    .post<Milestone>(`/v1/projects/${groupId}/milestones/${milestoneId}/save`, data)
    .then((res) => res.data),
```

## URL Conventions

- API version prefix: `/v1/`
- Plural resource names: `/v1/products`, `/v1/orders`
- Nested resources: `/v1/orders/${orderId}/items`
- Match the exact paths documented in the contract — not the backend controller source, which the frontend batch does not read directly

## File Upload Pattern

For endpoints that accept files:

```typescript
export const documentApi = {
  upload: (file: File, metadata: { name: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', metadata.name);

    return apiClient
      .post<Document>('/v1/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => res.data);
  },
};
```

## What NOT to Do

- Do NOT import `axios` directly in components or hooks — always use `apiClient`
- Do NOT hardcode API URLs — use the service layer
- Do NOT add business logic in API service files — they are pure HTTP wrappers
- Do NOT catch errors in the service layer — let them bubble to react-query's `onError`
- Do NOT create multiple axios instances unless there are genuinely different backends
- Do NOT write a service file before its contract file exists — see `SKILL.md`
