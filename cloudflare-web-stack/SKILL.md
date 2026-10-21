---
name: cloudflare-web-stack
disable-model-invocation: true
description: Apply the user's standard Bun, Hono, and Cloudflare TypeScript architecture when creating, restructuring, or extending web apps, APIs, routes, services, frontend pages, or project scaffolding. Use for new projects and compatible existing projects; preserve an established conflicting stack unless the user asks to migrate it.
---

# Cloudflare Web Stack

Use this architecture as the user's default for TypeScript web application work. Explicit user instructions and repository-local conventions take precedence; do not silently migrate an existing conflicting stack.

## Always use

- Bun as runtime and package manager. Use `bun install` and `bun run ...`; do not introduce npm, pnpm, or Yarn lockfiles.
- Biome for formatting and linting. Do not add ESLint or Prettier unless required by an existing repository or explicitly requested.
- Lefthook for pre-commit checks. Scope jobs by package where useful and run the package's check command on staged changes.
- Vitest for unit tests.
- Strict TypeScript with `moduleResolution: 'Bundler'` and a source-root path alias. For a new package, copy [assets/tsconfig.json](assets/tsconfig.json), then add only framework- or runtime-specific fields such as Next plugins or Cloudflare Worker types.

## Select the package shape

Choose among the supported shapes from the product requirements; read [references/package-shapes.md](references/package-shapes.md) before scaffolding or changing package boundaries.

- Next monolith with Hono
- Next frontend + Hono API
- Vite frontend + Hono API

Do not treat the current repository shape as mandatory. If the requirements do not decide the shape, recommend one and state the deciding tradeoff.

Except for a Next monolith, use Bun workspaces and Turborepo. Expose consistent package scripts through root scripts; each implementation package should provide `build`, `check`, `dev`, `format`, `lint`, and `typecheck` where applicable.

## When the application has a backend

Use Cloudflare D1, Drizzle ORM, Hono, Tailwind CSS, and Cloudflare Workers. Define the API contract with `@hono/zod-openapi`, generate the client with Orval using `axios-functions`, and execute requests with Axios.

Follow the route/contracts/services architecture in [references/backend.md](references/backend.md). Keep database access in route handlers; services are thin, replaceable implementations of contracts rather than database repositories.

Use stable `operationId` values for business endpoints, centralized typed HTTP errors, and Worker-compatible Web APIs. For cookie authentication, configure the cookie, Axios credentials, and CORS together.

After an API contract changes, regenerate the client before verification. Never hand-edit generated client code.

## Frontend

Use Lucide React icons, Jotai for shared client state, a shared `cn` helper built from `clsx` and `tailwind-merge`, and React Hook Form with `@hookform/resolvers` plus Zod for forms. Follow the colocation and import-boundary rules in [references/frontend.md](references/frontend.md).

shadcn/ui structure and Radix UI are optional. Use them when reusable accessible primitives materially help; do not add them as unconditional dependencies.

## Verification

Preserve the repository's scripts when present. For this architecture, ensure the root exposes checks equivalent to:

1. `bun run check`
2. `bun run build`

Run both before committing. If the API contract changed, run `bun run generate:api` first. Report any verification that could not be run.

Enable Cloudflare logs and traces for production deployments; choose the trace sampling rate for the expected traffic and cost.

Playwright is optional. Add it for important browser journeys or when end-to-end coverage is requested; run it against the real local web app, API, and D1 rather than mocked boundaries.
