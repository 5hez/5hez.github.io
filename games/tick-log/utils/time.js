'use strict';

export function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

export function formatHM(ts) {
  const d = new Date(ts);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function formatMD(ts) {
  const d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

export function formatFull(ts) {
  return formatMD(ts) + ' ' + formatHM(ts);
}

/** 时长文本：<1分钟"刚刚"；<1小时"X分钟"；<24小时"X小时Y分"；否则"X天Y小时"。 */
export function formatGapText(ms) {
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