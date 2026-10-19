# Package shapes and deployment

Choose the smallest shape that preserves the product's real boundaries.

| Shape | Choose when | Deployment |
| --- | --- | --- |
| Next monolith with Hono | One product and one release unit; server and UI should stay together | Deploy Next through `@opennextjs/cloudflare` to Cloudflare Workers |
| Next + Hono | Next features are useful, but the API needs an independent boundary, lifecycle, or additional clients | Deploy Next through `@opennextjs/cloudflare` and deploy Hono separately to Cloudflare Workers |
| Vite + Hono | The frontend is a client-rendered app and does not need Next-specific capabilities | Deploy Vite to Cloudflare Pages and Hono to Cloudflare Workers |

For Next + Hono and Vite + Hono, use Bun workspaces and Turborepo. Keep package scripts callable from root scripts rather than mixing package managers. Each implementation package should expose `build`, `check`, `dev`, `format`, `lint`, and `typecheck` where applicable. Do not add workspace or Turborepo overhead to a Next monolith.

For every Hono backend, use Cloudflare D1 with Drizzle and deploy to Cloudflare Workers. A Vite frontend goes to Cloudflare Pages; a Next frontend goes to Cloudflare Workers through OpenNext.

Enable Cloudflare observability logs and traces in production Wrangler configuration. Select a trace sampling rate appropriate to traffic volume and cost instead of assuming full sampling everywhere.
