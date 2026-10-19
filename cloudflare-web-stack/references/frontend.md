# Frontend architecture

## Standard libraries

- Use Tailwind CSS for styling in applications that include the standard backend stack.
- Use `lucide-react` for icons instead of adding another icon system.
- Use Jotai for shared client state; keep component-local state local.
- Wrap `clsx` and `tailwind-merge` in one shared `cn(...values)` helper and use it for conditional Tailwind classes.
- Use React Hook Form with `@hookform/resolvers/zod` and Zod for validated forms.
- Consume the Orval-generated `axios-functions` client rather than duplicating request and response types by hand.

## Page colocation

Put components used only by one page in the same directory as that page. Do not promote page-private components into a global components directory.

Within the page tree, code may reach through a parent directory only via a directory whose name starts with `@`, such as `@shared`. Use such directories for intentionally shared page-tree code. Keep global infrastructure such as the generated API client, generic UI primitives, and utilities in their established top-level locations.

Prefer configured absolute aliases over fragile relative traversal. Preserve the repository's existing alias spelling (`@/`, `~/`, or equivalent); the `@` rule above concerns directory names in the page tree, not the alias token.

## Optional UI primitives

shadcn/ui structure and Radix UI are optional. Choose them when the application benefits from reusable accessible primitives. If chosen, keep generic primitives in `components/ui` and page-specific compositions beside their page. Do not add either dependency to a small UI that does not need the abstraction.
