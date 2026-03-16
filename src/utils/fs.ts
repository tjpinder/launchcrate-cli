import fs from 'fs-extra';
import path from 'path';

/**
 * Read a file if it exists, return null otherwise
 */
export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write a file, creating directories as needed
 */
export async function writeFileSafe(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Find files matching a pattern in a directory (simple glob)
 */
export async function findFiles(
  dir: string,
  test: (filePath: string) => boolean,
  maxDepth = 5
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git' || entry.name === 'dist') {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else if (entry.isFile() && test(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir, 0);
  return results;
}

/**
 * Read package.json from a directory
 */
export async function readPackageJson(dir: string): Promise<Record<string, unknown> | null> {
  const content = await readFileIfExists(path.join(dir, 'package.json'));
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
