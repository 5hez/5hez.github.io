'use strict';

/**
 * 墓碑（tombstone）合并的纯函数集合 —— 让「删除」也能同步、且不复活。
 * 墓碑结构：[{ id, deletedAt }]，表示「该 id 的记录已被删除」。
 */

/** 合并多组墓碑：按 id 取最新 deletedAt；返回去重数组。 */
export function mergeTombstones(...groups) {
  const map = new Map();
  groups.forEach((g) => {
    (g || []).forEach((t) => {
      if (!t || !t.id) return;
      const at = Number(t.deletedAt) || 0;
      if (!map.has(t.id) || at > map.get(t.id)) map.set(t.id, at);
    });
  });
  return [...map.entries()].map(([id, deletedAt]) => ({ id, deletedAt }));
}

/** 墓碑 id 集合。 */
export function tombstoneIds(tombstones) {
  const s = new Set();
  (tombstones || []).forEach((t) => { if (t && t.id) s.add(t.id); });
  return s;
}

/** 过滤掉有墓碑（已删除）的记录。 */
export function applyTombstones(events, tombstones) {
  const dead = tombstoneIds(tombstones);
  if (!dead.size) return (events || []).slice();
  return (events || []).filter((e) => e && !dead.has(e.id));
}

/** 合并多组按钮（事件）墓碑：按 name 取最新 deletedAt。 */
export function mergeButtonTombstones(...groups) {
  const map = new Map();
  groups.forEach((g) => {
    (g || []).forEach((t) => {
      if (!t || !t.name) return;
      const at = Number(t.deletedAt) || 0;
      if (!map.has(t.name) || at > map.get(t.name)) map.set(t.name, at);
    });
  });
  return [...map.entries()].map(([name, deletedAt]) => ({ name, deletedAt }));
}

/** 按钮墓碑 name 集合。 */
export function buttonTombstoneNames(tombstones) {
  const s = new Set();
  (tombstones || []).forEach((t) => { if (t && t.name) s.add(t.name); });
  return s;
}
