import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { loadBrandConfig, CUSTOMER_DIR } from '../src/config/loadCustomer.ts';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

function brandSlug(shortName: string): string {
  const slug = shortName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'portal';
}

function buildServiceWorker(cacheName: string, precache: string[]): string {
  return `// Service Worker for offline capability & PWA installability (generated — do not edit)
const CACHE_NAME = '${cacheName}';
const ASSETS_TO_CACHE = [
${precache.map((a) => `  '${a}',`).join('\n')}
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Pre-cache asset warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Notification', body: '', url: '/' };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // non-JSON push payloads fall back to defaults
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/app-icon-192.png',
      badge: '/app-icon-192.png',
      data: { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through non-GET and API requests directly to network
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful responses for static assets
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});
`;
}

async function main() {
  const brand = loadBrandConfig();
  const slug = brandSlug(brand.shortName);

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  // 1. App icon SVG (customer drop-in artwork)
  const iconSrc = path.join(CUSTOMER_DIR, 'app-icon.svg');
  if (!fs.existsSync(iconSrc)) {
    throw new Error(`Missing customer asset: ${iconSrc}`);
  }
  const iconSvg = fs.readFileSync(iconSrc, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'app-icon.svg'), iconSvg);
  console.log('brand-assets: wrote public/app-icon.svg');

  // 2. PNG icons for installability (best effort)
  const icons: Array<{ src: string; sizes: string; type: string; purpose: string }> = [
    { src: '/app-icon.svg', sizes: '192x192 512x512 any', type: 'image/svg+xml', purpose: 'any maskable' },
  ];
  try {
    await sharp(Buffer.from(iconSvg)).resize(192, 192).png().toFile(path.join(PUBLIC_DIR, 'app-icon-192.png'));
    await sharp(Buffer.from(iconSvg)).resize(512, 512).png().toFile(path.join(PUBLIC_DIR, 'app-icon-512.png'));
    icons.push(
      { src: '/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    );
    console.log('brand-assets: wrote public/app-icon-192.png + public/app-icon-512.png');
  } catch (err) {
    console.warn('brand-assets: PNG icon generation skipped (sharp SVG rasterization unavailable).', err);
  }

  // 3. Web app manifest
  const manifest = {
    name: brand.companyName,
    short_name: brand.appTitle,
    description: `Staff roster, schedule, and availability management portal for ${brand.companyName}.`,
    start_url: '/',
    id: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: brand.colors.background,
    theme_color: brand.colors.background,
    icons,
  };
  fs.writeFileSync(path.join(PUBLIC_DIR, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('brand-assets: wrote public/manifest.webmanifest');

  // 4. Service worker (brand-scoped cache name so rebrands don't reuse stale caches)
  const precache = ['/', '/index.html', '/manifest.webmanifest', '/app-icon.svg'];
  if (icons.some((i) => i.src === '/app-icon-192.png')) {
    precache.push('/app-icon-192.png', '/app-icon-512.png');
  }
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sw.js'), buildServiceWorker(`${slug}-portal-v1`, precache));
  console.log(`brand-assets: wrote public/sw.js (cache ${slug}-portal-v1)`);
}

main().catch((err) => {
  console.error('brand-assets: FAILED —', err?.message || err);
  process.exit(1);
});
