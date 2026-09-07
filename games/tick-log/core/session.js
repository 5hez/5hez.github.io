'use strict';

import { computeRange, startOfDay } from './stats.js';

/**
 * 过程事件（节点化）会话逻辑：纯函数，无存储依赖。
 * 事件定义 nodes = [开始节点, 结束节点]（MVP 仅 2 节点）。
 * 记录含 node 与 sessionId；瞬时事件 node/sessionId 为 null。
 */

/**
 * 查找某事件的"进行中"会话（单进行中会话约束：最多取最新一个）。
 * records 需为该事件全部记录；返回 { sessionId, start } 或 null。
 */
export function findOpenSession(records, startNode, endNode) {
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
export function sessionize(records, startNode, endNode) {
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
export function durationStats(sessions) {
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
export function durationSeries(sessions, range, anchor) {
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