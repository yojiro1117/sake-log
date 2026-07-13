import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const htmlListPath = path.join(repoRoot, 'tests', 'fixtures', 'google-drive-files.json');
const htmlFiles = JSON.parse(await readFile(htmlListPath, 'utf8'));

const apiLeadingFiles = [
  ['IMG_5378.HEIC', '1-Q0oUlZsSjrYDLsu7tEI4auAE6rEnc48', 'image/heif', 1890345],
  ['IMG_5189.HEIC', '11bcScj3KruqCVke1wdpROe2ZL15Oe0lb', 'image/heif', 1777385],
  ['IMG_5188.HEIC', '1ZroFvTmFNXOrJ1nuzeWgLhsoacOUQ9XB', 'image/heif', 1621038],
  ['IMG_5187.HEIC', '1STRboEd6zIbc_Z9GjKNpnGqrsezdgkCs', 'image/heif', 2245877],
  ['IMG_7536.HEIC', '1wQ8F-WcDEMEE8JU9A0ppnyqeXGXcigrz', 'image/heif', 2017058],
  ['IMG_7535.HEIC', '1sh12-ULC9yQ59O11l6dS8WPuvEvCAWQh', 'image/heif', 2174675],
  ['IMG_4623 2.HEIC', '1GXsoJm1nb8_3tpn7LiLCAy-NINFNjuQK', 'image/heif', 3277645],
  ['IMG_4622 2.HEIC', '1TcEPn1-tcKQQH1l31txnJ7oqUO407-Sa', 'image/heif', 2282454],
  ['IMG_4621.HEIC', '1VwpZOqmeIFIpXfT6yIqhk5prTs1hGAwO', 'image/heif', 1977585],
  ['IMG_4620 2.HEIC', '151M8GmeqHILTxOwckhoi7Vgj8zUooIWR', 'image/heif', 2224444],
  ['IMG_4619 2.HEIC', '1YUl9g1LOB85BIXFEMhjep7Trj66nuIUF', 'image/heif', 2428844],
  ['IMG_4618 2.HEIC', '1G-vSJby7u-6D7n-U9Pd-cBFbPGJdNb21', 'image/heif', 2536904],
  ['IMG_4617 2.HEIC', '1j44iy4Jjl2zQCreHHvZM5ooc7spzO25-', 'image/heif', 2288898],
  ['IMG_4616 2.HEIC', '1pjv4RfIRiLwZsgu0AzeIxH8uZOZjJKI1', 'image/heif', 2176948],
  ['IMG_4615 2.HEIC', '14b5VlIe8x5RKT6beeFn0ZRa3ds7lg7nh', 'image/heif', 1603267],
  ['IMG_4614.HEIC', '1WKefqamIrCOiGeHkRQznv6aZOQeVram8', 'image/heif', 2258166],
  ['IMG_4612.HEIC', '1_-W1-Ihwy-pa_Ow3NyjD5LuYjMC_T3bx', 'image/heif', 1332804],
  ['IMG_4611.HEIC', '1vxLKQizHD3GdDsc_C07R9oTgZqXVwLh3', 'image/heif', 1985322],
  ['IMG_4300.HEIC', '1Cyf9b8cLvrKB4148wu2xuZEO5Prg9bHv', 'image/heif', 2052102],
  ['IMG_4298.HEIC', '1CCzHRFPWM9HRxhq7XkvwUdyh9zcbZD2o', 'image/heif', 2740275],
  ['IMG_4295.HEIC', '1_VpshPZ-SKenMTfVfyU5tPcRVccnUYzP', 'image/heif', 1873267],
  ['IMG_4294.HEIC', '1tQh_RUdA3lKuW78sxI5UPtWnDovC3fva', 'image/heif', 1961729]
].map(([fileName, driveFileId, mimeType, driveSize]) => ({ fileName, driveFileId, mimeType, driveSize }));

const byName = new Map();
for (const file of [...htmlFiles, ...apiLeadingFiles]) {
  byName.set(file.fileName, {
    driveFileId: file.driveFileId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    driveSize: file.driveSize ?? undefined,
    sizeLabel: file.sizeLabel ?? undefined
  });
}

const files = [...byName.values()].sort((a, b) => a.fileName.localeCompare(b.fileName, 'ja'));
await writeFile(htmlListPath, `${JSON.stringify(files, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ count: files.length, output: htmlListPath }, null, 2));
