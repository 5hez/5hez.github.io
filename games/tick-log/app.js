'use strict';

import { migrate, getSyncConfig, importEvents, importButtons } from './utils/db.js';
import { fetchRemoteFile, markSynced } from './utils/sync.js';
import { confirmbox, toast } from './utils/ui.js';
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
const SYNC_INTERVAL = 24 * 3600 * 1000; // 数据同步检测间隔：24 小时

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

// 注册 Service Worker（离线优先：秒开 + 离线可用）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

migrate();
render();

// 首屏渲染后再做后台检测，不阻塞启动
setTimeout(async () => {
  await checkVersion();
  await checkRemoteSync();
}, 3000);

/** 版本检测：version.json 与本地记录比较，有新版本弹手动升级提示。 */
async function checkVersion() {
  try {
    const resp = await fetch('./version.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) return;
    const remote = Number((await resp.json()).version || 0);
    const known = Number(localStorage.getItem('app_version') || 0);
    if (remote <= known) return;
    if (known === 0) { localStorage.setItem('app_version', String(remote)); return; }
    const ok = await confirmbox({
      title: '发现新版本',
      message: '检测到新版本 v' + remote + '，是否立即更新？（本地数据不受影响）',
      confirmText: '立即更新',
      cancelText: '稍后'
    });
    localStorage.setItem('app_version', String(remote));
    if (ok) {
      if ('caches' in window) { for (const k of await caches.keys()) await caches.delete(k); }
      location.reload();
    }
  } catch (e) { /* 离线或网络异常，忽略 */ }
}

/** 云端数据检测：每天一次，远端有更新则提示是否同步。 */
async function checkRemoteSync() {
  try {
    const cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) return; // 未配置同步
    const lastCheck = Number(localStorage.getItem('sync_last_check') || 0);
    if (Date.now() - lastCheck < SYNC_INTERVAL) return;
    localStorage.setItem('sync_last_check', String(Date.now()));
    const remote = await fetchRemoteFile(cfg);
    if (!remote) return;
    const remoteAt = Number(remote.exportedAt || 0);
    const localAt = Number(localStorage.getItem('sync_exported_at') || 0);
    if (remoteAt <= localAt) return;
    const ok = await confirmbox({
      title: '云端有更新',
      message: '检测到云端数据有更新（' + new Date(remoteAt).toLocaleString() + '），是否同步最新数据？',
      confirmText: '立即同步',
      cancelText: '暂不'
    });
    if (!ok) { markSynced(remoteAt); return; }
    let summary = '';
    if (Array.isArray(remote.events) && remote.events.length) {
      const r = importEvents(remote.events);
      summary += `记录 +${r.added}${r.updated ? `/改${r.updated}` : ''}`;
    }
    if (Array.isArray(remote.buttons) && remote.buttons.length) {
      const r = importButtons(remote.buttons);
      summary += (summary ? '，' : '') + `按钮 +${r.added}${r.updated ? `/改${r.updated}` : ''}`;
    }
    markSynced(remoteAt);
    toast('已同步云端数据' + (summary ? '：' + summary : ''));
    render();
  } catch (e) { /* 忽略网络错误 */ }
}
