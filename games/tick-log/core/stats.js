'use strict';

const DAY_MS = 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
const MIN_MS = 60 * 1000;

/**
 * 本地时区的当天 0 点时间戳（毫秒）。
 */
export function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 总次数。
 */
export function totalCount(records) {
  return records ? records.length : 0;
}

/**
 * 日均次数 = count / days。
 */
export function dailyAvg(count, days) {
  if (!count || !days) return 0;
  return count / days;
}

/**
 * 相对时间文本："刚刚" / "3小时前" / "2天前"。
 */
export function formatRelative(ms) {
  if (ms < 0) return '刚刚';
  if (ms < MIN_MS) return '刚刚';
  if (ms < DAY_MS) return Math.round(ms / HOUR_MS) + '小时前';
  return Math.max(1, Math.floor(ms / DAY_MS)) + '天前';
}

/**
 * 最近一次记录：{ ms, text }。records 为空返回 null。
 * now 由调用方注入，保证可测。
 */
export function lastOccurrence(records, now) {
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
export function computeRange(records, range, now) {
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
export function computeSeries(events, range, now) {
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