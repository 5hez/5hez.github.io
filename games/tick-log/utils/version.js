'use strict';

/**
 * 版本号唯一来源：version.json。
 * 设置页展示与「发现新版本」校验都走这里，避免两处版本不一致。
 */

export const APP_NAME = '快记小事';

export function getKnownVersion() {
  try { return localStorage.getItem('app_version') || ''; } catch (e) { return ''; }
}

export function setKnownVersion(v) {
  try { localStorage.setItem('app_version', String(v == null ? '' : v)); } catch (e) {}
}

/** 拉取远端最新版本号（始终走网络，绕开 SW / HTTP 缓存）。失败返回 null。 */
export async function fetchRemoteVersion() {
  try {
    const resp = await fetch('./version.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data && data.version != null ? String(data.version) : null;
  } catch (e) { return null; }
}

/** 语义化版本比较：a>b 返回 1，a<b 返回 -1，相等返回 0。 */
export function compareVersion(a, b) {
  const pa = String(a == null ? '' : a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b == null ? '' : b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** 展示文案：快记小事 v1.2.5 */
export function formatVersion(v) {
  return APP_NAME + ' v' + (v || '—');
}
