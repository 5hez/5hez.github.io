'use strict';

// GitHub 数据同步：通过 Contents API 上传/下载统一的数据包文件。
// 仅需一个对目标仓库拥有 contents 读写权限的 Personal Access Token。
// 注意：Token 保存在浏览器 localStorage（本机），请使用权限收敛的 token，勿写入共享环境。

const DEFAULT_BASE = 'https://api.github.com';

function base() {
  return (typeof window !== 'undefined' && window.__GH_API__) || DEFAULT_BASE;
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function headers(token) {
  return {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}

async function safeText(r) {
  try { return (await r.text()).slice(0, 200); } catch (e) { return ''; }
}

function appFetch(url, options) {
  return fetch(url, options);
}

/** 拉取远端同步文件。文件不存在返回 null。 */
export async function fetchRemoteFile({ token, repo, path }) {
  const url = `${base()}/repos/${repo}/contents/${path}`;
  const resp = await appFetch(url, { headers: headers(token) });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (await safeText(resp)));
  const data = await resp.json();
  if (!data || data.encoding !== 'base64' || !data.content) throw new Error('远程文件格式异常');
  return JSON.parse(b64ToUtf8(data.content));
}

/**
 * 上传同步数据到远端文件。若文件已存在则携带 sha 更新。
 */
export async function pushRemoteFile({ token, repo, path, message, content }) {
  const url = `${base()}/repos/${repo}/contents/${path}`;
  let sha = null;
  const existing = await appFetch(url, { headers: headers(token) });
  if (existing.status === 200) {
    const j = await existing.json();
    sha = j.sha;
  } else if (existing.status !== 404) {
    throw new Error('HTTP ' + existing.status + ' ' + (await safeText(existing)));
  }
  const body = { message: message || 'tick-log 同步', content: utf8ToB64(content) };
  if (sha) body.sha = sha;
  const resp = await appFetch(url, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (await safeText(resp)));
  return resp.json();
}

/** 组装云端数据包（复用本地导出结构）。 */
export function buildSyncPayload(events, buttons) {
  return JSON.stringify({
    app: 'tick-log',
    version: 1,
    exportedAt: Date.now(),
    events,
    buttons
  });
}