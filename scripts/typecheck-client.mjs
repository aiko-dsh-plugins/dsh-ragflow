import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
await mkdir('.artifacts', { recursive: true });
await writeFile('.artifacts/client-tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react', strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true }, files: [resolve('src/browser/client.tsx')] }));
execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', '.artifacts/client-tsconfig.json'], { stdio: 'inherit' });
