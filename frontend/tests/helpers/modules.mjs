import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const cache = new Map();
export function moduleUrl(path) {
  if (cache.has(path)) return cache.get(path);
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const linked = source.replace(/from ['"]([^'"]+)['"]/g, (_, spec) => {
    const local = resolve(dirname(path), spec);
    return `from '${spec.startsWith('.') ? moduleUrl(existsSync(local + '.ts') ? local + '.ts' : local + '.tsx') : import.meta.resolve(spec)}'`;
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(linked).toString('base64');
  cache.set(path, url);
  return url;
}
export const loadModule = path => import(moduleUrl(resolve(path)));
