import { build } from 'esbuild';
import sharp from 'sharp';
import { cp, mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'web/dist');
const apiOrigin = process.env.PUBLIC_API_ORIGIN || 'https://wearagain-api.oli-struska.workers.dev';
const contactEmail = process.env.PUBLIC_CONTACT_EMAIL || '';
const api = new URL(apiOrigin);
if ((api.protocol !== 'https:' && !(api.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(api.hostname))) || api.pathname !== '/' || api.username || api.password || api.search || api.hash) throw new Error('PUBLIC_API_ORIGIN must be an HTTPS origin (or local development origin).');
if (contactEmail && !/^[^\s<>"'@]+@[^\s<>"'@]+\.[^\s<>"'@]+$/.test(contactEmail)) throw new Error('PUBLIC_CONTACT_EMAIL must be a plain email address.');
await rm(destination, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
await mkdir(destination, { recursive: true });
await cp(join(root, 'web/public'), destination, { recursive: true });
await rm(join(destination, 'sw-template.js'));
const output = await build({
  entryPoints: [join(root, 'web/src/main.ts')], bundle: true, minify: true, metafile: true,
  outdir: join(destination, 'assets'), entryNames: 'app-[hash]', format: 'esm', platform: 'browser', target: ['es2022'],
  define: { __PUBLIC_API_ORIGIN__: JSON.stringify(api.origin), __PUBLIC_CONTACT_EMAIL__: JSON.stringify(contactEmail) },
  logLevel: 'warning',
});
const files = Object.keys(output.metafile.outputs).map(file => '/' + file.replaceAll('\\', '/').split('web/dist/').at(-1));
const script = files.find(file => file.endsWith('.js'));
const style = files.find(file => file.endsWith('.css'));
if (!script || !style) throw new Error('The app must produce both JavaScript and CSS.');
const template = await readFile(join(root, 'web/index.html'), 'utf8');
const html = template.replace('__APP_SCRIPT__', script).replace('__APP_STYLE__', style);
for (const route of ['', 'app', 'retailers']) {
  await mkdir(join(destination, route), { recursive: true });
  await writeFile(join(destination, route, 'index.html'), html);
}
await mkdir(join(destination, 'assets/avatars'), { recursive: true });
const avatarIndex = JSON.parse(await readFile(join(root, 'fixtures/base_models/avatars.json'), 'utf8'));
// UI thumbnails only. The Worker keeps using the pinned original avatar bytes.
await Promise.all(avatarIndex.avatars.map(async avatar => {
  if (!/^[A-Za-z0-9_-]+\.(png|jpg)$/.test(avatar.file)) throw new Error('Invalid avatar asset path');
  await sharp(join(root, 'fixtures/base_models', avatar.file)).resize({ width: 320, withoutEnlargement: true }).toFile(join(destination, 'assets/avatars', avatar.file));
}));
for (const [from, to] of [['landing-v1.png', 'reference-shoppers.png'], ['landing-retailers-v1.webp', 'reference-retailers.webp'], ['03-przymiarki-desktop.png', 'reference-matrix.png']]) {
  await cp(join(root, 'docs/mockups', from), join(destination, 'assets', to));
}
for (const size of [192, 512]) {
  await sharp(join(root, 'web/public/icons/icon.svg')).resize(size, size).png().toFile(join(destination, 'icons', `icon-${size}.png`));
}
const manifest = JSON.parse(await readFile(join(root, 'fixtures/youcam/demo-manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.renders)) throw new Error('Invalid recorded demo manifest');
const seen = new Set();
for (const entry of manifest.renders) {
  if (!/^[A-Za-z0-9._:-]+$/.test(entry.id ?? '') || seen.has(entry.id) || !/^\/demo\/renders\/[A-Za-z0-9_-]+\.(png|jpg)$/.test(entry.imagePath ?? '') || entry.syntheticAvatarOnly !== true || entry.api !== 'cloth-v4' || !avatarIndex.avatars.some(avatar => avatar.id === entry.avatarId)) throw new Error('Invalid recorded demo entry');
  seen.add(entry.id);
  const from = join(root, 'web', entry.imagePath.slice(1));
  if (!(await stat(from)).isFile()) throw new Error(`Missing recording: ${entry.imagePath}`);
  await mkdir(dirname(join(destination, entry.imagePath)), { recursive: true });
  await cp(from, join(destination, entry.imagePath));
}
await mkdir(join(destination, 'demo'), { recursive: true });
await writeFile(join(destination, 'demo/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await cp(join(root, 'fixtures/core'), join(destination, 'demo/scenarios'), { recursive: true });

const precache = [];
async function collect(path = '') {
  for (const entry of await readdir(join(destination, path), { withFileTypes: true })) {
    const relative = [path, entry.name].filter(Boolean).join('/');
    if (entry.isDirectory()) await collect(relative);
    else if (!entry.name.startsWith('_') && !entry.name.endsWith('.md') && entry.name !== 'index.html') precache.push('/' + relative);
  }
}
await collect();
// Pages redirects explicit index.html URLs to canonical directory paths.
// Precache only their final URLs so redirect refusal does not break install.
precache.push('/', '/app/', '/retailers/');
precache.sort();
const digest = createHash('sha256');
for (const file of precache) {
  digest.update(file);
  const path = file.endsWith('/') ? `${file.slice(1)}index.html` : file.slice(1);
  digest.update(await readFile(join(destination, path)));
}
const version = digest.digest('hex').slice(0, 16);
const sw = (await readFile(join(root, 'web/public/sw-template.js'), 'utf8')).replace('__PRECACHE_FILES__', JSON.stringify(precache)).replace('__CACHE_VERSION__', version);
await writeFile(join(destination, 'sw.js'), sw);
await writeFile(join(destination, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/sw.js\n  Cache-Control: no-cache\n/demo/manifest.json\n  Cache-Control: no-cache\n`);
await writeFile(join(destination, '_redirects'), '/app /app/ 301\n/retailers /retailers/ 301\n');
console.log(`Pages build: web/dist (${precache.length} explicit offline assets; ${manifest.renders.length} recorded YouCam previews).`);
