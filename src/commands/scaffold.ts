import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import dotenv from 'dotenv';
import { loadConfig } from './init.js';
import { analyzeFeature } from '../generate/analyzer.js';
import { generateFeature } from '../generate/generator.js';
import { writeFileSafe } from '../utils/fs.js';

export async function scaffoldCommand(
  featureName: string | undefined,
  options: { description?: string; ai?: boolean; dryRun?: boolean }
): Promise<void> {
  const projectRoot = process.cwd();

  // Load .env files for API key
  dotenv.config({ path: path.join(projectRoot, '.env.local') });
  dotenv.config({ path: path.join(projectRoot, '.env') });

  // Load project config
  let config;
  try {
    config = await loadConfig(projectRoot);
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  // Get feature name if not provided
  if (!featureName) {
    const response = await prompts({
      type: 'text',
      name: 'featureName',
      message: 'Feature name:',
      validate: (v) => v.length > 0 || 'Feature name is required',
    });
    featureName = response.featureName;
    if (!featureName) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  // Get description
  let description = options.description || featureName;
  if (!options.description) {
    const response = await prompts({
      type: 'text',
      name: 'description',
      message: 'Describe the feature (what it does, what fields it needs):',
      initial: featureName,
      validate: (v) => v.length >= 5 || 'Please provide at least a brief description',
    });
    description = response.description || featureName;
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const noAi = options.ai === false;
  const useAi = !noAi && !!apiKey;

  if (!useAi && !noAi) {
    console.log(chalk.yellow('\n  No ANTHROPIC_API_KEY found. Using basic templates.'));
    console.log(chalk.dim('  Set ANTHROPIC_API_KEY in .env for AI-powered generation.\n'));
  }

  // Step 1: Analyze the feature
  const analyzeSpinner = ora('Analyzing feature specification...').start();
  let spec;
  try {
    spec = await analyzeFeature(description!, config, useAi ? apiKey : undefined);
    analyzeSpinner.succeed(`Feature: ${chalk.cyan(spec.entityName)} (${spec.fields.length} fields)`);
  } catch (error) {
    analyzeSpinner.fail('Analysis failed');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  // Show spec summary
  console.log('');
  console.log(chalk.bold('  Fields:'));
  for (const field of spec.fields) {
    const req = field.required ? chalk.red('*') : ' ';
    console.log(`    ${req} ${chalk.cyan(field.name)}: ${chalk.dim(field.type)}${field.description ? chalk.dim(` — ${field.description}`) : ''}`);
  }
  console.log('');

  // Confirm before generating
  const { proceed } = await prompts({
    type: 'confirm',
    name: 'proceed',
    message: 'Generate files for this feature?',
    initial: true,
  });

  if (!proceed) {
    console.log(chalk.yellow('Aborted.'));
    return;
  }

  // Step 2: Generate code
  if (!useAi) {
    console.log(chalk.yellow('\n  Skipping code generation (no API key). Spec saved only.\n'));
    return;
  }

  const generateSpinner = ora('Generating code (this takes 15-30 seconds)...').start();
  let files;
  try {
    files = await generateFeature(spec, config, apiKey!);
    generateSpinner.succeed(`Generated ${chalk.cyan(String(files.length))} files`);
  } catch (error) {
    generateSpinner.fail('Generation failed');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  // Step 3: Write files
  console.log('');

  if (options.dryRun) {
    console.log(chalk.bold('  Dry run — files that would be created:\n'));
    for (const file of files) {
      console.log(`    ${chalk.green('+')} ${file.path}`);
      console.log(chalk.dim(`      ${file.description}`));
    }
    console.log('');
    return;
  }

  // Check for conflicts
  const fs = await import('fs-extra');
  const conflicts: string[] = [];
  for (const file of files) {
    const absPath = path.join(projectRoot, file.path);
    if (await fs.pathExists(absPath)) {
      conflicts.push(file.path);
    }
  }

  if (conflicts.length > 0) {
    console.log(chalk.yellow('  These files already exist:'));
    for (const c of conflicts) {
      console.log(chalk.yellow(`    ${c}`));
    }
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: 'Overwrite existing files?',
      initial: false,
    });
    if (!overwrite) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  const writeSpinner = ora('Writing files...').start();
  for (const file of files) {
    const absPath = path.join(projectRoot, file.path);
    await writeFileSafe(absPath, file.content);
  }
  writeSpinner.succeed('Files written');

  // Summary
  console.log('');
  console.log(chalk.bold('  Created:'));
  for (const file of files) {
    console.log(`    ${chalk.green('+')} ${file.path}`);
  }

  console.log('');
  console.log(chalk.bold('  Next steps:'));

  if (config.stack.database === 'prisma') {
    console.log(chalk.dim(`    1. Add the ${spec.entityName} model to prisma/schema.prisma`));
    console.log(chalk.dim('    2. Run: npx prisma db push'));
  } else if (config.stack.database === 'drizzle') {
    console.log(chalk.dim(`    1. Add the ${spec.variableNamePlural} table to your schema file`));
    console.log(chalk.dim('    2. Run: npx drizzle-kit push'));
  } else {
    console.log(chalk.dim('    1. Create the database table if needed'));
  }
  console.log(chalk.dim(`    ${config.stack.database === 'none' ? '1' : '3'}. Visit /dashboard/${spec.routeName} to see your feature`));
  console.log('');
}
