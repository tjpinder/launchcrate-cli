import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { detectProject, type ProjectConfig } from '../detect/index.js';

const CONFIG_FILE = '.launchcrate.json';

export async function initCommand(options: { force?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, CONFIG_FILE);

  // Check for existing config
  if (!options.force && await fs.pathExists(configPath)) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: '.launchcrate.json already exists. Overwrite?',
      initial: false,
    });
    if (!overwrite) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  const spinner = ora('Detecting project structure...').start();

  let config: ProjectConfig;
  try {
    config = await detectProject(projectRoot);
    spinner.succeed('Project detected');
  } catch (error) {
    spinner.fail('Detection failed');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  // Display what was detected
  console.log('');
  console.log(chalk.bold('  Project:    ') + config.project.name);
  console.log(chalk.bold('  Framework:  ') + `Next.js ${config.project.frameworkVersion} (${config.project.router === 'app' ? 'App Router' : 'Pages Router'})`);
  console.log(chalk.bold('  Language:   ') + config.project.language);
  console.log(chalk.bold('  Database:   ') + config.stack.database);
  console.log(chalk.bold('  Auth:       ') + config.stack.auth);
  console.log(chalk.bold('  Styling:    ') + config.stack.styling);
  console.log('');

  if (config.referenceFiles.length > 0) {
    console.log(chalk.bold('  Reference files found:'));
    for (const ref of config.referenceFiles) {
      console.log(chalk.dim('    ' + ref));
    }
    console.log('');
  }

  if (config.safeZones.length > 0) {
    console.log(chalk.bold('  Safe zones') + chalk.dim(' (scaffold will never touch these):'));
    for (const zone of config.safeZones) {
      console.log(chalk.dim('    ' + zone));
    }
    console.log('');
  }

  // Let user customize
  const { customize } = await prompts({
    type: 'confirm',
    name: 'customize',
    message: 'Customize these settings?',
    initial: false,
  });

  if (customize) {
    config = await customizeConfig(config);
  }

  // Check for API key
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  if (!hasKey) {
    console.log('');
    console.log(chalk.yellow('  Note: ANTHROPIC_API_KEY not set.'));
    console.log(chalk.dim('  Set it in your environment or .env file for AI-powered scaffolding.'));
    console.log(chalk.dim('  Without it, scaffold will use basic templates.'));
  }

  // Strip absolute paths before saving — store relative paths only
  const configToSave = {
    ...config,
    paths: {
      root: '.',
      features: path.relative(projectRoot, config.paths.features),
      components: path.relative(projectRoot, config.paths.components),
      lib: path.relative(projectRoot, config.paths.lib),
      api: path.relative(projectRoot, config.paths.api),
    },
  };

  await fs.writeJson(configPath, configToSave, { spaces: 2 });

  console.log('');
  console.log(chalk.green('  Created .launchcrate.json'));
  console.log('');
  console.log(chalk.bold('  Next steps:'));
  console.log(chalk.dim('    1. Review .launchcrate.json and adjust safe zones if needed'));
  console.log(chalk.dim('    2. Run: ') + chalk.cyan('launchcrate scaffold "your feature description"'));
  console.log('');
}

async function customizeConfig(config: ProjectConfig): Promise<ProjectConfig> {
  const { database } = await prompts({
    type: 'select',
    name: 'database',
    message: 'Database / ORM:',
    choices: [
      { title: 'Prisma', value: 'prisma' },
      { title: 'Drizzle', value: 'drizzle' },
      { title: 'Raw SQL (pg/mssql/mysql2)', value: 'raw-sql' },
      { title: 'Supabase', value: 'supabase' },
      { title: 'Mongoose', value: 'mongoose' },
      { title: 'None', value: 'none' },
    ],
    initial: ['prisma', 'drizzle', 'raw-sql', 'supabase', 'mongoose', 'none'].indexOf(config.stack.database),
  });

  const { auth } = await prompts({
    type: 'select',
    name: 'auth',
    message: 'Auth provider:',
    choices: [
      { title: 'NextAuth / Auth.js', value: 'next-auth' },
      { title: 'Clerk', value: 'clerk' },
      { title: 'Supabase Auth', value: 'supabase' },
      { title: 'Auth0', value: 'auth0' },
      { title: 'None', value: 'none' },
    ],
    initial: ['next-auth', 'clerk', 'supabase', 'auth0', 'none'].indexOf(config.stack.auth),
  });

  const { styling } = await prompts({
    type: 'select',
    name: 'styling',
    message: 'Styling:',
    choices: [
      { title: 'Tailwind CSS', value: 'tailwind' },
      { title: 'CSS Modules', value: 'css-modules' },
      { title: 'styled-components', value: 'styled-components' },
      { title: 'None', value: 'none' },
    ],
    initial: ['tailwind', 'css-modules', 'styled-components', 'none'].indexOf(config.stack.styling),
  });

  const { additionalSafeZones } = await prompts({
    type: 'list',
    name: 'additionalSafeZones',
    message: 'Additional safe zone paths (comma-separated, or empty to skip):',
    separator: ',',
  });

  return {
    ...config,
    stack: { database, auth, styling },
    safeZones: [
      ...config.safeZones,
      ...(additionalSafeZones as string[]).map((s: string) => s.trim()).filter(Boolean),
    ],
  };
}

/**
 * Load the config from disk, resolving relative paths to absolute
 */
export async function loadConfig(projectRoot: string): Promise<ProjectConfig> {
  const configPath = path.join(projectRoot, CONFIG_FILE);

  if (!await fs.pathExists(configPath)) {
    throw new Error(
      'No .launchcrate.json found. Run `launchcrate init` first.'
    );
  }

  const config: ProjectConfig = await fs.readJson(configPath);

  // Resolve relative paths to absolute
  config.paths = {
    root: projectRoot,
    features: path.resolve(projectRoot, config.paths.features),
    components: path.resolve(projectRoot, config.paths.components),
    lib: path.resolve(projectRoot, config.paths.lib),
    api: path.resolve(projectRoot, config.paths.api),
  };

  return config;
}
