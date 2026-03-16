import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import { findFiles, readFileIfExists } from '../utils/fs.js';

interface AuditFinding {
  severity: 'critical' | 'warning' | 'info';
  file: string;
  line: number;
  rule: string;
  message: string;
  snippet?: string;
}

interface AuditResult {
  findings: AuditFinding[];
  score: number;
  grade: string;
  filesScanned: number;
  breakdown: {
    auth: number;
    injection: number;
    secrets: number;
    validation: number;
    errorHandling: number;
  };
}

// Patterns that indicate security issues
const RULES: {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: keyof AuditResult['breakdown'];
  test: (content: string, filePath: string) => { line: number; snippet: string }[];
  message: string;
}[] = [
  // === CRITICAL: Auth ===
  {
    id: 'no-auth-api',
    severity: 'critical',
    category: 'auth',
    message: 'API route has no authentication check',
    test: (content, filePath) => {
      if (!filePath.match(/\/api\//) || filePath.includes('/api/auth/') || filePath.includes('/api/webhook') || filePath.includes('/api/health') || filePath.includes('/api/cron')) return [];
      if (!filePath.endsWith('route.ts') && !filePath.endsWith('route.js')) return [];

      const hasAuth = /auth\(\)|getServerSession|currentUser\(\)|withAuth|getSession|getToken|clerkClient|requireAuth|checkAuth|withCron|withApiKey/.test(content);
      if (hasAuth) return [];

      const exportMatch = content.match(/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/);
      if (!exportMatch) return [];

      const line = content.substring(0, exportMatch.index).split('\n').length;
      return [{ line, snippet: exportMatch[0] }];
    },
  },
  {
    id: 'no-auth-middleware-gap',
    severity: 'warning',
    category: 'auth',
    message: 'API route directory not covered by middleware matcher',
    test: (content, filePath) => {
      // Only check middleware files
      if (!filePath.endsWith('middleware.ts') && !filePath.endsWith('middleware.js')) return [];
      if (!content.includes('matcher')) return [{ line: 1, snippet: 'No matcher config found' }];
      return [];
    },
  },

  // === CRITICAL: SQL Injection ===
  {
    id: 'sql-concatenation',
    severity: 'critical',
    category: 'injection',
    message: 'SQL query uses string concatenation (injection risk)',
    test: (content, filePath) => {
      // Skip test files
      if (filePath.includes('__tests__') || filePath.includes('.test.') || filePath.includes('.spec.')) return [];
      const results: { line: number; snippet: string }[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip safe patterns: constant/column interpolation (ALL_CAPS, _COLUMNS, known safe patterns)
        // e.g., `SELECT ${IDEA_DETAIL_COLUMNS}` or `FROM [${table}]` where table is server-controlled
        if (/\$\{[A-Z_]{3,}\}/.test(line)) continue; // ALL_CAPS constants
        if (/\$\{\w+COLUMNS?\}/.test(line)) continue; // Column list constants
        if (/\[\$\{\w+\}\]/.test(line) && !/req|request|param|body|search|query|input/i.test(line)) continue; // [${table}] with server var

        // Template literals in SQL — only flag if interpolating something that looks like user input
        if (/(?:query|execute|raw)\s*\(\s*`[^`]*\$\{/.test(line)) {
          // Check if the interpolated variable looks like user input
          const hasUserInput = /\$\{.*(?:req|request|param|body|search|query|input|args|data\[)/i.test(line);
          const hasDynamicClauses = /\$\{.*(?:setClauses|values|whereClauses|conditions|filters)\b/.test(line);
          if (hasUserInput || hasDynamicClauses) {
            results.push({ line: i + 1, snippet: line.trim().substring(0, 80) });
          }
        }
        // String concat in SQL
        if (/(?:query|execute|raw)\s*\(\s*['"][^'"]*['"]\s*\+/.test(line)) {
          results.push({ line: i + 1, snippet: line.trim().substring(0, 80) });
        }
        // WHERE with direct user variable interpolation
        if (/WHERE\s+\w+\s*=\s*['"]?\s*\$\{(?:.*(?:req|request|param|body|input))/.test(line)) {
          results.push({ line: i + 1, snippet: line.trim().substring(0, 80) });
        }
      }
      return results;
    },
  },
  {
    id: 'nosql-injection',
    severity: 'critical',
    category: 'injection',
    message: 'MongoDB query uses unsanitized user input',
    test: (content) => {
      const results: { line: number; snippet: string }[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Direct request body in MongoDB query
        if (/\.(find|findOne|updateOne|deleteOne)\(\s*(req\.body|request\.body|body)/.test(lines[i])) {
          results.push({ line: i + 1, snippet: lines[i].trim().substring(0, 80) });
        }
      }
      return results;
    },
  },

  // === CRITICAL: Hardcoded Secrets ===
  {
    id: 'hardcoded-secret',
    severity: 'critical',
    category: 'secrets',
    message: 'Possible hardcoded secret or API key',
    test: (content, filePath) => {
      if (filePath.includes('.env') || filePath.includes('node_modules') || filePath.endsWith('.md')) return [];
      // Skip test files — fake tokens in test fixtures are expected
      if (filePath.includes('__tests__') || filePath.includes('.test.') || filePath.includes('.spec.')) return [];
      const results: { line: number; snippet: string }[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments and imports
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('import')) continue;

        // API keys patterns
        if (/(?:api[_-]?key|secret[_-]?key|password|token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i.test(line)) {
          // Skip if it's referencing process.env, an example, or clearly fake
          if (/process\.env|example|placeholder|your[_-]|xxx|test|mock|fake|dummy|sample|encrypted-/i.test(line)) continue;
          results.push({ line: i + 1, snippet: line.trim().substring(0, 60) + '...' });
        }

        // Specific key patterns — only flag if they look like actual key values (not regex patterns or validation checks)
        if (/(?:sk[-_]live|pk[-_]live|sk-ant-api|ghp_[a-zA-Z0-9]{30,}|gho_[a-zA-Z0-9]{30,}|glpat-[a-zA-Z0-9]{20,})\w+/.test(line)) {
          // Skip regex patterns (used for redaction/validation), startsWith checks, and string matching
          if (/\.replace|\.match|\.test|regex|RegExp|startsWith|\.search|\/.*sk[-_]live/i.test(line)) continue;
          results.push({ line: i + 1, snippet: line.trim().substring(0, 40) + '***' });
        }
      }
      return results;
    },
  },

  // === WARNING: Input Validation ===
  {
    id: 'no-body-validation',
    severity: 'warning',
    category: 'validation',
    message: 'Request body used without validation',
    test: (content, filePath) => {
      if (!filePath.match(/\/api\//) || !filePath.endsWith('route.ts') && !filePath.endsWith('route.js')) return [];
      const results: { line: number; snippet: string }[] = [];
      const lines = content.split('\n');

      const hasValidation = /zod|yup|joi|validate|schema\.parse|safeParse|\.refine/.test(content);
      if (hasValidation) return [];

      for (let i = 0; i < lines.length; i++) {
        if (/(?:await\s+)?(?:request|req)\.json\(\)/.test(lines[i])) {
          // Check surrounding lines for any validation
          const context = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 5)).join('\n');
          if (!/typeof|instanceof|\.parse|validate|check|assert/.test(context)) {
            results.push({ line: i + 1, snippet: lines[i].trim().substring(0, 80) });
          }
        }
      }
      return results;
    },
  },
  {
    id: 'no-param-validation',
    severity: 'warning',
    category: 'validation',
    message: 'URL parameter used without type/format validation',
    test: (content, filePath) => {
      if (!filePath.includes('[') || !filePath.match(/\/api\//)) return [];
      const results: { line: number; snippet: string }[] = [];
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (/params\.\w+/.test(lines[i]) || /params\)\.\w+/.test(lines[i])) {
          const context = lines.slice(i, Math.min(lines.length, i + 5)).join('\n');
          if (!/uuid|validate|typeof|parseInt|Number|isNaN|match|regex|test\(/.test(context)) {
            results.push({ line: i + 1, snippet: lines[i].trim().substring(0, 80) });
          }
        }
      }
      return results;
    },
  },

  // === WARNING: Error Handling ===
  {
    id: 'stack-trace-leak',
    severity: 'warning',
    category: 'errorHandling',
    message: 'Error stack trace may be exposed to client',
    test: (content, filePath) => {
      if (!filePath.match(/\/api\//)) return [];
      const results: { line: number; snippet: string }[] = [];
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (/(?:error|err)\.(?:stack|message)\s*\}?\s*\)/.test(lines[i]) && /json|response|res\./i.test(lines[i])) {
          results.push({ line: i + 1, snippet: lines[i].trim().substring(0, 80) });
        }
        // Direct error in JSON response
        if (/json\(\s*\{\s*(?:error|message)\s*:\s*(?:error|err)(?:\.message)?/.test(lines[i])) {
          results.push({ line: i + 1, snippet: lines[i].trim().substring(0, 80) });
        }
      }
      return results;
    },
  },
  {
    id: 'no-try-catch',
    severity: 'info',
    category: 'errorHandling',
    message: 'Async route handler without try/catch',
    test: (content, filePath) => {
      if (!filePath.match(/\/api\//) || !filePath.endsWith('route.ts') && !filePath.endsWith('route.js')) return [];

      const hasExport = /export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/.test(content);
      if (!hasExport) return [];

      const hasTryCatch = /try\s*\{/.test(content);
      const hasWrapper = /withAuth|withCron|withApiKey|catchAsync|handleError/.test(content);
      if (hasTryCatch || hasWrapper) return [];

      const match = content.match(/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/);
      if (!match) return [];
      const line = content.substring(0, match.index).split('\n').length;
      return [{ line, snippet: match[0] }];
    },
  },

  // === WARNING: XSS ===
  {
    id: 'dangerously-set-html',
    severity: 'warning',
    category: 'injection',
    message: 'dangerouslySetInnerHTML with user-controlled content',
    test: (content) => {
      const results: { line: number; snippet: string }[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/dangerouslySetInnerHTML/.test(lines[i])) {
          // Skip safe patterns: JSON.stringify (JSON-LD schema markup), DOMPurify
          const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join(' ');
          if (/JSON\.stringify|DOMPurify|sanitize|purify|ld\+json|schema/i.test(context)) continue;
          results.push({ line: i + 1, snippet: lines[i].trim().substring(0, 80) });
        }
      }
      return results;
    },
  },

  // === INFO: Best Practices ===
  {
    id: 'console-log-in-api',
    severity: 'info',
    category: 'errorHandling',
    message: 'console.log in API route (use structured logging in production)',
    test: (content, filePath) => {
      if (!filePath.match(/\/api\//)) return [];
      const results: { line: number; snippet: string }[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/console\.log\(/.test(lines[i]) && !lines[i].trim().startsWith('//')) {
          results.push({ line: i + 1, snippet: lines[i].trim().substring(0, 80) });
        }
      }
      // Only flag if there are many — a few are fine
      return results.length > 3 ? results.slice(0, 3) : [];
    },
  },
];

function calculateScore(findings: AuditFinding[], filesScanned: number): { score: number; grade: string; breakdown: AuditResult['breakdown'] } {
  const breakdown = { auth: 100, injection: 100, secrets: 100, validation: 100, errorHandling: 100 };

  for (const finding of findings) {
    const rule = RULES.find(r => r.message === finding.message);
    if (!rule) continue;

    const penalty = finding.severity === 'critical' ? 15 : finding.severity === 'warning' ? 5 : 2;
    breakdown[rule.category] = Math.max(0, breakdown[rule.category] - penalty);
  }

  // Weighted score
  const score = Math.round(
    breakdown.auth * 0.30 +
    breakdown.injection * 0.25 +
    breakdown.secrets * 0.25 +
    breakdown.validation * 0.10 +
    breakdown.errorHandling * 0.10
  );

  let grade: string;
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B+';
  else if (score >= 70) grade = 'B';
  else if (score >= 60) grade = 'C+';
  else if (score >= 50) grade = 'C';
  else if (score >= 40) grade = 'D+';
  else if (score >= 30) grade = 'D';
  else grade = 'F';

  return { score, grade, breakdown };
}

function gradeColor(grade: string): (text: string) => string {
  if (grade.startsWith('A')) return chalk.green;
  if (grade.startsWith('B')) return chalk.cyan;
  if (grade.startsWith('C')) return chalk.yellow;
  return chalk.red;
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return chalk.red('✗');
    case 'warning': return chalk.yellow('⚠');
    case 'info': return chalk.blue('ℹ');
    default: return ' ';
  }
}

export async function auditCommand(options: { json?: boolean; fix?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  // Verify it's a project
  if (!await fs.pathExists(path.join(projectRoot, 'package.json'))) {
    console.error(chalk.red('No package.json found. Run this from your project root.'));
    process.exit(1);
  }

  const spinner = ora('Scanning project files...').start();

  // Find all source files
  const sourceFiles = await findFiles(
    projectRoot,
    (f) => (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) &&
      !f.includes('node_modules') && !f.includes('.next') && !f.includes('dist'),
    8
  );

  spinner.text = `Auditing ${sourceFiles.length} files...`;

  const findings: AuditFinding[] = [];

  for (const filePath of sourceFiles) {
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
          rule: rule.id,
          message: rule.message,
          snippet: match.snippet,
        });
      }
    }
  }

  spinner.stop();

  const { score, grade, breakdown } = calculateScore(findings, sourceFiles.length);

  // JSON output mode
  if (options.json) {
    console.log(JSON.stringify({ score, grade, findings, filesScanned: sourceFiles.length, breakdown }, null, 2));
    return;
  }

  // Display results
  const criticals = findings.filter(f => f.severity === 'critical');
  const warnings = findings.filter(f => f.severity === 'warning');
  const infos = findings.filter(f => f.severity === 'info');

  console.log('');
  console.log(chalk.bold('  Launch Crate Audit'));
  console.log(chalk.dim(`  Scanned ${sourceFiles.length} files\n`));

  // Score display
  const colorFn = gradeColor(grade);
  console.log('  ┌─────────────────────────────────────┐');
  console.log(`  │  Vibe Safety Score: ${colorFn(chalk.bold(`${grade} (${score}/100)`))}${' '.repeat(Math.max(0, 15 - grade.length - String(score).length))}│`);
  console.log('  └─────────────────────────────────────┘');
  console.log('');

  // Breakdown
  console.log(chalk.bold('  Breakdown:'));
  const cats = [
    { name: 'Authentication', score: breakdown.auth, weight: '30%' },
    { name: 'Injection Safety', score: breakdown.injection, weight: '25%' },
    { name: 'Secrets Management', score: breakdown.secrets, weight: '25%' },
    { name: 'Input Validation', score: breakdown.validation, weight: '10%' },
    { name: 'Error Handling', score: breakdown.errorHandling, weight: '10%' },
  ];

  for (const cat of cats) {
    const bar = '█'.repeat(Math.floor(cat.score / 5)) + '░'.repeat(20 - Math.floor(cat.score / 5));
    const catColor = cat.score >= 80 ? chalk.green : cat.score >= 50 ? chalk.yellow : chalk.red;
    console.log(`    ${cat.name.padEnd(20)} ${catColor(bar)} ${cat.score}% ${chalk.dim(`(×${cat.weight})`)}`);
  }
  console.log('');

  // Findings
  if (criticals.length > 0) {
    console.log(chalk.red.bold(`  CRITICAL (${criticals.length})`));
    for (const f of criticals) {
      console.log(`    ${severityIcon('critical')} ${chalk.dim(`${f.file}:${f.line}`)} — ${f.message}`);
      if (f.snippet) console.log(chalk.dim(`      ${f.snippet}`));
    }
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow.bold(`  WARNING (${warnings.length})`));
    for (const f of warnings) {
      console.log(`    ${severityIcon('warning')} ${chalk.dim(`${f.file}:${f.line}`)} — ${f.message}`);
      if (f.snippet) console.log(chalk.dim(`      ${f.snippet}`));
    }
    console.log('');
  }

  if (infos.length > 0) {
    console.log(chalk.blue.bold(`  INFO (${infos.length})`));
    for (const f of infos.slice(0, 10)) {
      console.log(`    ${severityIcon('info')} ${chalk.dim(`${f.file}:${f.line}`)} — ${f.message}`);
    }
    if (infos.length > 10) {
      console.log(chalk.dim(`    ... and ${infos.length - 10} more`));
    }
    console.log('');
  }

  if (findings.length === 0) {
    console.log(chalk.green.bold('  No issues found. Your codebase is clean.\n'));
  }

  // Recommendations
  console.log(chalk.bold('  Next steps:'));
  if (criticals.length > 0) {
    console.log(chalk.red('    Fix critical issues immediately — these are exploitable.'));
  }
  if (!await fs.pathExists(path.join(projectRoot, '.launchcrate.json'))) {
    console.log(chalk.dim('    Run `launchcrate init` to set up safe zones'));
  }
  if (!await fs.pathExists(path.join(projectRoot, 'CLAUDE.md'))) {
    console.log(chalk.dim('    Run `launchcrate guard` to generate AI safety rules'));
  }
  console.log(chalk.dim('    Run `launchcrate scaffold` to add features safely'));
  console.log('');

  // Exit with error code if criticals found
  if (criticals.length > 0) {
    process.exit(1);
  }
}
