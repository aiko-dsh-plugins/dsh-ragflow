import { createRequire } from 'node:module';
import { mkdir, symlink, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const kit = process.env.DSH_CLIENT_TYPES ?? resolve('../aiko-dsh-workbench-kit-integration');
for (const scope of ['@deepseek-ai', '@types']) {
  await mkdir(join('node_modules', scope), { recursive: true });
  for (const name of await readdir(join(kit, 'node_modules', scope))) {
    const dest = resolve('node_modules', scope, name);
    if (!existsSync(dest)) await symlink(join(kit, 'node_modules', scope, name), dest, 'junction');
  }
}
if (!existsSync('node_modules/react')) await symlink(join(kit, 'node_modules/react'), resolve('node_modules/react'), 'junction');
if (!existsSync('node_modules/@deepseek-ai/dsh-client-ui-chat')) await symlink(resolve('../../deepseek-harness/packages/client/ui-chat'), resolve('node_modules/@deepseek-ai/dsh-client-ui-chat'), 'junction');
await mkdir('.artifacts', { recursive: true });
await writeFile('.artifacts/client-tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react', strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true }, files: [resolve('src/browser/client.tsx')] }));
execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', '.artifacts/client-tsconfig.json'], { stdio: 'inherit' });
