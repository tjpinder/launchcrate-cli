import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import { readFileIfExists } from '../utils/fs.js';

// Import the same rules from audit — we reuse the detection logic
// but scope it to only staged/changed files

interface Finding {
  severity: 'critical' | 'warning';
  file: string;
  line: number;
  message: string;
}

interface CheckRule {
  id: string;
  severity: 'critical' | 'warning';
  test: (content: string, filePath: string) => { line: number; message: string }[];
}

const RULES: CheckRule[] = [
  {
    id: 'no-auth-api',
    severity: 'critical',
    test: (content, filePath) => {
      const norm = filePath.replace(/\\/g, '/');
      if (!norm.includes('/api/') || norm.includes('/api/auth/') || norm.includes('/api/webhook') || norm.includes('/api/health') || norm.includes('/api/cron')) return [];
      if (!norm.endsWith('route.ts') && !norm.endsWith('route.js')) return [];

      const hasAuth = /auth\(\)|getServerSession|currentUser\(\)|withAuth|getSession|getToken|clerkClient|requireAuth|checkAuth|withCron|withApiKey/.test(content);
      if (hasAuth) return [];

      const exportMatch = content.match(/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/);
      if (!exportMatch) return [];

      const line = content.substring(0, exportMatch.index).split('\n').length;
      return [{ line, message: 'API route has no authentication check' }];
    },
  },
  {
    id: 'sql-concatenation',
    severity: 'critical',
    test: (content, filePath) => {
      if (filePath.includes('__tests__') || filePath.includes('.test.') || filePath.includes('.spec.')) return [];
      const results: { line: number; message: string }[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\$\{[A-Z_]{3,}\}/.test(line)) continue;
        if (/\$\{\w+COLUMNS?\}/.test(line)) continue;
        if (/\[\$\{\w+\}\]/.test(line) && !/req|request|param|body|search|query|input/i.test(line)) continue;

        if (/(?:query|execute|raw)\s*\(\s*`[^`]*\$\{/.test(line)) {
          const hasUserInput = /\$\{.*(?:req|request|param|body|search|query|input|args|data\[)/i.test(line);
          const hasDynamic = /\$\{.*(?:setClauses|values|whereClauses|conditions|filters)\b/.test(line);
          if (hasUserInput || hasDynamic) {
            results.push({ line: i + 1, message: 'SQL query uses string concatenation' });
          }
        }
      }
      return results;
    },
  },
  {
    id: 'hardcoded-secret',
    severity: 'critical',
    test: (content, filePath) => {
      if (filePath.includes('.env') || filePath.endsWith('.md')) return [];
      if (filePath.includes('__tests__') || filePath.includes('.test.') || filePath.includes('.spec.')) return [];
      const results: { line: number; message: string }[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('import')) continue;
        if (/(?:api[_-]?key|secret[_-]?key|password|token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i.test(line)) {
          if (/process\.env|example|placeholder|your[_-]|xxx|test|mock|fake|dummy|sample|encrypted-/i.test(line)) continue;
          results.push({ line: i + 1, message: 'Possible hardcoded secret' });
        }
        if (/(?:sk[-_]live|pk[-_]live|sk-ant-api|ghp_[a-zA-Z0-9]{30,}|gho_[a-zA-Z0-9]{30,})\w+/.test(line)) {
          if (/\.replace|\.match|\.test|regex|RegExp|startsWith/i.test(line)) continue;
          results.push({ line: i + 1, message: 'Hardcoded API key detected' });
        }
      }
      return results;
    },
  },
  {
    id: 'dangerously-set-html',
    severity: 'warning',
    test: (content) => {
      const results: { line: number; message: string }[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/dangerouslySetInnerHTML/.test(lines[i])) {
          const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join(' ');
          if (/JSON\.stringify|DOMPurify|sanitize|purify|ld\+json|schema/i.test(context)) continue;
          results.push({ line: i + 1, message: 'dangerouslySetInnerHTML with user content' });
        }
      }
      return results;
    },
  },
];

async function getStagedFiles(projectRoot: string): Promise<string[]> {
  const { execSync } = await import('child_process');
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    return output
      .split('\n')
      .filter(f => f.trim() && (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')))
      .map(f => path.join(projectRoot, f));
  } catch {
    return [];
  }
}

async function getChangedFiles(projectRoot: string): Promise<string[]> {
  const { execSync } = await import('child_process');
  try {
    const output = execSync('git diff --name-only HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    return output
      .split('\n')
      .filter(f => f.trim() && (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')))
      .map(f => path.join(projectRoot, f));
  } catch {
    return [];
  }
}

export async function checkCommand(options: { staged?: boolean; install?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  if (options.install) {
    await installHook(projectRoot);
    return;
  }

  // Get files to check
  let files: string[];
  if (options.staged) {
    files = await getStagedFiles(projectRoot);
  } else {
    // Default: check staged files, fall back to changed files
    files = await getStagedFiles(projectRoot);
    if (files.length === 0) {
      files = await getChangedFiles(projectRoot);
    }
  }

  if (files.length === 0) {
    console.log(chalk.dim('  No changed files to check.'));
    return;
  }

  console.log(chalk.dim(`  Checking ${files.length} changed file${files.length === 1 ? '' : 's'}...\n`));

  const findings: Finding[] = [];

  for (const filePath of files) {
    const content = await readFileIfExists(filePath);
    if (!content) continue;

    const relativePath = path.relative(projectRoot, filePath);

    for (const rule of RULES) {
      const matches = rule.test(content, relativePath);
      for (const match of matches) {
        findings.push({
          severity: rule.severity,
          file: relativePath,
          line: match.line,
          message: match.message,
        });
      }
    }
  }

  const criticals = findings.filter(f => f.severity === 'critical');
  const warnings = findings.filter(f => f.severity === 'warning');

  // Display results
  if (criticals.length > 0) {
    for (const f of criticals) {
      console.log(`  ${chalk.red('✗')} ${chalk.dim(`${f.file}:${f.line}`)} — ${f.message}`);
    }
  }

  if (warnings.length > 0) {
    for (const f of warnings) {
      console.log(`  ${chalk.yellow('⚠')} ${chalk.dim(`${f.file}:${f.line}`)} — ${f.message}`);
    }
  }

  if (findings.length === 0) {
    console.log(chalk.green('  ✓ All changed files look safe.'));
    return;
  }

  console.log('');

  if (criticals.length > 0) {
    console.log(chalk.red(`  ${criticals.length} critical issue${criticals.length === 1 ? '' : 's'} found. Commit blocked.`));
    console.log(chalk.dim('  Fix the issues above or use --no-verify to skip.'));
    process.exit(1);
  } else {
    console.log(chalk.yellow(`  ${warnings.length} warning${warnings.length === 1 ? '' : 's'} found. Proceeding with commit.`));
  }
}

async function installHook(projectRoot: string): Promise<void> {
  const hooksDir = path.join(projectRoot, '.git', 'hooks');
  if (!await fs.pathExists(hooksDir)) {
    // Check for .git file (worktree) or missing .git
    const gitPath = path.join(projectRoot, '.git');
    if (!await fs.pathExists(gitPath)) {
      console.error(chalk.red('  Not a git repository.'));
      process.exit(1);
    }
  }

  const hookPath = path.join(hooksDir, 'pre-commit');
  const hookContent = `#!/bin/sh
# Launch Crate pre-commit safety check
# Installed by: npx launchcrate check --install

npx launchcrate check --staged
`;

  // Check for existing hook
  if (await fs.pathExists(hookPath)) {
    const existing = await fs.readFile(hookPath, 'utf-8');
    if (existing.includes('launchcrate')) {
      console.log(chalk.yellow('  Launch Crate pre-commit hook already installed.'));
      return;
    }

    // Append to existing hook
    const updated = existing + '\n' + hookContent;
    await fs.writeFile(hookPath, updated, { mode: 0o755 });
    console.log(chalk.green('  ✓ Launch Crate check added to existing pre-commit hook.'));
  } else {
    await fs.ensureDir(hooksDir);
    await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
    console.log(chalk.green('  ✓ Pre-commit hook installed.'));
  }

  console.log(chalk.dim('  Every commit will now be checked for security issues.'));
  console.log(chalk.dim('  Use git commit --no-verify to skip if needed.'));
}
