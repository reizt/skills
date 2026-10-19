# Backend architecture

## Dependencies and contract flow

Use:

- `hono`
- `@hono/zod-openapi`
- `zod`
- `drizzle-orm` and `drizzle-kit` with Cloudflare D1
- Orval configured with `client: 'axios-functions'`
- Axios as the generated client's HTTP transport

The dependency direction is:

```text
routes ──uses──> contracts <──implements── services
```

Contracts hold service interfaces and application bindings. Prefix service interfaces with `I`, such as `IPasswordHasher`. Service classes use `class PasswordHasher implements IPasswordHasher`. Initialize services in `services-gate.ts` and pass them through `c.var`.

Do not create repository or store wrappers around D1. Route handlers access it directly with `drizzle(c.env.DB)`. Keep service implementations thin and replaceable; use them for capabilities such as hashing or mail delivery that are not route-owned database persistence.

## File layout

```text
api/src/
├── contracts/
│   ├── app.ts
│   └── <service>.ts
├── db/
│   └── schema.ts
├── routes/
│   └── <feature>/
│       └── <endpoint>.ts
├── services/
│   └── <service>.ts
├── <concern>-gate.ts
├── services-gate.ts
└── index.ts
```

Put each endpoint in one file. Define the endpoint's Zod request and response schemas in that same file. Use an `index.ts` inside a feature only to register routes, never to hold endpoint logic.

Give every business endpoint a stable, descriptive `operationId`. Treat it as public API because it determines generated client function names. Health checks and other non-client internal endpoints may omit it.

Implement middleware in files named `<concern>-gate.ts`, for example `auth-gate.ts` and `services-gate.ts`.

Put Drizzle migrations under the API package's `migrations/` directory. Keep secrets out of source control and use the repository's local secret mechanism, such as `.dev.vars`.

## Endpoint form

Export the route and its typed handler from the endpoint file:

```ts
export const listTodosRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: { 'application/json': { schema: todoListSchema } },
      description: 'Todo list',
    },
  },
});

export const listTodosHandler: RouteHandler<typeof listTodosRoute, AppBindings> = async (c) => {
  const rows = await drizzle(c.env.DB).select().from(todos);
  return c.json({ todos: rows }) as never;
};
```

In the entry or registration file, create an OpenAPI Hono app and register exported pairs:

```ts
const app = new OpenAPIHono<AppBindings>();
app.openapi(listTodosRoute, listTodosHandler);
```

Group routes with child `OpenAPIHono<AppBindings>` instances when a shared prefix or gate requires it. Register gates before the routes they protect.

## Errors and Worker compatibility

Represent expected HTTP failures with typed errors that carry a Hono `ContentfulStatusCode`. Convert them to responses in one `app.onError` handler rather than repeating response mapping in route handlers. Log unexpected errors without leaking their details to clients.

Use Worker-compatible Web APIs for UUIDs, cryptography, HTTP, encoding, and time-related primitives. Do not introduce Node.js-only APIs into Worker code unless the deployed compatibility mode and dependency require them.

## Cookie authentication

When authentication uses cookies, configure the complete boundary together:

- Set `httpOnly`, `sameSite`, `secure`, `path`, and expiry explicitly.
- Enable Axios credentials on the shared client.
- Allow only configured frontend origins in Hono CORS and enable credentials.
- Keep session validation and account injection in an authentication gate.

Do not apply these cookie rules to token-based authentication.

## API client generation

Treat the OpenAPI document as the boundary between backend and frontend. Configure Orval to generate Axios functions, for example:

```ts
export default defineConfig({
  api: {
    input: 'src/api/openapi.json',
    output: {
      client: 'axios-functions',
      httpClient: 'axios',
      mode: 'single',
      target: 'src/api/generated.ts',
    },
  },
});
```

Adapt paths and an Axios mutator to the chosen package shape. Preserve credentials and the API base URL in the shared Axios instance when authentication requires them.
