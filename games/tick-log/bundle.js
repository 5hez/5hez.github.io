
(function () {
  var modules = {};
  var cache = {};
  function __define(id, fn) { modules[id] = fn; }
  function __resolve(from, path) {
    if (path.charCodeAt(0) !== 46) return path; // 非 . 开头
    var base = from.split('/').slice(0, -1);
    var parts = base.concat(path.split('/'));
    var out = [];
    parts.forEach(function (seg) {
      if (seg === '' || seg === '.') return;
      if (seg === '..') out.pop();
      else out.push(seg);
    });
    return out.join('/');
  }
  function __require(from, id) {
    var key = __resolve(from, id);
    if (cache[key]) return cache[key].exports;
    if (!modules[key]) throw new Error('module not found: ' + key);
    var mod = { exports: {} };
    cache[key] = mod;
    modules[key](mod, mod.exports, function (p) { return __require(key, p); });
    return mod.exports;
  }
__define('core/stats.js', function (module, exports, require) {


const DAY_MS = 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
const MIN_MS = 60 * 1000;

/**
 * 本地时区的当天 0 点时间戳（毫秒）。
 */
function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 总次数。
 */
function totalCount(records) {
  return records ? records.length : 0;
}

/**
 * 日均次数 = count / days。
 */
function dailyAvg(count, days) {
  if (!count || !days) return 0;
  return count / days;
}

/**
 * 相对时间文本："刚刚" / "3小时前" / "2天前"。
 */
function formatRelative(ms) {
  if (ms < 0) return '刚刚';
  if (ms < MIN_MS) return '刚刚';
  if (ms < DAY_MS) return Math.round(ms / HOUR_MS) + '小时前';
  return Math.max(1, Math.floor(ms / DAY_MS)) + '天前';
}

/**
 * 最近一次记录：{ ms, text }。records 为空返回 null。
 * now 由调用方注入，保证可测。
 */
function lastOccurrence(records, now) {
  if (!records || !records.length) return null;
  now = now == null ? Date.now() : now;
  let latest = records[0];
  for (let i = 1; i < records.length; i++) {
    if (records[i].ts > latest.ts) latest = records[i];
  }
  return { ms: latest.ts, text: formatRelative(now - latest.ts) };
}

/**
 * 按时间范围聚合每日/每月次数。
 * range: 'week' | 'month' | 'year'，一律从本地时区当天 0 点归桶。
 * 周 = 本周一 ~ 周日（周一为起点，注意 getDay() 返回 0=周日需换算）。
 * 返回 { axisLabels, counts, totalDays, bucketTs }。
 */
function computeRange(records, range, now) {
  now = now == null ? Date.now() : now;
  const today = startOfDay(now);
  const labels = [];
  const bucketTs = [];
  let totalDays = 0;

  if (range === 'week') {
    const dow = new Date(now).getDay(); // 0 = 周日
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = today + mondayOffset * DAY_MS;
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    for (let i = 0; i < 7; i++) {
      labels.push('周' + names[i]);
      bucketTs.push(monday + i * DAY_MS);
    }
    totalDays = 7;
  } else if (range === 'month') {
    const d = new Date(now);
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= dim; i++) {
      labels.push(String(i));
      bucketTs.push(new Date(d.getFullYear(), d.getMonth(), i).getTime());
    }
    totalDays = dim;
  } else {
    const y = new Date(now).getFullYear();
    for (let m = 0; m < 12; m++) {
      labels.push((m + 1) + '月');
      bucketTs.push(new Date(y, m, 1).getTime());
    }
    totalDays = Math.round(
      (new Date(y + 1, 0, 1).getTime() - new Date(y, 0, 1).getTime()) / DAY_MS
    );
  }

  const counts = bucketTs.map(() => 0);
  const indexOf = new Map(bucketTs.map((t, i) => [t, i]));
  (records || []).forEach((r) => {
    const d = new Date(r.ts);
    // 月/年视图的桶是每月1号，需按"月"归键；周/日视图按当天 0 点归键
    const key = range === 'year'
      ? new Date(d.getFullYear(), d.getMonth(), 1).getTime()
      : startOfDay(r.ts);
    const idx = indexOf.get(key);
    if (idx != null) counts[idx]++;
  });

  return { axisLabels: labels, counts, totalDays, bucketTs };
}

/**
 * 按事件分组的多序列聚合（堆叠柱状图数据）。
 * events: [{ name, color, records }]
 * 返回 { axisLabels, bucketTs, totalDays, series: [{ name, color, counts }] }
 */
function computeSeries(events, range, now) {
  const base = computeRange([], range, now);
  const series = (events || []).map((ev) => ({
    name: ev.name,
    color: ev.color,
    counts: base.bucketTs.map(() => 0)
  }));
  const indexOf = new Map(base.bucketTs.map((t, i) => [t, i]));
  (events || []).forEach((ev, ei) => {
    (ev.records || []).forEach((r) => {
      const d = new Date(r.ts);
      const key = range === 'year'
        ? new Date(d.getFullYear(), d.getMonth(), 1).getTime()
        : startOfDay(r.ts);
      const idx = indexOf.get(key);
      if (idx != null) series[ei].counts[idx]++;
    });
  });
  return { axisLabels: base.axisLabels, bucketTs: base.bucketTs, totalDays: base.totalDays, series };
}
module.exports = { startOfDay, totalCount, dailyAvg, formatRelative, lastOccurrence, computeRange, computeSeries };

});
__define('core/interval.js', function (module, exports, require) {


const MIN_MS = 60 * 1000;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * "23:00" -> 分钟数(1380)。非法输入视为 0。
 */
function toMin(hhmm) {
  if (!hhmm) return 0;
  const p = String(hhmm).split(':');
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}

/**
 * 时间戳对应的本地时钟分钟数（0~1439）。
 */
function localClockMin(ts) {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * ts 是否落在夜间窗口 [nightStart, nightEnd)。
 * 支持跨天窗口：nightStart=23:00, nightEnd=07:00。
 * start == end 视为窗口关闭，恒返回 false。
 */
function isNightly(ts, nightStart, nightEnd) {
  const s = toMin(nightStart);
  const e = toMin(nightEnd);
  if (s === e) return false;
  const c = localClockMin(ts);
  return s < e ? c >= s && c < e : c >= s || c < e;
}

/**
 * 数字美化：整数不带小点，非整数保留 1 位小数。
 */
function beautify(n) {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
}

/**
 * 间隔文本："刚刚" / "20分钟" / "2.5小时" / "1.2天"。
 */
function formatGap(ms) {
  if (ms < MIN_MS) return '刚刚';
  if (ms < HOUR_MS) return beautify(ms / MIN_MS) + '分钟';
  if (ms < DAY_MS) return beautify(ms / HOUR_MS) + '小时';
  return beautify(ms / DAY_MS) + '天';
}

/**
 * 平均间隔：对升序时间戳相邻两两求差后取平均。
 * ignoreNight=true 时跳过"出发点落在夜间窗口内"的间隔（口径见产品文档）。
 * records 不足 2 条返回 null。
 * 返回 { ms, text }。
 */
function avgInterval(records, opts) {
  if (!records || records.length < 2) return null;
  opts = opts || {};
  const ignoreNight = !!opts.ignoreNight;
  const sorted = baseSorted(records);
  let sum = 0;
  let n = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (ignoreNight && isNightly(sorted[i - 1].ts, opts.nightStart, opts.nightEnd)) {
      continue;
    }
    sum += sorted[i].ts - sorted[i - 1].ts;
    n++;
  }
  if (!n) return null;
  const avg = sum / n;
  return { ms: avg, text: formatGap(avg) };
}

/**
 * 最近 limit（默认10）次间隔明细：{ fromTs, toTs, gapMs, text }。
 */
function intervalDistribution(records, opts, limit) {
  if (!records || records.length < 2) return [];
  opts = opts || {};
  if (!limit) limit = 10;
  const ignoreNight = !!opts.ignoreNight;
  const sorted = baseSorted(records);
  const pairs = [];
  for (let i = 1; i < sorted.length; i++) {
    if (ignoreNight && isNightly(sorted[i - 1].ts, opts.nightStart, opts.nightEnd)) {
      continue;
    }
    pairs.push({ from: sorted[i - 1], to: sorted[i] });
  }
  return pairs.slice(pairs.length - limit).map((p) => {
    const gapMs = p.to.ts - p.from.ts;
    return { fromTs: p.from.ts, toTs: p.to.ts, gapMs, text: formatGap(gapMs) };
  });
}

function baseSorted(records) {
  return records.slice().sort((a, b) => a.ts - b.ts);
}
module.exports = { toMin, localClockMin, isNightly, beautify, formatGap, avgInterval, intervalDistribution };

});
__define('core/session.js', function (module, exports, require) {


var __m5838 = require('./stats.js');
var computeRange = __m5838.computeRange;
var startOfDay = __m5838.startOfDay;

/**
 * 过程事件（节点化）会话逻辑：纯函数，无存储依赖。
 * 事件定义 nodes = [开始节点, 结束节点]（MVP 仅 2 节点）。
 * 记录含 node 与 sessionId；瞬时事件 node/sessionId 为 null。
 */

/**
 * 查找某事件的"进行中"会话（单进行中会话约束：最多取最新一个）。
 * records 需为该事件全部记录；返回 { sessionId, start } 或 null。
 */
function findOpenSession(records, startNode, endNode) {
  if (!startNode || !endNode) return null;
  const bySid = new Map();
  (records || []).forEach((r) => {
    if (!r.sessionId) return;
    if (!bySid.has(r.sessionId)) bySid.set(r.sessionId, []);
    bySid.get(r.sessionId).push(r);
  });
  let open = null;
  bySid.forEach((list) => {
    const start = list.find((r) => r.node === startNode);
    const hasEnd = list.some((r) => r.node === endNode);
    if (start && !hasEnd) {
      if (!open || start.ts > open.start.ts) open = { sessionId: list[0].sessionId, start };
    }
  });
  return open;
}

/**
 * 将会话记录归组为会话列表。
 * 返回 [{ sessionId, name, start, end, durationMs, open }]，按开始时间倒序。
 * 瞬时记录（无 sessionId）不计入。
 */
function sessionize(records, startNode, endNode) {
  const bySid = new Map();
  (records || []).forEach((r) => {
    if (!r.sessionId) return;
    if (!bySid.has(r.sessionId)) bySid.set(r.sessionId, []);
    bySid.get(r.sessionId).push(r);
  });
  const out = [];
  bySid.forEach((list) => {
    const start = list.find((r) => r.node === startNode);
    const end = list.find((r) => r.node === endNode);
    const ref = start || end || list[0];
    out.push({
      sessionId: ref.sessionId,
      name: ref.name,
      start: start ? start.ts : null,
      end: end ? end.ts : null,
      durationMs: start && end ? end.ts - start.ts : null,
      open: !!(start && !end)
    });
  });
  out.sort((a, b) => (b.start || 0) - (a.start || 0));
  return out;
}

/**
 * 会话时长统计。
 * 返回 { count, avgMs, totalMs, maxMs, minMs }（无已完成会话时均为 0）。
 */
function durationStats(sessions) {
  const durs = (sessions || []).filter((s) => s.durationMs != null).map((s) => s.durationMs);
  if (!durs.length) return { count: 0, avgMs: 0, totalMs: 0, maxMs: 0, minMs: 0 };
  return {
    count: durs.length,
    avgMs: durs.reduce((a, b) => a + b, 0) / durs.length,
    totalMs: durs.reduce((a, b) => a + b, 0),
    maxMs: Math.max(...durs),
    minMs: Math.min(...durs)
  };
}

/**
 * 时长折线数据：按周期桶（以会话结束时间归桶），聚合各桶的会话次数/总时长/平均时长。
 * 仅统计已闭合会话；进行中的会话不计入。
 */
function durationSeries(sessions, range, anchor) {
  const base = computeRange([], range, anchor);
  const counts = base.bucketTs.map(() => 0);
  const sums = base.bucketTs.map(() => 0);
  const indexOf = new Map(base.bucketTs.map((t, i) => [t, i]));
  (sessions || []).forEach((s) => {
    if (s.durationMs == null || s.end == null) return;
    const d = new Date(s.end);
    const key = range === 'year'
      ? new Date(d.getFullYear(), d.getMonth(), 1).getTime()
      : startOfDay(s.end);
    const idx = indexOf.get(key);
    if (idx == null) return;
    counts[idx]++;
    sums[idx] += s.durationMs;
  });
  const avgs = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  return {
    axisLabels: base.axisLabels,
    bucketTs: base.bucketTs,
    totalDays: base.totalDays,
    counts,
    sums,
    avgs
  };
}
module.exports = { findOpenSession, sessionize, durationStats, durationSeries };

});
__define('utils/storage.js', function (module, exports, require) {


/**
 * 浏览器 localStorage 读写封装：自动 JSON 序列化，失败时返回默认值。
 * 单 key 容量理论 5MB（各浏览器实现略有差异），events 按年分片存放。
 */

function get(key, dft) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? dft : JSON.parse(v);
  } catch (e) {
    return dft;
  }
}

function set(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function remove(key) {
  localStorage.removeItem(key);
}

function keys() {
  try {
    return Object.keys(localStorage);
  } catch (e) {
    return [];
  }
}

/**
 * 估算 JSON 字节（UTF-16 近似，空实现兼容）。
 */
function estimateBytes(arr) {
  try {
    return (JSON.stringify(arr) || '').length * 2;
  } catch (e) {
    return 0;
  }
}
module.exports = { get, set, remove, keys, estimateBytes };

});
__define('utils/db.js', function (module, exports, require) {


var __m26056 = require('./storage.js');
var get = __m26056.get;
var set = __m26056.set;
var remove = __m26056.remove;
var keys = __m26056.keys;
var estimateBytes = __m26056.estimateBytes;
var __m71202 = require('../core/session.js');
var findOpenSession = __m71202.findOpenSession;
var sessionize = __m71202.sessionize;

const META_KEY = 'meta';
const BUTTONS_KEY = 'buttons';
const SETTINGS_KEY = 'settings';
const SYNC_KEY = 'gh_sync';
const EVT_PREFIX = 'events_';
const ONE_MB = 1024 * 1024;

function getSyncConfig() {
  return Object.assign({ token: '', repo: '', path: 'tick-log/data.json' }, get(SYNC_KEY, {}));
}

function saveSyncConfig(cfg) {
  set(SYNC_KEY, cfg);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function yearOf(ts) {
  return new Date(ts).getFullYear();
}

function evtKey(ts) {
  return EVT_PREFIX + yearOf(ts);
}

// ---------------- meta ----------------

function getMeta() {
  return get(META_KEY, { version: 1 });
}

function saveMeta(meta) {
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

function getButtons() {
  const b = get(BUTTONS_KEY, null);
  if (b && b.length) {
    return b.slice().sort((x, y) => x.sort - y.sort).map(migrateButtonIcon);
  }
  return DEFAULT_BUTTONS.slice();
}

function saveButtons(list) {
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

function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, get(SETTINGS_KEY, {}));
}

function saveSettings(s) {
  set(SETTINGS_KEY, Object.assign({}, DEFAULT_SETTINGS, s));
}

// ---------------- events ----------------

/**
 * 新增一条记录，按年份分片存储，倒序（unshift）插入。
 */
function appendEvent(evt) {
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

function removeEvent(id) {
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

function clearAllEvents() {
  listYearKeys().forEach((key) => remove(key));
}

/**
 * 事件改名：把历史记录中旧名称统一迁移到新名称（顺带更新颜色）。
 * 返回受影响的历史记录条数。用于"改按钮名 = 之前的记录也补到新名下来"。
 */
function renameEventName(oldName, newName, color) {
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
function countByName(name) {
  return queryEvents({ name }).length;
}

/**
 * 批量导入记录（去重合并）：按 id 判重，已存在则跳过。
 * 记录按年份分片写入，写入前与各年已有记录合并并按时间倒序。
 * 返回 { added, skipped }。
 */
function importEvents(list) {
  const existingIds = new Set(queryEvents({}).map((e) => e.id));
  const perYear = new Map();
  let added = 0;
  let skipped = 0;

  (list || []).forEach((e) => {
    if (!e || typeof e.ts !== 'number' || !e.name) { skipped++; return; }
    const id = e.id || uid();
    if (existingIds.has(id)) { skipped++; return; }
    existingIds.add(id);
    const rec = {
      id,
      name: String(e.name),
      color: e.color || '#4cb6ac',
      ts: e.ts,
      node: e.node || null,
      sessionId: e.sessionId || null
    };
    const key = evtKey(rec.ts);
    if (!perYear.has(key)) perYear.set(key, []);
    perYear.get(key).push(rec);
    added++;
  });

  perYear.forEach((imports, key) => {
    const cur = get(key, []);
    const byId = new Map(cur.map((x) => [x.id, x]));
    imports.forEach((r) => { if (!byId.has(r.id)) byId.set(r.id, r); });
    const merged = Array.from(byId.values()).sort((a, b) => b.ts - a.ts);
    set(key, merged);
  });

  return { added, skipped };
}

/**
 * 批量导入快捷按钮：按名称合并——同名按钮用导入的样式覆盖（保留原 id），
 * 新名称追加到末尾。导入后保证至少有一个启用按钮。
 * 返回 { added, updated }。
 */
function importButtons(list) {
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

function listYearKeys() {
  return keys().filter((k) => k.indexOf(EVT_PREFIX) === 0);
}

/**
 * 查询记录：可叠加 name / fromTs / toTs 过滤，只读相关年份 key。
 */
function queryEvents(opts) {
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
function getEventNodes(name) {
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
function recordNode({ name, color, node, ts }) {
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
function getOpenSession(name) {
  const nodes = getEventNodes(name);
  if (!nodes) return null;
  return findOpenSession(queryEvents({ name }), nodes[0], nodes[1]);
}

/**
 * 作废某事件进行中的会话：把该会话的开始节点记录降级为瞬时记录
 * （node/sessionId 置空，保留"发生过"但不计入时长）。
 */
function abortOpenSession(name) {
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
function querySessions(name) {
  const nodes = getEventNodes(name);
  if (!nodes) return [];
  return sessionize(queryEvents({ name }), nodes[0], nodes[1]);
}

/**
 * 重命名事件中的节点：把历史记录里该事件的 node 名称同步迁移。
 * 返回受影响记录数。
 */
function renameNode(eventName, oldNode, newNode) {
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
function removeSession(sessionId) {
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

function migrate() {
  const meta = getMeta();
  // 预留版本升级钩子：按 meta.version 逐级迁移
  let ver = meta.version || 1;
  if (ver < 1) { /* 未来迁移逻辑写这里 */ }
  saveMeta({ version: 1 });
}
module.exports = { getSyncConfig, saveSyncConfig, uid, yearOf, evtKey, getMeta, saveMeta, getButtons, saveButtons, getSettings, saveSettings, appendEvent, removeEvent, clearAllEvents, renameEventName, countByName, importEvents, importButtons, listYearKeys, queryEvents, getEventNodes, recordNode, getOpenSession, abortOpenSession, querySessions, renameNode, removeSession, migrate };

});
__define('utils/time.js', function (module, exports, require) {


function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatHM(ts) {
  const d = new Date(ts);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatMD(ts) {
  const d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function formatFull(ts) {
  return formatMD(ts) + ' ' + formatHM(ts);
}

/** 时长文本：<1分钟"刚刚"；<1小时"X分钟"；<24小时"X小时Y分"；否则"X天Y小时"。 */
function formatGapText(ms) {
  if (ms == null) return '';
  if (ms < 60000) return '刚刚';
  const s = Math.round(ms / 1000);
  if (s < 3600) return Math.floor(s / 60) + '分钟';
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? h + '小时' + m + '分' : h + '小时';
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return h ? d + '天' + h + '小时' : d + '天';
}
module.exports = { pad, formatHM, formatMD, formatFull, formatGapText };

});
__define('utils/canvasChart.js', function (module, exports, require) {


const PAD_L = 6;
const PAD_R = 6;

/**
 * Canvas 2D 手绘柱状图，坐标使用 CSS 像素。
 * 支持两种输入：
 * - 单序列：opts.counts + opts.color
 * - 多序列堆叠：opts.series = [{ name?, color, counts: number[] }]（同一天各事件分段着色）
 * opts: { width, height, labels, counts, color, series, tickEvery }
 */
function drawBarChart(ctx, opts) {
  const {
    width, height, labels, counts, series, color,
    tickEvery = 1
  } = opts || {};
  const padT = 24;
  const padB = 26;

  const stacked = !counts && series && series.length;
  const n = counts ? counts.length : (stacked && series[0].counts ? series[0].counts.length : 0);
  if (!n) return;

  const totals = counts
    ? counts.slice()
    : series[0].counts.map((_, i) => series.reduce((s, se) => s + (se.counts[i] || 0), 0));

  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const plotH = Math.max(10, height - padT - padB);
  const max = Math.max(1, ...totals);

  ctx.clearRect(0, 0, width, height);

  // 网格线 + y 轴刻度（4 档）
  ctx.font = '10px sans-serif';
  ctx.strokeStyle = '#ececec';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const ratio = g / 3;
    const baseline = padT + plotH;
    const y = baseline - plotH * ratio;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y + 8);
    ctx.lineTo(PAD_L + plotW, y + 8);
    ctx.stroke();
    ctx.fillStyle = '#b0b0b0';
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.round(max * ratio)), PAD_L, y + 12);
  }

  const colW = plotW / n;
  const barW = Math.max(3, Math.min(colW * 0.6, 26));
  const baseline = padT + plotH;

  const stackSeries = stacked
    ? series
    : [{ color: color || '#4cb6ac', counts: counts || [] }];

  for (let i = 0; i < n; i++) {
    const x = PAD_L + i * colW + (colW - barW) / 2;
    const total = totals[i] || 0;

    if (total > 0) {
      // 从基线向上堆叠各事件段
      let offset = 0;
      stackSeries.forEach((se) => {
        const c = (se.counts && se.counts[i]) || 0;
        if (c <= 0) return;
        const segH = (c / max) * plotH;
        const y = baseline - offset - segH;
        ctx.fillStyle = se.color;
        ctx.beginPath();
        ctx.rect(x, y, barW, segH);
        ctx.fill();
        offset += segH;
      });
      // 柱顶总数
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.fillText(String(total), x + barW / 2, baseline - offset - 4);
    }

    // x 轴标签抽稀
    const label = labels && labels[i];
    if (label && i % tickEvery === 0) {
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.fillText(label, PAD_L + i * colW + colW / 2, baseline + 12);
    }
  }
}

/**
 * 按点击 x（CSS 像素）反查柱索引；未命中返回 -1。
 */
function indexAtX(x, width, count) {
  const plotW = Math.max(10, width - PAD_L - PAD_R);
  if (x < PAD_L || x > PAD_L + plotW || !count) return -1;
  return Math.min(count - 1, Math.floor((x - PAD_L) / (plotW / count)));
}

function fmtHours(h) {
  if (h < 0.1) return String(Math.round(h * 60)) + 'm';
  return (Math.round(h * 10) / 10) + 'h';
}

/**
 * Canvas 2D 手绘折线图（用于过程事件"持续时长"）。
 * values 为每个桶的数值（小时）；avgLine 为平均参考线（小时）。
 */
function drawLineChart(ctx, opts) {
  const { width, height, labels, values, color = '#2b2b2b', tickEvery = 1, avgLine = 0 } = opts || {};
  const padT = 24;
  const padB = 26;
  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const plotH = Math.max(10, height - padT - padB);
  const n = values ? values.length : 0;
  if (!n) return;
  const max = Math.max(0.5, ...values, avgLine);

  ctx.clearRect(0, 0, width, height);
  ctx.font = '10px sans-serif';

  // 网格 + y 轴刻度
  ctx.strokeStyle = '#ececec';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const ratio = g / 3;
    const y = padT + plotH - plotH * ratio;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y + 8);
    ctx.lineTo(PAD_L + plotW, y + 8);
    ctx.stroke();
    ctx.fillStyle = '#b0b0b0';
    ctx.textAlign = 'left';
    ctx.fillText(fmtHours(max * ratio), PAD_L, y + 12);
  }

  const colW = plotW / n;
  const baseline = padT + plotH;
  const xAt = (i) => PAD_L + i * colW + colW / 2;
  const yAt = (v) => baseline - (v / max) * plotH;

  // 平均参考虚线
  if (avgLine > 0) {
    ctx.strokeStyle = '#c5c8cb';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD_L, yAt(avgLine));
    ctx.lineTo(PAD_L + plotW, yAt(avgLine));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#999';
    ctx.textAlign = 'left';
    ctx.fillText('平均', PAD_L + 2, yAt(avgLine) - 4);
  }

  // 折线
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 数据点 + 数值
  values.forEach((v, i) => {
    if (v <= 0) return;
    const x = xAt(i);
    const y = yAt(v);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText(fmtHours(v), x, y - 6);
  });

  // x 轴标签抽稀
  if (labels) {
    labels.forEach((l, i) => {
      if (l && i % tickEvery === 0) {
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.fillText(l, xAt(i), baseline + 12);
      }
    });
  }
}

const CHART_PAD_L = PAD_L;
const CHART_PAD_R = PAD_R;
module.exports = { drawBarChart, indexAtX, drawLineChart, CHART_PAD_L, CHART_PAD_R };

});
__define('utils/exporter.js', function (module, exports, require) {


function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function toCSV(records) {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [
    ['时间', '事件名称', '时间戳']
  ];
  records.forEach((r) => {
    const d = new Date(r.ts);
    const t = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    // 时间/名称转义（名称可能含逗号引号）；"="前缀防止 Excel 把长整数时间戳显示为科学计数法
    rows.push([esc(t), esc(r.name), '="' + r.ts + '"']);
  });
  return rows.map((row) => row.join(',')).join('\r\n');
}

function toJSON(records) {
  return JSON.stringify(records, null, 2);
}

function toButtonsJSON(buttons) {
  return JSON.stringify({ buttons }, null, 2);
}

/**
 * 统一备份格式（与 GitHub 云同步同一结构）：记录 + 快捷按钮合并为一个文件。
 */
function toBackupJSON(events, buttons) {
  return JSON.stringify({ app: 'tick-log', version: 1, exportedAt: Date.now(), events, buttons });
}

/**
 * 触发浏览器下载导出（Blob + a[download]）。
 */
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadCSV(records, filename) {
  download(new Blob(['\ufeff' + toCSV(records)], { type: 'text/csv;charset=utf-8' }), filename || 'tick-log.csv');
}

function downloadJSON(records, filename) {
  download(new Blob([toJSON(records)], { type: 'application/json' }), filename || 'tick-log.json');
}

function downloadButtonsJSON(buttons, filename) {
  download(new Blob([toButtonsJSON(buttons)], { type: 'application/json' }), filename || 'tick-log-buttons.json');
}

function downloadBackupJSON(events, buttons, filename) {
  download(new Blob([toBackupJSON(events, buttons)], { type: 'application/json' }), filename || 'tick-log-all.json');
}

module.exports = { pad, toCSV, toJSON, toButtonsJSON, toBackupJSON, downloadCSV, downloadJSON, downloadButtonsJSON, downloadBackupJSON };

});
__define('utils/icons.js', function (module, exports, require) {


/**
 * 内置 lucide 图标目录（MIT，https://lucide.dev）。
 * 快捷按钮的 icon 字段存图标名；旧数据仍是 emoji/字符时，iconSvg 回退原样输出。
 */

const ICON_CATALOG = {
  "droplet": { label: "水滴", body: "<path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z\" />" },
  "glass-water": { label: "喝水", body: "<path d=\"M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z\" />\n  <path d=\"M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0\" />" },
  "coffee": { label: "咖啡", body: "<path d=\"M10 2v2\" />\n  <path d=\"M14 2v2\" />\n  <path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\" />\n  <path d=\"M6 2v2\" />" },
  "utensils": { label: "吃饭", body: "<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\" />\n  <path d=\"M7 2v20\" />\n  <path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\" />" },
  "apple": { label: "水果", body: "<path d=\"M12 6.528V3a1 1 0 0 1 1-1h0\" />\n  <path d=\"M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21\" />" },
  "pill": { label: "吃药", body: "<path d=\"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z\" />\n  <path d=\"m8.5 8.5 7 7\" />" },
  "tablets": { label: "药片", body: "<circle cx=\"7\" cy=\"7\" r=\"5\" />\n  <circle cx=\"17\" cy=\"17\" r=\"5\" />\n  <path d=\"M12 17h10\" />\n  <path d=\"m3.46 10.54 7.08-7.08\" />" },
  "thermometer": { label: "体温", body: "<path d=\"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z\" />" },
  "heart-pulse": { label: "心率", body: "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />\n  <path d=\"M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27\" />" },
  "stethoscope": { label: "看病", body: "<path d=\"M11 2v2\" />\n  <path d=\"M5 2v2\" />\n  <path d=\"M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1\" />\n  <path d=\"M8 15a6 6 0 0 0 12 0v-3\" />\n  <circle cx=\"20\" cy=\"10\" r=\"2\" />" },
  "toilet": { label: "上厕所", body: "<path d=\"M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18\" />\n  <path d=\"M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8\" />" },
  "shower-head": { label: "洗澡", body: "<path d=\"m4 4 2.5 2.5\" />\n  <path d=\"M13.5 6.5a4.95 4.95 0 0 0-7 7\" />\n  <path d=\"M15 5 5 15\" />\n  <path d=\"M14 17v.01\" />\n  <path d=\"M10 16v.01\" />\n  <path d=\"M13 13v.01\" />\n  <path d=\"M16 10v.01\" />\n  <path d=\"M11 20v.01\" />\n  <path d=\"M17 14v.01\" />\n  <path d=\"M20 11v.01\" />" },
  "bath": { label: "泡澡", body: "<path d=\"M10 4 8 6\" />\n  <path d=\"M17 19v2\" />\n  <path d=\"M2 12h20\" />\n  <path d=\"M7 19v2\" />\n  <path d=\"M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5\" />" },
  "moon": { label: "睡觉", body: "<path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\" />" },
  "bed-double": { label: "睡觉", body: "<path d=\"M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8\" />\n  <path d=\"M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4\" />\n  <path d=\"M12 4v6\" />\n  <path d=\"M2 18h20\" />" },
  "face-angry": { label: "生气", body: "<path d=\"M15 12v-1.584\" />\n  <path d=\"M17 10a5 5 0 00-3 1\" />\n  <path d=\"M7 10a5 5 0 013 1\" />\n  <path d=\"M9 12v-1.584\" />\n  <path d=\"M9 17a5 5 0 016.001 0\" />\n  <circle cx=\"12\" cy=\"12\" r=\"10\" />" },
  "face-slightly-smiling": { label: "开心", body: "<path d=\"M15 10V9\" />\n  <path d=\"M16.472 15a6 6 0 01-8.943 0\" />\n  <path d=\"M9 10V9\" />\n  <circle cx=\"12\" cy=\"12\" r=\"10\" />" },
  "heart": { label: "爱", body: "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />" },
  "party-popper": { label: "庆祝", body: "<path d=\"M5.8 11.3 2 22l10.7-3.79\" />\n  <path d=\"M4 3h.01\" />\n  <path d=\"M22 8h.01\" />\n  <path d=\"M15 2h.01\" />\n  <path d=\"M22 20h.01\" />\n  <path d=\"m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10\" />\n  <path d=\"m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17\" />\n  <path d=\"m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7\" />\n  <path d=\"M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z\" />" },
  "bus": { label: "公交", body: "<path d=\"M8 6v6\" />\n  <path d=\"M15 6v6\" />\n  <path d=\"M2 12h19.6\" />\n  <path d=\"M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3\" />\n  <circle cx=\"7\" cy=\"18\" r=\"2\" />\n  <path d=\"M9 18h5\" />\n  <circle cx=\"16\" cy=\"18\" r=\"2\" />" },
  "car": { label: "开车", body: "<path d=\"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2\" />\n  <circle cx=\"7\" cy=\"17\" r=\"2\" />\n  <path d=\"M9 17h6\" />\n  <circle cx=\"17\" cy=\"17\" r=\"2\" />" },
  "train-front": { label: "地铁", body: "<path d=\"M8 3.1V7a4 4 0 0 0 8 0V3.1\" />\n  <path d=\"m9 15-1-1\" />\n  <path d=\"m15 15 1-1\" />\n  <path d=\"M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z\" />\n  <path d=\"m8 19-2 3\" />\n  <path d=\"m16 19 2 3\" />" },
  "bike": { label: "骑车", body: "<circle cx=\"18.5\" cy=\"17.5\" r=\"3.5\" />\n  <circle cx=\"5.5\" cy=\"17.5\" r=\"3.5\" />\n  <circle cx=\"15\" cy=\"5\" r=\"1\" />\n  <path d=\"M12 17.5V14l-3-3 4-3 2 3h2\" />" },
  "footprints": { label: "走路", body: "<path d=\"M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z\" />\n  <path d=\"M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z\" />\n  <path d=\"M16 17h4\" />\n  <path d=\"M4 13h4\" />" },
  "dumbbell": { label: "健身", body: "<path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\" />\n  <path d=\"m2.5 21.5 1.4-1.4\" />\n  <path d=\"m20.1 3.9 1.4-1.4\" />\n  <path d=\"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z\" />\n  <path d=\"m9.6 14.4 4.8-4.8\" />" },
  "activity": { label: "运动", body: "<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\" />" },
  "lightbulb": { label: "灵感", body: "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\" />\n  <path d=\"M9 18h6\" />\n  <path d=\"M10 22h4\" />" },
  "sparkles": { label: "灵感", body: "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" />\n  <path d=\"M20 2v4\" />\n  <path d=\"M22 4h-4\" />\n  <circle cx=\"4\" cy=\"20\" r=\"2\" />" },
  "music": { label: "音乐", body: "<path d=\"M9 18V5l12-2v13\" />\n  <circle cx=\"6\" cy=\"18\" r=\"3\" />\n  <circle cx=\"18\" cy=\"16\" r=\"3\" />" },
  "shopping-cart": { label: "购物", body: "<path d=\"m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18\" />\n  <path d=\"M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25\" />\n  <circle cx=\"18\" cy=\"20\" r=\"2\" />\n  <circle cx=\"8\" cy=\"20\" r=\"2\" />" },
  "book-open": { label: "读书", body: "<path d=\"M12 5v16\" />\n  <path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\" />" },
  "briefcase": { label: "工作", body: "<path d=\"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\" />\n  <rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\" />" },
  "house": { label: "回家", body: "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" />\n  <path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />" },
  "baby": { label: "带娃", body: "<path d=\"M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5\" />\n  <path d=\"M15 12h.01\" />\n  <path d=\"M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1\" />\n  <path d=\"M9 12h.01\" />" },
  "sun": { label: "晴天", body: "<circle cx=\"12\" cy=\"12\" r=\"4\" />\n  <path d=\"M12 2v2\" />\n  <path d=\"M12 20v2\" />\n  <path d=\"m4.93 4.93 1.41 1.41\" />\n  <path d=\"m17.66 17.66 1.41 1.41\" />\n  <path d=\"M2 12h2\" />\n  <path d=\"M20 12h2\" />\n  <path d=\"m6.34 17.66-1.41 1.41\" />\n  <path d=\"m19.07 4.93-1.41 1.41\" />" },
  "cloud-rain": { label: "下雨", body: "<path d=\"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242\" />\n  <path d=\"M16 14v6\" />\n  <path d=\"M8 14v6\" />\n  <path d=\"M12 16v6\" />" },
  "snowflake": { label: "下雪", body: "<path d=\"m10 20-1.25-2.5L6 18\" />\n  <path d=\"M10 4 8.75 6.5 6 6\" />\n  <path d=\"m14 20 1.25-2.5L18 18\" />\n  <path d=\"m14 4 1.25 2.5L18 6\" />\n  <path d=\"m17 21-3-6h-4\" />\n  <path d=\"m17 3-3 6 1.5 3\" />\n  <path d=\"M2 12h6.5L10 9\" />\n  <path d=\"m20 10-1.5 2 1.5 2\" />\n  <path d=\"M22 12h-6.5L14 15\" />\n  <path d=\"m4 10 1.5 2L4 14\" />\n  <path d=\"m7 21 3-6-1.5-3\" />\n  <path d=\"m7 3 3 6h4\" />" },
  "clock": { label: "计时", body: "<circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M12 6v6l4 2\" />" },
  "smartphone": { label: "手机", body: "<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\" />\n  <path d=\"M12 18h.01\" />" }
};

/** 有序列表（图标选择器按此顺序展示）。 */
const ICON_LIST = [["droplet","水滴"],["glass-water","喝水"],["coffee","咖啡"],["utensils","吃饭"],["apple","水果"],["pill","吃药"],["tablets","药片"],["thermometer","体温"],["heart-pulse","心率"],["stethoscope","看病"],["toilet","上厕所"],["shower-head","洗澡"],["bath","泡澡"],["moon","睡觉"],["bed-double","睡觉"],["face-angry","生气"],["face-slightly-smiling","开心"],["heart","爱"],["party-popper","庆祝"],["bus","公交"],["car","开车"],["train-front","地铁"],["bike","骑车"],["footprints","走路"],["dumbbell","健身"],["activity","运动"],["lightbulb","灵感"],["sparkles","灵感"],["music","音乐"],["shopping-cart","购物"],["book-open","读书"],["briefcase","工作"],["house","回家"],["baby","带娃"],["sun","晴天"],["cloud-rain","下雨"],["snowflake","下雪"],["clock","计时"],["smartphone","手机"]];

/** 由图标名生成内联 SVG；未知名称回退为转义后的原文本（emoji/字符）。 */
function iconSvg(name) {
  const ic = ICON_CATALOG[name];
  if (!ic) return escapeHtml(String(name == null ? '' : name));
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ic.body + '</svg>';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { iconSvg, ICON_CATALOG, ICON_LIST };

});
__define('utils/import.js', function (module, exports, require) {


// 数据导入解析：JSON / CSV（与 exporter 导出的格式一一对应）

function parseJSONRecords(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : (Array.isArray(data.events) ? data.events : []);
  return list
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const name = String(e.name || '').trim();
      const ts = normalizeTs(e.ts);
      if (!name || ts == null) return null;
      return { id: e.id || null, name, color: e.color || '#4cb6ac', ts };
    })
    .filter(Boolean);
}

function parseCSVRecords(text) {
  const rows = parseCSVRows(String(text).replace(/^\uFEFF/, ''));
  if (!rows || !rows.length) return [];
  let idxTs = -1;
  let idxName = -1;
  rows[0].forEach((h, i) => {
    const s = String(h).trim().toLowerCase();
    if (s.includes('时间戳') || s === 'ts' || s === 'timestamp') idxTs = i;
    if (s.includes('事件名称') || s === 'name' || s === 'event') idxName = i;
  });
  // 表头行判定：第一行含"时间/事件/名称/time/name"等字样
  const hasHeader = rows[0].some((c) => /时间|事件|名称|time|\bts\b|name|event/i.test(String(c)));
  const body = hasHeader ? rows.slice(1) : rows;

  return body
    .map((row) => {
      // 时间戳列存在时优先；否则回退用首列日期时间
      const tsCell = (idxTs >= 0 && row.length > idxTs && row[idxTs] != null) ? row[idxTs] : row[0];
      const nameCell = (idxName >= 0 && row.length > idxName) ? row[idxName] : row[1];
      const name = String(nameCell == null ? '' : nameCell).trim();
      const ts = normalizeTs(tsCell);
      if (!name || ts == null) return null;
      return { id: null, name, color: '#4cb6ac', ts };
    })
    .filter(Boolean);
}

/**
 * 时间值归一为毫秒时间戳：
 * - 数字：>1e12 视为毫秒，否则视为秒
 * - 字符串：可能为 `="123"`（Excel 防科学计数法）、纯数字、或 "YYYY-MM-DD HH:mm:ss"
 */
function normalizeTs(v) {
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  let s = String(v == null ? '' : v).trim();
  s = s.replace(/^=/, '');               // 去掉 Excel 防科学计数法的前导 =
  s = s.replace(/^["]+|["]+$/g, '');     // 去掉外层引号
  s = s.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n > 1e12 ? n : n * 1000;
  }
  const t = new Date(s.replace(' ', 'T'));
  return isNaN(t.getTime()) ? null : t.getTime();
}

/** 简易 CSV 解析（支持引号包裹与 "" 转义），返回二维字符串数组。 */
function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      if (row.length !== 1 || row[0] !== '') rows.push(row);
      row = []; field = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** 解析快捷按钮备份：{ buttons: [...] } 或纯数组。 */
function parseButtonsJSON(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : (data.buttons && Array.isArray(data.buttons) ? data.buttons : []);
  return list
    .map((b) => {
      if (!b || !b.name) return null;
      const name = String(b.name).trim();
      if (!name) return null;
      return {
        id: b.id || null,
        name,
        icon: b.icon || '·',
        color: b.color || '#4cb6ac',
        enabled: b.enabled !== false,
        sort: typeof b.sort === 'number' ? b.sort : 0,
        nodes: Array.isArray(b.nodes) && b.nodes.length >= 2 ? b.nodes.slice() : []
      };
    })
    .filter(Boolean);
}

/** 解析统一备份：{ events, buttons }，复用记录/按钮各自的解析逻辑。 */
function parseBackupJSON(text) {
  return {
    events: parseJSONRecords(text),
    buttons: parseButtonsJSON(text)
  };
}
module.exports = { parseJSONRecords, parseCSVRecords, normalizeTs, parseCSVRows, parseButtonsJSON, parseBackupJSON };

});
__define('utils/ui.js', function (module, exports, require) {


// 极简 UI 辅助：toast / 确认框 / 输入框 / 动作面板 / 长按识别 / HTML 转义

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function toast(msg, duration = 1800) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), duration);
}

function confirmbox({ title, message = '', confirmText = '确认', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${esc(title)}</div>
        <div class="modal-msg">${esc(message)}</div>
        <div class="modal-btns">
          <button class="modal-btn" data-v="0">${esc(cancelText)}</button>
          <button class="modal-btn ${danger ? 'danger' : 'primary'}" data-v="1">${esc(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = (v) => { overlay.remove(); resolve(!!v); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return close(false);
      const b = e.target.closest('[data-v]');
      if (b) close(+b.dataset.v);
    });
  });
}

function promptbox({ title, placeholder = '', defaultValue = '' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${esc(title)}</div>
        <input class="modal-input" type="text" placeholder="${esc(placeholder)}" value="${esc(defaultValue)}">
        <div class="modal-btns">
          <button class="modal-btn" data-v="0">取消</button>
          <button class="modal-btn primary" data-v="1">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('input');
    const close = (v) => { overlay.remove(); resolve(v ? input.value.trim() : null); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return close(false);
      const b = e.target.closest('[data-v]');
      if (b) close(+b.dataset.v);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(true); });
    setTimeout(() => input.focus(), 60);
  });
}

function actionSheet(items) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-mask';
    overlay.innerHTML = `
      <div class="sheet">
        <div class="sheet-items">${items.map((it, i) => `<div class="sheet-item" data-i="${i}">${esc(it)}</div>`).join('')}</div>
        <div class="sheet-cancel">取消</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(null); return; }
      const it = e.target.closest('.sheet-item');
      if (it) { const v = items[+it.dataset.i]; overlay.remove(); resolve(v); return; }
      if (e.target.closest('.sheet-cancel')) overlay.remove(), resolve(null);
    });
  });
}

/**
 * 节点选择弹层（过程事件记录）：展示事件名 + 各节点 + 进行中状态。
 * items: [{ name }]，openLabel: 进行中的节点名（无则 null）。
 * 返回选中的节点名；取消返回 null。
 */
function nodeDialog({ title, items, openLabel }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-mask';
    const statusHtml = openLabel
      ? `<div class="node-status">⏳ 进行中 · 已记「${esc(openLabel)}」</div>`
      : '<div class="node-status node-status-idle">未开始，可选择开始节点</div>';
    overlay.innerHTML = `
      <div class="sheet">
        <div class="sheet-title">${esc(title)}</div>
        ${statusHtml}
        <div class="sheet-items">${items.map((it, i) => `
          <div class="sheet-item" data-i="${i}">${esc(it.name)}</div>`).join('')}
        </div>
        <div class="sheet-cancel">取消</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(null); return; }
      const it = e.target.closest('.sheet-item');
      if (it) { const v = items[+it.dataset.i]; overlay.remove(); resolve(v ? v.name : null); return; }
      if (e.target.closest('.sheet-cancel')) { overlay.remove(); resolve(null); }
    });
  });
}

/**
 * 长按识别：指针按下 450ms 未位移触发 onLong，位移 >12px 取消。
 * 触发时在 el._lpAt 记录时间，供 click 处理器判断是否应忽略（防双击）。
 */
function onLongPress(el, onLong) {
  let timer = null;
  let sx = 0; let sy = 0;
  const clear = () => { clearTimeout(timer); timer = null; };
  const fire = () => {
    clear();
    el._lpAt = Date.now();
    onLong();
  };
  el.addEventListener('pointerdown', (e) => {
    sx = e.clientX; sy = e.clientY;
    clear();
    timer = setTimeout(fire, 450);
  });
  el.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - sx) > 12 || Math.abs(e.clientY - sy) > 12) clear();
  });
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointerleave', clear);
  el.addEventListener('pointercancel', clear);
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clear();
    fire();
  });
}

/** 用于 click 处理器开头：刚刚发生过长按则返回 true（忽略本次点击）。 */
function wasLongPress(el) {
  return el._lpAt && Date.now() - el._lpAt < 500;
}

/**
 * 列表弹层：每条记录带删除按钮。
 * items: [{ label, ... }]，onDelete(item) 由调用方执行真正删除并刷新视图。
 */
function listDialog({ title, items, onDelete }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-mask';
  const rows = (items || []).map((it, i) => `
    <div class="list-row">
      <span class="list-label">${esc(it.label)}</span>
      <button class="list-del" data-i="${i}">删除</button>
    </div>`).join('');
  overlay.innerHTML = `
    <div class="modal modal-list">
      <div class="modal-title">${esc(title)}</div>
      <div class="modal-msg modal-list-body">${rows || '<div class="list-empty">无记录</div>'}</div>
      <div class="modal-btns"><button class="modal-btn" data-close="1">关闭</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) return close();
    const del = e.target.closest('.list-del');
    if (del) {
      const item = items[+del.dataset.i];
      if (item && onDelete) onDelete(item);
    }
  });
}
module.exports = { esc, toast, confirmbox, promptbox, actionSheet, nodeDialog, onLongPress, wasLongPress, listDialog };

});
__define('utils/sync.js', function (module, exports, require) {


var __m26382 = require('./exporter.js');
var toBackupJSON = __m26382.toBackupJSON;

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
async function fetchRemoteFile({ token, repo, path }) {
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
async function pushRemoteFile({ token, repo, path, message, content }) {
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
function buildSyncPayload(events, buttons) {
  return toBackupJSON(events, buttons);
}
module.exports = { fetchRemoteFile, pushRemoteFile, buildSyncPayload };

});
__define('views/home.js', function (module, exports, require) {


var __m7224 = require('../utils/db.js');
var getButtons = __m7224.getButtons;
var saveButtons = __m7224.saveButtons;
var appendEvent = __m7224.appendEvent;
var queryEvents = __m7224.queryEvents;
var removeEvent = __m7224.removeEvent;
var renameEventName = __m7224.renameEventName;
var getEventNodes = __m7224.getEventNodes;
var recordNode = __m7224.recordNode;
var getOpenSession = __m7224.getOpenSession;
var abortOpenSession = __m7224.abortOpenSession;
var __m70275 = require('../utils/time.js');
var formatFull = __m70275.formatFull;
var formatGapText = __m70275.formatGapText;
var formatHM = __m70275.formatHM;
var __m75936 = require('../core/stats.js');
var startOfDay = __m75936.startOfDay;
var __m18352 = require('../utils/ui.js');
var esc = __m18352.esc;
var toast = __m18352.toast;
var confirmbox = __m18352.confirmbox;
var promptbox = __m18352.promptbox;
var actionSheet = __m18352.actionSheet;
var nodeDialog = __m18352.nodeDialog;
var onLongPress = __m18352.onLongPress;
var wasLongPress = __m18352.wasLongPress;
var __m98880 = require('../utils/icons.js');
var iconSvg = __m98880.iconSvg;

let editing = false;

function render(container) {
  const buttons = getButtons().filter((b) => b.enabled);
  const allEvents = queryEvents({});
  const totalCount = allEvents.length;
  const entries = allEvents.slice(0, 5);
  const hasMore = totalCount > entries.length;

  container.innerHTML = `
    <div class="page">
      <div class="grid-toolbar">
        <span class="grid-tip">${editing ? '拖动排序 · 点 × 删除' : '长按按钮可编辑'}</span>
        <button class="edit-toggle" id="edit-toggle">${editing ? '完成' : '编辑'}</button>
      </div>
      <div class="grid ${editing ? 'editing' : ''}">
        ${buttons.map((b) => `
          <div class="cell" data-id="${b.id}" style="background:${b.color}">
            ${editing ? `<button class="cell-del" data-del="${b.id}" aria-label="删除">×</button>` : ''}
            <span class="cell-icon">${iconSvg(b.icon)}</span>
            <span class="cell-name">${esc(b.name)}</span>
          </div>`).join('')}
        <div class="cell cell-add" data-act="add">
          <span class="cell-icon">＋</span>
          <span class="cell-name">添加</span>
        </div>
      </div>

      <div class="card today-card" id="today-summary">
        <span class="today-ico">☀️</span>
        <span class="today-body">
          <span class="today-title">今日统计</span>
          <span class="today-sub" id="today-count">已记录 0 件小事</span>
        </span>
        <button class="today-link" id="today-detail">查看详情</button>
      </div>

      <h2 class="section-title section-title-row">
        <span>最近记录</span>
        <span class="section-meta" id="recent-count">显示 ${entries.length} 条</span>
      </h2>
      ${entries.length ? `
        <div class="list">
          ${entries.map((e) => `
            <div class="row" data-del="${e.id}">
              <span class="dot" style="background:${e.color}"></span>
              <span class="row-name">${esc(e.name)}</span>
              <span class="row-time">${formatFull(e.ts)}</span>
              <button class="row-del row-del-icon" data-id="${e.id}" aria-label="删除">🗑</button>
            </div>`).join('')}
        </div>
        ${hasMore ? `<a class="recent-more" href="#/history">查看全部 ${totalCount} 条 ›</a>` : ''}`
      : '<div class="empty-tip">暂无记录 · 点击上方按钮即可 1 秒记一件</div>'}
      <button class="fab" id="fab-add" aria-label="补录">＋</button>
    </div>`;

  const todayTs = startOfDay(Date.now());
  const todayCount = queryEvents({}).filter((e) => e.ts >= todayTs).length;
  const todayEl = container.querySelector('#today-count');
  if (todayEl) todayEl.textContent = '已记录 ' + todayCount + ' 件小事';
  container.querySelector('#today-detail').addEventListener('click', () => { location.hash = '#/stats'; });
  container.querySelector('#fab-add').addEventListener('click', async () => {
    const r = await backfillOne();
    if (r) {
      toast('已补录：' + r.name);
      render(container);
    }
  });

  // 编辑模式切换
  container.querySelector('#edit-toggle').addEventListener('click', () => {
    editing = !editing;
    render(container);
  });
  // 编辑模式：删除 + 拖拽排序
  if (editing) {
    container.querySelectorAll('.cell-del').forEach((btn) => btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const ok = await confirmbox({ title: '隐藏按钮', message: '将从首页隐藏该按钮（不删除记录），可在设置里重新显示。', confirmText: '隐藏' });
      if (ok) {
        const list = getButtons();
        const b = list.find((x) => x.id === btn.dataset.del);
        if (b) { b.enabled = false; saveButtons(list); }
        render(container);
      }
    }));
    enableDrag(container);
  }

  // 点击记录
  container.querySelector('.grid').addEventListener('click', async (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    if (cell.dataset.act === 'add') { location.hash = '#/settings'; return; }
    if (editing) return;
    if (wasLongPress(cell)) return;
    const btn = getButtons().find((b) => b.id === cell.dataset.id && b.enabled);
    if (!btn) return;
    const nodes = getEventNodes(btn.name);
    if (!nodes) {
      // 瞬时事件：现状，直接记录
      appendEvent({ name: btn.name, color: btn.color });
      toast('已记录：' + btn.name);
      render(container);
      return;
    }
    await handleNodeRecord(container, btn, nodes);
  });

  // 长按按钮 -> 编辑/删除（仅非编辑模式）
  if (!editing) container.querySelectorAll('.cell[data-id]').forEach((cell) => {
    onLongPress(cell, async () => {
      const btn = getButtons().find((b) => b.id === cell.dataset.id);
      if (!btn) return;
const act = await actionSheet(['编辑名称', '补录一笔', '删除按钮']);
  if (act === '编辑名称') {
    const name = await promptbox({ title: '重命名', placeholder: '输入新名称', defaultValue: btn.name });
    if (name && name !== btn.name) {
      const list = getButtons();
      if (list.some((x) => x.name === name && x.id !== btn.id)) { toast('名称已存在'); return; }
      const b = list.find((x) => x.id === btn.id);
      if (b) {
        const moved = renameEventName(b.name, name, b.color);
        b.name = name;
        saveButtons(list);
        toast(moved ? `已改名，同步 ${moved} 条记录` : '已改名');
        render(container);
      }
    }
  } else if (act === '补录一笔') {
    const r = await backfillOne({ defaultName: btn.name });
    if (r) {
      toast('已补录：' + r.name);
      render(container);
    }
  } else if (act === '删除按钮') {
        const ok = await confirmbox({ title: '删除按钮', message: '删除后按钮将从首页移除，历史记录保留。', danger: true });
        if (ok) {
          saveButtons(getButtons().filter((x) => x.id !== btn.id));
          render(container);
        }
      }
    });
  });

  // 列表每条记录右侧显式「删除」按钮
  container.querySelectorAll('.row-del').forEach((btn) => btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const ok = await confirmbox({ title: '删除记录', message: '确认删除这条记录？', danger: true });
    if (ok) {
      removeEvent(btn.dataset.id);
      toast('已删除');
      render(container);
    }
  }));

  // 长按记录 -> 删除
  container.querySelectorAll('.row[data-del]').forEach((row) => {
    onLongPress(row, async () => {
      if (wasLongPress(row)) return;
      const ok = await confirmbox({ title: '删除记录', message: '确认删除这条记录？', danger: true });
      if (ok) {
        removeEvent(row.dataset.del);
        toast('已删除');
        render(container);
      }
    });
  });
}

function enableDrag(container) {
  const grid = container.querySelector('.grid');
  let dragEl = null;

  grid.querySelectorAll('.cell[data-id]').forEach((cell) => {
    cell.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.cell-del')) return;
      dragEl = cell;
      cell.classList.add('dragging');
      try { cell.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });

    cell.addEventListener('pointermove', (e) => {
      if (dragEl !== cell) return;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell[data-id]');
      if (over && over !== cell) {
        const rect = over.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        grid.insertBefore(cell, after ? over.nextElementSibling : over);
      }
    });

    const end = (e) => {
      if (dragEl !== cell) return;
      dragEl = null;
      cell.classList.remove('dragging');
      try { cell.releasePointerCapture(e.pointerId); } catch {}
      persistOrder(grid);
    };
    cell.addEventListener('pointerup', end);
    cell.addEventListener('pointercancel', end);
  });
}

function persistOrder(grid) {
  const ids = [...grid.querySelectorAll('.cell[data-id]')].map((c) => c.dataset.id);
  const all = getButtons();
  const enabled = all.filter((b) => b.enabled);
  enabled.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const disabled = all.filter((b) => !b.enabled);
  saveButtons([...enabled, ...disabled]);
}

/**
 * 过程事件点击：弹出节点选择 -> 按会话规则记录（校验先开始后结束）。
 */
async function handleNodeRecord(container, btn, nodes) {
  const [startNode, endNode] = nodes;
  const open = getOpenSession(btn.name);
  const pick = await nodeDialog({
    title: btn.name,
    items: nodes.map((n) => ({ name: n })),
    openLabel: open ? open.start.node : null
  });
  if (!pick) return;

  if (pick === startNode) {
    if (open) {
      const ok = await confirmbox({
        title: '已有进行中的会话',
        message: `「${btn.name}」已记录「${open.start.node}」但尚未结束。作废该会话并开始新一轮？`,
        confirmText: '作废并新开',
        danger: true
      });
      if (!ok) return;
      abortOpenSession(btn.name);
    }
    const r = recordNode({ name: btn.name, color: btn.color, node: startNode });
    toast(r.status === 'started' ? '已记录：' + startNode : '记录失败');
  } else if (pick === endNode) {
    if (!open) {
      toast('请先记录「' + startNode + '」');
      return;
    }
    const r = recordNode({ name: btn.name, color: btn.color, node: endNode });
    if (r.status === 'ended') toast('已记录：' + endNode + ' · 持续' + formatGapText(r.durationMs));
    else toast('记录失败');
  }
  render(container);
}

/**
 * 补录弹层：选择事件名称（默认 defaultName）+ 节点（过程事件时）+ 日期 + 时间。
 * 返回 { name, node, ts }；取消返回 undefined。
 */
async function backfillOne({ defaultName } = {}) {
  const buttons = getButtons().filter((b) => b.enabled);
  const now = new Date();
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  const nowTime = pad(now.getHours()) + ':' + pad(now.getMinutes());
  const options = buttons.map((b) => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">补录记录</div>
        <div class="modal-msg modal-form">
          <label class="form-row">
            <span class="form-label">事件</span>
            <select id="bf-event" class="bf-select">${options}<option value="__custom__">＋ 自定义名称</option></select>
          </label>
          <div id="bf-custom-wrap" class="form-row hidden">
            <span class="form-label">名称</span>
            <input id="bf-custom" class="modal-input" type="text" placeholder="输入事件名称">
          </div>
          <div id="bf-node-wrap" class="form-row hidden">
            <span class="form-label">节点</span>
            <select id="bf-node" class="bf-select"></select>
          </div>
          <label class="form-row">
            <span class="form-label">日期</span>
            <input id="bf-date" class="time-input" type="date" value="${today}">
          </label>
          <label class="form-row">
            <span class="form-label">时间</span>
            <input id="bf-time" class="time-input" type="time" value="${nowTime}">
          </label>
        </div>
        <div class="modal-btns">
          <button class="modal-btn" data-cancel="1">取消</button>
          <button class="modal-btn primary" data-save="1">保存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const $ = (s) => overlay.querySelector(s);
    const refreshNode = () => {
      const sel = $('#bf-event').value;
      const nodes = getEventNodes(sel);
      const wrap = $('#bf-node-wrap');
      if (nodes) {
        $('#bf-node').innerHTML = nodes.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
        wrap.classList.remove('hidden');
      } else {
        wrap.classList.add('hidden');
      }
    };
    if (defaultName) {
      try { $('#bf-event').value = defaultName; } catch (e) { /* ignore */ }
    }
    refreshNode();
    $('#bf-event').addEventListener('change', () => {
      $('#bf-custom-wrap').classList.toggle('hidden', $('#bf-event').value !== '__custom__');
      refreshNode();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-cancel]')) { overlay.remove(); resolve(undefined); return; }
      if (e.target.closest('[data-save]')) {
        let name = $('#bf-event').value;
        if (name === '__custom__') name = $('#bf-custom').value.trim();
        const dVal = $('#bf-date').value;
        const tVal = $('#bf-time').value || '00:00';
        if (!name || !dVal) return;
        const t = new Date(dVal + 'T' + tVal); // 本地时区解析
        if (isNaN(t.getTime())) return;
        const btn = buttons.find((b) => b.name === name);
        const nodes = getEventNodes(name);
        const node = nodes ? $('#bf-node').value : null;
        if (nodes) {
          // 过程事件：补录节点（校验先开始后结束）
          const r = recordNode({ name, color: (btn && btn.color) || '#4cb6ac', node, ts: t.getTime() });
          if (r.status === 'noOpen') {
            toast('请先补录开始节点「' + nodes[0] + '」');
            return;
          }
          if (r.status === 'dupStart') {
            toast('该时间点已有进行中会话，请先补录结束节点');
            return;
          }
          if (r.status !== 'started' && r.status !== 'ended') {
            toast('补录失败');
            return;
          }
        } else {
          appendEvent({ name, color: (btn && btn.color) || '#4cb6ac', ts: t.getTime() });
        }
        overlay.remove();
        resolve({ name, node, ts: t.getTime() });
      }
    });
  });
}
module.exports = { render, backfillOne };

});
__define('views/stats.js', function (module, exports, require) {


var core = require('../core/stats.js');
var iv = require('../core/interval.js');
var sess = require('../core/session.js');
var __m7224 = require('../utils/db.js');
var getButtons = __m7224.getButtons;
var getSettings = __m7224.getSettings;
var queryEvents = __m7224.queryEvents;
var removeEvent = __m7224.removeEvent;
var getEventNodes = __m7224.getEventNodes;
var querySessions = __m7224.querySessions;
var __m70275 = require('../utils/time.js');
var formatFull = __m70275.formatFull;
var formatHM = __m70275.formatHM;
var formatGapText = __m70275.formatGapText;
var __m47705 = require('../utils/canvasChart.js');
var drawBarChart = __m47705.drawBarChart;
var indexAtX = __m47705.indexAtX;
var drawLineChart = __m47705.drawLineChart;
var __m18352 = require('../utils/ui.js');
var esc = __m18352.esc;
var listDialog = __m18352.listDialog;
var toast = __m18352.toast;
var confirmbox = __m18352.confirmbox;

const DAY = 24 * 3600 * 1000;
const RANGES = { week: '周', month: '月', year: '年' };
const ALL = '__all__';

let viewEl = null; // 供删除后刷新当前统计视图
let curOffset = 0; // 周期偏移：0=当前周/月/年（距离现在最近），-1=上一期，+1=下一期
let curChartMode = 'freq'; // 'freq' 频率柱状图 | 'duration' 时长折线（仅过程事件）

/** 由偏移量计算目标周期的锚点时间戳（落在该周期内即可）。 */
function periodAnchor(range, offset) {
  const now = new Date();
  if (range === 'week') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset * 7).getTime();
  }
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth() + offset, 1).getTime();
  }
  return new Date(now.getFullYear() + offset, 0, 1).getTime();
}

/** 周期显示文本：周 -> "M月D日 – M月D日"，月 -> "YYYY年M月"，年 -> "YYYY年"。 */
function periodLabel(range, offset) {
  const anchor = new Date(periodAnchor(range, offset));
  if (range === 'week') {
    const dow = anchor.getDay();
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const md = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
    return md(monday) + ' – ' + md(sunday);
  }
  if (range === 'month') return anchor.getFullYear() + '年' + (anchor.getMonth() + 1) + '月';
  return anchor.getFullYear() + '年';
}

function render(container) {
  viewEl = container;
  const buttons = getButtons();
  const state = { active: getActive(buttons), range: getRange(), offset: curOffset };
  // 「全部」汇总在第一位，默认选中，一眼看到所有记录
  const chips = [{ name: ALL, label: '全部', color: '#9aa0a6', dark: '#2b2b2b' }]
    .concat(buttons.map((b) => ({ name: b.name, label: b.name, color: b.color })));
  // 过程事件（有节点）才提供"时长"视图
  const showModeSwitch = state.active !== ALL && !!getEventNodes(state.active);

  container.innerHTML = `
      <div class="page">
      <h2 class="section-title filter-title" id="filter-title">▽ 分类筛选</h2>
      <div class="chips">${chips.map((c) => {
    const on = c.name === state.active;
    const style = on
      ? 'background:var(--primary);border-color:var(--primary);color:#fff'
      : `border-color:${c.color && c.name !== ALL ? c.color : '#c5c8cb'};color:${c.color && c.name !== ALL ? c.color : '#666'}`;
    return `<button class="chip ${on ? 'on' : ''}" data-name="${esc(c.name)}"
      style="${style}">${esc(c.label)}</button>`;
  }).join('')}</div>
      <div class="seg">${Object.entries(RANGES).map(([k, label]) => `
        <button class="seg-item ${k === state.range ? 'on' : ''}" data-range="${k}">${label}</button>`).join('')}
      </div>
      ${showModeSwitch ? `
      <div class="seg seg-mini">
        <button class="seg-item ${curChartMode === 'freq' ? 'on' : ''}" data-cmode="freq">频率</button>
        <button class="seg-item ${curChartMode === 'duration' ? 'on' : ''}" data-cmode="duration">时长</button>
      </div>` : ''}
      <div class="period-nav">
        <button class="pn-btn" id="period-prev" aria-label="上一${RANGES[state.range]}">‹</button>
        <span class="period-label" id="period-label"></span>
        <button class="pn-btn" id="period-next" aria-label="下一${RANGES[state.range]}">›</button>
      </div>
      <div id="stats-body"></div>
      <p class="privacy-note" id="stats-foot-note">数据仅保存在本地浏览器，建议定期通过 GitHub 同步备份</p>
    </div>`;

  container.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    location.hash = '#/stats?event=' + encodeURIComponent(c.dataset.name);
  }));
  container.querySelectorAll('.seg-item').forEach((s) => s.addEventListener('click', () => {
    if (s.dataset.cmode) {
      curChartMode = s.dataset.cmode;
      drawStats(container, state);
      return;
    }
    setRange(s.dataset.range);
    curOffset = 0; // 切换周/月/年粒度后回到当前周期
    render(container);
  }));
  container.querySelector('#period-prev').addEventListener('click', () => {
    curOffset -= 1;
    render(container);
  });
  container.querySelector('#period-next').addEventListener('click', () => {
    curOffset += 1;
    render(container);
  });

  drawStats(container, state);
}

/**
 * 选择统计范围：
 * 1) URL 显式指定（?event=具体事件 或 ?event=__all__）；
 * 2) 默认「全部」——汇总所有事件的记录，避免"只看到最近一次"的误解。
 */
function getActive(buttons) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const name = q.get('event');
  if (name === ALL) return ALL;
  if (name && buttons.some((b) => b.name === name)) return name;
  return ALL;
}

function getRange() {
  const saved = sessionStorage.getItem('statsRange');
  return RANGES[saved] ? saved : 'week';
}

function setRange(r) {
  sessionStorage.setItem('statsRange', r);
}

function drawStats(container, state) {
  const body = container.querySelector('#stats-body');
  const isAll = state.active === ALL;

  // 周期标签 + 锚点（支持前后翻页，默认当前周期）
  const labelEl = container.querySelector('#period-label');
  if (labelEl) labelEl.textContent = periodLabel(state.range, state.offset);
  const anchor = periodAnchor(state.range, state.offset);

  // 过程事件 + "时长"模式 -> 时长折线（会话持续时间）
  if (!isAll && curChartMode === 'duration') {
    drawDurationStats(container, state, anchor);
    return;
  }

  const settings = getSettings();
  // 「全部」不过滤事件；单个事件按 name 过滤
  const records = isAll ? queryEvents({}) : queryEvents({ name: state.active });
  const r = core.computeRange(records, state.range, anchor);
  const last = core.lastOccurrence(records);
  // 平均间隔 / 间隔分析仅对同一事件有意义，全部视图不计算
  const avg = isAll ? null : iv.avgInterval(records, settings);
  const dist = isAll ? [] : iv.intervalDistribution(records, settings, 10);
  // 总次数 = 所选周期内的次数（r.counts 已按周期桶聚合）
  const total = r.counts.reduce((a, b) => a + b, 0);
  const daily = total ? (total / r.totalDays).toFixed(1) : '0';
  const chip = getButtons().find((b) => b.name === state.active);
  const singleColor = isAll ? '#2b2b2b' : (chip && chip.color) || '#4cb6ac';
  const tickEvery = state.range === 'week' ? 1 : state.range === 'month' ? 5 : 3;

  if (!total) {
    const label = isAll ? '全部' : state.active;
    const hasAny = queryEvents({}).length > 0;
    body.innerHTML = hasAny
      ? `<div class="empty-tip">「${esc(label)}」在 ${periodLabel(state.range, state.offset)} 暂无记录<br><span class="tip-sub">全应用已有 ${queryEvents({}).length} 条记录，可点上方标签切换其他事件</span></div>`
      : '<div class="empty-tip">还没有任何记录，去首页记一件吧</div>';
    return;
  }

  // —— 图表绘图数据 ——
  // 全部视图：按事件分组堆叠（同一天各事件分段着色）；单事件视图：单序列
  let series;
  let bucketTs;
  let axisLabels;
  let legendHtml = '';
  if (isAll) {
    const names = [...new Set(records.map((x) => x.name))];
    const evs = names.map((name) => ({
      name,
      records: records.filter((x) => x.name === name),
      color: colorOf(name)
    }));
    const comp = core.computeSeries(evs, state.range, anchor);
    series = comp.series;
    bucketTs = comp.bucketTs;
    axisLabels = comp.axisLabels;
    if (comp.series.length > 1) {
      legendHtml = `<div class="legend">${comp.series.map((s) => `
        <span class="lg"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
    }
  } else {
    series = [{ name: state.active, color: singleColor, counts: r.counts }];
    bucketTs = r.bucketTs;
    axisLabels = r.axisLabels;
  }

  const distCard = isAll ? '' : `
    <div class="card">
      <div class="dist-head" id="dist-toggle">
        <span>间隔分布（最近 ${dist.length} 次）</span><span class="arrow" id="dist-arrow">▸</span>
      </div>
      <div id="dist-list" class="dist-list hidden"></div>
    </div>`;

  body.innerHTML = `
    <div class="cards">
      <div class="card card-metric"><span class="card-tag">累计</span><b class="num">${total}</b><span class="lbl">总次数</span></div>
      <div class="card card-metric"><span class="card-tag">频次</span><b class="num">${daily}</b><span class="lbl">日均</span></div>
      <div class="card card-metric"><span class="card-tag">动态</span><b class="num num-sm">${last ? last.text : '-'}</b><span class="lbl">最近一次</span></div>
      <div class="card card-metric"><span class="card-tag">趋势</span><b class="num num-sm">${avg ? avg.text : '-'}</b><span class="lbl">平均间隔</span></div>
    </div>
    <div class="card chart-card">
      <h3 class="chart-title" id="chart-title">事件趋势分布</h3>
      <p class="chart-lead">点击柱子查看当日明细${isAll ? '（全部事件）' : ''}</p>
      ${legendHtml}
      <canvas id="chart" class="chart" style="height:320px"></canvas>
      <div class="chart-tip">点击柱子查看当日明细${isAll ? '（全部事件）' : ''}</div>
    </div>
    ${distCard}`;

  setupChart(container, { series, axisLabels, bucketTs, tickEvery, active: isAll ? null : state.active });
  if (!isAll) setupDistList(container, dist);
}

/** 由按钮配色查事件颜色（含已隐藏按钮），未知事件用默认色。 */
function colorOf(name) {
  const b = getButtons().find((x) => x.name === name);
  return (b && b.color) || '#4cb6ac';
}

/** 过程事件"时长"视图：会话持续时间折线图 + 会话指标。 */
function drawDurationStats(container, state, anchor) {
  const body = container.querySelector('#stats-body');
  const sessions = querySessions(state.active);
  const ds = sess.durationSeries(sessions, state.range, anchor);
  const closed = sessions.filter((s) => s.durationMs != null);

  const periodCount = ds.counts.reduce((a, b) => a + b, 0);
  const periodSum = ds.sums.reduce((a, b) => a + b, 0);
  const lastEnd = closed.length ? Math.max(...closed.map((s) => s.end)) : null;
  const avgMs = periodCount ? periodSum / periodCount : 0;
  const totalAvgMs = closed.length ? closed.reduce((a, s) => a + s.durationMs, 0) / closed.length : 0;
  const color = colorOf(state.active);
  const tickEvery = state.range === 'week' ? 1 : state.range === 'month' ? 5 : 3;
  // 折线值转小时
  const valuesH = ds.avgs.map((ms) => (ms ? ms / 3600000 : 0));
  const avgLineH = totalAvgMs ? totalAvgMs / 3600000 : 0;

  if (!closed.length) {
    body.innerHTML = `<div class="empty-tip">「${esc(state.active)}」还没有已结束的过程<br><span class="tip-sub">记录开始与结束节点后，这里展示每次的持续时长</span></div>`;
    return;
  }

  body.innerHTML = `
    <div class="cards">
      <div class="card"><b class="num">${periodCount}</b><span class="lbl">会话次数</span></div>
      <div class="card"><b class="num num-sm">${periodCount ? formatGapText(avgMs) : '-'}</b><span class="lbl">平均时长</span></div>
      <div class="card"><b class="num num-sm">${lastEnd ? core.formatRelative(Date.now() - lastEnd) : '-'}</b><span class="lbl">最近结束</span></div>
      <div class="card"><b class="num num-sm">${periodSum ? formatGapText(periodSum) : '-'}</b><span class="lbl">总时长</span></div>
    </div>
    <div class="card chart-card">
      <canvas id="chart" class="chart" style="height:320px"></canvas>
      <div class="chart-tip">折线：该周期内每次过程的持续时长（虚线为总体平均）</div>
    </div>`;

  setupDurationChart(container, { labels: ds.axisLabels, values: valuesH, color, avgLine: avgLineH, tickEvery });
}

function setupDurationChart(container, { labels, values, color, avgLine, tickEvery }) {
  const canvas = container.querySelector('#chart');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || container.querySelector('.chart-card').clientWidth - 24;
  const h = 320;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  drawLineChart(ctx, { width: w, height: h, labels, values, color, avgLine, tickEvery });
}

function setupChart(container, { series, axisLabels, bucketTs, tickEvery, active }) {
  const canvas = container.querySelector('#chart');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || container.querySelector('.chart-card').clientWidth - 24;
  const h = 320;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  drawBarChart(ctx, { width: w, height: h, labels: axisLabels, series, tickEvery });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const idx = indexAtX(e.clientX - rect.left, w, series && series[0] ? series[0].counts.length : 0);
    if (idx < 0 || !bucketTs[idx]) return;
    const fromTs = bucketTs[idx];
    // active 为 null 时 queryEvents 不过滤事件名 -> 当日全部记录
    const dayStats = queryEvents({ name: active, fromTs, toTs: fromTs + DAY - 1 });
    if (!dayStats.length) return;
    listDialog({
      title: axisLabels[idx] + '的记录（' + dayStats.length + ' 条）',
      items: dayStats.map((x) => ({ id: x.id, label: x.name + ' ' + formatHM(x.ts) })),
      onDelete: async (item) => {
        const ok = await confirmbox({ title: '删除记录', message: '确认删除这条记录？', danger: true });
        if (ok) {
          removeEvent(item.id);
          toast('已删除');
          render(viewEl);
        }
      }
    });
  });
}

function setupDistList(container, dist) {
  const head = container.querySelector('#dist-toggle');
  const list = container.querySelector('#dist-list');
  const arrow = container.querySelector('#dist-arrow');
  head.addEventListener('click', () => {
    const hidden = list.classList.toggle('hidden');
    arrow.textContent = hidden ? '▸' : '▾';
  });
  if (!dist.length) {
    list.innerHTML = '<div class="dist-row dist-none">记录不足两条，暂无间隔分析</div>';
    return;
  }
  list.innerHTML = dist.map((d) => `
    <div class="dist-row">${formatFull(d.fromTs)} → ${formatFull(d.toTs)}，间隔 ${d.text}</div>`).join('');
}
module.exports = { render, getActive };

});
__define('views/history.js', function (module, exports, require) {


var __m7224 = require('../utils/db.js');
var getButtons = __m7224.getButtons;
var queryEvents = __m7224.queryEvents;
var removeEvent = __m7224.removeEvent;
var querySessions = __m7224.querySessions;
var removeSession = __m7224.removeSession;
var __m70275 = require('../utils/time.js');
var formatHM = __m70275.formatHM;
var formatFull = __m70275.formatFull;
var formatGapText = __m70275.formatGapText;
var __m18352 = require('../utils/ui.js');
var esc = __m18352.esc;
var toast = __m18352.toast;
var confirmbox = __m18352.confirmbox;
var __m13484 = require('./home.js');
var backfillOne = __m13484.backfillOne;

/** 日期分组键 -> "YYYY年M月D日" */
function dateKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function render(container) {
  const buttons = getButtons();
  const rows = new Map(); // dateLabel -> [row html]
  const anchors = new Map(); // dateLabel -> 该分组内最新时间戳（用于降序排序）
  const push = (ts, html) => {
    const date = dateKey(ts);
    if (!rows.has(date)) rows.set(date, []);
    if (ts > (anchors.get(date) || 0)) anchors.set(date, ts);
    rows.get(date).push(html);
  };

  // —— 过程事件：按会话展示（开始日期为分组锚点） ——
  buttons
    .filter((b) => Array.isArray(b.nodes) && b.nodes.length >= 2)
    .forEach((btn) => {
      querySessions(btn.name).forEach((s) => {
        if (!s.start) return;
        const color = btn.color || '#4cb6ac';
        const d0 = new Date(s.start);
        const d1 = s.end ? new Date(s.end) : null;
        const rangeTxt = d1
          ? `${d0.getFullYear()}年${d0.getMonth() + 1}月${d0.getDate()}日 ${formatHM(s.start)} — ${d1.getFullYear()}年${d1.getMonth() + 1}月${d1.getDate()}日 ${formatHM(s.end)}`
          : `${formatFull(s.start)} — 进行中`;
        const durTxt = s.durationMs != null ? `持续${formatGapText(s.durationMs)}` : '进行中';
        push(s.start, `
          <div class="row session-row" data-sid="${esc(s.sessionId)}">
            <div class="session-head">
              <span class="dot" style="background:${color}"></span>
              <span class="row-name">${esc(btn.name)}</span>
              <span class="session-badge">周期</span>
              <span class="row-time">${formatHM(s.start)}</span>
              <span class="session-dur">${durTxt}</span>
              <button class="row-del" data-sid="${esc(s.sessionId)}">删除</button>
              <span class="row-arrow">›</span>
            </div>
            <div class="session-detail">${rangeTxt}</div>
          </div>`);
      });
    });

  // —— 瞬时记录：按天分组（排除过程事件的节点记录） ——
  queryEvents({}).filter((e) => !e.node).forEach((e) => {
    push(e.ts, `
      <div class="row" data-del="${e.id}">
        <span class="dot" style="background:${e.color}"></span>
        <span class="row-name">${esc(e.name)}</span>
        <span class="row-time">${formatHM(e.ts)}</span>
        <button class="row-del" data-id="${e.id}">删除</button>
        <span class="row-arrow">›</span>
      </div>`);
  });

  const groups = [];
  let total = 0;
  // 按锚点时间戳降序（设计稿：最新的一天在最上面）
  [...rows.keys()].sort((a, b) => anchors.get(b) - anchors.get(a)).forEach((date) => {
    total += rows.get(date).length;
    groups.push(`<h3 class="group-date">📅 ${date}</h3>${rows.get(date).join('')}`);
  });

  container.innerHTML = `<div class="page">
    <div class="block-btn block-outline" id="backfill-btn">＋ 补录一条记录</div>
    ${groups.join('')}
    ${total ? `<p class="history-summary">共 ${total} 条记录</p>` : '<div class="empty-tip">还没有记录</div>'}
  </div>`;

  bindBackfill(container);

  // 会话删除（删除该会话全部记录）
  container.querySelectorAll('.session-row .row-del').forEach((btn) => btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const ok = await confirmbox({ title: '删除该次过程', message: '将删除这次过程（开始与结束）的全部记录，确认？', danger: true });
    if (ok) {
      removeSession(btn.dataset.sid);
      toast('已删除该次过程');
      render(container);
    }
  }));

  // 每行右侧显式删除按钮（瞬时记录）
  container.querySelectorAll('.row[data-del] .row-del').forEach((btn) => btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const ok = await confirmbox({ title: '删除记录', message: '确认删除这条记录？', danger: true });
    if (ok) {
      removeEvent(btn.dataset.id);
      toast('已删除');
      render(container);
    }
  }));
}

function bindBackfill(container) {
  const btn = container.querySelector('#backfill-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const r = await backfillOne();
    if (r) {
      toast('已补录：' + r.name);
      render(container);
    }
  });
}

module.exports = { render };

});
__define('views/settings.js', function (module, exports, require) {


var __m7224 = require('../utils/db.js');
var getButtons = __m7224.getButtons;
var saveButtons = __m7224.saveButtons;
var getSettings = __m7224.getSettings;
var saveSettings = __m7224.saveSettings;
var queryEvents = __m7224.queryEvents;
var clearAllEvents = __m7224.clearAllEvents;
var renameEventName = __m7224.renameEventName;
var countByName = __m7224.countByName;
var importEvents = __m7224.importEvents;
var importButtons = __m7224.importButtons;
var getSyncConfig = __m7224.getSyncConfig;
var saveSyncConfig = __m7224.saveSyncConfig;
var renameNode = __m7224.renameNode;
var __m14030 = require('../utils/exporter.js');
var downloadCSV = __m14030.downloadCSV;
var downloadJSON = __m14030.downloadJSON;
var downloadButtonsJSON = __m14030.downloadButtonsJSON;
var downloadBackupJSON = __m14030.downloadBackupJSON;
var __m7956 = require('../utils/import.js');
var parseJSONRecords = __m7956.parseJSONRecords;
var parseCSVRecords = __m7956.parseCSVRecords;
var parseButtonsJSON = __m7956.parseButtonsJSON;
var parseBackupJSON = __m7956.parseBackupJSON;
var __m9654 = require('../utils/sync.js');
var fetchRemoteFile = __m9654.fetchRemoteFile;
var pushRemoteFile = __m9654.pushRemoteFile;
var buildSyncPayload = __m9654.buildSyncPayload;
var __m18352 = require('../utils/ui.js');
var esc = __m18352.esc;
var toast = __m18352.toast;
var confirmbox = __m18352.confirmbox;
var promptbox = __m18352.promptbox;
var __m98880 = require('../utils/icons.js');
var iconSvg = __m98880.iconSvg;
var ICON_LIST = __m98880.ICON_LIST;

const COLORS = [
  '#4cb6ac', '#FF6B6B', '#4D96FF', '#F9C74F', '#9B5DE5', '#00BBF9',
  '#F3722C', '#F9844A', '#90BE6D', '#43AA8B', '#577590', '#277DA1',
  '#E07A5F', '#8AC926', '#6A4C93', '#FF5D8F', '#2D9CDB', '#EB5757',
  '#F2C94C', '#9B51E0', '#2F80ED', '#27AE60', '#F2994A', '#C71585',
  '#20B2AA', '#FF8C00', '#556B2F', '#8B4513', '#708090', '#5F6368'
];

function render(container) {
  const settings = getSettings();
  const buttons = getButtons();
  const gh = getSyncConfig();

  container.innerHTML = `
    <div class="page">
      <div class="card">
        <h3 class="card-title">快捷按钮</h3>
        <p class="card-sub">点图标改样子 · 点色块改颜色 · 点名称改名 · 点「节点」配置过程事件（如 吵架→和好）· 点状态显示/隐藏</p>
        ${buttons.map((b) => `
          <div class="btn-row" data-id="${b.id}">
            <button class="btn-icon" data-icon="${b.id}">${iconSvg(b.icon)}</button>
            <button class="swatch" data-color="${b.id}" style="background:${b.color}"></button>
            <button class="btn-name ${b.enabled ? '' : 'btn-off'}" data-edit="${b.id}">${esc(b.name)}</button>
            <button class="btn-node ${Array.isArray(b.nodes) && b.nodes.length >= 2 ? 'btn-node-on' : ''}" data-nodes="${b.id}">${Array.isArray(b.nodes) && b.nodes.length >= 2 ? '过程' : '节点'}</button>
            <button class="btn-state" data-toggle="${b.id}">${b.enabled ? '显示中' : '已隐藏'}</button>
            <button class="btn-del" data-del="${b.id}">删除</button>
          </div>`).join('')}
        <div class="block-btn block-outline" id="add-btn">＋ 新增快捷按钮</div>
      </div>

      <div class="card">
        <h3 class="card-title">统计设置</h3>
        <label class="setting-row">
          <span class="setting-label">
            忽略夜间间隔
            <em class="setting-desc">${settings.nightStart}–${settings.nightEnd} 的记录不参与间隔统计</em>
          </span>
          <span class="switch"><input type="checkbox" id="night-switch" ${settings.ignoreNightInterval ? 'checked' : ''}></span>
        </label>
        <label class="setting-row">
          <span class="setting-label">夜间开始</span>
          <input type="time" id="night-start" value="${settings.nightStart}" class="time-input">
        </label>
        <label class="setting-row">
          <span class="setting-label">夜间结束</span>
          <input type="time" id="night-end" value="${settings.nightEnd}" class="time-input">
        </label>
      </div>

      <div class="card">
        <h3 class="card-title">数据管理</h3>
        <div class="security-row"><span class="form-label">记录导出 / 导入</span></div>
        <div class="btn-group">
          <div class="block-btn" id="export-csv">导出 CSV</div>
          <div class="block-btn" id="export-json">导出 JSON</div>
        </div>
        <div class="btn-group">
          <div class="block-btn" id="import-json">导入 JSON</div>
          <div class="block-btn" id="import-csv">导入 CSV</div>
        </div>
        <div class="split-line"></div>
        <div class="security-row"><span class="form-label">快捷按钮备份</span></div>
        <div class="btn-group">
          <div class="block-btn" id="export-buttons">导出快捷按钮</div>
          <div class="block-btn" id="import-buttons">导入快捷按钮</div>
        </div>
        <div class="split-line"></div>
        <div class="security-row"><span class="form-label">全部数据（记录 + 快捷按钮）</span></div>
        <div class="btn-group">
          <div class="block-btn" id="export-all">导出全部数据</div>
          <div class="block-btn" id="import-all">导入全部数据</div>
        </div>
        <input type="file" id="import-file" class="hidden" accept=".json,.csv">
        <div class="block-btn block-danger" id="clear-all">清空全部数据</div>
      </div>

      <div class="card">
        <h3 class="card-title">云同步（GitHub）</h3>
        <p class="card-sub">把「记录 + 快捷按钮」备份到自己的 GitHub 仓库，换设备时下载即恢复。请求 GitHub 使用本机 Token，仅保存在本机浏览器，请用只开该仓库读写权限的 Token。</p>
        <div class="sync-field">
          <div class="sync-label-row">
            <span class="setting-label">访问令牌 (TOKEN)</span>
            <span class="token-badge" id="token-encrypted">ENCRYPTED</span>
          </div>
          <input type="password" id="gh-token" class="time-input sync-input" value="${esc(gh.token)}" placeholder="ghp_…">
        </div>
        <label class="setting-row"><span class="setting-label">仓库 (REPOSITORY)</span>
          <input type="text" id="gh-repo" class="time-input sync-input" value="${esc(gh.repo)}" placeholder="用户名/仓库名"></label>
        <label class="setting-row"><span class="setting-label">文件路径 (FILE PATH)</span>
          <input type="text" id="gh-path" class="time-input sync-input" value="${esc(gh.path)}" placeholder="tick-log/data.json"></label>
        <div class="block-btn block-outline" id="gh-save">保存同步配置</div>
        <div class="btn-group">
          <div class="block-btn" id="gh-upload">↑ 上传同步</div>
          <div class="block-btn" id="gh-download">↓ 下载同步</div>
        </div>
        <div class="block-btn block-primary" id="gh-save-sync">保存并同步</div>
        <p class="security-row" id="gh-info">下载的数据会通过“导入”能力合并到本地（重复自动跳过）。</p>
      </div>

      <div class="version-info">
        <p id="app-version">快记小事 v1.2.4</p>
        <p class="version-tag" id="app-tagline">Designed for mindful logging</p>
      </div>

      <div class="privacy-note">所有数据仅保存在本机（localStorage + Service Worker 离线缓存），不上传任何服务器。</div>
    </div>`;

  // —— 改图标 ——
  container.querySelectorAll('.btn-icon[data-icon]').forEach((el) => el.addEventListener('click', async () => {
    const btn = buttons.find((b) => b.id === el.dataset.icon);
    if (!btn) return;
    const icon = await pickIcon(btn.icon);
    if (!icon) return;
    const list = getButtons();
    const b = list.find((x) => x.id === btn.id);
    if (b) { b.icon = icon; saveButtons(list); render(container); }
  }));

  // —— 配置过程事件节点 ——
  container.querySelectorAll('.btn-node[data-nodes]').forEach((el) => el.addEventListener('click', async () => {
    const btn = buttons.find((b) => b.id === el.dataset.nodes);
    if (!btn) return;
    const oldNodes = Array.isArray(btn.nodes) && btn.nodes.length >= 2 ? btn.nodes : [];
    const next = await nodeConfigDialog(btn.name, oldNodes);
    if (next === null) return;
    const list = getButtons();
    const b = list.find((x) => x.id === btn.id);
    if (!b) return;
    // 节点改名 -> 迁移历史记录中的 node 名
    if (oldNodes[0] && oldNodes[0] !== next[0]) renameNode(b.name, oldNodes[0], next[0]);
    if (oldNodes[1] && oldNodes[1] !== next[1]) renameNode(b.name, oldNodes[1], next[1]);
    b.nodes = next;
    saveButtons(list);
    toast(next.length >= 2 ? '已设为过程事件：' + next.join(' → ') : '已设为瞬时事件');
    render(container);
  }));

  // —— 改颜色 ——
  container.querySelectorAll('.swatch[data-color]').forEach((sw) => sw.addEventListener('click', async () => {
    const btn = buttons.find((b) => b.id === sw.dataset.color);
    if (!btn) return;
    const color = await pickColor(btn.color);
    if (!color) return;
    const list = getButtons();
    const b = list.find((x) => x.id === btn.id);
    if (b) { b.color = color; saveButtons(list); render(container); }
  }));

  // —— 改名（同步历史记录） ——
  container.querySelectorAll('.btn-name[data-edit]').forEach((el) => el.addEventListener('click', async () => {
    const btn = buttons.find((b) => b.id === el.dataset.edit);
    if (!btn) return;
    const name = (await promptbox({ title: '重命名', placeholder: '输入新名称', defaultValue: btn.name }));
    if (!name || name === btn.name) return;
    const list = getButtons();
    if (list.some((b) => b.name === name && b.id !== btn.id)) { toast('名称已存在'); return; }
    const b = list.find((x) => x.id === btn.id);
    if (!b) return;
    const moved = renameEventName(b.name, name, b.color);
    b.name = name;
    saveButtons(list);
    toast(moved ? `已改名，同步 ${moved} 条历史记录` : '已改名');
    render(container);
  }));

  // —— 显示 / 隐藏 ——
  container.querySelectorAll('.btn-state[data-toggle]').forEach((tg) => tg.addEventListener('click', () => {
    const btn = buttons.find((b) => b.id === tg.dataset.toggle);
    if (!btn) return;
    const next = !btn.enabled;
    if (!next && buttons.filter((b) => b.enabled).length <= 1) { toast('至少保留一个快捷键'); return; }
    const list = getButtons();
    const b = list.find((x) => x.id === btn.id);
    if (b) { b.enabled = next; saveButtons(list); render(container); }
  }));

  // —— 删除（历史保留，可找回） ——
  container.querySelectorAll('.btn-del').forEach((del) => {
    del.addEventListener('click', async () => {
      const id = del.dataset.del;
      const remain = buttons.filter((b) => b.enabled).length;
      const target = buttons.find((b) => b.id === id);
      if (target && !target.enabled) {
        // 已隐藏：直接移除
        saveButtons(buttons.filter((b) => b.id !== id));
        render(container);
        return;
      }
      if (remain <= 1) { toast('至少保留一个快捷键'); return; }
      const ok = await confirmbox({
        title: '删除按钮',
        message: '按钮将从首页移除；它的历史记录保留，仍可在统计「全部」中查看。以后新增同名按钮可自动找回这些记录。',
        danger: true
      });
      if (ok) {
        saveButtons(buttons.filter((b) => b.id !== id));
        render(container);
      }
    });
  });

  // —— 新增（同名找回历史 + 引导配置过程事件） ——
  container.querySelector('#add-btn').addEventListener('click', async () => {
    const name = await promptbox({ title: '新增快捷按钮', placeholder: '输入事件名称，如：锻炼' });
    if (!name) return;
    const list = getButtons();
    if (list.some((b) => b.name === name)) { toast('名称已存在'); return; }
    const n = countByName(name);
    if (n) {
      const ok = await confirmbox({
        title: '找到历史记录',
        message: `将新增按钮「${name}」，并自动关联该名称的 ${n} 条历史记录。`,
        confirmText: '添加并关联'
      });
      if (!ok) return;
    }
    // 引导：是否配置为过程事件（有开始/结束节点）
    let nodes = [];
    const wantProcess = await confirmbox({
      title: '事件类型',
      message: `「${name}」是否要记录“过程”（有开始和结束节点）？如 吵架→和好、生病→康复。选“否”则为普通瞬时事件（点一下记一条）。`,
      confirmText: '是（过程事件）',
      cancelText: '否（瞬时）'
    });
    if (wantProcess) {
      const next = await nodeConfigDialog(name, []);
      if (next === null) return; // 取消新增
      nodes = next;
    }
    const icon = (await pickIcon(null)) || 'sparkles';
    list.push({
      id: 'btn' + Date.now().toString(36),
      name,
      icon,
      color: COLORS[list.length % COLORS.length],
      enabled: true,
      sort: list.length,
      nodes
    });
    saveButtons(list);
    toast(nodes.length >= 2 ? `已添加，过程：${nodes[0]} → ${nodes[1]}` : (n ? `已添加，关联 ${n} 条记录` : '已添加'));
    render(container);
  });

  // —— 夜间设置 ——
  const s = getSettings();
  container.querySelector('#night-switch').addEventListener('change', (e) => {
    s.ignoreNightInterval = e.target.checked;
    saveSettings(s);
    toast('已保存');
  });
  container.querySelector('#night-start').addEventListener('change', (e) => {
    if (e.target.value === s.nightEnd) { toast('开始时间不能等于结束'); render(container); return; }
    s.nightStart = e.target.value;
    saveSettings(s);
  });
  container.querySelector('#night-end').addEventListener('change', (e) => {
    if (e.target.value === s.nightStart) { toast('结束时间不能等于开始'); render(container); return; }
    s.nightEnd = e.target.value;
    saveSettings(s);
  });

  // —— 导出 ——
  container.querySelector('#export-csv').addEventListener('click', () => {
    const records = queryEvents({});
    if (!records.length) return toast('暂无数据');
    downloadCSV(records, 'tick-log.csv');
    toast('已导出 CSV');
  });
  container.querySelector('#export-json').addEventListener('click', () => {
    const records = queryEvents({});
    if (!records.length) return toast('暂无数据');
    downloadJSON(records, 'tick-log.json');
    toast('已导出 JSON');
  });
  container.querySelector('#export-buttons').addEventListener('click', () => {
    const btns = getButtons();
    if (!btns.length) return toast('暂无按钮');
    downloadButtonsJSON(btns, 'tick-log-buttons.json');
    toast('已导出快捷按钮');
  });
  container.querySelector('#export-all').addEventListener('click', () => {
    const records = queryEvents({});
    const btns = getButtons();
    if (!records.length && !btns.length) return toast('暂无数据');
    downloadBackupJSON(records, btns, 'tick-log-all.json');
    toast('已导出全部数据');
  });

  // —— 导入（JSON / CSV / 快捷按钮 / 全部数据） ——
  const fileEl = container.querySelector('#import-file');
  const triggerImport = (type) => { fileEl.dataset.type = type; fileEl.click(); };
  container.querySelector('#import-json').addEventListener('click', () => triggerImport('json'));
  container.querySelector('#import-csv').addEventListener('click', () => triggerImport('csv'));
  container.querySelector('#import-buttons').addEventListener('click', () => triggerImport('buttons'));
  container.querySelector('#import-all').addEventListener('click', () => triggerImport('all'));
  fileEl.addEventListener('change', async () => {
    const f = fileEl.files && fileEl.files[0];
    const type = fileEl.dataset.type || 'json';
    fileEl.value = '';
    if (!f) return;
    let text;
    try {
      text = await f.text();
    } catch (err) {
      toast('文件读取失败');
      return;
    }

    // 全部数据导入（记录 + 快捷按钮）
    if (type === 'all') {
      let parsed;
      try {
        parsed = parseBackupJSON(text);
      } catch (err) {
        toast('备份文件解析失败');
        return;
      }
      const { events, buttons } = parsed;
      if (!events.length && !buttons.length) { toast('未识别到有效数据'); return; }
      const ok = await confirmbox({
        title: '导入全部数据',
        message: `将导入 ${events.length} 条记录、${buttons.length} 个快捷按钮（合并去重，重复自动跳过）。`,
        confirmText: '开始导入'
      });
      if (!ok) return;
      let summary = '';
      if (events.length) {
        const r = importEvents(events);
        summary += `记录 ${r.added} 条${r.skipped ? `，跳过重复 ${r.skipped}` : ''}`;
      }
      if (buttons.length) {
        const r = importButtons(buttons);
        summary += (summary ? '；' : '') + `按钮 新增 ${r.added} 个${r.updated ? `，更新 ${r.updated} 个` : ''}`;
      }
      toast('导入完成：' + summary);
      render(container);
      return;
    }

    // 快捷按钮导入
    if (type === 'buttons') {
      let btns;
      try {
        btns = parseButtonsJSON(text);
      } catch (err) {
        toast('按钮文件解析失败');
        return;
      }
      if (!btns.length) { toast('未识别到按钮数据'); return; }
      const ok = await confirmbox({
        title: '导入快捷按钮',
        message: `将导入 ${btns.length} 个快捷键：同名的更新样式，新名称追加到末尾，并根据需求自动保证至少一个启用。`,
        confirmText: '开始导入'
      });
      if (!ok) return;
      const { added, updated } = importButtons(btns);
      toast(`已导入：新增 ${added} 个${updated ? `，更新 ${updated} 个` : ''}`);
      render(container);
      return;
    }

    // 记录导入（JSON / CSV）
    let records;
    try {
      records = type === 'json' ? parseJSONRecords(text) : parseCSVRecords(text);
    } catch (err) {
      toast('文件解析失败，请检查文件格式');
      return;
    }
    if (!records.length) { toast('未识别到有效记录'); return; }
    const ok = await confirmbox({
      title: '导入确认',
      message: `将导入 ${records.length} 条记录（如「${records[0].name}」）。重复的记录会自动跳过。`,
      confirmText: '开始导入'
    });
    if (!ok) return;
    const { added, skipped } = importEvents(records);
    toast(`已导入 ${added} 条${skipped ? `，跳过重复 ${skipped} 条` : ''}`);
    render(container);
  });

  // —— 清空 ——
  container.querySelector('#clear-all').addEventListener('click', async () => {
    const ok = await confirmbox({ title: '清空全部数据', message: '将删除所有记录且不可恢复！', confirmText: '确认清空', danger: true });
    if (ok) {
      const again = await confirmbox({ title: '再次确认', message: '此操作不可撤销，确定清空？', confirmText: '确认清空', danger: true });
      if (again) {
        clearAllEvents();
        toast('已清空');
      }
    }
  });

  // —— GitHub 云同步 ——
  const setBusy = (id, busy) => {
    const el = container.querySelector('#' + id);
    if (!el) return;
    if (busy) { el.dataset.txt = el.textContent; el.textContent = '处理中…'; }
    else if (el.dataset.txt) el.textContent = el.dataset.txt;
    el.disabled = busy;
  };
  container.querySelector('#gh-save').addEventListener('click', () => {
    saveSyncConfig({
      token: container.querySelector('#gh-token').value.trim(),
      repo: container.querySelector('#gh-repo').value.trim(),
      path: container.querySelector('#gh-path').value.trim() || 'tick-log/data.json'
    });
    toast('同步配置已保存');
  });
  // 保存并同步：先保存当前表单配置，再立即上传一次
  container.querySelector('#gh-save-sync').addEventListener('click', async () => {
    saveSyncConfig({
      token: container.querySelector('#gh-token').value.trim(),
      repo: container.querySelector('#gh-repo').value.trim(),
      path: container.querySelector('#gh-path').value.trim() || 'tick-log/data.json'
    });
    const cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) { toast('请先填写并保存 TOKEN 与仓库'); return; }
    setBusy('gh-save-sync', true);
    try {
      const payload = buildSyncPayload(queryEvents({}), getButtons());
      await pushRemoteFile({ ...cfg, message: 'tick-log 保存并同步', content: payload });
      toast('已保存并同步到 GitHub');
    } catch (err) {
      toast('同步失败：' + err.message);
    } finally {
      setBusy('gh-save-sync', false);
    }
  });
  container.querySelector('#gh-upload').addEventListener('click', async () => {
    const cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) { toast('请先填写并保存同步配置'); return; }
    setBusy('gh-upload', true);
    try {
      const payload = buildSyncPayload(queryEvents({}), getButtons());
      await pushRemoteFile({ ...cfg, message: 'tick-log 自动同步', content: payload });
      toast('已上传到 GitHub');
    } catch (err) {
      toast('上传失败：' + err.message);
    } finally {
      setBusy('gh-upload', false);
    }
  });
  container.querySelector('#gh-download').addEventListener('click', async () => {
    const cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) { toast('请先填写并保存同步配置'); return; }
    setBusy('gh-download', true);
    try {
      const data = await fetchRemoteFile(cfg);
      if (!data) { toast('远程暂无同步数据'); return; }
      const evCount = Array.isArray(data.events) ? data.events.length : 0;
      const btnCount = Array.isArray(data.buttons) ? data.buttons.length : 0;
      if (!evCount && !btnCount) { toast('远程数据无内容'); return; }
      const ok = await confirmbox({
        title: '下载并导入',
        message: `将导入 ${evCount} 条记录、${btnCount} 个快捷按钮（合并去重，不清空本地数据）。`,
        confirmText: '开始导入'
      });
      if (!ok) return;
      let summary = '';
      if (Array.isArray(data.events) && data.events.length) {
        const r = importEvents(data.events);
        summary += `记录 ${r.added} 条${r.skipped ? `，跳过重复 ${r.skipped}` : ''}`;
      }
      if (Array.isArray(data.buttons) && data.buttons.length) {
        const r = importButtons(data.buttons);
        summary += (summary ? '；' : '') + `按钮 新增 ${r.added} 个${r.updated ? `，更新 ${r.updated} 个` : ''}`;
      }
      toast('下载完成：' + summary);
      render(container);
    } catch (err) {
      toast('下载失败：' + err.message);
    } finally {
      setBusy('gh-download', false);
    }
  });
}

/** 弹出颜色选择面板：30 色预设 + 自定义取色器；取消返回 null。 */
function pickColor(current) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">选择按钮颜色</div>
        <div class="palette">${COLORS.map((c) => `
          <button class="swatch-lg" data-color="${c}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="palette-row">
          <input type="color" id="color-custom" class="color-custom" value="${current || COLORS[0]}">
          <label for="color-custom" class="palette-label">自定义颜色</label>
        </div>
        <div class="modal-btns"><button class="modal-btn" data-close="1">取消</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const finish = (v) => { overlay.remove(); resolve(v); };
    overlay.querySelector('#color-custom').addEventListener('input', (e) => finish(e.target.value));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) { finish(null); return; }
      const sw = e.target.closest('.swatch-lg');
      if (sw) finish(sw.dataset.color);
    });
  });
}

/** 弹出图标面板：预设 emoji 宫格 + 自定义输入；取消返回 null。 */
function pickIcon(current) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">选择图标</div>
        <div class="icon-palette">${ICON_LIST.map(([name, label]) => `
          <button class="icon-sel ${name === current ? 'on' : ''}" data-icon="${name}" title="${label}">
            ${iconSvg(name)}<span class="icon-label">${label}</span>
          </button>`).join('')}</div>
        <div class="modal-btns">
          <button class="modal-btn" data-custom="1">自定义图标</button>
          <button class="modal-btn" data-close="1">取消</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', async (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) { overlay.remove(); resolve(null); return; }
      if (e.target.closest('[data-custom]')) {
        overlay.remove();
        const v = await promptbox({ title: '自定义图标', placeholder: '输入一个字符或表情' });
        resolve(v || null);
        return;
      }
      const b = e.target.closest('.icon-sel');
      if (b) { overlay.remove(); resolve(b.dataset.icon); }
    });
  });
}

/**
 * 节点配置弹窗：为过程事件配置 2 个节点（开始/结束）。
 * 两项都填 -> 返回 [start, end]；留空或仅填一项 -> 返回 []（瞬时事件）；取消 -> null。
 */
function nodeConfigDialog(eventName, oldNodes) {
  return new Promise((resolve) => {
    const s0 = (oldNodes && oldNodes[0]) || '';
    const e0 = (oldNodes && oldNodes[1]) || '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">配置过程事件 · ${esc(eventName)}</div>
        <div class="modal-msg modal-form">
          <p class="modal-note">过程事件有两个节点（开始 → 结束），记录时需先记开始、再记结束，从而统计持续时长。留空则为瞬时事件（点一下记一条）。</p>
          <label class="form-row"><span class="form-label">开始节点</span>
            <input id="nc-start" class="modal-input" type="text" value="${esc(s0)}" placeholder="如：吵架"></label>
          <label class="form-row"><span class="form-label">结束节点</span>
            <input id="nc-end" class="modal-input" type="text" value="${esc(e0)}" placeholder="如：和好"></label>
        </div>
        <div class="modal-btns">
          <button class="modal-btn" data-cancel="1">取消</button>
          <button class="modal-btn primary" data-save="1">保存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = (s) => overlay.querySelector(s);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-cancel]')) { overlay.remove(); resolve(null); return; }
      if (e.target.closest('[data-save]')) {
        const s = $('#nc-start').value.trim();
        const en = $('#nc-end').value.trim();
        if (s && en && s === en) { toast('开始与结束节点不能相同'); return; }
        const next = (s && en) ? [s, en] : [];
        overlay.remove();
        resolve(next);
      }
    });
  });
}
module.exports = { render };

});
__define('app.js', function (module, exports, require) {


var __m40425 = require('./utils/db.js');
var migrate = __m40425.migrate;
var home = require('./views/home.js');
var stats = require('./views/stats.js');
var history = require('./views/history.js');
var settings = require('./views/settings.js');

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
});
  function __boot() { __require('', 'app.js'); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __boot);
  } else {
    __boot();
  }
})();
