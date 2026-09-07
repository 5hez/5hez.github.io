'use strict';

const MIN_MS = 60 * 1000;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * "23:00" -> 分钟数(1380)。非法输入视为 0。
 */
export function toMin(hhmm) {
  if (!hhmm) return 0;
  const p = String(hhmm).split(':');
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}

/**
 * 时间戳对应的本地时钟分钟数（0~1439）。
 */
export function localClockMin(ts) {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * ts 是否落在夜间窗口 [nightStart, nightEnd)。
 * 支持跨天窗口：nightStart=23:00, nightEnd=07:00。
 * start == end 视为窗口关闭，恒返回 false。
 */
export function isNightly(ts, nightStart, nightEnd) {
  const s = toMin(nightStart);
  const e = toMin(nightEnd);
  if (s === e) return false;
  const c = localClockMin(ts);
  return s < e ? c >= s && c < e : c >= s || c < e;
}

/**
 * 数字美化：整数不带小点，非整数保留 1 位小数。
 */
export function beautify(n) {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
}

/**
 * 间隔文本："刚刚" / "20分钟" / "2.5小时" / "1.2天"。
 */
export function formatGap(ms) {
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
export function avgInterval(records, opts) {
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
export function intervalDistribution(records, opts, limit) {
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