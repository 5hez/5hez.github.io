'use strict';

// 快记小事 Service Worker：
// - 实现性资源（首页 / JS / CSS / manifest）：NetworkFirst —— 在线时始终取最新（解决改代码刷不出新版），离线回退缓存。
// - 静态资源（图标）：CacheFirst —— 优先速度与离线，install 时预缓存。
// 注意：Service Worker 仅在 HTTPS 或 localhost 环境下生效。

const CACHE = 'tick-log-v4';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app.css',
  './app.js',
  './core/stats.js',
  './core/interval.js',
  './core/session.js',
  './utils/db.js',
  './utils/storage.js',
  './utils/time.js',
  './utils/canvasChart.js',
  './utils/exporter.js',
  './utils/icons.js',
  './utils/import.js',
  './utils/ui.js',
  './utils/sync.js',
  './views/home.js',
  './views/stats.js',
  './views/history.js',
  './views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('tick-log-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isImpl(url) {
  return url.pathname.endsWith('/') || /\.(js|css|json|webmanifest|html)$/.test(url.pathname);
}

async function networkFirst(req) {
  try {
    const resp = await fetch(req, { cache: 'no-store' });
    if (resp && resp.ok) {
      const copy = resp.clone();
      const cache = await caches.open(CACHE);
      await cache.put(req, copy);
    }
    return resp;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const resp = await fetch(req);
  if (resp && resp.ok) {
    const copy = resp.clone();
    const cache = await caches.open(CACHE);
    await cache.put(req, copy);
  }
  return resp;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(isImpl(url) ? networkFirst(req) : cacheFirst(req));
});