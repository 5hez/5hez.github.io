'use strict';

import { get, set, remove, keys, estimateBytes } from './storage.js';
import { findOpenSession, sessionize } from '../core/session.js';

const META_KEY = 'meta';
const BUTTONS_KEY = 'buttons';
const SETTINGS_KEY = 'settings';
const SYNC_KEY = 'gh_sync';
const EVT_PREFIX = 'events_';
const ONE_MB = 1024 * 1024;

export function getSyncConfig() {
  return Object.assign({ token: '', repo: '', path: 'tick-log/data.json' }, get(SYNC_KEY, {}));
}

export function saveSyncConfig(cfg) {
  set(SYNC_KEY, cfg);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function yearOf(ts) {
  return new Date(ts).getFullYear();
}

export function evtKey(ts) {
  return EVT_PREFIX + yearOf(ts);
}

// ---------------- meta ----------------

export function getMeta() {
  return get(META_KEY, { version: 1 });
}

export function saveMeta(meta) {
  set(META_KEY, meta);
}

// ---------------- buttons ----------------

const DEFAULT_BUTTONS = [
  { id: 'btn1', name: '上厕所', icon: 'toilet', color: '#4cb6ac', enabled: true, sort: 0 },
  { id: 'btn2', name: '咳嗽', icon: 'stethoscope', color: '#FF6B6B', enabled: true, sort: 1 },
  { id: 'btn3', name: '喝水', icon: 'glass-water', color: '#4D96FF', enabled: true, sort: 2 },
  { id: 'btn4', name: '吃药', icon: 'pill', color: '#F9C74F', enabled: true, sort: 3 }
];

// 旧默认按钮：按名称 + 旧 emoji 精确升级到语义正确的 lucide 图标
const DEFAULT_ICON_UPGRADE = {
  '上厕所': { from: '💧', to: 'toilet' },
  '咳嗽': { from: '😷', to: 'stethoscope' },
  '喝水': { from: '🥤', to: 'glass-water' },
  '吃药': { from: '💊', to: 'pill' }
};
// 其余旧 emoji -> lucide（通用映射）
const EMOJI_ICON = {
  '🚽': 'toilet', '🍚': 'utensils', '🏃': 'activity', '🚶': 'footprints',
  '😴': 'moon', '🚿': 'shower-head', '💓': 'heart-pulse', '🌡️': 'thermometer',
  '😤': 'face-angry', '🌙': 'moon', '☀️': 'sun', '⏰': 'clock', '💧': 'droplet'
};

function migrateButtonIcon(b) {
  const up = DEFAULT_ICON_UPGRADE[b.name];
  if (up && b.icon === up.from) b.icon = up.to;
  else if (EMOJI_ICON[b.icon]) b.icon = EMOJI_ICON[b.icon];
  return b;
}

export function getButtons() {
  const b = get(BUTTONS_KEY, null);
  if (b && b.length) {
    return b.slice().sort((x, y) => x.sort - y.sort).map(migrateButtonIcon);
  }
  return DEFAULT_BUTTONS.slice();
}

export function saveButtons(list) {
  list.forEach((b, i) => { b.sort = i; });
  set(BUTTONS_KEY, list);
}

// ---------------- settings ----------------

const DEFAULT_SETTINGS = {
  ignoreNightInterval: false,
  nightStart: '23:00',
  nightEnd: '07:00',
  defaultRange: 'week'
};

export function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, get(SETTINGS_KEY, {}));
}

export function saveSettings(s) {
  set(SETTINGS_KEY, Object.assign({}, DEFAULT_SETTINGS, s));
}

// ---------------- events ----------------

/**
 * 新增一条记录，按年份分片存储，倒序（unshift）插入。
 */
export function appendEvent(evt) {
  if (!evt.id) evt.id = uid();
  evt.ts = evt.ts || Date.now();
  const key = evtKey(evt.ts);
  const arr = get(key, []);
  arr.unshift(evt);
  if (estimateBytes(arr) > ONE_MB) {
    console.warn('[tick-log] 本年数据接近存储上限，建议导出备份。');
  }
  set(key, arr);
  return evt;
}

export function removeEvent(id) {
  let removed = false;
  listYearKeys().forEach((key) => {
    const arr = get(key, []);
    const next = arr.filter((x) => x.id !== id);
    if (next.length !== arr.length) {
      set(key, next);
      removed = true;
    }
  });
  return removed;
}

export function clearAllEvents() {
  listYearKeys().forEach((key) => remove(key));
}

/**
 * 事件改名：把历史记录中旧名称统一迁移到新名称（顺带更新颜色）。
 * 返回受影响的历史记录条数。用于"改按钮名 = 之前的记录也补到新名下来"。
 */
export function renameEventName(oldName, newName, color) {
  if (!oldName || !newName || oldName === newName) return 0;
  let moved = 0;
  listYearKeys().forEach((key) => {
    const arr = get(key, []);
    let changed = false;
    arr.forEach((e) => {
      if (e.name === oldName) {
        e.name = newName;
        if (color) e.color = color;
        changed = true;
        moved++;
      }
    });
    if (changed) set(key, arr);
  });
  return moved;
}

/** 某事件名称（不分是否同名按钮）现有历史记录条数。 */
export function countByName(name) {
  return queryEvents({ name }).length;
}

/**
 * 记录内容签名：用于「完全一样」判重（name + ts + node + sessionId）。
 */
function eventSig(e) {
  return String(e.name) + '|' + e.ts + '|' + (e.node || '') + '|' + (e.sessionId || '');
}

/**
 * 批量导入记录（合并协调）：
 * - 同 id 已存在：协调改名/改色（把合并/改名传播到本机），内容相同则跳过。
 * - 无 id 或 id 不同但内容签名相同：跳过（"完全一样"判重）。
 * - 其余为新增。
 * 返回 { added, updated, skipped }。
 */
export function importEvents(list) {
  const all = queryEvents({});
  const byId = new Map(all.map((e) => [e.id, e]));
  const sigs = new Set(all.map(eventSig));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  (list || []).forEach((e) => {
    if (!e || typeof e.ts !== 'number' || !e.name) { skipped++; return; }
    const id = e.id || uid();
    const existing = byId.get(id);
    if (existing) {
      // 同 id：协调改名/改色（合并传播），内容相同则跳过
      if (existing.name !== String(e.name) || (e.color && existing.color !== e.color)) {
        sigs.delete(eventSig(existing));
        existing.name = String(e.name);
        if (e.color) existing.color = e.color;
        sigs.add(eventSig(existing));
        updated++;
      } else {
        skipped++;
      }
      return;
    }
    const sig = eventSig(e);
    if (sigs.has(sig)) { skipped++; return; }
    const rec = {
      id,
      name: String(e.name),
      color: e.color || '#4cb6ac',
      ts: e.ts,
      node: e.node || null,
      sessionId: e.sessionId || null
    };
    all.push(rec);
    byId.set(id, rec);
    sigs.add(sig);
    added++;
  });

  // 重新分片写回（含改名协调）
  const perYear = new Map();
  all.forEach((rec) => {
    const key = evtKey(rec.ts);
    if (!perYear.has(key)) perYear.set(key, []);
    perYear.get(key).push(rec);
  });
  perYear.forEach((arr, key) => {
    arr.sort((a, b) => b.ts - a.ts);
    set(key, arr);
  });

  return { added, updated, skipped };
}

/**
 * 批量导入快捷按钮：按名称合并——同名按钮用导入的样式覆盖（保留原 id），
 * 新名称追加到末尾。导入后保证至少有一个启用按钮。
 * 返回 { added, updated }。
 */
export function importButtons(list) {
  const cur = getButtons();
  const byName = new Map(cur.map((b) => [b.name, b]));
  let added = 0;
  let updated = 0;
  (list || []).forEach((b) => {
    const ex = byName.get(b.name);
    if (ex) {
      ex.icon = b.icon;
      ex.color = b.color;
      ex.enabled = b.enabled;
      if (Array.isArray(b.nodes) && b.nodes.length >= 2) ex.nodes = b.nodes.slice();
      else if (!Array.isArray(ex.nodes) || ex.nodes.length < 2) ex.nodes = [];
      updated++;
    } else {
      byName.set(b.name, {
        id: uid(),
        name: b.name,
        icon: b.icon,
        color: b.color,
        enabled: b.enabled,
        sort: 0,
        nodes: Array.isArray(b.nodes) ? b.nodes.slice() : []
      });
      added++;
    }
  });
  // 按导入的 sort 恢复顺序：导入项按其 sort 排，未导入的本地项保持原相对顺序追加
  const sortOf = new Map((list || []).map((b) => [b.name, typeof b.sort === 'number' ? b.sort : 0]));
  const imported = [];
  const rest = [];
  byName.forEach((b) => (sortOf.has(b.name) ? imported : rest).push(b));
  imported.sort((a, b) => sortOf.get(a.name) - sortOf.get(b.name));
  const merged = imported.concat(rest).map((b, i) => { b.sort = i; return b; });
  if (!merged.some((b) => b.enabled)) merged[0].enabled = true;
  saveButtons(merged);
  return { added, updated };
}

export function listYearKeys() {
  return keys().filter((k) => k.indexOf(EVT_PREFIX) === 0);
}

/**
 * 查询记录：可叠加 name / fromTs / toTs 过滤，只读相关年份 key。
 */
export function queryEvents(opts) {
  opts = opts || {};
  const { name, fromTs, toTs } = opts;
  let out = [];
  listYearKeys().forEach((key) => {
    out = out.concat(get(key, []));
  });
  if (name) out = out.filter((e) => e.name === name);
  if (fromTs != null) out = out.filter((e) => e.ts >= fromTs);
  if (toTs != null) out = out.filter((e) => e.ts <= toTs);
  return out;
}

// ---------------- 过程事件（节点化） ----------------

/**
 * 取某事件的节点定义：[开始节点, 结束节点]。瞬时事件返回 null。
 */
export function getEventNodes(name) {
  const b = getButtons().find((x) => x.name === name);
  if (b && Array.isArray(b.nodes) && b.nodes.length >= 2) return [b.nodes[0], b.nodes[1]];
  return null;
}

/**
 * 记录一个节点。返回 { status }：
 * - 'started'   已记录开始节点（新建会话）
 * - 'ended'     已记录结束节点（闭合会话，附带 durationMs）
 * - 'dupStart'  已有进行中会话又点开始（附 open）
 * - 'noOpen'    无进行中会话却点结束（应报错）
 * - 'invalid'   事件无节点定义 / 节点非法
 */
export function recordNode({ name, color, node, ts }) {
  const nodes = getEventNodes(name);
  if (!nodes) return { status: 'invalid' };
  ts = ts || Date.now();
  const [startNode, endNode] = nodes;
  const recs = queryEvents({ name });
  const open = findOpenSession(recs, startNode, endNode);

  if (node === startNode) {
    if (open) return { status: 'dupStart', open };
    const sessionId = uid();
    appendEvent({ name, color, node, sessionId, ts });
    return { status: 'started', sessionId };
  }
  if (node === endNode) {
    if (!open) return { status: 'noOpen' };
    appendEvent({ name, color, node, sessionId: open.sessionId, ts });
    return { status: 'ended', sessionId: open.sessionId, durationMs: ts - open.start.ts };
  }
  return { status: 'invalid' };
}

/**
 * 查询某事件进行中的会话；无则 null。
 */
export function getOpenSession(name) {
  const nodes = getEventNodes(name);
  if (!nodes) return null;
  return findOpenSession(queryEvents({ name }), nodes[0], nodes[1]);
}

/**
 * 作废某事件进行中的会话：把该会话的开始节点记录降级为瞬时记录
 * （node/sessionId 置空，保留"发生过"但不计入时长）。
 */
export function abortOpenSession(name) {
  const open = getOpenSession(name);
  if (!open) return false;
  listYearKeys().forEach((key) => {
    const arr = get(key, []);
    const next = arr.map((e) => {
      if (e.id === open.start.id) return Object.assign({}, e, { node: null, sessionId: null });
      return e;
    });
    set(key, next);
  });
  return true;
}

/**
 * 某事件的会话列表（按开始时间倒序），供历史/统计使用。
 */
export function querySessions(name) {
  const nodes = getEventNodes(name);
  if (!nodes) return [];
  return sessionize(queryEvents({ name }), nodes[0], nodes[1]);
}

/**
 * 重命名事件中的节点：把历史记录里该事件的 node 名称同步迁移。
 * 返回受影响记录数。
 */
export function renameNode(eventName, oldNode, newNode) {
  if (!oldNode || !newNode || oldNode === newNode) return 0;
  let moved = 0;
  listYearKeys().forEach((key) => {
    const arr = get(key, []);
    let changed = false;
    arr.forEach((e) => {
      if (e.name === eventName && e.node === oldNode) {
        e.node = newNode;
        changed = true;
        moved++;
      }
    });
    if (changed) set(key, arr);
  });
  return moved;
}

/**
 * 删除某会话的全部记录。返回删除条数。
 */
export function removeSession(sessionId) {
  if (!sessionId) return 0;
  let removed = 0;
  listYearKeys().forEach((key) => {
    const arr = get(key, []);
    const next = arr.filter((e) => e.sessionId !== sessionId);
    if (next.length !== arr.length) {
      set(key, next);
      removed += arr.length - next.length;
    }
  });
  return removed;
}

// ---------------- migrate ----------------

/**
 * 清理历史重复记录：按内容签名去重（保留第一条），返回移除条数。
 */
function dedupEvents() {
  let removed = 0;
  listYearKeys().forEach((key) => {
    const arr = get(key, []);
    const seen = new Set();
    const next = [];
    arr.forEach((e) => {
      const sig = eventSig(e);
      if (seen.has(sig)) { removed++; return; }
      seen.add(sig);
      next.push(e);
    });
    if (next.length !== arr.length) set(key, next);
  });
  return removed;
}

export function migrate() {
  const meta = getMeta();
  let ver = meta.version || 1;
  // v2：清理历史重复记录（按内容签名去重）
  if (ver < 2) {
    dedupEvents();
    ver = 2;
  }
  saveMeta({ version: ver });
}