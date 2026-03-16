# Launch Crate CLI

**AI-powered feature scaffolding for Next.js. Vibe code safely.**

Launch Crate scans your Next.js project for security issues, generates AI safety rules, and scaffolds new features that match your existing code patterns. It knows which files are safe to create and which ones to never touch.

## Quick Start

```bash
# Audit your project's vibe safety
npx launchcrate audit

#   Scanned 3,051 files
#
#   ┌─────────────────────────────────────┐
#   │  Vibe Safety Score: B (71/100)      │
#   └─────────────────────────────────────┘
#
#   Breakdown:
#     Authentication       ████████████████████ 100%
#     Injection Safety     ░░░░░░░░░░░░░░░░░░░░   0%
#     Secrets Management   █████████████████░░░  85%
#     Input Validation     ████████████████████ 100%
#     Error Handling       ████████████████████ 100%
#
#   CRITICAL (8)
#     ✗ src/lib/db/jira.ts:181 — SQL query uses string concatenation
#     ✗ src/app/api/admin/route.ts:145 — SQL injection risk
#     ...

# Generate AI safety rules for Claude Code and Cursor
npx launchcrate guard

#   + CLAUDE.md (47 rules)
#   + .cursorrules

# Detect your project and set up safe zones
npx launchcrate init

# Scaffold a complete feature that matches your patterns
npx launchcrate scaffold "invoice management system"

#   ✓ Feature: Invoice (8 fields)
#   ✓ Generated 7 files
#
#   + src/app/api/invoices/route.ts
#   + src/app/api/invoices/[id]/route.ts
#   + src/app/dashboard/invoices/page.tsx
#   + src/app/dashboard/invoices/[id]/page.tsx
#   + src/app/dashboard/invoices/components/InvoiceForm.tsx
#   + src/app/dashboard/invoices/components/InvoiceList.tsx
#   + src/app/dashboard/invoices/types.ts
```

## Why?

AI coding tools generate features fast — and break your auth, database, and billing even faster. You spend more time fixing AI output than you saved.

Launch Crate fixes this with three steps:

1. **Audit** — find what AI already broke (security issues, injection risks, leaked secrets)
2. **Guard** — generate rules so AI can't break it again (CLAUDE.md, .cursorrules)
3. **Scaffold** — build new features safely (code that matches YOUR patterns, not generic templates)

## Commands

### `launchcrate audit`

Scan your codebase for security issues and get a **Vibe Safety Score** (0-100).

```bash
npx launchcrate audit          # Terminal output with color
npx launchcrate audit --json   # Machine-readable JSON
```

Checks for:
- **Unprotected API routes** — endpoints missing auth checks
- **SQL injection** — string concatenation in queries
- **Hardcoded secrets** — API keys, tokens, passwords in source code
- **Missing input validation** — request bodies used without validation
- **Error leaks** — stack traces exposed to clients
- **XSS risks** — dangerouslySetInnerHTML with user content

Score breakdown with weighted categories:

| Category | Weight | What it checks |
|----------|--------|----------------|
| Authentication | 30% | Auth on every API route |
| Injection Safety | 25% | Parameterized queries, no XSS |
| Secrets Management | 25% | No hardcoded credentials |
| Input Validation | 10% | Zod/Yup/Joi on request bodies |
| Error Handling | 10% | No stack traces in responses |

Exits with code 1 if critical issues found — use in CI to block unsafe merges:

```yaml
# .github/workflows/audit.yml
- run: npx launchcrate audit
```

### `launchcrate guard`

Auto-generate AI safety rules from your project's actual architecture.

```bash
npx launchcrate guard              # Generate CLAUDE.md + .cursorrules
npx launchcrate guard --format claude   # CLAUDE.md only
npx launchcrate guard --format cursor   # .cursorrules only
```

Analyzes your project and generates rules covering:
- **Safe zones** — files AI must never modify (auth, db, middleware)
- **Database patterns** — how to query (your ORM, your import paths)
- **Auth patterns** — how auth works (your wrappers, your session handling)
- **Security rules** — no hardcoded secrets, parameterized queries only
- **Code conventions** — import style, naming, error handling

With `ANTHROPIC_API_KEY` set, rules are tailored to your specific codebase by reading your existing code. Without it, generates from a template based on detected stack.

Commit the generated files so every AI coding session respects your architecture.

### `launchcrate init`

Detect your project structure and create `.launchcrate.json` config.

```bash
npx launchcrate init           # Interactive detection
npx launchcrate init --force   # Overwrite existing config
```

Auto-detects:
- Framework version and router type (App Router / Pages Router)
- Database (Prisma, Drizzle, raw SQL, Supabase, Mongoose)
- Auth (NextAuth, Clerk, Auth0, Supabase Auth)
- Styling (Tailwind, CSS Modules, styled-components)
- Reference files (existing routes and pages to learn patterns from)
- Safe zones (files that should never be touched)

### `launchcrate scaffold [name]`

Generate a complete feature with API routes, pages, and components.

```bash
npx launchcrate scaffold                                    # Interactive
npx launchcrate scaffold "customer tickets with SLA"        # With description
npx launchcrate scaffold "blog posts" --dry-run             # Preview only
npx launchcrate scaffold "notes" --no-ai                    # Basic templates
```

| Flag | Description |
|------|-------------|
| `-d, --description <desc>` | Feature description (skips prompt) |
| `--no-ai` | Use basic templates instead of AI generation |
| `--dry-run` | Preview files without writing them |

Requires `ANTHROPIC_API_KEY` for AI-powered generation. Without it, generates functional but generic code.

Generated code uses **your** ORM, **your** auth pattern, **your** component style, **your** import conventions. Not generic boilerplate — code that looks like you wrote it.

#### What gets generated

| File | Purpose |
|------|---------|
| `api/{feature}/route.ts` | List (GET) and create (POST) endpoints |
| `api/{feature}/[id]/route.ts` | Get, update, delete endpoints |
| `dashboard/{feature}/page.tsx` | List view with search, filter, sort |
| `dashboard/{feature}/[id]/page.tsx` | Detail view with edit mode |
| `dashboard/{feature}/components/Form.tsx` | Reusable create/edit form |
| `dashboard/{feature}/components/List.tsx` | Table/list display component |
| `dashboard/{feature}/types.ts` | TypeScript interfaces |

## Supported Stacks

Launch Crate works with any Next.js project. It auto-detects:

| Layer | Supported |
|-------|-----------|
| **Router** | App Router, Pages Router |
| **Language** | TypeScript, JavaScript |
| **Database** | Prisma, Drizzle, raw SQL (pg/mssql), Supabase, Mongoose |
| **Auth** | NextAuth/Auth.js, Clerk, Supabase Auth, Auth0 |
| **Styling** | Tailwind CSS, CSS Modules, styled-components |

## GitHub Action

Add Launch Crate to your CI pipeline to audit every pull request:

```yaml
# .github/workflows/vibecheck.yml
name: Vibe Safety Check
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tjpinder/launchcrate-cli@v1
```

The action:
- Posts a **PR comment** with your Vibe Safety Score and findings breakdown
- **Fails the check** if critical issues are found (configurable)
- Updates the comment on subsequent pushes (no spam)

### Options

```yaml
- uses: tjpinder/launchcrate-cli@v1
  with:
    fail-on-critical: 'true'        # Block merge on critical findings (default: true)
    comment-on-pr: 'true'           # Post results as PR comment (default: true)
    working-directory: 'apps/web'   # For monorepos (default: repo root)
```

## Safe Zones

The core idea: **some files should never be generated or modified by AI.**

`init` automatically identifies safe zones. `guard` writes them into CLAUDE.md. `scaffold` respects them when generating code. Customize in `.launchcrate.json`:

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

## Setup

### API Key (optional but recommended)

```bash
# In your .env or .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Required for `scaffold` (AI code generation) and `guard` (project-specific rules). Without it, both commands fall back to templates.

`audit` and `init` work without an API key.

## FAQ

**Does this modify my existing files?**
No. Launch Crate only creates new files. `guard` generates new CLAUDE.md/.cursorrules files (with confirmation if they exist). `scaffold` only creates new feature files. Nothing reads, modifies, or deletes your existing code.

**Can I use this in CI?**
Yes. `audit` exits with code 1 on critical findings and supports `--json` output. Use it as a CI gate to block unsafe merges.

**Does it work with monorepos?**
Run commands from the app directory (e.g., `apps/web`), not the monorepo root.

**What if I don't have an Anthropic API key?**
`audit` and `init` work without one. `scaffold` falls back to basic templates. `guard` falls back to stack-based rules.

**Can I customize the generated code?**
Yes — it's your code. The reference files in `.launchcrate.json` influence future generations, so the more consistent your codebase, the better the output.

## License

MIT

---

<p align="center">
  <sub>Built with Launch Crate? Test it with <a href="https://vibeproof.dev">VibeProof</a> — AI-powered QA for your vibe-coded app.</sub>
</p>
