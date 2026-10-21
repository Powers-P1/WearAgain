import { build } from 'esbuild';
import sharp from 'sharp';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'web2/dist');
await rm(dest, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
await mkdir(join(dest, 'assets/items'), { recursive: true });

/*
 * Use the eight separate garment photographs already approved on board 05.
 * These are board-coordinate crops of ImageGen design reference artwork, not
 * catalogue photographs, user uploads or generated try-on evidence.
 * PR-E includes screenshot review, where fine crop bounds can be adjusted.
 */
const board = join(root, 'docs/mockups/v2/WearAgain-05-Desktop-Szafa.png');
// Visually checked against the 1536 x 1024 source board (photo rectangles,
// excluding the garment names beneath). One standalone garment per crop.
const photos = [
  ['cashmere', 320, 291], ['blazer', 623, 291],
  ['silk', 926, 291], ['coat', 1230, 291],
  ['trousers', 320, 623], ['dress', 623, 623],
  ['loafers', 926, 623], ['bag', 1230, 623],
];
for (const [name, x, y] of photos) {
  // 274x260 is the full image rect. Inset four pixels from every edge
  // so captions and adjacent tiles cannot bleed into the asset.
  const left = x + 4, top = y + 4;
  await sharp(board).extract({ left, top, width: 266, height: 252 })
    .resize({ width: 516 }).webp({ quality: 85 }).toFile(join(dest, 'assets/items', name + '.webp'));
}
// The avatar in the design is a portrait, not a full-body white-tee render.
 // Crop the approved board-03 synthetic portrait separately for the UI.
await sharp(join(root, 'docs/mockups/v2/WearAgain-03-Personalizacja-i-wyjazd.png'))
  .extract({ left: 139, top: 541, width: 144, height: 167 })
  .resize({ width: 360 }).webp({ quality: 88 })
  .toFile(join(dest, 'assets/demo-portrait.webp'));

// Future flows reuse the original immutable recording paths and manifest.
// Individual cloth-v4 outputs must never be described as complete outfit renders.
await mkdir(join(dest, 'demo'), { recursive: true });
await cp(join(root, 'web/demo/renders'), join(dest, 'demo/renders'), { recursive: true });
await cp(join(root, 'fixtures/youcam/demo-manifest.json'), join(dest, 'demo/manifest.json'));

const output = await build({
  entryPoints: [join(root, 'web2/src/main.ts')],
  bundle: true, minify: true, metafile: true,
  outdir: join(dest, 'assets'), entryNames: 'web2-[hash]',
  format: 'esm', platform: 'browser', target: ['es2022'],
  logLevel: 'warning',
});
const emitted = Object.keys(output.metafile.outputs).map(path => '/' + path.replaceAll('\\', '/').split('web2/dist/').at(-1));
const script = emitted.find(path => path.endsWith('.js'));
const style = emitted.find(path => path.endsWith('.css'));
if (!script || !style) throw new Error('No compiled script or stylesheet for web2.');
const markup = (await readFile(join(root, 'web2/index.html'), 'utf8'))
  .replace('__APP_SCRIPT__', script).replace('__APP_STYLE__', style);
await writeFile(join(dest, 'index.html'), markup);
await mkdir(join(dest, 'app'), { recursive: true });
await writeFile(join(dest, 'app/index.html'), markup);
console.log('web2 staging build: ' + photos.length + ' garment crops, 6 unmodified recorded previews, no deploy switch.');
