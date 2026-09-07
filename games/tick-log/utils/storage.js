'use strict';

/**
 * 浏览器 localStorage 读写封装：自动 JSON 序列化，失败时返回默认值。
 * 单 key 容量理论 5MB（各浏览器实现略有差异），events 按年分片存放。
 */

export function get(key, dft) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? dft : JSON.parse(v);
  } catch (e) {
    return dft;
  }
}

export function set(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

export function remove(key) {
  localStorage.removeItem(key);
}

export function keys() {
  try {
    return Object.keys(localStorage);
  } catch (e) {
    return [];
  }
}

/**
 * 估算 JSON 字节（UTF-16 近似，空实现兼容）。
 */
export function estimateBytes(arr) {
  try {
    return (JSON.stringify(arr) || '').length * 2;
  } catch (e) {
    return 0;
  }
}