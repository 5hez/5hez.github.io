'use strict';

import { migrate, getSyncConfig, importEvents, importButtons, queryEvents, getButtons, dataSignature, getTombstones, getButtonTombstones } from './utils/db.js';
import { fetchRemoteFile, pushRemoteFile, buildSyncPayload, getSyncedSig, setSyncedSig } from './utils/sync.js';
import { fetchRemoteVersion, getKnownVersion, setKnownVersion, compareVersion } from './utils/version.js';
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

// 打开第一时间：检测云端是否有新数据 → 提示同步；随后再检测版本
(async () => {
  await checkRemoteSync();
  await checkVersion();
})();

// 页面关闭 / 切到后台：把本地最新数据上传同步
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') uploadIfChanged();
});
window.addEventListener('pagehide', uploadIfChanged);

/** 打开时检测：远端数据与本机已同步签名不一致 → 提示同步。 */
async function checkRemoteSync() {
  try {
    const cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) return; // 未配置同步
    const remote = await fetchRemoteFile(cfg);
    if (!remote) return;
    const remoteSig = dataSignature(remote.events || [], remote.buttons || [], remote.tombstones || [], remote.buttonTombstones || []);
    if (remoteSig === getSyncedSig()) return; // 与已同步版本一致，无新数据
    const ok = await confirmbox({
      title: '云端有新数据',
      message: '检测到云端数据有更新，是否同步到本机？（本地记录不会丢失）',
      confirmText: '立即同步',
      cancelText: '暂不'
    });
    if (!ok) return;
    let summary = '';
    if ((Array.isArray(remote.events) && remote.events.length) || (Array.isArray(remote.tombstones) && remote.tombstones.length)) {
      const r = importEvents(remote.events || [], remote.tombstones);
      summary += `记录 +${r.added}${r.updated ? `/改${r.updated}` : ''}`;
    }
    if ((Array.isArray(remote.buttons) && remote.buttons.length) || (Array.isArray(remote.buttonTombstones) && remote.buttonTombstones.length)) {
      const r = importButtons(remote.buttons || [], remote.buttonTombstones);
      summary += (summary ? '，' : '') + `按钮 +${r.added}${r.updated ? `/改${r.updated}` : ''}`;
    }
    setSyncedSig(remoteSig);
    toast('已同步云端数据' + (summary ? '：' + summary : ''));
    render();
  } catch (e) { /* 离线或网络异常，忽略 */ }
}

/** 关闭时：本地数据相比上次同步有改动 → 上传最新数据。 */
let uploading = false;
async function uploadIfChanged() {
  if (uploading) return;
  try {
    const cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) return;
    const sig = dataSignature();
    if (sig === getSyncedSig()) return; // 无本地改动
    uploading = true;
    // 先合并远端墓碑，避免把别处已删除的记录又传回去（删除一致性）
    try {
      const remote = await fetchRemoteFile(cfg);
      if (remote) {
        if (Array.isArray(remote.tombstones) && remote.tombstones.length) importEvents([], remote.tombstones);
        if (Array.isArray(remote.buttonTombstones) && remote.buttonTombstones.length) importButtons([], remote.buttonTombstones);
      }
    } catch (e) { /* 拉不到远端就按本地墓碑上传 */ }
    const payload = buildSyncPayload(queryEvents({}), getButtons(), getTombstones(), getButtonTombstones());
    await pushRemoteFile({ ...cfg, message: 'tick-log 自动同步', content: payload });
    setSyncedSig(dataSignature());
  } catch (e) { /* 忽略网络错误 */ } finally {
    uploading = false;
  }
}

/** 版本检测：version.json 与本地已知版本比较，有新版本弹手动升级提示。 */
async function checkVersion() {
  const remote = await fetchRemoteVersion();
  if (!remote) return; // 离线或取不到版本
  const known = getKnownVersion();
  if (compareVersion(remote, known) <= 0) return; // 已是最新
  if (!known) { setKnownVersion(remote); return; } // 首次：静默记录当前版本
  const ok = await confirmbox({
    title: '发现新版本',
    message: '检测到新版本 v' + remote + '，是否立即更新？（本地数据不受影响）',
    confirmText: '立即更新',
    cancelText: '稍后'
  });
  setKnownVersion(remote);
  if (ok) {
    if ('caches' in window) { for (const k of await caches.keys()) await caches.delete(k); }
    location.reload();
  }
}
