'use strict';

// 数据导入解析：JSON / CSV（与 exporter 导出的格式一一对应）

export function parseJSONRecords(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : (Array.isArray(data.events) ? data.events : []);
  return list
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const name = String(e.name || '').trim();
      const ts = normalizeTs(e.ts);
      if (!name || ts == null) return null;
      return { id: e.id || null, name, color: e.color || '#4ECDC4', ts };
    })
    .filter(Boolean);
}

export function parseCSVRecords(text) {
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
      return { id: null, name, color: '#4ECDC4', ts };
    })
    .filter(Boolean);
}

/**
 * 时间值归一为毫秒时间戳：
 * - 数字：>1e12 视为毫秒，否则视为秒
 * - 字符串：可能为 `="123"`（Excel 防科学计数法）、纯数字、或 "YYYY-MM-DD HH:mm:ss"
 */
export function normalizeTs(v) {
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
export function parseCSVRows(text) {
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
export function parseButtonsJSON(text) {
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
        color: b.color || '#4ECDC4',
        enabled: b.enabled !== false,
        sort: typeof b.sort === 'number' ? b.sort : 0,
        nodes: Array.isArray(b.nodes) && b.nodes.length >= 2 ? b.nodes.slice() : []
      };
    })
    .filter(Boolean);
}

/** 解析统一备份：{ events, buttons }，复用记录/按钮各自的解析逻辑。 */
export function parseBackupJSON(text) {
  return {
    events: parseJSONRecords(text),
    buttons: parseButtonsJSON(text)
  };
}