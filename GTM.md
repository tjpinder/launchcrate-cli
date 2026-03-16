# Launch Crate CLI — Go-to-Market & Distribution Plan

## Product Suite

### Live (v0.1.0)
- [x] `launchcrate audit` — Security scanner with Vibe Safety Score (0-100)
- [x] `launchcrate guard` — Generate CLAUDE.md + .cursorrules from project analysis
- [x] `launchcrate init` — Detect project stack, safe zones, reference files
- [x] `launchcrate scaffold` — AI-powered feature generation matching existing patterns
- [x] Website: https://launchcrate.vibeproof.tech
- [x] npm: `npx launchcrate`
- [x] GitHub: https://github.com/tjpinder/launchcrate-cli

### To Build

| Tool | Type | Direct VibeProof Funnel | Build Effort |
|------|------|------------------------|--------------|
| **GitHub Action** (`launchcrate-audit`) | GitHub Actions Marketplace | PR comments link to VibeProof | 1-2 days |
| **Cursorrules web generator** | SEO landing page on site | Footer + email capture | 1 day |
| **`launchcrate test-gap`** | CLI subcommand | "Generate tests → VibeProof" | 1-2 days |
| **`launchcrate check`** | Git pre-commit hook | Daily brand touchpoint | 1 day |
| **VS Code extension** | VS Code Marketplace listing | Status bar + settings link | 2-3 days |

---

## Organic Distribution Channels

### 1. GitHub Actions Marketplace

**What:** Publish `launchcrate-audit` as a reusable GitHub Action that comments on PRs with audit findings + Vibe Safety Score.

**Usage:**
```yaml
# .github/workflows/vibecheck.yml
name: Vibe Safety Check
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tjpinder/launchcrate-audit@v1
        with:
          fail-on-critical: true
```

**PR comment output:**
```
## Vibe Safety Score: B (71/100)

| Category | Score |
|----------|-------|
| Authentication | 100% |
| Injection Safety | 0% |
| Secrets Management | 85% |

### Critical (3 new in this PR)
- `src/app/api/users/route.ts:14` — No auth check
- ...

> Tested with [VibeProof](https://vibeproof.tech)? Run AI-powered QA on your app.
```

**Discovery:** Appears when teams search "security", "audit", "nextjs", "sast" in Actions marketplace. Installs compound — each team that adds it runs it on every PR.

**Action items:**
- [ ] Create `action.yml` at repo root
- [ ] Create composite action that installs + runs audit
- [ ] Format output as PR comment via `github-script`
- [ ] Publish to GitHub Marketplace
- [ ] Add Action badge to README and website

---

### 2. SEO Landing Pages

**Strategy:** One page per search intent. Each page is a static HTML page in `site/` directory.

| Page | Target Keywords | Content |
|------|----------------|---------|
| `/cursorrules-generator` | "cursor rules generator", "generate cursorrules", "cursorrules template" | Paste package.json → get .cursorrules. Interactive web tool. |
| `/claude-md-generator` | "claude md generator", "create claude.md", "claude code rules" | Same but outputs CLAUDE.md format. |
| `/nextjs-security-audit` | "nextjs security audit", "nextjs security scanner", "nextjs vulnerability checker" | Explains what audit checks, shows terminal output, CTA to run. |
| `/ai-code-security` | "ai generated code security", "is ai code safe", "ai coding risks" | Problem-focused page: what AI gets wrong, how to fix it. |
| `/vibe-coding-tools` | "vibe coding tools", "vibe coding best practices", "safe vibe coding" | Hub page linking to all tools. Own the term early. |

**Implementation:**
- Static HTML pages with Tailwind CDN (same as current site)
- Each page has: H1 targeting keyword, 500-800 words, terminal demo, `npx` CTA, VibeProof footer
- Internal links between pages for SEO juice
- Add to sitemap.xml

**Action items:**
- [ ] Build `/cursorrules-generator` page with interactive form (highest value)
- [ ] Build `/claude-md-generator` page
- [ ] Build `/nextjs-security-audit` page
- [ ] Build `/ai-code-security` page
- [ ] Build `/vibe-coding-tools` hub page
- [ ] Update sitemap.xml with all pages
- [ ] Submit to Google Search Console

---

### 3. VS Code Extension Marketplace

**What:** Lightweight extension: "Launch Crate — Vibe Safety for VS Code"

**Features:**
- Status bar shows Vibe Safety Score for current workspace
- Warning icon flashes when editing an API route with no auth
- Command palette: "Launch Crate: Run Audit", "Launch Crate: Generate Guard"
- Links to full CLI for scaffold

**Discovery:** VS Code marketplace search for "security", "nextjs", "ai safety", "code audit". Millions of daily visitors.

**Action items:**
- [ ] Create `vscode-launchcrate/` repo or subdirectory
- [ ] Implement status bar provider
- [ ] Implement audit command
- [ ] Publish to VS Code Marketplace
- [ ] Add marketplace badge to README and website

---

### 4. npm Discoverability

**Current keywords:** nextjs, scaffold, ai, cli, vibe-coding, saas, code-generation, developer-tools

**Add these high-value keywords:**
```json
"keywords": [
  "nextjs", "security", "audit", "ai-safety",
  "cursorrules", "claude-md", "vibe-coding",
  "code-generation", "scaffold", "sast",
  "sql-injection", "api-security", "nextjs-cli",
  "developer-tools", "static-analysis", "code-audit"
]
```

**Action items:**
- [ ] Update package.json keywords
- [ ] Ensure README has clear install + usage at top (npm search shows first 250 chars)

---

### 5. Directory & List Submissions

**GitHub Awesome Lists (PR to add):**
- [ ] [awesome-nextjs](https://github.com/unicodeveloper/awesome-nextjs) — Security/Tools section
- [ ] [awesome-security](https://github.com/sbilly/awesome-security) — SAST tools
- [ ] [awesome-developer-tools](https://github.com/trimstray/the-book-of-secret-knowledge) — CLI tools
- [ ] [awesome-cli-apps](https://github.com/agarrharr/awesome-cli-apps) — Developer tools
- [ ] [awesome-static-analysis](https://github.com/analysis-tools-dev/static-analysis) — JavaScript section
- [ ] [awesome-ai-tools](https://github.com/mahseema/awesome-ai-tools) — Developer tools

**Product Directories:**
- [ ] [Product Hunt](https://producthunt.com) — Developer Tools category
- [ ] [AlternativeTo](https://alternativeto.net) — Alternative to Snyk, SonarQube, ESLint
- [ ] [StackShare](https://stackshare.io) — Developer Tools
- [ ] [Openbase](https://openbase.com) — npm package discovery
- [ ] [LibHunt](https://www.libhunt.com) — JavaScript category
- [ ] [Uneed](https://uneed.best) — Developer tools directory

**Developer Platforms:**
- [ ] [dev.to](https://dev.to) — Tutorial: "How to audit your AI-coded Next.js app" (SEO)
- [ ] [Hashnode](https://hashnode.com) — Same tutorial, different audience
- [ ] [Medium](https://medium.com) — "The security risks of vibe coding" (thought leadership)

---

### 6. Integration Ecosystem

**Cursor Community:**
- [ ] Post in Cursor Discord/forum about `.cursorrules` generator
- [ ] Submit to Cursor's community resources/wiki if they have one

**Claude Code Community:**
- [ ] Post in Anthropic Discord about `CLAUDE.md` generator
- [ ] Contribute to Claude Code documentation if they accept community resources

**Vercel:**
- [ ] Create Vercel template that includes Launch Crate audit in CI
- [ ] Submit to Vercel's integration marketplace if applicable

---

## Social Media Strategy

### Principles
- Social is the **amplifier**, not the primary channel
- Every post drives to a permanent asset (website page, GitHub, npm)
- Content comes from real usage, not manufactured hype
- Post frequency: 3-5x/week on Twitter, 1x/week on Reddit

### Content Pillars

**1. Audit Reports (40% of posts)**
Run `launchcrate audit` on popular open-source Next.js projects. Post the results.

Target projects:
- [ ] cal.com
- [ ] dub.co
- [ ] Taxonomy (shadcn starter)
- [ ] Next.js commerce template
- [ ] Vercel's AI chatbot template
- [ ] Create-t3-app output
- [ ] Any trending "vibe coded" project on Twitter

Format: Screenshot of terminal output + "I audited [project]. Score: [X]. Here's what I found." Tag the maintainers.

**Why it works:** Controversy drives engagement. Maintainers will respond (agree or disagree). Either way, your tool gets visibility. The score is the shareable artifact.

**2. Vibe Coding Horror Stories (25% of posts)**
Short posts about real AI coding failures:
- "Claude deleted my middleware and I didn't notice for 3 days"
- "Cursor put my Stripe key in a component file"
- "AI generated 4 duplicate auth checks across 4 files"

End each with: "This is why I built launchcrate guard." or link to relevant tool.

**3. Tool Drops (20% of posts)**
Each new feature/command is a launch event:
- "New: `npx launchcrate test-gap` — find every untested API route in your project"
- Include terminal screenshot
- Link to website or npm

**4. Educational (15% of posts)**
Genuine tips about AI coding safety:
- "3 things to check before deploying AI-generated API routes"
- "Why your .cursorrules file is probably wrong"
- "The one line that prevents 80% of AI auth mistakes"

### Platform-Specific Strategy

**Twitter/X (primary)**
- 3-5 tweets/week
- Mix of audit reports, horror stories, tool drops
- Reply to AI coding threads with relevant tool links (not spammy — add value)
- Follow and engage with: AI coding influencers, Next.js team, Vercel team, Cursor team

**Reddit (secondary)**
- 1 post/week maximum (Reddit hates spam)
- Target subs: r/nextjs, r/webdev, r/sideproject, r/SaaS, r/programming
- Format: "I built..." or "Show r/nextjs" or genuine problem-solving posts
- Comment on relevant threads with tool recommendation where appropriate

**Hacker News (occasional)**
- "Show HN" for major releases only (initial launch, GitHub Action, VS Code extension)
- Don't over-post — HN penalizes frequent self-promotion
- Comment on AI/security threads with relevant context

**Dev.to / Hashnode (SEO)**
- 1 long-form post/month
- Tutorial format: "How to secure your AI-coded Next.js app in 5 minutes"
- Cross-post to both platforms
- These rank in Google and drive permanent organic traffic

### Launch Calendar

| Week | Build | Distribute |
|------|-------|------------|
| **Week 1** | GitHub Action | Twitter launch, r/nextjs post, submit to awesome lists |
| **Week 2** | Cursorrules generator page + SEO pages | Twitter, Cursor community, dev.to tutorial |
| **Week 3** | `test-gap` command | Twitter, r/webdev, Hacker News "Show HN" |
| **Week 4** | `check` pre-commit hook | Twitter, update npm keywords |
| **Week 5** | Product Hunt launch | PH, Twitter, all social channels, directory submissions |
| **Week 6+** | VS Code extension | VS Code marketplace, Twitter, r/vscode |

### Tracking

| Metric | Tool | Week 1 Target | Month 1 Target | Month 3 Target |
|--------|------|---------------|----------------|----------------|
| GitHub stars | GitHub | 50 | 300 | 1,000 |
| npm weekly downloads | npm | 200 | 1,000 | 5,000 |
| Website visits | Azure Analytics | 500 | 2,000 | 10,000 |
| GH Action installs | GitHub Marketplace | — | 50 | 200 |
| VS Code installs | VS Code Marketplace | — | — | 500 |
| VibeProof signups (attributed) | VibeProof analytics | 5 | 25 | 100 |
| Cursorrules page visits | Azure Analytics | — | 500 | 3,000 |

---

## Funnel Architecture

```
Discovery Layer (free, organic reach)
├── GitHub Actions Marketplace → launchcrate-audit Action
├── VS Code Marketplace → Vibe Safety extension
├── npm search → launchcrate package
├── Google search → SEO landing pages
├── GitHub awesome lists → repo link
├── dev.to / Hashnode → tutorial posts
└── Social media → Twitter, Reddit, HN

    ↓ install / visit

Engagement Layer (free, daily touchpoint)
├── CLI: audit, guard, scaffold, test-gap, check
├── GitHub Action: PR comments on every merge
├── VS Code: status bar score on every save
└── Website: cursorrules generator, audit demo

    ↓ "now I need to test this"

Conversion Layer (paid)
└── VibeProof — AI-powered QA
    ├── README footer: "Test it with VibeProof"
    ├── test-gap output: "Generate tests → VibeProof"
    ├── PR comment: "Tested with VibeProof?"
    └── VS Code: "Run VibeProof tests" command
```

---

## OG Image

**TODO:** Convert `site/og-image.svg` to PNG (1200x630) for social sharing. Open SVG in browser → screenshot → save as `og-image.png`. Update meta tags in `index.html`.

---

*Last updated: 2026-03-16*
