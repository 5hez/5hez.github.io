'use strict';

import { getButtons, saveButtons, appendEvent, queryEvents, removeEvent, renameEventName, getEventNodes, recordNode, getOpenSession, abortOpenSession } from '../utils/db.js';
import { formatFull, formatGapText, formatHM } from '../utils/time.js';
import { startOfDay } from '../core/stats.js';
import { esc, toast, confirmbox, promptbox, actionSheet, nodeDialog, onLongPress, wasLongPress } from '../utils/ui.js';
import { iconSvg } from '../utils/icons.js';

let editing = false;

export function render(container) {
  const buttons = getButtons().filter((b) => b.enabled);
  const allEvents = queryEvents({});
  const totalCount = allEvents.length;
  const entries = allEvents.slice(0, 5);
  const hasMore = totalCount > entries.length;

  container.innerHTML = `
    <div class="page">
      <div class="grid-toolbar">
        <span class="grid-tip">${editing ? '拖动排序 · 点 × 删除' : '长按按钮可编辑'}</span>
        <button class="edit-toggle" id="edit-toggle">${editing ? '完成' : '编辑'}</button>
      </div>
      <div class="grid ${editing ? 'editing' : ''}">
        ${buttons.map((b) => `
          <div class="cell" data-id="${b.id}" style="background:${b.color}">
            ${editing ? `<button class="cell-del" data-del="${b.id}" aria-label="删除">×</button>` : ''}
            <span class="cell-icon">${iconSvg(b.icon)}</span>
            <span class="cell-name">${esc(b.name)}</span>
          </div>`).join('')}
        <div class="cell cell-add" data-act="add">
          <span class="cell-icon">＋</span>
          <span class="cell-name">添加</span>
        </div>
      </div>

      <div class="card today-card" id="today-summary">
        <span class="today-ico">☀️</span>
        <span class="today-body">
          <span class="today-title">今日统计</span>
          <span class="today-sub" id="today-count">已记录 0 件小事</span>
        </span>
        <button class="today-link" id="today-detail">查看详情</button>
      </div>

      <h2 class="section-title section-title-row">
        <span>最近记录</span>
        <span class="section-meta" id="recent-count">显示 ${entries.length} 条</span>
      </h2>
      ${entries.length ? `
        <div class="list">
          ${entries.map((e) => `
            <div class="row" data-del="${e.id}">
              <span class="dot" style="background:${e.color}"></span>
              <span class="row-name">${esc(e.name)}</span>
              <span class="row-time">${formatFull(e.ts)}</span>
              <button class="row-del row-del-icon" data-id="${e.id}" aria-label="删除">🗑</button>
            </div>`).join('')}
        </div>
        ${hasMore ? `<a class="recent-more" href="#/history">查看全部 ${totalCount} 条 ›</a>` : ''}`
      : '<div class="empty-tip">暂无记录 · 点击上方按钮即可 1 秒记一件</div>'}
      <button class="fab" id="fab-add" aria-label="补录">＋</button>
    </div>`;

  const todayTs = startOfDay(Date.now());
  const todayCount = queryEvents({}).filter((e) => e.ts >= todayTs).length;
  const todayEl = container.querySelector('#today-count');
  if (todayEl) todayEl.textContent = '已记录 ' + todayCount + ' 件小事';
  container.querySelector('#today-detail').addEventListener('click', () => { location.hash = '#/stats'; });
  container.querySelector('#fab-add').addEventListener('click', async () => {
    const r = await backfillOne();
    if (r) {
      toast('已补录：' + r.name);
      render(container);
    }
  });

  // 编辑模式切换
  container.querySelector('#edit-toggle').addEventListener('click', () => {
    editing = !editing;
    render(container);
  });
  // 编辑模式：删除 + 拖拽排序
  if (editing) {
    container.querySelectorAll('.cell-del').forEach((btn) => btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const ok = await confirmbox({ title: '隐藏按钮', message: '将从首页隐藏该按钮（不删除记录），可在设置里重新显示。', confirmText: '隐藏' });
      if (ok) {
        const list = getButtons();
        const b = list.find((x) => x.id === btn.dataset.del);
        if (b) { b.enabled = false; saveButtons(list); }
        render(container);
      }
    }));
    enableDrag(container);
  }

  // 点击记录
  container.querySelector('.grid').addEventListener('click', async (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    if (cell.dataset.act === 'add') { location.hash = '#/settings'; return; }
    if (editing) return;
    if (wasLongPress(cell)) return;
    const btn = getButtons().find((b) => b.id === cell.dataset.id && b.enabled);
    if (!btn) return;
    const nodes = getEventNodes(btn.name);
    if (!nodes) {
      // 瞬时事件：现状，直接记录
      appendEvent({ name: btn.name, color: btn.color });
      toast('已记录：' + btn.name);
      render(container);
      return;
    }
    await handleNodeRecord(container, btn, nodes);
  });

  // 长按按钮 -> 编辑/删除（仅非编辑模式）
  if (!editing) container.querySelectorAll('.cell[data-id]').forEach((cell) => {
    onLongPress(cell, async () => {
      const btn = getButtons().find((b) => b.id === cell.dataset.id);
      if (!btn) return;
const act = await actionSheet(['编辑名称', '补录一笔', '删除按钮']);
  if (act === '编辑名称') {
    const name = await promptbox({ title: '重命名', placeholder: '输入新名称', defaultValue: btn.name });
    if (name && name !== btn.name) {
      const list = getButtons();
      if (list.some((x) => x.name === name && x.id !== btn.id)) { toast('名称已存在'); return; }
      const b = list.find((x) => x.id === btn.id);
      if (b) {
        const moved = renameEventName(b.name, name, b.color);
        b.name = name;
        saveButtons(list);
        toast(moved ? `已改名，同步 ${moved} 条记录` : '已改名');
        render(container);
      }
    }
  } else if (act === '补录一笔') {
    const r = await backfillOne({ defaultName: btn.name });
    if (r) {
      toast('已补录：' + r.name);
      render(container);
    }
  } else if (act === '删除按钮') {
        const ok = await confirmbox({ title: '删除按钮', message: '删除后按钮将从首页移除，历史记录保留。', danger: true });
        if (ok) {
          saveButtons(getButtons().filter((x) => x.id !== btn.id));
          render(container);
        }
      }
    });
  });

  // 列表每条记录右侧显式「删除」按钮
  container.querySelectorAll('.row-del').forEach((btn) => btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const ok = await confirmbox({ title: '删除记录', message: '确认删除这条记录？', danger: true });
    if (ok) {
      removeEvent(btn.dataset.id);
      toast('已删除');
      render(container);
    }
  }));

  // 长按记录 -> 删除
  container.querySelectorAll('.row[data-del]').forEach((row) => {
    onLongPress(row, async () => {
      if (wasLongPress(row)) return;
      const ok = await confirmbox({ title: '删除记录', message: '确认删除这条记录？', danger: true });
      if (ok) {
        removeEvent(row.dataset.del);
        toast('已删除');
        render(container);
      }
    });
  });
}

function enableDrag(container) {
  const grid = container.querySelector('.grid');
  let dragEl = null;

  grid.querySelectorAll('.cell[data-id]').forEach((cell) => {
    cell.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.cell-del')) return;
      dragEl = cell;
      cell.classList.add('dragging');
      try { cell.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });

    cell.addEventListener('pointermove', (e) => {
      if (dragEl !== cell) return;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell[data-id]');
      if (over && over !== cell) {
        const rect = over.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        grid.insertBefore(cell, after ? over.nextElementSibling : over);
      }
    });

    const end = (e) => {
      if (dragEl !== cell) return;
      dragEl = null;
      cell.classList.remove('dragging');
      try { cell.releasePointerCapture(e.pointerId); } catch {}
      persistOrder(grid);
    };
    cell.addEventListener('pointerup', end);
    cell.addEventListener('pointercancel', end);
  });
}

function persistOrder(grid) {
  const ids = [...grid.querySelectorAll('.cell[data-id]')].map((c) => c.dataset.id);
  const all = getButtons();
  const enabled = all.filter((b) => b.enabled);
  enabled.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const disabled = all.filter((b) => !b.enabled);
  saveButtons([...enabled, ...disabled]);
}

/**
 * 过程事件点击：弹出节点选择 -> 按会话规则记录（校验先开始后结束）。
 */
async function handleNodeRecord(container, btn, nodes) {
  const [startNode, endNode] = nodes;
  const open = getOpenSession(btn.name);
  const pick = await nodeDialog({
    title: btn.name,
    items: nodes.map((n) => ({ name: n })),
    openLabel: open ? open.start.node : null
  });
  if (!pick) return;

  if (pick === startNode) {
    if (open) {
      const ok = await confirmbox({
        title: '已有进行中的会话',
        message: `「${btn.name}」已记录「${open.start.node}」但尚未结束。作废该会话并开始新一轮？`,
        confirmText: '作废并新开',
        danger: true
      });
      if (!ok) return;
      abortOpenSession(btn.name);
    }
    const r = recordNode({ name: btn.name, color: btn.color, node: startNode });
    toast(r.status === 'started' ? '已记录：' + startNode : '记录失败');
  } else if (pick === endNode) {
    if (!open) {
      toast('请先记录「' + startNode + '」');
      return;
    }
    const r = recordNode({ name: btn.name, color: btn.color, node: endNode });
    if (r.status === 'ended') toast('已记录：' + endNode + ' · 持续' + formatGapText(r.durationMs));
    else toast('记录失败');
  }
  render(container);
}

/**
 * 补录弹层：选择事件名称（默认 defaultName）+ 节点（过程事件时）+ 日期 + 时间。
 * 返回 { name, node, ts }；取消返回 undefined。
 */
export async function backfillOne({ defaultName } = {}) {
  const buttons = getButtons().filter((b) => b.enabled);
  const now = new Date();
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  const nowTime = pad(now.getHours()) + ':' + pad(now.getMinutes());
  const options = buttons.map((b) => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">补录记录</div>
        <div class="modal-msg modal-form">
          <label class="form-row">
            <span class="form-label">事件</span>
            <select id="bf-event" class="bf-select">${options}<option value="__custom__">＋ 自定义名称</option></select>
          </label>
          <div id="bf-custom-wrap" class="form-row hidden">
            <span class="form-label">名称</span>
            <input id="bf-custom" class="modal-input" type="text" placeholder="输入事件名称">
          </div>
          <div id="bf-node-wrap" class="form-row hidden">
            <span class="form-label">节点</span>
            <select id="bf-node" class="bf-select"></select>
          </div>
          <label class="form-row">
            <span class="form-label">日期</span>
            <input id="bf-date" class="time-input" type="date" value="${today}">
          </label>
          <label class="form-row">
            <span class="form-label">时间</span>
            <input id="bf-time" class="time-input" type="time" value="${nowTime}">
          </label>
        </div>
        <div class="modal-btns">
          <button class="modal-btn" data-cancel="1">取消</button>
          <button class="modal-btn primary" data-save="1">保存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const $ = (s) => overlay.querySelector(s);
    const refreshNode = () => {
      const sel = $('#bf-event').value;
      const nodes = getEventNodes(sel);
      const wrap = $('#bf-node-wrap');
      if (nodes) {
        $('#bf-node').innerHTML = nodes.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
        wrap.classList.remove('hidden');
      } else {
        wrap.classList.add('hidden');
      }
    };
    if (defaultName) {
      try { $('#bf-event').value = defaultName; } catch (e) { /* ignore */ }
    }
    refreshNode();
    $('#bf-event').addEventListener('change', () => {
      $('#bf-custom-wrap').classList.toggle('hidden', $('#bf-event').value !== '__custom__');
      refreshNode();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-cancel]')) { overlay.remove(); resolve(undefined); return; }
      if (e.target.closest('[data-save]')) {
        let name = $('#bf-event').value;
        if (name === '__custom__') name = $('#bf-custom').value.trim();
        const dVal = $('#bf-date').value;
        const tVal = $('#bf-time').value || '00:00';
        if (!name || !dVal) return;
        const t = new Date(dVal + 'T' + tVal); // 本地时区解析
        if (isNaN(t.getTime())) return;
        const btn = buttons.find((b) => b.name === name);
        const nodes = getEventNodes(name);
        const node = nodes ? $('#bf-node').value : null;
        if (nodes) {
          // 过程事件：补录节点（校验先开始后结束）
          const r = recordNode({ name, color: (btn && btn.color) || '#4cb6ac', node, ts: t.getTime() });
          if (r.status === 'noOpen') {
            toast('请先补录开始节点「' + nodes[0] + '」');
            return;
          }
          if (r.status === 'dupStart') {
            toast('该时间点已有进行中会话，请先补录结束节点');
            return;
          }
          if (r.status !== 'started' && r.status !== 'ended') {
            toast('补录失败');
            return;
          }
        } else {
          appendEvent({ name, color: (btn && btn.color) || '#4cb6ac', ts: t.getTime() });
        }
        overlay.remove();
        resolve({ name, node, ts: t.getTime() });
      }
    });
  });
}