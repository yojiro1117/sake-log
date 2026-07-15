import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const project = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const allowed = new Set(['MIT', 'ISC', 'Apache-2.0', 'MPL-2.0']);
const checked = [];

for (const dependency of Object.keys(project.dependencies ?? {})) {
  const packagePath = path.join(root, 'node_modules', ...dependency.split('/'), 'package.json');
  const metadata = JSON.parse(await readFile(packagePath, 'utf8'));
  const license = typeof metadata.license === 'string' ? metadata.license : '';
  if (!allowed.has(license)) {
    throw new Error(`${dependency}: unsupported or unknown client license "${license || 'missing'}"`);
  }
  checked.push({ dependency, license });
}

console.log(JSON.stringify({ checked: checked.length, licenses: [...new Set(checked.map((item) => item.license))].sort() }));
