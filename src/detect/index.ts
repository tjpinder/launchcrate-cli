import path from 'path';
import fs from 'fs-extra';
import { readFileIfExists, readPackageJson, findFiles } from '../utils/fs.js';

export interface ProjectConfig {
  version: string;
  project: {
    name: string;
    framework: 'next';
    frameworkVersion: string;
    router: 'app' | 'pages';
    srcDir: boolean;
    language: 'typescript' | 'javascript';
  };
  stack: {
    database: 'prisma' | 'drizzle' | 'raw-sql' | 'supabase' | 'mongoose' | 'none';
    auth: 'next-auth' | 'clerk' | 'supabase' | 'auth0' | 'none';
    styling: 'tailwind' | 'css-modules' | 'styled-components' | 'none';
  };
  paths: {
    root: string;
    features: string;
    components: string;
    lib: string;
    api: string;
  };
  safeZones: string[];
  referenceFiles: string[];
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function hasDep(pkg: PackageJson, name: string): boolean {
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function getDepVersion(pkg: PackageJson, name: string): string {
  return (pkg.dependencies?.[name] || pkg.devDependencies?.[name] || '').replace(/[\^~>=<]/g, '');
}

export async function detectProject(projectRoot: string): Promise<ProjectConfig> {
  const pkg = (await readPackageJson(projectRoot)) as PackageJson | null;

  if (!pkg || !hasDep(pkg, 'next')) {
    throw new Error('Not a Next.js project. No "next" dependency found in package.json.');
  }

  const srcDir = await fs.pathExists(path.join(projectRoot, 'src'));
  const base = srcDir ? path.join(projectRoot, 'src') : projectRoot;

  const router = (await fs.pathExists(path.join(base, 'app'))) ? 'app' as const : 'pages' as const;
  const language = (await fs.pathExists(path.join(projectRoot, 'tsconfig.json'))) ? 'typescript' as const : 'javascript' as const;

  const database = detectDatabase(pkg);
  const auth = detectAuth(pkg);
  const styling = detectStyling(pkg);

  const paths = detectPaths(projectRoot, srcDir, router);
  const referenceFiles = await findReferenceFiles(projectRoot, paths);

  return {
    version: '1.0',
    project: {
      name: pkg.name || path.basename(projectRoot),
      framework: 'next',
      frameworkVersion: getDepVersion(pkg, 'next'),
      router,
      srcDir,
      language,
    },
    stack: { database, auth, styling },
    paths,
    safeZones: suggestSafeZones(paths, auth, database),
    referenceFiles,
  };
}

function detectDatabase(pkg: PackageJson): ProjectConfig['stack']['database'] {
  if (hasDep(pkg, 'prisma') || hasDep(pkg, '@prisma/client')) return 'prisma';
  if (hasDep(pkg, 'drizzle-orm')) return 'drizzle';
  if (hasDep(pkg, 'mongoose')) return 'mongoose';
  if (hasDep(pkg, '@supabase/supabase-js')) return 'supabase';
  if (hasDep(pkg, 'mssql') || hasDep(pkg, 'pg') || hasDep(pkg, 'mysql2') || hasDep(pkg, 'better-sqlite3')) return 'raw-sql';
  return 'none';
}

function detectAuth(pkg: PackageJson): ProjectConfig['stack']['auth'] {
  if (hasDep(pkg, 'next-auth') || hasDep(pkg, '@auth/core')) return 'next-auth';
  if (hasDep(pkg, '@clerk/nextjs')) return 'clerk';
  if (hasDep(pkg, '@auth0/nextjs-auth0')) return 'auth0';
  if (hasDep(pkg, '@supabase/auth-helpers-nextjs') || hasDep(pkg, '@supabase/ssr')) return 'supabase';
  return 'none';
}

function detectStyling(pkg: PackageJson): ProjectConfig['stack']['styling'] {
  if (hasDep(pkg, 'tailwindcss')) return 'tailwind';
  if (hasDep(pkg, 'styled-components')) return 'styled-components';
  return 'css-modules';
}

function detectPaths(
  root: string,
  srcDir: boolean,
  router: 'app' | 'pages'
): ProjectConfig['paths'] {
  const base = srcDir ? path.join(root, 'src') : root;

  return {
    root,
    features: router === 'app' ? path.join(base, 'app') : path.join(base, 'pages'),
    components: path.join(base, 'components'),
    lib: path.join(base, 'lib'),
    api: router === 'app' ? path.join(base, 'app', 'api') : path.join(base, 'pages', 'api'),
  };
}

function suggestSafeZones(
  paths: ProjectConfig['paths'],
  auth: string,
  database: string
): string[] {
  const zones: string[] = [];

  // Auth files should never be touched
  if (auth === 'next-auth') {
    zones.push('**/auth/**', '**/api/auth/**', '**/lib/auth.*');
  } else if (auth === 'clerk') {
    zones.push('**/middleware.*');
  } else if (auth === 'auth0') {
    zones.push('**/api/auth/**');
  }

  // Database config should never be touched
  if (database === 'prisma') {
    zones.push('**/prisma/schema.prisma', '**/lib/prisma.*', '**/lib/db.*');
  } else if (database === 'drizzle') {
    zones.push('**/drizzle.config.*', '**/lib/db.*', '**/db/schema.*');
  } else if (database === 'raw-sql') {
    zones.push('**/lib/db.*', '**/lib/database.*');
  }

  // Config files
  zones.push('**/middleware.*', '**/layout.*', '**/next.config.*');

  return zones;
}

async function findReferenceFiles(
  root: string,
  paths: ProjectConfig['paths']
): Promise<string[]> {
  const refs: string[] = [];

  // Find existing API route files as patterns
  const apiRoutes = await findFiles(
    paths.api,
    (f) => f.endsWith('route.ts') || f.endsWith('route.js'),
    3
  );

  // Find existing page files
  const pages = await findFiles(
    paths.features,
    (f) => f.endsWith('page.tsx') || f.endsWith('page.jsx') || f.endsWith('page.ts') || f.endsWith('page.js'),
    3
  );

  // Take up to 3 of each, preferring non-auth routes
  const nonAuthRoutes = apiRoutes.filter(f => !f.includes('/auth/'));
  const nonAuthPages = pages.filter(f => !f.includes('/auth/') && !f.includes('/login') && !f.includes('/signup'));

  refs.push(...nonAuthRoutes.slice(0, 3));
  refs.push(...nonAuthPages.slice(0, 3));

  // Make paths relative to project root
  return refs.map(f => path.relative(root, f));
}
