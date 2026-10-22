import { build } from 'esbuild';
import sharp from 'sharp';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'web2/dist');
const apiOrigin = new URL(process.env.PUBLIC_API_ORIGIN || 'https://wearagain-api.oli-struska.workers.dev');
if (apiOrigin.protocol !== 'https:' || apiOrigin.pathname !== '/' || apiOrigin.username || apiOrigin.password || apiOrigin.search || apiOrigin.hash) throw Error('PUBLIC_API_ORIGIN must be an HTTPS origin.');
await rm(dest, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
await mkdir(join(dest, 'assets/items'), { recursive: true });
await mkdir(join(dest, 'fonts'), { recursive: true });
await mkdir(join(dest, 'icons'), { recursive: true });
// Local licensed webfonts are static public assets. No network CSS dependency.
await cp(join(root, 'web2/public/fonts'), join(dest, 'fonts'), { recursive: true });
await cp(join(root, 'web2/public/illustrations'), join(dest, 'assets/illustrations'), { recursive: true });
await writeFile(join(dest,'_headers'),(await readFile(join(root,'web2/_headers'),'utf8')).replaceAll('__API_ORIGIN__',apiOrigin.origin));
// Replace the former root-scope PWA with a one-time cleanup worker; keep
// the optional new app PWA independently scoped under /app/sw.js.
await cp(join(root, 'web2/public/sw.js'), join(dest, 'sw.js'));
await cp(join(root, 'web2/manifest.webmanifest'), join(dest, 'manifest.webmanifest'));
await cp(join(root, 'web/public/icons/icon.svg'), join(dest, 'icons/icon.svg'));
for (const size of [192,512]) {
  await sharp(join(root, 'web/public/icons/icon.svg')).resize(size,size).png()
    .toFile(join(dest,'icons',`icon-${size}.png`));
}


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
  .extract({ left: 121, top: 548, width: 150, height: 160 })
  .resize({ width: 360 }).webp({ quality: 88 })
  .toFile(join(dest, 'assets/demo-portrait.webp'));

// Verbatim artwork extracts from the approved boards. Used as editorial
// illustrations only: never catalogued as provider recordings or live results.
const editorialArt = [
  ['surprise-scarf', 'WearAgain-03-Personalizacja-i-wyjazd.png', 1035, 242, 415, 256],
  ['editorial-retail', 'WearAgain-14-Retail-Landing.png', 645, 55, 378, 505],
  ['editorial-judges', 'WearAgain-16-Judges-Landing.png', 456, 91, 426, 486],
  ['retail-product', 'WearAgain-15-Retail-Produkt.png', 34, 116, 496, 628],
  ['retail-styling', 'WearAgain-15-Retail-Produkt.png', 981, 228, 334, 518],
];
for (const [name, file, left, top, width, height] of editorialArt) {
  await sharp(join(root, 'docs/mockups/v2', file)).extract({left, top, width, height})
    .resize({width: 900, withoutEnlargement: true}).webp({quality: 88})
    .toFile(join(dest, 'assets', name + '.webp'));
}

// Provider evidence uses only the six single-garment recordings in the
// immutable manifest. Editorial art above is kept outside that catalogue.
// Future flows reuse the original immutable recording paths and manifest.
// Individual cloth-v4 outputs must never be described as complete outfit renders.
await mkdir(join(dest, 'demo'), { recursive: true });
await cp(join(root, 'web/demo/renders'), join(dest, 'demo/renders'), { recursive: true });
// Identical v1 approved design-reference visuals on the v2 public landing.
await cp(join(root, 'docs/mockups/landing-v1.png'),join(dest,'assets/reference-shoppers.png'));
await cp(join(root, 'docs/mockups/landing-retailers-v1.webp'),join(dest,'assets/reference-retailers.webp'));

await cp(join(root, 'fixtures/youcam/demo-manifest.json'), join(dest, 'demo/manifest.json'));
// Publish only the approved synthetic-adult bases, byte for byte. Do not put
// originals in the PWA precache; the Worker checks the existing Git blob hash.
const {AVATARS} = await import('../worker/src/assets.js');
await mkdir(join(dest,'demo/avatars'),{recursive:true});
for (const avatar of AVATARS) {
  const bytes=await readFile(join(root,'fixtures/base_models',avatar.file));
  const blobHash=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if(blobHash!==avatar.baseRevision)throw new Error('Approved avatar hash mismatch: '+avatar.id);
  await writeFile(join(dest,'demo/avatars',avatar.baseRevision+'-'+avatar.file),bytes);
}
// A real screen recording and captions, deliberately outside the PWA precache.
await cp(join(root,'web2/public/video'),join(dest,'video'),{recursive:true});

const output = await build({
  entryPoints: [join(root, 'web2/src/main.ts')],
  bundle: true, minify: true, metafile: true,
  outdir: join(dest, 'assets'), entryNames: 'web2-[hash]',
  format: 'esm', platform: 'browser', target: ['es2022'],
  define: {__PUBLIC_API_ORIGIN__: JSON.stringify(apiOrigin.origin), __PUBLIC_CONTACT_EMAIL__: JSON.stringify('')},
  // Absolute URLs resolve from the Pages origin; the licensed WOFF2 files
  // are copied into /fonts/ above, not bundled as JS dependencies.
  external: ['/fonts/*'],
  logLevel: 'warning',
});
const emitted = Object.keys(output.metafile.outputs).map(path => '/' + path.replaceAll('\\', '/').split('web2/dist/').at(-1));
const script = emitted.find(path => path.endsWith('.js'));
const style = emitted.find(path => path.endsWith('.css'));
if (!script || !style) throw new Error('No compiled script or stylesheet for web2.');
const markup = (await readFile(join(root, 'web2/index.html'), 'utf8'))
  .replace('__APP_SCRIPT__', script).replace('__APP_STYLE__', style);
await writeFile(join(dest, 'index.html'),
  markup.replace('<title>Your wardrobe - WearAgain</title>','<title>WearAgain - Your wardrobe, more you</title>'));
// Pages ships one static HTML shell on each route; the client resolves the exact
// pathname. Root retains the owner-selected v1 landing; the app is under /app/.
for (const directory of ['app','retail','retail/demo','judges','judges/demo']) {
  await mkdir(join(dest,directory),{recursive:true});
  const titles = {
    app: 'Your wardrobe - WearAgain',
    retail: 'For retailers - WearAgain',
    'retail/demo': 'Demo Atelier - WearAgain',
    judges: 'For judges - WearAgain',
    'judges/demo': 'Guided demo - WearAgain',
  };
  await writeFile(join(dest,directory,'index.html'),
    markup.replace('<title>Your wardrobe - WearAgain</title>',
      '<title>'+titles[directory]+'</title>'));
}
await writeFile(join(dest,'_redirects'),
  '/app /app/ 301\n/retail /retail/ 301\n/retail/demo /retail/demo/ 301\n/judges /judges/ 301\n/judges/demo /judges/demo/ 301\n/retailers /retail/ 301\n/retailers/ /retail/ 301\n');
// A real top-level 404 disables Pages' implicit SPA fallback for unknown paths.
await writeFile(join(dest,'404.html'),markup
  .replace('<title>Your wardrobe - WearAgain</title>','<title>Page not found - WearAgain</title>')
  .replace('<div id="app"></div>','<main class="page error-page" id="main-content"><a class="wordmark" href="/">WearAgain</a><h1>Let’s find your wardrobe.</h1><p>This page does not exist.</p><a class="button button-primary" href="/app/">Open your wardrobe</a></main>')
  .replace(/<script type="module"[^>]*><\/script>/,''));

// Only explicitly public, read-only assets enter the optional web app shell.
// No private browser photo, localStorage, Worker responses or live URLs.
const publicCache=['/app/','/manifest.webmanifest','/demo/manifest.json'];
async function gatherPublic(relative) {
  const path=join(dest,relative);
  for (const item of await readdir(path,{withFileTypes:true})) {
    const child=[relative,item.name].filter(Boolean).join('/');
    if(item.isDirectory()) await gatherPublic(child);
    else if(!item.name.endsWith('.txt') && !item.name.startsWith('_') &&
      /^((assets|fonts|icons)\/|demo\/renders\/)/.test(child)) publicCache.push('/'+child);
  }
}
for (const directory of ['assets','fonts','icons','demo/renders']) await gatherPublic(directory);
publicCache.sort();
const digest=createHash('sha256');
for (const relative of publicCache) {
  const actual=relative==='/app/'?'app/index.html':relative.slice(1);
  digest.update(relative);digest.update(await readFile(join(dest,actual)));
}
const template=await readFile(join(root,'web2/sw-template.js'),'utf8');
const version=digest.digest('hex').slice(0,16);
await writeFile(join(dest,'app/sw.js'),template
  .replace('__PRECACHE_FILES__',JSON.stringify(publicCache))
  .replace('__CACHE_VERSION__',version));
console.log('web2 staging: 5 public routes + /app, '+photos.length+
  ' garment references, 6 saved render assets; PWA public files '+publicCache.length+
  '; NO production deploy switch.');
