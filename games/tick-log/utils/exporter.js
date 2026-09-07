'use strict';

export function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

export function toCSV(records) {
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

export function toJSON(records) {
  return JSON.stringify(records, null, 2);
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

export function downloadCSV(records, filename) {
  download(new Blob(['\ufeff' + toCSV(records)], { type: 'text/csv;charset=utf-8' }), filename || 'tick-log.csv');
}

export function downloadJSON(records, filename) {
  download(new Blob([toJSON(records)], { type: 'application/json' }), filename || 'tick-log.json');
}

export function toButtonsJSON(buttons) {
  return JSON.stringify({ buttons }, null, 2);
}

export function downloadButtonsJSON(buttons, filename) {
  download(new Blob([toButtonsJSON(buttons)], { type: 'application/json' }), filename || 'tick-log-buttons.json');
}