// Builds the standalone site in docs/ from index.html (the app source).
// Run: node build.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const out = path.join(__dirname, 'docs');
fs.mkdirSync(out, { recursive: true });

const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const cut = src.indexOf('<div id="app">');
if (cut < 0) throw new Error('index.html: could not find the app container');
const head = src.slice(0, cut), body = src.slice(cut);
const version = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Lift Log">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#F2F4F3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E1513" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" href="icon-192.png">
<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
<script>window.GP_STANDALONE = true;</script>
${head.trim()}
</head>
<body>
${body.trim()}
<script>if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });</script>
</body>
</html>
`);

fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'Lift Log', short_name: 'Lift Log', start_url: './', scope: './', display: 'standalone',
  background_color: '#F2F4F3', theme_color: '#13201B',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
}, null, 2));

// Offline support: the app shell is fetched fresh when online and served from cache when not.
fs.writeFileSync(path.join(out, 'sw.js'), `const CACHE = 'gym-progress-${version}';
const SHELL = ['./', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const fonts = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (fonts) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
  } else if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./'))));
  }
});
`);

// App icon: a white dumbbell on the app's dark green, drawn pixel by pixel.
function crc32(buf) { let c, crc = ~0; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function icon(n) {
  const rects = [[.36, .46, .64, .54], [.25, .28, .35, .72], [.65, .28, .75, .72], [.15, .37, .23, .63], [.77, .37, .85, .63]];
  const raw = Buffer.alloc(n * (n * 3 + 1));
  for (let y = 0; y < n; y++) {
    raw[y * (n * 3 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const fx = (x + .5) / n, fy = (y + .5) / n, on = rects.some(r => fx >= r[0] && fx < r[2] && fy >= r[1] && fy < r[3]);
      const o = y * (n * 3 + 1) + 1 + x * 3;
      raw[o] = on ? 255 : 0x13; raw[o + 1] = on ? 255 : 0x20; raw[o + 2] = on ? 255 : 0x1B;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
[180, 192, 512].forEach(n => fs.writeFileSync(path.join(out, 'icon-' + n + '.png'), icon(n)));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Built docs/ (version ' + version + ')');
