import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const png = await readFile('dist/images/crow-companion.png');
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

let offset = 8;
let width;
let height;
let complete = false;
while (offset + 12 <= png.length) {
  const length = png.readUInt32BE(offset);
  const end = offset + 12 + length;
  assert.ok(end <= png.length, `crow-companion.png is truncated at byte ${offset}`);
  const type = png.toString('ascii', offset + 4, offset + 8);
  if (type === 'IHDR') {
    width = png.readUInt32BE(offset + 8);
    height = png.readUInt32BE(offset + 12);
  }
  offset = end;
  if (type === 'IEND') {
    complete = true;
    break;
  }
}
assert.equal(complete, true, 'crow-companion.png has no complete IEND chunk');
assert.equal(offset, png.length, 'crow-companion.png has unexpected trailing data');
assert.deepEqual([width, height], [1670, 941]);

const author = await readFile('dist/images/author-default.jpeg');
assert.deepEqual([...author.subarray(0, 2)], [255, 216]);
assert.deepEqual([...author.subarray(-2)], [255, 217]);

for (const name of ['gardens', 'marina', 'kyoto', 'paris', 'sydney', 'kampong', 'golden-gate']) {
  const path = `dist/images/destinations/${name}.webp`;
  const image = await readFile(path);
  assert.equal(image.toString('ascii', 0, 4), 'RIFF', path);
  assert.equal(image.toString('ascii', 8, 12), 'WEBP', path);
  assert.equal(image.readUInt32LE(4) + 8, image.length, `${path} is truncated`);
}

console.log('Approved image assets are complete.');
