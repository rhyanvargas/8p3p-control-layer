---
name: swagger-design
description: Edit and update Swagger UI design and API docs in the 8P3P control layer. Use when changing Swagger theme, lock icons, auth UX, OpenAPI descriptions, or /docs appearance.
---

# Swagger Design and API Docs

How to edit Swagger UI styling and OpenAPI-driven copy in this project. The API docs are served at `/docs` and built from a static OpenAPI spec plus custom theme CSS.

## Where Things Live

| What | Location |
|------|----------|
| Theme CSS (colors, locks, buttons) | `src/server.ts` — `swaggerBrandThemeCss` template literal |
| OpenAPI spec (paths, security, descriptions) | `docs/api/openapi.yaml` |
| Swagger/UI registration | `src/server.ts` — `server.register(swagger)` and `server.register(swaggerUi)` |

## Editing the Theme (CSS)

Theme CSS is injected via `@fastify/swagger-ui` in `src/server.ts`:

```ts
await server.register(swaggerUi, {
  routePrefix: '/docs',
  theme: {
    title: '8P3P Control Layer API Docs',
    css: [{ filename: '8p3p-theme.css', content: swaggerBrandThemeCss }]
  }
});
```

- **CSS variables** (e.g. `--brand-bg`, `--brand-accent`) are defined in `:root` inside `swaggerBrandThemeCss`. Use them for consistency.
- **All selectors must be scoped** with `.swagger-ui` so they don’t leak (e.g. `.swagger-ui .btn.execute`).
- **Swagger’s default CSS** can override yours; use `!important` sparingly when you need to win (e.g. lock icon `fill`).

### Lock Icons (Auth State)

Swagger uses “locked” = authorized (closed padlock), “unlocked” = not authorized. To make **authorized** state clearly visible (e.g. green “you have access”):

1. **Top-level Authorize button** when authorized: `.swagger-ui .btn.authorize.locked svg`
2. **Per-operation lock buttons**: the button often has only `class="authorization__btn"` and **no** `.locked` class; the state is in `aria-label="authorization button locked"`. Target it with:
   - `.swagger-ui .authorization__btn[aria-label="authorization button locked"] svg`
3. **Override default grey**: Swagger’s fill can win; use `fill: #49cc90 !important` (or your brand green) for the authorized lock SVGs.

Example block to keep in the theme:

```css
.swagger-ui .btn.authorize.locked svg,
.swagger-ui .authorization__btn.locked svg,
.swagger-ui .authorization__btn .locked svg,
.swagger-ui .authorization__btn[aria-label="authorization button locked"] svg {
  fill: #49cc90 !important;
  opacity: 1;
}
```

### Buttons and Layout

- **Authorize button**: `.swagger-ui .btn.authorize` (and `:hover`)
- **Execute button**: `.swagger-ui .btn.execute` (and `:hover`)
- **Opblocks (operation cards)**: `.swagger-ui .opblock`, `.swagger-ui .scheme-container`
- **Topbar / logo**: `.swagger-ui .topbar`, `.swagger-ui .topbar .link::after` (e.g. “8P3P” text)

## Editing OpenAPI Copy and Security

- **API-level description** (top of `/docs`): `docs/api/openapi.yaml` → `info.description`. Use it to explain auth (e.g. “lock icons turn green when authorized”).
- **Security scheme** (Authorize modal): `components.securitySchemes.ApiKeyAuth.description`. Explain that endpoints are locked until a valid key is entered and that locks turn green when authorized.
- **Global security**: `security: - ApiKeyAuth: []` at spec root applies to all operations; 401 responses and `api_key_required` / `api_key_invalid` are already documented on relevant paths.

After editing the YAML, run `npm run validate:api` (Redocly lint) and refresh `/docs`.

## Env and Auth Behavior

- **Auth is enforced** only when `API_KEY` is set at runtime. The server loads `process.env` from `.env` then `.env.local` at startup (see top of `src/server.ts`). If you change auth copy in the spec, ensure the app still loads env (e.g. dotenv for `.env`/`.env.local`) so the described behavior matches.
- **Per-org**: Optional `API_KEY_ORG_ID` pins the key to one org; document in the spec or `.env.example` as needed.

## Checklist for Design Changes

- [ ] Theme changes in `src/server.ts` use `.swagger-ui` scope and, if needed, `!important` for overrides.
- [ ] Lock “authorized” state targets both `.btn.authorize.locked` and `.authorization__btn[aria-label="authorization button locked"]` (and optionally `.authorization__btn .locked`).
- [ ] OpenAPI descriptions in `docs/api/openapi.yaml` stay in sync with behavior (auth, lock colors).
- [ ] Run `npm run validate:api` after editing the spec.
- [ ] Hard-refresh `/docs` (or restart dev server) to see CSS changes.
