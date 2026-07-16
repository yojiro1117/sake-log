import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const forbidden = /\.(?:tflite|mlmodel|mlpackage|onnx|pt|pth|weights)$/i;
const hits = [];
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) await walk(child);
    else if (forbidden.test(entry.name)) hits.push(child);
  }
}
await walk('.');
if (hits.length) throw new Error(`Unreviewed native model binaries found:\n${hits.join('\n')}`);
console.log('No embedded third-party model binaries found.');
