import { build } from 'esbuild';
import { writeFile, copyFile } from 'node:fs/promises';
const output = await build({ entryPoints: ['src/browser/client.tsx'], bundle: true, write: false, platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'transform', external: ['react'], define: { 'process.env.NODE_ENV': '"production"' } });
await writeFile('dist/browser.js', `window.__ModuleLoader__.load({id:"@aiko-dsh-plugins/dsh-ragflow",factory:function(require){const module={exports:{}};\n${output.outputFiles[0].text}\nreturn module.exports;}});\n`);
await copyFile('src/web.mjs', 'dist/web.mjs');
