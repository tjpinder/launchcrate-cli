#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { scaffoldCommand } from './commands/scaffold.js';
import { auditCommand } from './commands/audit.js';
import { guardCommand } from './commands/guard.js';
import { testGapCommand } from './commands/test-gap.js';

const program = new Command();

program
  .name('launchcrate')
  .description('AI-powered feature scaffolding for Next.js. Vibe code safely.')
  .version('0.1.0');

program
  .command('init')
  .description('Detect project structure and create .launchcrate.json config')
  .option('-f, --force', 'Overwrite existing config without asking')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('Scan for security issues and get a Vibe Safety Score')
  .option('--json', 'Output results as JSON')
  .action(async (options) => {
    try {
      await auditCommand(options);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('guard')
  .description('Generate CLAUDE.md and .cursorrules for AI safety')
  .option('--format <format>', 'Output format: all, claude, cursor', 'all')
  .action(async (options) => {
    try {
      await guardCommand(options);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('test-gap')
  .description('Find untested API routes and pages, ranked by risk')
  .option('--json', 'Output results as JSON')
  .option('--risk-only', 'Show only critical and high-risk untested routes')
  .action(async (options) => {
    try {
      await testGapCommand(options);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('scaffold [feature-name]')
  .description('Generate a complete feature with AI')
  .option('-d, --description <desc>', 'Feature description')
  .option('--no-ai', 'Skip AI generation, use basic templates')
  .option('--dry-run', 'Show what would be generated without writing files')
  .action(async (featureName, options) => {
    try {
      await scaffoldCommand(featureName, options);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// Default: show help
program.action(() => {
  console.log('');
  console.log(chalk.bold('  Launch Crate CLI') + chalk.dim(' — Vibe code safely.'));
  console.log('');
  program.outputHelp();
});

program.parse();
