import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildBundle } from './build';
import { checkContent } from './check';
import { loadContent, type Issue } from './load';

const USAGE = `Usage:
  logicpath-content check <content-dir>
  logicpath-content build <content-dir> <out-file>`;

function report(issues: Issue[]): boolean {
  const errors = issues.filter((i) => i.severity === 'error');
  for (const issue of issues) {
    const tag = issue.severity === 'error' ? '✗' : '!';
    console.error(`${tag} ${issue.file}\n  ${issue.message.replace(/\n/g, '\n  ')}`);
  }
  const warnings = issues.length - errors.length;
  console.error(
    errors.length === 0
      ? `✓ content ok${warnings ? ` (${warnings} warnings)` : ''}`
      : `${errors.length} errors, ${warnings} warnings`,
  );
  return errors.length === 0;
}

function main(args: string[]): number {
  const [command, dir, out] = args;
  if (!dir || (command !== 'check' && command !== 'build') || (command === 'build' && !out)) {
    console.error(USAGE);
    return 2;
  }

  const { content, issues } = loadContent(resolve(dir));
  const allIssues = content ? [...issues, ...checkContent(content)] : issues;
  if (!report(allIssues) || !content) return 1;

  if (command === 'build') {
    const bundle = buildBundle(content);
    const target = resolve(out!);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(bundle)}\n`);
    const published = bundle.concepts.filter((c) => c.published).length;
    console.error(
      `✓ built ${target} (version ${bundle.version}, ${published}/${bundle.concepts.length} concepts published, ${Object.keys(bundle.items).length} items)`,
    );
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
