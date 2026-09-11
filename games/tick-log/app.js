'use strict';

import { migrate } from './utils/db.js';
import * as home from './views/home.js';
import * as stats from './views/stats.js';
import * as history from './views/history.js';
import * as settings from './views/settings.js';

const ROUTES = {
  '#/home': home,
  '#/stats': stats,
  '#/history': history,
  '#/settings': settings
};

function currentRoute() {
  let hash = location.hash.split('?')[0];
  if (!hash || !ROUTES[hash]) hash = '#/home';
  return hash;
}

function render() {
  const route = currentRoute();
  const container = document.getElementById('view');
  container.scrollTop = 0;
  ROUTES[route].render(container);
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === route);
  });
}

window.addEventListener('hashchange', render);

// 首次注册 Service Worker（离线缓存）：仅 HTTPS / localhost 下生效
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {
    // 离线目录（lavalapp）或非安全环境：静默跳过，应用仍可正常使用
  });
}

migrate();
render();