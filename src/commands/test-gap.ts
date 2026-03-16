import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import { findFiles } from '../utils/fs.js';

interface RouteInfo {
  path: string;
  methods: string[];
  hasTest: boolean;
  testPath?: string;
  risk: 'critical' | 'high' | 'medium' | 'low';
  riskReason?: string;
}

interface PageInfo {
  path: string;
  hasTest: boolean;
  testPath?: string;
}

interface TestGapResult {
  routes: RouteInfo[];
  pages: PageInfo[];
  routeCoverage: number;
  pageCoverage: number;
  criticalUntested: RouteInfo[];
}

// Keywords that indicate high-risk routes needing tests
const CRITICAL_PATTERNS = [
  { pattern: /\/auth\//i, reason: 'Authentication endpoint' },
  { pattern: /\/billing|\/payment|\/checkout|\/subscription|\/stripe/i, reason: 'Payment/billing endpoint' },
  { pattern: /\/admin/i, reason: 'Admin endpoint' },
  { pattern: /\/webhook/i, reason: 'Webhook handler' },
];

const HIGH_PATTERNS = [
  { pattern: /\/user|\/account|\/profile/i, reason: 'User data endpoint' },
  { pattern: /\/api-key|\/token/i, reason: 'API key/token management' },
  { pattern: /\/delete|\/remove|\/purge/i, reason: 'Destructive operation' },
  { pattern: /\/export|\/import|\/upload/i, reason: 'Data transfer endpoint' },
  { pattern: /\/invite|\/member|\/team/i, reason: 'Team management endpoint' },
];

function classifyRisk(routePath: string, content: string): { risk: RouteInfo['risk']; reason?: string } {
  for (const { pattern, reason } of CRITICAL_PATTERNS) {
    if (pattern.test(routePath)) return { risk: 'critical', reason };
  }

  // Check for dangerous operations in content
  if (/DELETE\s+FROM|DROP\s+TABLE|TRUNCATE/i.test(content)) {
    return { risk: 'critical', reason: 'Contains destructive SQL' };
  }

  for (const { pattern, reason } of HIGH_PATTERNS) {
    if (pattern.test(routePath)) return { risk: 'high', reason };
  }

  // Check for sensitive operations
  if (/password|secret|token|credential/i.test(content)) {
    return { risk: 'high', reason: 'Handles sensitive data' };
  }

  if (/POST|PUT|PATCH|DELETE/.test(content)) {
    return { risk: 'medium' };
  }

  return { risk: 'low' };
}

function detectMethods(content: string): string[] {
  const methods: string[] = [];
  if (/export\s+(async\s+)?function\s+GET/m.test(content)) methods.push('GET');
  if (/export\s+(async\s+)?function\s+POST/m.test(content)) methods.push('POST');
  if (/export\s+(async\s+)?function\s+PUT/m.test(content)) methods.push('PUT');
  if (/export\s+(async\s+)?function\s+PATCH/m.test(content)) methods.push('PATCH');
  if (/export\s+(async\s+)?function\s+DELETE/m.test(content)) methods.push('DELETE');
  return methods;
}

function findTestFile(routePath: string, testFiles: string[], projectRoot: string): string | undefined {
  const relative = path.relative(projectRoot, routePath);
  const dir = path.dirname(relative);
  const baseName = path.basename(dir);

  // Common test file patterns:
  // 1. __tests__/route.test.ts in same directory
  // 2. route.test.ts next to route.ts
  // 3. __tests__ folder with matching name
  // 4. *.spec.ts variants

  for (const testFile of testFiles) {
    const testRelative = path.relative(projectRoot, testFile);

    // Same directory __tests__ folder
    if (testRelative.includes(dir) && testRelative.includes('__tests__')) return testRelative;

    // Same directory .test. file
    if (testRelative.startsWith(dir) && (testRelative.includes('.test.') || testRelative.includes('.spec.'))) return testRelative;

    // Test file mentions the route name
    if (testRelative.includes(baseName) && (testRelative.includes('.test.') || testRelative.includes('.spec.'))) return testRelative;
  }

  return undefined;
}

function riskIcon(risk: string): string {
  switch (risk) {
    case 'critical': return chalk.red('!!');
    case 'high': return chalk.yellow('! ');
    case 'medium': return chalk.blue('- ');
    case 'low': return chalk.dim('  ');
    default: return '  ';
  }
}

export async function testGapCommand(options: { json?: boolean; riskOnly?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  if (!await fs.pathExists(path.join(projectRoot, 'package.json'))) {
    console.error(chalk.red('No package.json found. Run this from your project root.'));
    process.exit(1);
  }

  const spinner = ora('Scanning for routes and tests...').start();

  // Normalize path separators for cross-platform matching
  const norm = (p: string) => p.replace(/\\/g, '/');

  // Find all route files
  const routeFiles = await findFiles(
    projectRoot,
    (f) => {
      const n = norm(f);
      return (n.endsWith('route.ts') || n.endsWith('route.js')) &&
        n.includes('/api/') &&
        !n.includes('node_modules') && !n.includes('.next') && !n.includes('/dist/');
    },
    8
  );

  // Find all page files
  const pageFiles = await findFiles(
    projectRoot,
    (f) => {
      const n = norm(f);
      return (n.endsWith('page.tsx') || n.endsWith('page.jsx') || n.endsWith('page.ts') || n.endsWith('page.js')) &&
        !n.includes('node_modules') && !n.includes('.next') && !n.includes('/dist/') &&
        !n.includes('/api/');
    },
    8
  );

  // Find all test files
  const testFiles = await findFiles(
    projectRoot,
    (f) => {
      const n = norm(f);
      return (n.includes('.test.') || n.includes('.spec.') || n.includes('__tests__')) &&
        !n.includes('node_modules') && !n.includes('.next') && !n.includes('/dist/');
    },
    8
  );

  spinner.text = `Analyzing ${routeFiles.length} routes and ${pageFiles.length} pages...`;

  // Analyze routes
  const routes: RouteInfo[] = [];
  for (const routeFile of routeFiles) {
    let content = '';
    try {
      content = await fs.readFile(routeFile, 'utf-8');
    } catch { continue; }

    const relativePath = path.relative(projectRoot, routeFile);
    const methods = detectMethods(content);
    const { risk, reason } = classifyRisk(relativePath, content);
    const testPath = findTestFile(routeFile, testFiles, projectRoot);

    routes.push({
      path: relativePath,
      methods,
      hasTest: !!testPath,
      testPath,
      risk,
      riskReason: reason,
    });
  }

  // Analyze pages
  const pages: PageInfo[] = [];
  for (const pageFile of pageFiles) {
    const relativePath = path.relative(projectRoot, pageFile);
    const testPath = findTestFile(pageFile, testFiles, projectRoot);
    pages.push({
      path: relativePath,
      hasTest: !!testPath,
      testPath,
    });
  }

  // Sort routes: critical untested first
  const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  routes.sort((a, b) => {
    if (a.hasTest !== b.hasTest) return a.hasTest ? 1 : -1;
    return riskOrder[a.risk] - riskOrder[b.risk];
  });

  spinner.stop();

  const testedRoutes = routes.filter(r => r.hasTest).length;
  const testedPages = pages.filter(p => p.hasTest).length;
  const routeCoverage = routes.length > 0 ? Math.round((testedRoutes / routes.length) * 100) : 100;
  const pageCoverage = pages.length > 0 ? Math.round((testedPages / pages.length) * 100) : 100;
  const criticalUntested = routes.filter(r => !r.hasTest && (r.risk === 'critical' || r.risk === 'high'));

  // JSON output
  if (options.json) {
    console.log(JSON.stringify({ routes, pages, routeCoverage, pageCoverage, criticalUntested }, null, 2));
    return;
  }

  // Display
  console.log('');
  console.log(chalk.bold('  Launch Crate Test Gap Analysis'));
  console.log('');

  // Route coverage
  const routeBar = '█'.repeat(Math.floor(routeCoverage / 5)) + '░'.repeat(20 - Math.floor(routeCoverage / 5));
  const routeColor = routeCoverage >= 80 ? chalk.green : routeCoverage >= 50 ? chalk.yellow : chalk.red;
  console.log(chalk.bold('  API Routes'));
  console.log(`    ${routes.length} found, ${testedRoutes} have tests`);
  console.log(`    ${routeColor(routeBar)} ${routeCoverage}% coverage`);
  console.log('');

  // Page coverage
  const pageBar = '█'.repeat(Math.floor(pageCoverage / 5)) + '░'.repeat(20 - Math.floor(pageCoverage / 5));
  const pageColor = pageCoverage >= 80 ? chalk.green : pageCoverage >= 50 ? chalk.yellow : chalk.red;
  console.log(chalk.bold('  Pages'));
  console.log(`    ${pages.length} found, ${testedPages} have tests`);
  console.log(`    ${pageColor(pageBar)} ${pageCoverage}% coverage`);
  console.log('');

  // Critical untested routes
  if (criticalUntested.length > 0) {
    console.log(chalk.red.bold(`  Untested Critical/High-Risk Routes (${criticalUntested.length})`));
    console.log('');
    for (const route of criticalUntested) {
      const methods = route.methods.length > 0 ? chalk.dim(` [${route.methods.join(', ')}]`) : '';
      console.log(`    ${riskIcon(route.risk)} ${chalk.white(route.path)}${methods}`);
      if (route.riskReason) {
        console.log(`       ${chalk.dim(route.riskReason)}`);
      }
    }
    console.log('');
  }

  // All untested routes (unless --risk-only)
  if (!options.riskOnly) {
    const untestedMediumLow = routes.filter(r => !r.hasTest && r.risk !== 'critical' && r.risk !== 'high');
    if (untestedMediumLow.length > 0) {
      console.log(chalk.yellow.bold(`  Other Untested Routes (${untestedMediumLow.length})`));
      console.log('');
      for (const route of untestedMediumLow.slice(0, 20)) {
        const methods = route.methods.length > 0 ? chalk.dim(` [${route.methods.join(', ')}]`) : '';
        console.log(`    ${riskIcon(route.risk)} ${chalk.dim(route.path)}${methods}`);
      }
      if (untestedMediumLow.length > 20) {
        console.log(chalk.dim(`    ... and ${untestedMediumLow.length - 20} more`));
      }
      console.log('');
    }
  }

  // Tested routes summary
  const tested = routes.filter(r => r.hasTest);
  if (tested.length > 0) {
    console.log(chalk.green.bold(`  Tested Routes (${tested.length})`));
    console.log('');
    for (const route of tested.slice(0, 10)) {
      console.log(`    ${chalk.green('✓')} ${chalk.dim(route.path)}`);
      if (route.testPath) console.log(`      ${chalk.dim('→ ' + route.testPath)}`);
    }
    if (tested.length > 10) {
      console.log(chalk.dim(`    ... and ${tested.length - 10} more`));
    }
    console.log('');
  }

  // Recommendations
  console.log(chalk.bold('  Next steps:'));
  if (criticalUntested.length > 0) {
    console.log(chalk.red(`    ${criticalUntested.length} critical/high-risk routes have zero test coverage.`));
  }
  console.log(chalk.dim(`    Generate and run tests for your project → https://vibeproof.tech`));
  console.log('');
}
