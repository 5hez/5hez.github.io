'use strict';

// 快记小事 Service Worker —— 离线优先：
// - 所有资源 CacheFirst：优先用缓存（秒开 + 完全离线可用），版本升级走 version.json 手动提示。
// - version.json 始终走网络（版本检测）。
// 注意：Service Worker 仅在 HTTPS 或 localhost 环境下生效。

const CACHE = 'tick-log-v5';

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
  // 版本检测文件始终走网络
  if (url.pathname.endsWith('/version.json')) return;
  e.respondWith(cacheFirst(req));
});
