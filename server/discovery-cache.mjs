import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export function discoveryDiskCache(directory) {
  let writes = Promise.resolve();
  const path = key => {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid image cache key.');
    return join(directory, key + '.json');
  };
  return {
    async get(key) {
      const file = path(key), info = await stat(file).catch(() => null);
      if (!info || info.size > 4 * 1024 * 1024 || Date.now() - info.mtimeMs > 7 * 86400000) return null;
      return JSON.parse(await readFile(file, 'utf8'));
    },
    set(key, value) {
      const operation = writes.catch(() => {}).then(async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const file = path(key), temporary = file + '.tmp';
        await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
        await rename(temporary, file);
        const files = await Promise.all((await readdir(directory)).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(async name => ({ name, time: (await stat(join(directory, name))).mtimeMs })));
        files.sort((a, b) => b.time - a.time);
        await Promise.all(files.filter((item, i) => i >= 24 || Date.now() - item.time > 7 * 86400000).map(item => unlink(join(directory, item.name))));
      });
      writes = operation;
      return operation;
    },
  };
}
