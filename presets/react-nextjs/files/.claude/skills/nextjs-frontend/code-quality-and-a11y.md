# Code Quality & Accessibility

## ESLint / Prettier baseline

Use the project's existing config. If starting fresh:

```jsonc
// eslint.config.mjs (flat config) — minimal
import next from 'eslint-config-next';
import a11y from 'eslint-plugin-jsx-a11y';

export default [
  ...next,
  a11y.flatConfigs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'react/jsx-no-leaked-render': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
```

CI gate: `next lint` (or `eslint .`) + `tsc --noEmit` must pass on every PR.

## Component library first, then semantic HTML

**Use whatever component library the project has installed** — see [component-libraries.md](component-libraries.md). Library components carry accessibility, keyboard support, focus management, RTL, and theming for free — re-implementing them with `<button>` + Tailwind almost always loses one of those.

```tsx
// ❌ — re-rolling what the library already gives us
<button type="button" className="rounded bg-blue-600 px-4 py-2 text-white">Save</button>

// ✅ — AntD project
import { Button } from 'antd';
<Button type="primary" htmlType="submit">Save</Button>

// ✅ — MUI project
import Button from '@mui/material/Button';
<Button type="submit" variant="contained">Save</Button>

// ✅ — shadcn/ui project
import { Button } from '@/components/ui/button';
<Button type="submit">Save</Button>
```

Same rule for forms, inputs, modals, toasts, tables, and layout. See [component-libraries.md](component-libraries.md) for: detecting which library is installed from `package.json`, the per-library App Router setup (registries, providers), the Server→Client wrapping pattern, and the per-library form + Server Action pattern.

Reach for raw HTML only when (a) no library is installed, (b) the library has no equivalent (rare), or (c) progressive enhancement matters for a public form. The rules below apply in those cases.

## Semantic HTML (when raw HTML is the right call)

The first rule of ARIA is: **don't use ARIA**. Semantic HTML carries the semantics for free.

```tsx
// ❌
<div onClick={handleSubmit} role="button" tabIndex={0}>Submit</div>

// ✅
<button type="button" onClick={handleSubmit}>Submit</button>
```

Use the right element:

| Need | Element |
|---|---|
| Action button | `<button type="button">` (or `type="submit"` inside a form) |
| Navigation link | `<a>` (or `<Link>`) |
| Form labels | `<label htmlFor="…">` |
| Error message | `<p role="alert">` or `aria-describedby` linking to the input |
| Section landmarks | `<header>`, `<main>`, `<nav>`, `<aside>`, `<footer>` |
| Lists | `<ul>` / `<ol>` / `<dl>` |
| Quotes | `<blockquote>` / `<q>` |

## Forms

Every input has a programmatically associated label. Either wrap or use `htmlFor`/`id`:

```tsx
<div>
  <label htmlFor="email" className="block text-sm font-medium">
    Work email
  </label>
  <input
    id="email"
    name="email"
    type="email"
    autoComplete="email"
    required
    aria-describedby="email-help email-error"
    className="w-full rounded border p-2"
  />
  <p id="email-help" className="mt-1 text-xs text-gray-500">
    We'll only use this to send order updates.
  </p>
  {error && (
    <p id="email-error" role="alert" className="mt-1 text-sm text-red-600">
      {error}
    </p>
  )}
</div>
```

Always set `autoComplete` for known fields (`email`, `current-password`, `new-password`, `street-address`, `cc-number`). Browsers and password managers depend on it.

## Buttons and clickable things

`<button>` is the default for any interaction. Style it however you want; don't restyle a `<div>`.

If you need a button that looks like a link or vice versa, set `type="button"` (inside a form, default `type` is `submit` and that catches people out) and style with classes — keep the semantic element correct.

## Keyboard support

Every interactive element must be reachable via Tab and operable via Enter/Space (Enter for links, Enter+Space for buttons). If it's a `<button>` or `<a>`, this is free.

For custom widgets (combobox, menu, tabs), follow the WAI-ARIA Authoring Practices, or use a tested headless library (Radix, Headless UI, Ant Design). Don't roll your own focus management for complex widgets.

Visible focus:

```css
/* never do this */
*:focus { outline: none; }

/* do this */
*:focus-visible {
  outline: 2px solid theme('colors.blue.600');
  outline-offset: 2px;
}
```

Tailwind: keep `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2` on interactive utilities.

## Images

Every `<Image>` and `<img>` needs an `alt`:

- Decorative image → `alt=""` (empty string, not omitted).
- Informative image → describe the information, not the visual ("Profile photo of Sarah Chen", not "Image of a woman").
- Image inside a link with no other text → `alt` describes the link target.

## Color contrast

WCAG AA: 4.5:1 for normal text, 3:1 for large text (≥18.66px bold or ≥24px regular). Test with the browser devtools color picker or a contrast checker. Don't rely on color alone for status (errors need an icon or text marker, not just red).

## Headings

One `<h1>` per page (the route's title). Don't skip levels — `<h2>` follows `<h1>`, `<h3>` follows `<h2>`. If you need a visually small heading inside a section, that's a styling choice, not a level choice.

## Live regions

For toasts, success messages, validation summaries that appear dynamically:

```tsx
<div role="status" aria-live="polite">
  {message}
</div>

// for urgent errors only
<div role="alert" aria-live="assertive">
  {error}
</div>
```

Don't sprinkle `aria-live` on every element — it's noisy for screen readers.

## Logging

```ts
// ❌
console.log('user', user);

// ✅
import { logger } from '@/lib/logger';
logger.info('user.fetched', { userId: user.id });
```

`console.log` survives commits, ships to production, and pollutes browser consoles. The project's logger should be:
- A thin wrapper around the destination (Pino, console in dev, Datadog in prod).
- Stripped of sensitive fields by default.
- Structured, not stringly-typed.

Keep `console.warn` / `console.error` for genuinely exceptional client-side cases — they're allowed by the lint rule.

## Code review heuristics

Before opening a PR:

- [ ] No `console.log`, no `any`, no `as` casts that aren't justified.
- [ ] If the project has a component library, the change uses it (no re-rolled buttons, inputs, modals, toasts).
- [ ] Every interactive element is the library's component, or — when raw HTML is appropriate — `<button>` / `<a>` / `<input>`.
- [ ] Every input has an associated label.
- [ ] Every image has an `alt`.
- [ ] Focus states are visible.
- [ ] No `useEffect` for data the server could fetch.
- [ ] Server Actions revalidate after writing.
- [ ] No `"use client"` on pages or layouts.
- [ ] Tailwind classes use design tokens (no inline `style={{}}` for theme values).
- [ ] Any route/component that renders user-generated content follows `../owasp-security/SKILL.md`'s client-side security guidance (no unescaped `dangerouslySetInnerHTML` of untrusted input).

## DO

- Detect the project's component library from `package.json` and use it.
- Reach for semantic HTML before ARIA when raw HTML is the right call.
- Pair every input with a label.
- Use `next lint && tsc --noEmit` in CI.
- Use the project logger; keep `console` out of committed code.
- Test with keyboard only (Tab, Shift+Tab, Enter, Space, Esc) before merging UI work.

## DON'T

- Don't re-roll a button, input, modal, or toast in raw HTML when the project's component library has it.
- Don't make `<div>` clickable. It's a button.
- Don't remove focus outlines without providing a visible replacement.
- Don't communicate status through color alone.
- Don't add `role="button"` to a `<button>` — it's already a button.
- Don't put `aria-label` on something whose visible text already labels it.

## See also

- `../owasp-security/SKILL.md` — client-side security section referenced above
