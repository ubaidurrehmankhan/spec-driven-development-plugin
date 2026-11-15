---
name: nextjs-component-libraries
description: UI component library usage in Next.js App Router — detect which library the project actually uses (Ant Design, Material UI / MUI, Chakra UI, Mantine, Radix / shadcn/ui, Headless UI, HeroUI) and apply that library's App Router setup, SSR registry, Client Component boundary, Form + Server Action pattern, theming, and centralized notifications. Load when building any UI in a project that has a component library installed, choosing between library components and raw HTML, or wiring a library into App Router for the first time.
---

# Component Libraries (multi-library, library-first)

## Default rule

**Use whatever component library the project already has.** Don't re-roll a button, input, modal, table, or notification when a tested, accessible library component already exists.

For a new project with no library installed yet and no stated preference,
Ant Design is a reasonable default choice — well-supported App Router
integration, broad component coverage. For an existing project, **match
what's installed**; don't introduce a second library without an explicit
decision to do so.

## Detect the library first

Read `package.json` before writing UI code. The first match wins:

| Dependency | Library | App Router specifics |
|---|---|---|
| `antd` | **Ant Design** | Needs `@ant-design/nextjs-registry` for SSR styles |
| `@mui/material` | **Material UI (MUI)** | Needs `@mui/material-nextjs` AppRouterCacheProvider |
| `@chakra-ui/react` | **Chakra UI** | Needs `<CacheProvider>` from `@chakra-ui/next-js` |
| `@mantine/core` | **Mantine** | Needs `<MantineProvider>` + `ColorSchemeScript` |
| `@radix-ui/react-*` only | **Radix primitives + Tailwind** | No registry needed; render as Client Components |
| `components/ui/*` Radix-style files + `tailwindcss` | **shadcn/ui** | Same as Radix; components live in your repo |
| `@headlessui/react` | **Headless UI** | No registry needed |
| `@heroui/react` (or `@nextui-org/react`) | **HeroUI** (formerly NextUI) | Needs `<HeroUIProvider>` |
| None of the above | Raw HTML + Tailwind | Use semantic HTML; see [code-quality-and-a11y.md](code-quality-and-a11y.md) |

If two libraries appear in `package.json` (e.g., AntD plus a half-migrated MUI), don't mix them in the same screen. Pick the library the change touches; flag the dual-library state for cleanup.

## Library-agnostic principles

These hold for every library on the list:

1. **Library components are Client Components.** Anything that imports the library can't be rendered from a Server Component directly. Pattern: Server Component fetches data → passes it as props to a small Client wrapper that renders the library.
2. **Form validation drives off the Server Action's typed return value.** Whatever the library's form API is, the source of truth for errors is the action's return shape. The client form surfaces those errors using the library's per-input error mechanism.
3. **Centralize the theme** (one tokens file in `src/lib/theme.ts` or equivalent) and **centralize feedback** (one notification helper). No ad-hoc spinners or toasts per screen.
4. **Wire fonts via `next/font` variables**, not the library's font import — avoids a second font fetch.
5. **CSS-in-JS libraries (AntD, MUI, Chakra, Mantine) need an SSR registry** wrapping the layout. Skipping it means a flash of unstyled content on first paint.

## Primitive → library component mapping

| Need | AntD | MUI | Chakra | Mantine | Radix / shadcn | Headless UI | HeroUI |
|---|---|---|---|---|---|---|---|
| Action / submit | `<Button>` | `<Button>` | `<Button>` | `<Button>` | `<Button>` (shadcn) | render `<button>` | `<Button>` |
| Text input | `<Input>` | `<TextField>` | `<Input>` | `<TextInput>` | `<Input>` (shadcn) | render `<input>` | `<Input>` |
| Select | `<Select>` | `<Select>` / `<Autocomplete>` | `<Select>` | `<Select>` / `<MultiSelect>` | `<Select>` (Radix) | `<Listbox>` / `<Combobox>` | `<Select>` |
| Date picker | `<DatePicker>` | `<DatePicker>` (lab) | community add-on | `<DateInput>` | community / day-picker | community | `<DatePicker>` |
| Form | `<Form>` + `<Form.Item>` | `react-hook-form` + MUI inputs | `react-hook-form` + Chakra inputs | `useForm` (Mantine) | `react-hook-form` + Radix | `react-hook-form` + Headless UI | `react-hook-form` + HeroUI |
| Modal | `<Modal>` | `<Dialog>` | `<Modal>` | `<Modal>` | `<Dialog>` (Radix) | `<Dialog>` | `<Modal>` |
| Toast / notification | `notification.*` / `message.*` | `<Snackbar>` | `useToast()` | `notifications.*` | `sonner` / shadcn `<Toaster>` | community | `addToast()` |
| Table | `<Table>` | `<DataGrid>` (X) | community | `<Table>` | `@tanstack/react-table` + shadcn `<Table>` | render `<table>` | `<Table>` |
| Layout | `<Layout>` / `<Row>` / `<Col>` | `<Box>` / `<Grid>` | `<Box>` / `<Grid>` | `<Group>` / `<Stack>` / `<Grid>` | Tailwind utilities | Tailwind utilities | Tailwind utilities |

Reach for raw HTML only when (a) no library is installed, (b) the library has no equivalent (rare), or (c) progressive-enhancement matters for a public form.

---

## Library-specific App Router setup

### Ant Design

```bash
npm i antd @ant-design/cssinjs @ant-design/nextjs-registry
```

```tsx
// app/layout.tsx
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, App as AntdApp } from 'antd';
import enUS from 'antd/locale/en_US';
import { theme } from '@/lib/theme';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <ConfigProvider locale={enUS} theme={theme}>
            <AntdApp>{children}</AntdApp>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
```

```ts
// src/lib/theme.ts
import type { ThemeConfig } from 'antd';

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#0d6efd',
    fontFamily: 'var(--font-inter), system-ui, sans-serif',
    borderRadius: 8,
  },
  components: {
    Button: { controlHeight: 40, fontWeight: 500 },
    Input: { controlHeight: 40 },
  },
};
```

`<AntdApp>` exposes the App-aware `message`, `notification`, and `Modal.confirm` hooks via `App.useApp()`. The static `message.success(...)` calls bypass `ConfigProvider` and miss the theme — avoid them.

#### AntD form + Server Action

```tsx
// app/posts/new/new-post-form.tsx
'use client';

import { useTransition } from 'react';
import { App, Button, Form, Input } from 'antd';
import { createPost } from '../actions';

type Values = { title: string; body: string };

export function NewPostForm() {
  const [form] = Form.useForm<Values>();
  const [isPending, startTransition] = useTransition();
  const { message } = App.useApp();

  const onFinish = (values: Values) => {
    startTransition(async () => {
      const result = await createPost(values);
      if (result.status === 'error') {
        if (result.fieldErrors) {
          form.setFields(
            Object.entries(result.fieldErrors).map(([name, errors]) => ({
              name,
              errors: errors as string[],
            })),
          );
        } else {
          message.error(result.message);
        }
        return;
      }
      message.success('Post published');
      form.resetFields();
    });
  };

  return (
    <Form<Values> form={form} layout="vertical" onFinish={onFinish} disabled={isPending}>
      <Form.Item
        name="title"
        label="Title"
        rules={[
          { required: true, message: 'Title is required' },
          { max: 200, message: 'Title must be 200 characters or fewer' },
        ]}
      >
        <Input autoFocus />
      </Form.Item>
      <Form.Item name="body" label="Body" rules={[{ required: true, message: 'Body is required' }]}>
        <Input.TextArea rows={8} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={isPending}>Publish</Button>
      </Form.Item>
    </Form>
  );
}
```

---

### Material UI (MUI)

```bash
npm i @mui/material @emotion/react @emotion/styled @mui/material-nextjs
```

```tsx
// app/layout.tsx
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from '@/lib/theme';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
```

```ts
// src/lib/theme.ts
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: { primary: { main: '#0d6efd' } },
  typography: { fontFamily: 'var(--font-inter), system-ui, sans-serif' },
});
```

#### MUI form + Server Action (with `react-hook-form`)

```tsx
// app/posts/new/new-post-form.tsx
'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Stack, TextField } from '@mui/material';
import { createPost } from '../actions';

type Values = { title: string; body: string };

export function NewPostForm() {
  const { register, handleSubmit, setError, formState: { errors }, reset } = useForm<Values>();
  const [isPending, startTransition] = useTransition();

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createPost(values);
      if (result.status === 'error') {
        if (result.fieldErrors) {
          for (const [name, msgs] of Object.entries(result.fieldErrors)) {
            setError(name as keyof Values, { message: (msgs as string[]).join(', ') });
          }
        }
        return;
      }
      reset();
    });
  });

  return (
    <Stack component="form" spacing={2} onSubmit={onSubmit}>
      <TextField
        label="Title"
        {...register('title', { required: 'Title is required', maxLength: { value: 200, message: 'Max 200 chars' } })}
        error={!!errors.title}
        helperText={errors.title?.message}
        autoFocus
      />
      <TextField
        label="Body"
        multiline
        rows={8}
        {...register('body', { required: 'Body is required' })}
        error={!!errors.body}
        helperText={errors.body?.message}
      />
      <Button type="submit" variant="contained" disabled={isPending}>
        {isPending ? 'Publishing…' : 'Publish'}
      </Button>
    </Stack>
  );
}
```

---

### Chakra UI

```bash
npm i @chakra-ui/react @chakra-ui/next-js @emotion/react @emotion/styled framer-motion
```

```tsx
// app/providers.tsx
'use client';
import { CacheProvider } from '@chakra-ui/next-js';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '@/lib/theme';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CacheProvider>
      <ChakraProvider theme={theme}>{children}</ChakraProvider>
    </CacheProvider>
  );
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Toasts: `useToast()` inside any Client Component. Wrap once in a `useNotify()` helper for consistent placement/duration.

---

### Mantine

```bash
npm i @mantine/core @mantine/hooks @mantine/form @mantine/notifications
```

```tsx
// app/layout.tsx
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { theme } from '@/lib/theme';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><ColorSchemeScript /></head>
      <body>
        <MantineProvider theme={theme}>
          <Notifications position="top-right" />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
```

`ColorSchemeScript` runs before paint to avoid a dark-mode flash. Forms use `@mantine/form`'s `useForm({ validate })`; submit handlers call the Server Action and map errors via `form.setErrors({...})`.

---

### Radix UI primitives + Tailwind (and shadcn/ui)

No registry needed — Radix is unstyled and Tailwind is build-time. Components are still Client Components when they use Radix's hooks/state, so add `'use client'` to the file that wraps the primitive.

```tsx
// src/components/ui/dialog.tsx
'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export function DialogContent({ children }: { children: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50" />
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg">
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
```

For shadcn/ui, the components already live in `src/components/ui/` after `npx shadcn@latest add <name>` — they're yours to edit.

Forms: `react-hook-form` + Zod resolver, with shadcn's `<Form>` wrapper around Radix Label/Description/Message primitives. Toasts: shadcn's `<Toaster>` (which uses [sonner](https://sonner.emilkowal.ski)) wrapped once in the root layout.

---

### Headless UI

```bash
npm i @headlessui/react
```

No provider, no registry — primitives only. Same Client Component rule. Style with Tailwind. Pair with `@headlessui/tailwindcss` plugin for `data-headlessui-state` variants.

---

### HeroUI (formerly NextUI)

```bash
npm i @heroui/react framer-motion
```

```tsx
// app/providers.tsx
'use client';
import { HeroUIProvider } from '@heroui/react';
import { ToastProvider } from '@heroui/toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HeroUIProvider>
      <ToastProvider />
      {children}
    </HeroUIProvider>
  );
}
```

`addToast(...)` is the centralized notification API.

---

## Server → Client wrapping pattern (applies to every library)

```tsx
// app/orders/page.tsx (Server Component)
import { listMyOrders } from '@/server/orders';
import { OrdersTable } from './orders-table';

export default async function OrdersPage() {
  const orders = await listMyOrders();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Orders</h1>
      <OrdersTable orders={orders} />
    </main>
  );
}
```

```tsx
// app/orders/orders-table.tsx (Client wrapper around the library's table)
'use client';
import { Table, Tag, type TableProps } from 'antd'; // swap for the project's library
import type { Order } from '@/server/orders';

const columns: TableProps<Order>['columns'] = [
  { title: 'Order #', dataIndex: 'id', key: 'id' },
  { title: 'Customer', dataIndex: 'customerName', key: 'customerName' },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    render: (s: Order['status']) => <Tag color={s === 'Paid' ? 'green' : 'orange'}>{s}</Tag>,
  },
];

export function OrdersTable({ orders }: { orders: Order[] }) {
  return <Table<Order> rowKey="id" columns={columns} dataSource={orders} pagination={{ pageSize: 20 }} />;
}
```

Server Component stays lean (data + layout). Client wrapper holds library imports. Keeps the JS bundle small for non-library parts of the page.

## Form pattern across libraries (one principle, different APIs)

The Server Action is the source of truth for validation. The client form surfaces field errors using the library's mechanism:

| Library | Set field errors via |
|---|---|
| Ant Design | `form.setFields([{ name, errors: [...] }])` |
| MUI + react-hook-form | `setError(name, { message })` |
| Chakra + react-hook-form | `setError(name, { message })` |
| Mantine | `form.setErrors({ name: 'message' })` |
| Radix / shadcn + react-hook-form | `setError(name, { message })` |
| Headless UI + react-hook-form | `setError(name, { message })` |
| HeroUI + react-hook-form | `setError(name, { message })` |

The Server Action's typed return shape (`{ status: 'error', fieldErrors: {...} }`) stays the same regardless of library — see [server-actions-and-mutations.md](server-actions-and-mutations.md).

## Centralized notifications

Whatever the library, expose **one** hook so screens don't drift:

```tsx
// src/components/feedback/notify.ts
'use client';

// AntD
import { App } from 'antd';
export function useNotify() {
  const { message, notification, modal } = App.useApp();
  return {
    success: (text: string) => message.success(text, 2),
    error: (text: string) => notification.error({ message: 'Error', description: text }),
    confirm: (title: string, content: string) =>
      new Promise<boolean>((resolve) => {
        modal.confirm({ title, content, onOk: () => resolve(true), onCancel: () => resolve(false) });
      }),
  };
}
```

Swap the imports for Chakra's `useToast()`, Mantine's `notifications.show()`, sonner's `toast()`, or HeroUI's `addToast()`. The shape stays the same. Every Client Component imports `useNotify()`, never the library's primitive directly.

## RTL and locale

| Library | Mechanism |
|---|---|
| AntD | `<ConfigProvider direction="rtl" locale={arEG}>` |
| MUI | `<ThemeProvider theme={createTheme({ direction: 'rtl' })}>` + `stylis` RTL plugin in the cache provider |
| Chakra | `<ChakraProvider theme={extendTheme({ direction: 'rtl' })}>` |
| Mantine | `<MantineProvider theme={{ dir: 'rtl' }}>` (and `<DirectionProvider>` for Radix-backed bits) |
| Radix / shadcn | `<DirectionProvider dir="rtl">` plus Tailwind's `rtl:` variants |
| HeroUI | `<HeroUIProvider locale="ar-EG">` (uses native `dir`) |

Don't hand-flip CSS — pass `direction`/`dir` once at the provider level and the library propagates it.

## DO

- Read `package.json` first; use the library that's already installed.
- Wrap the layout once with the library's required provider/registry.
- Centralize the theme in `src/lib/theme.ts` and feedback in a `useNotify()` hook.
- Keep library imports in Client wrappers; let Server Components fetch data.
- Drive form errors off the Server Action's typed return value.
- Use `next/font` variables in the library's typography config — one font fetch, not two.

## DON'T

- Don't introduce a second component library when one is already installed.
- Don't import the library directly into a Server Component — you'll get a runtime/build error.
- Don't skip the SSR registry on AntD / MUI / Chakra / Mantine — flash of unstyled content.
- Don't use the library's static notification API (`message.success(...)`, raw `toast(...)`) directly across the app — wrap once.
- Don't import the library's CSS reset alongside its provider (e.g., `antd/dist/reset.css` with `ConfigProvider`) — duplicate styles, subtle bugs.
- Don't hand-roll a button, modal, or toast in any project that has a component library — use what's there.
