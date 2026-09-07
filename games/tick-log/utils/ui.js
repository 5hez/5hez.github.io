'use strict';

// 极简 UI 辅助：toast / 确认框 / 输入框 / 动作面板 / 长按识别 / HTML 转义

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function toast(msg, duration = 1800) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), duration);
}

export function confirmbox({ title, message = '', confirmText = '确认', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${esc(title)}</div>
        <div class="modal-msg">${esc(message)}</div>
        <div class="modal-btns">
          <button class="modal-btn" data-v="0">${esc(cancelText)}</button>
          <button class="modal-btn ${danger ? 'danger' : 'primary'}" data-v="1">${esc(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = (v) => { overlay.remove(); resolve(!!v); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return close(false);
      const b = e.target.closest('[data-v]');
      if (b) close(+b.dataset.v);
    });
  });
}

export function promptbox({ title, placeholder = '', defaultValue = '' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${esc(title)}</div>
        <input class="modal-input" type="text" placeholder="${esc(placeholder)}" value="${esc(defaultValue)}">
        <div class="modal-btns">
          <button class="modal-btn" data-v="0">取消</button>
          <button class="modal-btn primary" data-v="1">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('input');
    const close = (v) => { overlay.remove(); resolve(v ? input.value.trim() : null); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return close(false);
      const b = e.target.closest('[data-v]');
      if (b) close(+b.dataset.v);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(true); });
    setTimeout(() => input.focus(), 60);
  });
}

export function actionSheet(items) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-mask';
    overlay.innerHTML = `
      <div class="sheet">
        <div class="sheet-items">${items.map((it, i) => `<div class="sheet-item" data-i="${i}">${esc(it)}</div>`).join('')}</div>
        <div class="sheet-cancel">取消</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(null); return; }
      const it = e.target.closest('.sheet-item');
      if (it) { const v = items[+it.dataset.i]; overlay.remove(); resolve(v); return; }
      if (e.target.closest('.sheet-cancel')) overlay.remove(), resolve(null);
    });
  });
}

/**
 * 节点选择弹层（过程事件记录）：展示事件名 + 各节点 + 进行中状态。
 * items: [{ name }]，openLabel: 进行中的节点名（无则 null）。
 * 返回选中的节点名；取消返回 null。
 */
export function nodeDialog({ title, items, openLabel }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-mask';
    const statusHtml = openLabel
      ? `<div class="node-status">⏳ 进行中 · 已记「${esc(openLabel)}」</div>`
      : '<div class="node-status node-status-idle">未开始，可选择开始节点</div>';
    overlay.innerHTML = `
      <div class="sheet">
        <div class="sheet-title">${esc(title)}</div>
        ${statusHtml}
        <div class="sheet-items">${items.map((it, i) => `
          <div class="sheet-item" data-i="${i}">${esc(it.name)}</div>`).join('')}
        </div>
        <div class="sheet-cancel">取消</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(null); return; }
      const it = e.target.closest('.sheet-item');
      if (it) { const v = items[+it.dataset.i]; overlay.remove(); resolve(v ? v.name : null); return; }
      if (e.target.closest('.sheet-cancel')) { overlay.remove(); resolve(null); }
    });
  });
}

/**
 * 长按识别：指针按下 450ms 未位移触发 onLong，位移 >12px 取消。
 * 触发时在 el._lpAt 记录时间，供 click 处理器判断是否应忽略（防双击）。
 */
export function onLongPress(el, onLong) {
  let timer = null;
  let sx = 0; let sy = 0;
  const clear = () => { clearTimeout(timer); timer = null; };
  const fire = () => {
    clear();
    el._lpAt = Date.now();
    onLong();
  };
  el.addEventListener('pointerdown', (e) => {
    sx = e.clientX; sy = e.clientY;
    clear();
    timer = setTimeout(fire, 450);
  });
  el.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - sx) > 12 || Math.abs(e.clientY - sy) > 12) clear();
  });
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointerleave', clear);
  el.addEventListener('pointercancel', clear);
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clear();
    fire();
  });
}

/** 用于 click 处理器开头：刚刚发生过长按则返回 true（忽略本次点击）。 */
export function wasLongPress(el) {
  return el._lpAt && Date.now() - el._lpAt < 500;
}

/**
 * 列表弹层：每条记录带删除按钮。
 * items: [{ label, ... }]，onDelete(item) 由调用方执行真正删除并刷新视图。
 */
export function listDialog({ title, items, onDelete }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-mask';
  const rows = (items || []).map((it, i) => `
    <div class="list-row">
      <span class="list-label">${esc(it.label)}</span>
      <button class="list-del" data-i="${i}">删除</button>
    </div>`).join('');
  overlay.innerHTML = `
    <div class="modal modal-list">
      <div class="modal-title">${esc(title)}</div>
      <div class="modal-msg modal-list-body">${rows || '<div class="list-empty">无记录</div>'}</div>
      <div class="modal-btns"><button class="modal-btn" data-close="1">关闭</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) return close();
    const del = e.target.closest('.list-del');
    if (del) {
      const item = items[+del.dataset.i];
      if (item && onDelete) onDelete(item);
    }
  });
}