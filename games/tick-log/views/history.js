'use strict';

import { getButtons, queryEvents, removeEvent, querySessions, removeSession } from '../utils/db.js';
import { formatHM, formatFull, formatGapText } from '../utils/time.js';
import { esc, toast, confirmbox } from '../utils/ui.js';
import { backfillOne } from './home.js';

/** 日期分组键 -> "YYYY年M月D日" */
function dateKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

export function render(container) {
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
