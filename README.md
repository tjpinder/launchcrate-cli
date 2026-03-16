# Launch Crate CLI

**AI-powered feature scaffolding for Next.js. Vibe code safely.**

Launch Crate analyzes your existing Next.js project, learns your patterns, and generates new features that match your codebase exactly. It knows which files are safe to create and which ones to never touch.

## The Problem

AI coding tools are incredible at generating features — and terrible at respecting your existing architecture. They'll rewrite your auth, break your database layer, and ignore your project conventions. You spend more time fixing AI output than you saved.

## The Solution

```bash
# 1. Launch Crate learns your project
npx launchcrate init

# 2. It detects your stack, finds your patterns, and marks safe zones
#    ✓ Next.js 14 (App Router) | TypeScript | Prisma | NextAuth | Tailwind
#    ✗ Safe zones: auth/**, lib/db.*, middleware.*

# 3. Scaffold features that match YOUR code, not generic templates
npx launchcrate scaffold "invoice management system"

#    Analyzing feature specification...
#    ✓ Feature: Invoice (8 fields)
#    Generating code (reading your patterns)...
#    ✓ Generated 7 files
#
#    + src/app/api/invoices/route.ts
#    + src/app/api/invoices/[id]/route.ts
#    + src/app/dashboard/invoices/page.tsx
#    + src/app/dashboard/invoices/[id]/page.tsx
#    + src/app/dashboard/invoices/components/InvoiceForm.tsx
#    + src/app/dashboard/invoices/components/InvoiceList.tsx
#    + src/app/dashboard/invoices/types.ts
```

The generated code uses **your** ORM, **your** auth pattern, **your** component style, **your** import conventions. Not generic boilerplate — code that looks like you wrote it.

## How It Works

1. **`launchcrate init`** scans your project and creates `.launchcrate.json`:
   - Detects your stack (database, auth, styling)
   - Finds existing route and page files as reference patterns
   - Identifies safe zones (auth, database config, middleware) that should never be touched

2. **`launchcrate scaffold "description"`** generates a complete feature:
   - Uses Claude to analyze your description into a structured spec (fields, types, relationships)
   - Reads your existing code to learn your patterns
   - Generates files that match your conventions exactly
   - Only creates new files — never modifies existing ones

## Supported Stacks

Launch Crate works with any Next.js project. It auto-detects:

| Layer | Supported |
|-------|-----------|
| **Router** | App Router, Pages Router |
| **Language** | TypeScript, JavaScript |
| **Database** | Prisma, Drizzle, raw SQL (pg/mssql), Supabase, Mongoose |
| **Auth** | NextAuth/Auth.js, Clerk, Supabase Auth, Auth0 |
| **Styling** | Tailwind CSS, CSS Modules, styled-components |

## Installation

```bash
# Use directly with npx (no install needed)
npx launchcrate init
npx launchcrate scaffold "feature description"

# Or install globally
npm install -g launchcrate
```

## Setup

### 1. Initialize your project

```bash
cd your-nextjs-project
npx launchcrate init
```

This creates `.launchcrate.json` with your detected configuration. Review it and adjust safe zones if needed.

### 2. Set your API key

Launch Crate uses Claude for intelligent code generation. Set your API key:

```bash
# In your .env or .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Without an API key, `scaffold` falls back to basic templates (functional but not pattern-matched).

### 3. Scaffold features

```bash
# Interactive mode
npx launchcrate scaffold

# With inline description
npx launchcrate scaffold "customer ticket system with priority, status, assignee, and SLA tracking"

# Preview without writing files
npx launchcrate scaffold "blog posts" --dry-run

# Skip AI (use basic templates)
npx launchcrate scaffold "notes" --no-ai
```

## Safe Zones

The core idea: **some files should never be generated or modified by AI.**

When you run `init`, Launch Crate automatically identifies safe zones based on your stack:

- **Auth files** — your authentication config, middleware, auth API routes
- **Database config** — your ORM setup, connection files, schema definitions
- **Core middleware** — Next.js middleware, layout files, config

You can add custom safe zones in `.launchcrate.json`:

```json
{
  "safeZones": [
    "**/auth/**",
    "**/lib/db.*",
    "**/middleware.*",
    "**/lib/billing.*",
    "**/api/webhooks/**"
  ]
}
```

The scaffold command will never generate files that match these patterns.

## Commands

### `launchcrate init`

Detect your project and create `.launchcrate.json`.

| Flag | Description |
|------|-------------|
| `-f, --force` | Overwrite existing config without asking |

### `launchcrate scaffold [name]`

Generate a complete feature with API routes, pages, and components.

| Flag | Description |
|------|-------------|
| `-d, --description <desc>` | Feature description (skips interactive prompt) |
| `--no-ai` | Use basic templates instead of AI generation |
| `--dry-run` | Preview files without writing them |

## What Gets Generated

For each feature, Launch Crate creates:

| File | Purpose |
|------|---------|
| `api/{feature}/route.ts` | List (GET) and create (POST) endpoints |
| `api/{feature}/[id]/route.ts` | Get, update, delete endpoints |
| `dashboard/{feature}/page.tsx` | List view with search, filter, sort |
| `dashboard/{feature}/[id]/page.tsx` | Detail view with edit mode |
| `dashboard/{feature}/components/Form.tsx` | Reusable create/edit form |
| `dashboard/{feature}/components/List.tsx` | Table/list display component |
| `dashboard/{feature}/types.ts` | TypeScript interfaces |

## Configuration

`.launchcrate.json` reference:

```json
{
  "version": "1.0",
  "project": {
    "name": "my-app",
    "framework": "next",
    "frameworkVersion": "14.2.0",
    "router": "app",
    "srcDir": true,
    "language": "typescript"
  },
  "stack": {
    "database": "prisma",
    "auth": "next-auth",
    "styling": "tailwind"
  },
  "paths": {
    "root": ".",
    "features": "src/app",
    "components": "src/components",
    "lib": "src/lib",
    "api": "src/app/api"
  },
  "safeZones": [
    "**/auth/**",
    "**/lib/db.*",
    "**/middleware.*"
  ],
  "referenceFiles": [
    "src/app/api/projects/route.ts",
    "src/app/dashboard/projects/page.tsx"
  ]
}
```

## FAQ

**Does this modify my existing files?**
No. Launch Crate only creates new files. It reads existing files to learn your patterns but never writes to them.

**What if I don't have an Anthropic API key?**
The `scaffold` command falls back to basic templates. They're functional but won't match your specific code patterns.

**Does it work with monorepos?**
Run `init` and `scaffold` from the app directory (e.g., `apps/web`), not the monorepo root.

**Can I customize the generated code?**
Yes — it's your code. Edit it however you want after generation. The reference files in `.launchcrate.json` influence future generations, so the more consistent your codebase, the better the output.

## License

MIT

---

<p align="center">
  <sub>Built with Launch Crate? Test it with <a href="https://vibeproof.dev">VibeProof</a> — AI-powered QA for your app.</sub>
</p>
