import { readFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';
for (const name of ['body', 'left-wing', 'right-wing']) {
  const bytes = await readFile(new URL(`../dist/models/${name}.glb`, import.meta.url));
  const { issues } = await validateBytes(bytes, { uri: `${name}.glb` });
  console.log(`${name}: ${issues.numErrors} errors, ${issues.numWarnings} warnings, ${issues.numInfos} informational hints`);
  if (issues.numErrors || issues.numWarnings) process.exitCode = 1;
}
