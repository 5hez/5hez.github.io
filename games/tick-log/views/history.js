'use strict';

import { getButtons, queryEvents, removeEvent, querySessions, removeSession } from '../utils/db.js';
import { formatHM, formatFull, formatGapText } from '../utils/time.js';
import { esc, toast, confirmbox } from '../utils/ui.js';
import { backfillOne } from './home.js';

export function render(container) {
  const buttons = getButtons();
  const processNames = buttons.filter((b) => Array.isArray(b.nodes) && b.nodes.length >= 2).map((b) => b.name);

  // —— 过程事件：按会话展示 ——
  const sessionRows = [];
  processNames.forEach((name) => {
    const sessions = querySessions(name);
    if (!sessions.length) return;
    const btn = buttons.find((b) => b.name === name);
    const color = (btn && btn.color) || '#4ECDC4';
    sessionRows.push(`<h3 class="group-date">${esc(name)} · 过程</h3>`);
    sessions.forEach((s) => {
      const startTxt = s.start ? formatFull(s.start) : '-';
      const endTxt = s.end ? formatFull(s.end) : '进行中';
      const durTxt = s.durationMs != null ? ' · 持续' + formatGapText(s.durationMs) : ' · 未结束';
      sessionRows.push(`
        <div class="row session-row" data-sid="${esc(s.sessionId)}">
          <span class="dot" style="background:${color}"></span>
          <span class="row-name session-name">${startTxt} → ${endTxt}${durTxt}</span>
          <button class="row-del" data-sid="${esc(s.sessionId)}">删除</button>
        </div>`);
    });
  });

  // —— 瞬时记录：按天分组（排除过程事件的节点记录） ——
  const flat = queryEvents({}).filter((e) => !e.node);
  const map = new Map();
  flat.forEach((e) => {
    const d = new Date(e.ts);
    const key = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: e.id, name: e.name, color: e.color, time: formatHM(e.ts) });
  });
  const dayRows = [];
  map.forEach((items, date) => {
    dayRows.push(`<h3 class="group-date">${date}</h3>`);
    items.forEach((it) => {
      dayRows.push(`
        <div class="row" data-del="${it.id}">
          <span class="dot" style="background:${it.color}"></span>
          <span class="row-name">${esc(it.name)}</span>
          <span class="row-time">${it.time}</span>
          <button class="row-del" data-id="${it.id}">删除</button>
        </div>`);
    });
  });

  const empty = !sessionRows.length && !dayRows.length;
  container.innerHTML = `<div class="page">
    <div class="block-btn" id="backfill-btn">＋ 补录一条记录</div>
    ${sessionRows.join('')}
    ${dayRows.join('')}
    ${empty ? '<div class="empty-tip">还没有记录</div>' : ''}
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