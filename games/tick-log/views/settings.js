'use strict';

import {
  getButtons, saveButtons, getSettings, saveSettings,
  queryEvents, clearAllEvents, renameEventName, countByName, importEvents, importButtons,
  getSyncConfig, saveSyncConfig, renameNode
} from '../utils/db.js';
import { downloadCSV, downloadJSON, downloadButtonsJSON, downloadBackupJSON } from '../utils/exporter.js';
import { parseJSONRecords, parseCSVRecords, parseButtonsJSON, parseBackupJSON } from '../utils/import.js';
import { fetchRemoteFile, pushRemoteFile, buildSyncPayload } from '../utils/sync.js';
import { esc, toast, confirmbox, promptbox } from '../utils/ui.js';
import { iconSvg, ICON_LIST } from '../utils/icons.js';

const COLORS = [
  '#4cb6ac', '#FF6B6B', '#4D96FF', '#F9C74F', '#9B5DE5', '#00BBF9',
  '#F3722C', '#F9844A', '#90BE6D', '#43AA8B', '#577590', '#277DA1',
  '#E07A5F', '#8AC926', '#6A4C93', '#FF5D8F', '#2D9CDB', '#EB5757',
  '#F2C94C', '#9B51E0', '#2F80ED', '#27AE60', '#F2994A', '#C71585',
  '#20B2AA', '#FF8C00', '#556B2F', '#8B4513', '#708090', '#5F6368'
];

export function render(container) {
  const settings = getSettings();
  const buttons = getButtons();
  const gh = getSyncConfig();

  container.innerHTML = `
    <div class="page">
      <div class="card">
        <h3 class="card-title">快捷按钮</h3>
        <p class="card-sub">点图标改样子 · 点色块改颜色 · 点名称改名 · 点「节点」配置过程事件（如 吵架→和好）· 点状态显示/隐藏</p>
        ${buttons.map((b) => `
          <div class="btn-row" data-id="${b.id}">
            <button class="btn-icon" data-icon="${b.id}">${iconSvg(b.icon)}</button>
            <button class="swatch" data-color="${b.id}" style="background:${b.color}"></button>
            <button class="btn-name ${b.enabled ? '' : 'btn-off'}" data-edit="${b.id}">${esc(b.name)}</button>
            <button class="btn-node ${Array.isArray(b.nodes) && b.nodes.length >= 2 ? 'btn-node-on' : ''}" data-nodes="${b.id}">${Array.isArray(b.nodes) && b.nodes.length >= 2 ? '过程' : '节点'}</button>
            <button class="btn-state" data-toggle="${b.id}">${b.enabled ? '显示中' : '已隐藏'}</button>
            <button class="btn-del" data-del="${b.id}">删除</button>
          </div>`).join('')}
        <div class="block-btn block-outline" id="add-btn">＋ 新增快捷按钮</div>
      </div>

      <div class="card">
        <h3 class="card-title">统计设置</h3>
        <label class="setting-row">
          <span class="setting-label">
            忽略夜间间隔
            <em class="setting-desc">${settings.nightStart}–${settings.nightEnd} 的记录不参与间隔统计</em>
          </span>
          <span class="switch"><input type="checkbox" id="night-switch" ${settings.ignoreNightInterval ? 'checked' : ''}></span>
        </label>
        <label class="setting-row">
          <span class="setting-label">夜间开始</span>
          <input type="time" id="night-start" value="${settings.nightStart}" class="time-input">
        </label>
        <label class="setting-row">
          <span class="setting-label">夜间结束</span>
          <input type="time" id="night-end" value="${settings.nightEnd}" class="time-input">
        </label>
      </div>

      <div class="card">
        <h3 class="card-title">数据管理</h3>
        <div class="security-row"><span class="form-label">记录导出 / 导入</span></div>
        <div class="btn-group">
          <div class="block-btn" id="export-csv">导出 CSV</div>
          <div class="block-btn" id="export-json">导出 JSON</div>
        </div>
        <div class="btn-group">
          <div class="block-btn" id="import-json">导入 JSON</div>
          <div class="block-btn" id="import-csv">导入 CSV</div>
        </div>
        <div class="split-line"></div>
        <div class="security-row"><span class="form-label">快捷按钮备份</span></div>
        <div class="btn-group">
          <div class="block-btn" id="export-buttons">导出快捷按钮</div>
          <div class="block-btn" id="import-buttons">导入快捷按钮</div>
        </div>
        <div class="split-line"></div>
        <div class="security-row"><span class="form-label">全部数据（记录 + 快捷按钮）</span></div>
        <div class="btn-group">
          <div class="block-btn" id="export-all">导出全部数据</div>
          <div class="block-btn" id="import-all">导入全部数据</div>
        </div>
        <input type="file" id="import-file" class="hidden" accept=".json,.csv">
        <div class="block-btn block-danger" id="clear-all">清空全部数据</div>
      </div>

      <div class="card">
        <h3 class="card-title">云同步（GitHub）</h3>
        <p class="card-sub">把「记录 + 快捷按钮」备份到自己的 GitHub 仓库，换设备时下载即恢复。请求 GitHub 使用本机 Token，仅保存在本机浏览器，请用只开该仓库读写权限的 Token。</p>
        <div class="sync-field">
          <div class="sync-label-row">
            <span class="setting-label">访问令牌 (TOKEN)</span>
            <span class="token-badge" id="token-encrypted">ENCRYPTED</span>
          </div>
          <input type="password" id="gh-token" class="time-input sync-input" value="${esc(gh.token)}" placeholder="ghp_…">
        </div>
        <label class="setting-row"><span class="setting-label">仓库 (REPOSITORY)</span>
          <input type="text" id="gh-repo" class="time-input sync-input" value="${esc(gh.repo)}" placeholder="用户名/仓库名"></label>
        <label class="setting-row"><span class="setting-label">文件路径 (FILE PATH)</span>
          <input type="text" id="gh-path" class="time-input sync-input" value="${esc(gh.path)}" placeholder="tick-log/data.json"></label>
        <div class="block-btn block-outline" id="gh-save">保存同步配置</div>
        <div class="btn-group">
          <div class="block-btn" id="gh-upload">↑ 上传同步</div>
          <div class="block-btn" id="gh-download">↓ 下载同步</div>
        </div>
        <div class="block-btn block-primary" id="gh-save-sync">保存并同步</div>
        <p class="security-row" id="gh-info">下载的数据会通过“导入”能力合并到本地（重复自动跳过）。</p>
      </div>

      <div class="version-info">
        <p id="app-version">快记小事 v1.2.4</p>
        <p class="version-tag" id="app-tagline">Designed for mindful logging</p>
      </div>

      <div class="privacy-note">所有数据仅保存在本机（localStorage + Service Worker 离线缓存），不上传任何服务器。</div>
    </div>`;

  // —— 改图标 ——
  container.querySelectorAll('.btn-icon[data-icon]').forEach((el) => el.addEventListener('click', async () => {
    const btn = buttons.find((b) => b.id === el.dataset.icon);
    if (!btn) return;
    const icon = await pickIcon(btn.icon);
    if (!icon) return;
    const list = getButtons();
    const b = list.find((x) => x.id === btn.id);
    if (b) { b.icon = icon; saveButtons(list); render(container); }
  }));

  // —— 配置过程事件节点 ——
  container.querySelectorAll('.btn-node[data-nodes]').forEach((el) => el.addEventListener('click', async () => {
    const btn = buttons.find((b) => b.id === el.dataset.nodes);
    if (!btn) return;
    const oldNodes = Array.isArray(btn.nodes) && btn.nodes.length >= 2 ? btn.nodes : [];
    const next = await nodeConfigDialog(btn.name, oldNodes);
    if (next === null) return;
    const list = getButtons();
    const b = list.find((x) => x.id === btn.id);
    if (!b) return;
    // 节点改名 -> 迁移历史记录中的 node 名
    if (oldNodes[0] && oldNodes[0] !== next[0]) renameNode(b.name, oldNodes[0], next[0]);
    if (oldNodes[1] && oldNodes[1] !== next[1]) renameNode(b.name, oldNodes[1], next[1]);
    b.nodes = next;
    saveButtons(list);
    toast(next.length >= 2 ? '已设为过程事件：' + next.join(' → ') : '已设为瞬时事件');
    render(container);
  }));

  // —— 改颜色 ——
  container.querySelectorAll('.swatch[data-color]').forEach((sw) => sw.addEventListener('click', async () => {
    const btn = buttons.find((b) => b.id === sw.dataset.color);
    if (!btn) return;
    const color = await pickColor(btn.color);
    if (!color) return;
    const list = getButtons();
    const b = list.find((x) => x.id === btn.id);
    if (b) { b.color = color; saveButtons(list); render(container); }
  }));

  // —— 改名（同步历史记录） ——
  container.querySelectorAll('.btn-name[data-edit]').forEach((el) => el.addEventListener('click', async () => {
    const btn = buttons.find((b) => b.id === el.dataset.edit);
    if (!btn) return;
    const name = (await promptbox({ title: '重命名', placeholder: '输入新名称', defaultValue: btn.name }));
    if (!name || name === btn.name) return;
    const list = getButtons();
    if (list.some((b) => b.name === name && b.id !== btn.id)) { toast('名称已存在'); return; }
    const b = list.find((x) => x.id === btn.id);
    if (!b) return;
    const moved = renameEventName(b.name, name, b.color);
    b.name = name;
    saveButtons(list);
    toast(moved ? `已改名，同步 ${moved} 条历史记录` : '已改名');
    render(container);
  }));

  // —— 显示 / 隐藏 ——
  container.querySelectorAll('.btn-state[data-toggle]').forEach((tg) => tg.addEventListener('click', () => {
    const btn = buttons.find((b) => b.id === tg.dataset.toggle);
    if (!btn) return;
    const next = !btn.enabled;
    if (!next && buttons.filter((b) => b.enabled).length <= 1) { toast('至少保留一个快捷键'); return; }
    const list = getButtons();
    const b = list.find((x) => x.id === btn.id);
    if (b) { b.enabled = next; saveButtons(list); render(container); }
  }));

  // —— 删除（历史保留，可找回） ——
  container.querySelectorAll('.btn-del').forEach((del) => {
    del.addEventListener('click', async () => {
      const id = del.dataset.del;
      const remain = buttons.filter((b) => b.enabled).length;
      const target = buttons.find((b) => b.id === id);
      if (target && !target.enabled) {
        // 已隐藏：直接移除
        saveButtons(buttons.filter((b) => b.id !== id));
        render(container);
        return;
      }
      if (remain <= 1) { toast('至少保留一个快捷键'); return; }
      const ok = await confirmbox({
        title: '删除按钮',
        message: '按钮将从首页移除；它的历史记录保留，仍可在统计「全部」中查看。以后新增同名按钮可自动找回这些记录。',
        danger: true
      });
      if (ok) {
        saveButtons(buttons.filter((b) => b.id !== id));
        render(container);
      }
    });
  });

  // —— 新增（同名找回历史 + 引导配置过程事件） ——
  container.querySelector('#add-btn').addEventListener('click', async () => {
    const name = await promptbox({ title: '新增快捷按钮', placeholder: '输入事件名称，如：锻炼' });
    if (!name) return;
    const list = getButtons();
    if (list.some((b) => b.name === name)) { toast('名称已存在'); return; }
    const n = countByName(name);
    if (n) {
      const ok = await confirmbox({
        title: '找到历史记录',
        message: `将新增按钮「${name}」，并自动关联该名称的 ${n} 条历史记录。`,
        confirmText: '添加并关联'
      });
      if (!ok) return;
    }
    // 引导：是否配置为过程事件（有开始/结束节点）
    let nodes = [];
    const wantProcess = await confirmbox({
      title: '事件类型',
      message: `「${name}」是否要记录“过程”（有开始和结束节点）？如 吵架→和好、生病→康复。选“否”则为普通瞬时事件（点一下记一条）。`,
      confirmText: '是（过程事件）',
      cancelText: '否（瞬时）'
    });
    if (wantProcess) {
      const next = await nodeConfigDialog(name, []);
      if (next === null) return; // 取消新增
      nodes = next;
    }
    const icon = (await pickIcon(null)) || 'sparkles';
    list.push({
      id: 'btn' + Date.now().toString(36),
      name,
      icon,
      color: COLORS[list.length % COLORS.length],
      enabled: true,
      sort: list.length,
      nodes
    });
    saveButtons(list);
    toast(nodes.length >= 2 ? `已添加，过程：${nodes[0]} → ${nodes[1]}` : (n ? `已添加，关联 ${n} 条记录` : '已添加'));
    render(container);
  });

  // —— 夜间设置 ——
  const s = getSettings();
  container.querySelector('#night-switch').addEventListener('change', (e) => {
    s.ignoreNightInterval = e.target.checked;
    saveSettings(s);
    toast('已保存');
  });
  container.querySelector('#night-start').addEventListener('change', (e) => {
    if (e.target.value === s.nightEnd) { toast('开始时间不能等于结束'); render(container); return; }
    s.nightStart = e.target.value;
    saveSettings(s);
  });
  container.querySelector('#night-end').addEventListener('change', (e) => {
    if (e.target.value === s.nightStart) { toast('结束时间不能等于开始'); render(container); return; }
    s.nightEnd = e.target.value;
    saveSettings(s);
  });

  // —— 导出 ——
  container.querySelector('#export-csv').addEventListener('click', () => {
    const records = queryEvents({});
    if (!records.length) return toast('暂无数据');
    downloadCSV(records, 'tick-log.csv');
    toast('已导出 CSV');
  });
  container.querySelector('#export-json').addEventListener('click', () => {
    const records = queryEvents({});
    if (!records.length) return toast('暂无数据');
    downloadJSON(records, 'tick-log.json');
    toast('已导出 JSON');
  });
  container.querySelector('#export-buttons').addEventListener('click', () => {
    const btns = getButtons();
    if (!btns.length) return toast('暂无按钮');
    downloadButtonsJSON(btns, 'tick-log-buttons.json');
    toast('已导出快捷按钮');
  });
  container.querySelector('#export-all').addEventListener('click', () => {
    const records = queryEvents({});
    const btns = getButtons();
    if (!records.length && !btns.length) return toast('暂无数据');
    downloadBackupJSON(records, btns, 'tick-log-all.json');
    toast('已导出全部数据');
  });

  // —— 导入（JSON / CSV / 快捷按钮 / 全部数据） ——
  const fileEl = container.querySelector('#import-file');
  const triggerImport = (type) => { fileEl.dataset.type = type; fileEl.click(); };
  container.querySelector('#import-json').addEventListener('click', () => triggerImport('json'));
  container.querySelector('#import-csv').addEventListener('click', () => triggerImport('csv'));
  container.querySelector('#import-buttons').addEventListener('click', () => triggerImport('buttons'));
  container.querySelector('#import-all').addEventListener('click', () => triggerImport('all'));
  fileEl.addEventListener('change', async () => {
    const f = fileEl.files && fileEl.files[0];
    const type = fileEl.dataset.type || 'json';
    fileEl.value = '';
    if (!f) return;
    let text;
    try {
      text = await f.text();
    } catch (err) {
      toast('文件读取失败');
      return;
    }

    // 全部数据导入（记录 + 快捷按钮）
    if (type === 'all') {
      let parsed;
      try {
        parsed = parseBackupJSON(text);
      } catch (err) {
        toast('备份文件解析失败');
        return;
      }
      const { events, buttons } = parsed;
      if (!events.length && !buttons.length) { toast('未识别到有效数据'); return; }
      const ok = await confirmbox({
        title: '导入全部数据',
        message: `将导入 ${events.length} 条记录、${buttons.length} 个快捷按钮（合并去重，重复自动跳过）。`,
        confirmText: '开始导入'
      });
      if (!ok) return;
      let summary = '';
      if (events.length) {
        const r = importEvents(events);
        summary += `记录 ${r.added} 条${r.skipped ? `，跳过重复 ${r.skipped}` : ''}`;
      }
      if (buttons.length) {
        const r = importButtons(buttons);
        summary += (summary ? '；' : '') + `按钮 新增 ${r.added} 个${r.updated ? `，更新 ${r.updated} 个` : ''}`;
      }
      toast('导入完成：' + summary);
      render(container);
      return;
    }

    // 快捷按钮导入
    if (type === 'buttons') {
      let btns;
      try {
        btns = parseButtonsJSON(text);
      } catch (err) {
        toast('按钮文件解析失败');
        return;
      }
      if (!btns.length) { toast('未识别到按钮数据'); return; }
      const ok = await confirmbox({
        title: '导入快捷按钮',
        message: `将导入 ${btns.length} 个快捷键：同名的更新样式，新名称追加到末尾，并根据需求自动保证至少一个启用。`,
        confirmText: '开始导入'
      });
      if (!ok) return;
      const { added, updated } = importButtons(btns);
      toast(`已导入：新增 ${added} 个${updated ? `，更新 ${updated} 个` : ''}`);
      render(container);
      return;
    }

    // 记录导入（JSON / CSV）
    let records;
    try {
      records = type === 'json' ? parseJSONRecords(text) : parseCSVRecords(text);
    } catch (err) {
      toast('文件解析失败，请检查文件格式');
      return;
    }
    if (!records.length) { toast('未识别到有效记录'); return; }
    const ok = await confirmbox({
      title: '导入确认',
      message: `将导入 ${records.length} 条记录（如「${records[0].name}」）。重复的记录会自动跳过。`,
      confirmText: '开始导入'
    });
    if (!ok) return;
    const { added, skipped } = importEvents(records);
    toast(`已导入 ${added} 条${skipped ? `，跳过重复 ${skipped} 条` : ''}`);
    render(container);
  });

  // —— 清空 ——
  container.querySelector('#clear-all').addEventListener('click', async () => {
    const ok = await confirmbox({ title: '清空全部数据', message: '将删除所有记录且不可恢复！', confirmText: '确认清空', danger: true });
    if (ok) {
      const again = await confirmbox({ title: '再次确认', message: '此操作不可撤销，确定清空？', confirmText: '确认清空', danger: true });
      if (again) {
        clearAllEvents();
        toast('已清空');
      }
    }
  });

  // —— GitHub 云同步 ——
  const setBusy = (id, busy) => {
    const el = container.querySelector('#' + id);
    if (!el) return;
    if (busy) { el.dataset.txt = el.textContent; el.textContent = '处理中…'; }
    else if (el.dataset.txt) el.textContent = el.dataset.txt;
    el.disabled = busy;
  };
  container.querySelector('#gh-save').addEventListener('click', () => {
    saveSyncConfig({
      token: container.querySelector('#gh-token').value.trim(),
      repo: container.querySelector('#gh-repo').value.trim(),
      path: container.querySelector('#gh-path').value.trim() || 'tick-log/data.json'
    });
    toast('同步配置已保存');
  });
  // 保存并同步：先保存当前表单配置，再立即上传一次
  container.querySelector('#gh-save-sync').addEventListener('click', async () => {
    saveSyncConfig({
      token: container.querySelector('#gh-token').value.trim(),
      repo: container.querySelector('#gh-repo').value.trim(),
      path: container.querySelector('#gh-path').value.trim() || 'tick-log/data.json'
    });
    const cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) { toast('请先填写并保存 TOKEN 与仓库'); return; }
    setBusy('gh-save-sync', true);
    try {
      const payload = buildSyncPayload(queryEvents({}), getButtons());
      await pushRemoteFile({ ...cfg, message: 'tick-log 保存并同步', content: payload });
      toast('已保存并同步到 GitHub');
    } catch (err) {
      toast('同步失败：' + err.message);
    } finally {
      setBusy('gh-save-sync', false);
    }
  });
  container.querySelector('#gh-upload').addEventListener('click', async () => {
    const cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) { toast('请先填写并保存同步配置'); return; }
    setBusy('gh-upload', true);
    try {
      const payload = buildSyncPayload(queryEvents({}), getButtons());
      await pushRemoteFile({ ...cfg, message: 'tick-log 自动同步', content: payload });
      toast('已上传到 GitHub');
    } catch (err) {
      toast('上传失败：' + err.message);
    } finally {
      setBusy('gh-upload', false);
    }
  });
  container.querySelector('#gh-download').addEventListener('click', async () => {
    const cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) { toast('请先填写并保存同步配置'); return; }
    setBusy('gh-download', true);
    try {
      const data = await fetchRemoteFile(cfg);
      if (!data) { toast('远程暂无同步数据'); return; }
      const evCount = Array.isArray(data.events) ? data.events.length : 0;
      const btnCount = Array.isArray(data.buttons) ? data.buttons.length : 0;
      if (!evCount && !btnCount) { toast('远程数据无内容'); return; }
      const ok = await confirmbox({
        title: '下载并导入',
        message: `将导入 ${evCount} 条记录、${btnCount} 个快捷按钮（合并去重，不清空本地数据）。`,
        confirmText: '开始导入'
      });
      if (!ok) return;
      let summary = '';
      if (Array.isArray(data.events) && data.events.length) {
        const r = importEvents(data.events);
        summary += `记录 ${r.added} 条${r.skipped ? `，跳过重复 ${r.skipped}` : ''}`;
      }
      if (Array.isArray(data.buttons) && data.buttons.length) {
        const r = importButtons(data.buttons);
        summary += (summary ? '；' : '') + `按钮 新增 ${r.added} 个${r.updated ? `，更新 ${r.updated} 个` : ''}`;
      }
      toast('下载完成：' + summary);
      render(container);
    } catch (err) {
      toast('下载失败：' + err.message);
    } finally {
      setBusy('gh-download', false);
    }
  });
}

/** 弹出颜色选择面板：30 色预设 + 自定义取色器；取消返回 null。 */
function pickColor(current) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">选择按钮颜色</div>
        <div class="palette">${COLORS.map((c) => `
          <button class="swatch-lg" data-color="${c}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="palette-row">
          <input type="color" id="color-custom" class="color-custom" value="${current || COLORS[0]}">
          <label for="color-custom" class="palette-label">自定义颜色</label>
        </div>
        <div class="modal-btns"><button class="modal-btn" data-close="1">取消</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const finish = (v) => { overlay.remove(); resolve(v); };
    overlay.querySelector('#color-custom').addEventListener('input', (e) => finish(e.target.value));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) { finish(null); return; }
      const sw = e.target.closest('.swatch-lg');
      if (sw) finish(sw.dataset.color);
    });
  });
}

/** 弹出图标面板：预设 emoji 宫格 + 自定义输入；取消返回 null。 */
function pickIcon(current) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">选择图标</div>
        <div class="icon-palette">${ICON_LIST.map(([name, label]) => `
          <button class="icon-sel ${name === current ? 'on' : ''}" data-icon="${name}" title="${label}">
            ${iconSvg(name)}<span class="icon-label">${label}</span>
          </button>`).join('')}</div>
        <div class="modal-btns">
          <button class="modal-btn" data-custom="1">自定义图标</button>
          <button class="modal-btn" data-close="1">取消</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', async (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) { overlay.remove(); resolve(null); return; }
      if (e.target.closest('[data-custom]')) {
        overlay.remove();
        const v = await promptbox({ title: '自定义图标', placeholder: '输入一个字符或表情' });
        resolve(v || null);
        return;
      }
      const b = e.target.closest('.icon-sel');
      if (b) { overlay.remove(); resolve(b.dataset.icon); }
    });
  });
}

/**
 * 节点配置弹窗：为过程事件配置 2 个节点（开始/结束）。
 * 两项都填 -> 返回 [start, end]；留空或仅填一项 -> 返回 []（瞬时事件）；取消 -> null。
 */
function nodeConfigDialog(eventName, oldNodes) {
  return new Promise((resolve) => {
    const s0 = (oldNodes && oldNodes[0]) || '';
    const e0 = (oldNodes && oldNodes[1]) || '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">配置过程事件 · ${esc(eventName)}</div>
        <div class="modal-msg modal-form">
          <p class="modal-note">过程事件有两个节点（开始 → 结束），记录时需先记开始、再记结束，从而统计持续时长。留空则为瞬时事件（点一下记一条）。</p>
          <label class="form-row"><span class="form-label">开始节点</span>
            <input id="nc-start" class="modal-input" type="text" value="${esc(s0)}" placeholder="如：吵架"></label>
          <label class="form-row"><span class="form-label">结束节点</span>
            <input id="nc-end" class="modal-input" type="text" value="${esc(e0)}" placeholder="如：和好"></label>
        </div>
        <div class="modal-btns">
          <button class="modal-btn" data-cancel="1">取消</button>
          <button class="modal-btn primary" data-save="1">保存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = (s) => overlay.querySelector(s);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-cancel]')) { overlay.remove(); resolve(null); return; }
      if (e.target.closest('[data-save]')) {
        const s = $('#nc-start').value.trim();
        const en = $('#nc-end').value.trim();
        if (s && en && s === en) { toast('开始与结束节点不能相同'); return; }
        const next = (s && en) ? [s, en] : [];
        overlay.remove();
        resolve(next);
      }
    });
  });
}