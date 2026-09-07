'use strict';

import * as core from '../core/stats.js';
import * as iv from '../core/interval.js';
import * as sess from '../core/session.js';
import { getButtons, getSettings, queryEvents, removeEvent, getEventNodes, querySessions } from '../utils/db.js';
import { formatFull, formatHM, formatGapText } from '../utils/time.js';
import { drawBarChart, indexAtX, drawLineChart } from '../utils/canvasChart.js';
import { esc, listDialog, toast, confirmbox } from '../utils/ui.js';

const DAY = 24 * 3600 * 1000;
const RANGES = { week: '周', month: '月', year: '年' };
const ALL = '__all__';

let viewEl = null; // 供删除后刷新当前统计视图
let curOffset = 0; // 周期偏移：0=当前周/月/年（距离现在最近），-1=上一期，+1=下一期
let curChartMode = 'freq'; // 'freq' 频率柱状图 | 'duration' 时长折线（仅过程事件）

/** 由偏移量计算目标周期的锚点时间戳（落在该周期内即可）。 */
function periodAnchor(range, offset) {
  const now = new Date();
  if (range === 'week') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset * 7).getTime();
  }
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth() + offset, 1).getTime();
  }
  return new Date(now.getFullYear() + offset, 0, 1).getTime();
}

/** 周期显示文本：周 -> "M月D日 – M月D日"，月 -> "YYYY年M月"，年 -> "YYYY年"。 */
function periodLabel(range, offset) {
  const anchor = new Date(periodAnchor(range, offset));
  if (range === 'week') {
    const dow = anchor.getDay();
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const md = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
    return md(monday) + ' – ' + md(sunday);
  }
  if (range === 'month') return anchor.getFullYear() + '年' + (anchor.getMonth() + 1) + '月';
  return anchor.getFullYear() + '年';
}

export function render(container) {
  viewEl = container;
  const buttons = getButtons().filter((b) => b.enabled);
  const state = { active: getActive(buttons), range: getRange(), offset: curOffset };
  // 「全部」汇总在第一位，默认选中，一眼看到所有记录
  const chips = [{ name: ALL, label: '全部', color: '#9aa0a6', dark: '#2b2b2b' }]
    .concat(buttons.map((b) => ({ name: b.name, label: b.name, color: b.color })));
  // 过程事件（有节点）才提供"时长"视图
  const showModeSwitch = state.active !== ALL && !!getEventNodes(state.active);

  container.innerHTML = `
    <div class="page">
      <div class="chips">${chips.map((c) => {
    const on = c.name === state.active;
    const color = on ? (c.dark || c.color) : '#666';
    const border = c.color && c.name !== ALL ? c.color : '#c5c8cb';
    return `<button class="chip ${on ? 'on' : ''}" data-name="${esc(c.name)}"
      style="border-color:${border};color:${color}">${esc(c.label)}</button>`;
  }).join('')}</div>
      <div class="seg">${Object.entries(RANGES).map(([k, label]) => `
        <button class="seg-item ${k === state.range ? 'on' : ''}" data-range="${k}">${label}</button>`).join('')}
      </div>
      ${showModeSwitch ? `
      <div class="seg seg-mini">
        <button class="seg-item ${curChartMode === 'freq' ? 'on' : ''}" data-cmode="freq">频率</button>
        <button class="seg-item ${curChartMode === 'duration' ? 'on' : ''}" data-cmode="duration">时长</button>
      </div>` : ''}
      <div class="period-nav">
        <button class="pn-btn" id="period-prev" aria-label="上一${RANGES[state.range]}">◀</button>
        <span class="period-label" id="period-label"></span>
        <button class="pn-btn" id="period-next" aria-label="下一${RANGES[state.range]}">▶</button>
      </div>
      <div id="stats-body"></div>
    </div>`;

  container.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    location.hash = '#/stats?event=' + encodeURIComponent(c.dataset.name);
  }));
  container.querySelectorAll('.seg-item').forEach((s) => s.addEventListener('click', () => {
    if (s.dataset.cmode) {
      curChartMode = s.dataset.cmode;
      drawStats(container, state);
      return;
    }
    setRange(s.dataset.range);
    curOffset = 0; // 切换周/月/年粒度后回到当前周期
    render(container);
  }));
  container.querySelector('#period-prev').addEventListener('click', () => {
    curOffset -= 1;
    render(container);
  });
  container.querySelector('#period-next').addEventListener('click', () => {
    curOffset += 1;
    render(container);
  });

  drawStats(container, state);
}

/**
 * 选择统计范围：
 * 1) URL 显式指定（?event=具体事件 或 ?event=__all__）；
 * 2) 默认「全部」——汇总所有事件的记录，避免"只看到最近一次"的误解。
 */
export function getActive(buttons) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const name = q.get('event');
  if (name === ALL) return ALL;
  if (name && buttons.some((b) => b.name === name)) return name;
  return ALL;
}

function getRange() {
  const saved = sessionStorage.getItem('statsRange');
  return RANGES[saved] ? saved : 'week';
}

function setRange(r) {
  sessionStorage.setItem('statsRange', r);
}

function drawStats(container, state) {
  const body = container.querySelector('#stats-body');
  const isAll = state.active === ALL;

  // 周期标签 + 锚点（支持前后翻页，默认当前周期）
  const labelEl = container.querySelector('#period-label');
  if (labelEl) labelEl.textContent = periodLabel(state.range, state.offset);
  const anchor = periodAnchor(state.range, state.offset);

  // 过程事件 + "时长"模式 -> 时长折线（会话持续时间）
  if (!isAll && curChartMode === 'duration') {
    drawDurationStats(container, state, anchor);
    return;
  }

  const settings = getSettings();
  // 「全部」不过滤事件；单个事件按 name 过滤
  const records = isAll ? queryEvents({}) : queryEvents({ name: state.active });
  const r = core.computeRange(records, state.range, anchor);
  const last = core.lastOccurrence(records);
  // 平均间隔 / 间隔分析仅对同一事件有意义，全部视图不计算
  const avg = isAll ? null : iv.avgInterval(records, settings);
  const dist = isAll ? [] : iv.intervalDistribution(records, settings, 10);
  // 总次数 = 所选周期内的次数（r.counts 已按周期桶聚合）
  const total = r.counts.reduce((a, b) => a + b, 0);
  const daily = total ? (total / r.totalDays).toFixed(1) : '0';
  const chip = getButtons().filter((b) => b.enabled).find((b) => b.name === state.active);
  const singleColor = isAll ? '#2b2b2b' : (chip && chip.color) || '#4ECDC4';
  const tickEvery = state.range === 'week' ? 1 : state.range === 'month' ? 5 : 3;

  if (!total) {
    const label = isAll ? '全部' : state.active;
    const hasAny = queryEvents({}).length > 0;
    body.innerHTML = hasAny
      ? `<div class="empty-tip">「${esc(label)}」在 ${periodLabel(state.range, state.offset)} 暂无记录<br><span class="tip-sub">全应用已有 ${queryEvents({}).length} 条记录，可点上方标签切换其他事件</span></div>`
      : '<div class="empty-tip">还没有任何记录，去首页记一件吧</div>';
    return;
  }

  // —— 图表绘图数据 ——
  // 全部视图：按事件分组堆叠（同一天各事件分段着色）；单事件视图：单序列
  let series;
  let bucketTs;
  let axisLabels;
  let legendHtml = '';
  if (isAll) {
    const names = [...new Set(records.map((x) => x.name))];
    const evs = names.map((name) => ({
      name,
      records: records.filter((x) => x.name === name),
      color: colorOf(name)
    }));
    const comp = core.computeSeries(evs, state.range, anchor);
    series = comp.series;
    bucketTs = comp.bucketTs;
    axisLabels = comp.axisLabels;
    if (comp.series.length > 1) {
      legendHtml = `<div class="legend">${comp.series.map((s) => `
        <span class="lg"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
    }
  } else {
    series = [{ name: state.active, color: singleColor, counts: r.counts }];
    bucketTs = r.bucketTs;
    axisLabels = r.axisLabels;
  }

  const distCard = isAll ? '' : `
    <div class="card">
      <div class="dist-head" id="dist-toggle">
        <span>间隔分布（最近 ${dist.length} 次）</span><span class="arrow" id="dist-arrow">▸</span>
      </div>
      <div id="dist-list" class="dist-list hidden"></div>
    </div>`;

  body.innerHTML = `
    <div class="cards">
      <div class="card"><b class="num">${total}</b><span class="lbl">总次数</span></div>
      <div class="card"><b class="num">${daily}</b><span class="lbl">日均</span></div>
      <div class="card"><b class="num num-sm">${last ? last.text : '-'}</b><span class="lbl">最近一次</span></div>
      <div class="card"><b class="num num-sm">${avg ? avg.text : '-'}</b><span class="lbl">平均间隔</span></div>
    </div>
    <div class="card chart-card">
      ${legendHtml}
      <canvas id="chart" class="chart" style="height:320px"></canvas>
      <div class="chart-tip">点击柱子查看当日明细${isAll ? '（全部事件）' : ''}</div>
    </div>
    ${distCard}`;

  setupChart(container, { series, axisLabels, bucketTs, tickEvery, active: isAll ? null : state.active });
  if (!isAll) setupDistList(container, dist);
}

/** 由按钮配色查事件颜色（含已隐藏按钮），未知事件用默认色。 */
function colorOf(name) {
  const b = getButtons().find((x) => x.name === name);
  return (b && b.color) || '#4ECDC4';
}

/** 过程事件"时长"视图：会话持续时间折线图 + 会话指标。 */
function drawDurationStats(container, state, anchor) {
  const body = container.querySelector('#stats-body');
  const sessions = querySessions(state.active);
  const ds = sess.durationSeries(sessions, state.range, anchor);
  const closed = sessions.filter((s) => s.durationMs != null);

  const periodCount = ds.counts.reduce((a, b) => a + b, 0);
  const periodSum = ds.sums.reduce((a, b) => a + b, 0);
  const lastEnd = closed.length ? Math.max(...closed.map((s) => s.end)) : null;
  const avgMs = periodCount ? periodSum / periodCount : 0;
  const totalAvgMs = closed.length ? closed.reduce((a, s) => a + s.durationMs, 0) / closed.length : 0;
  const color = colorOf(state.active);
  const tickEvery = state.range === 'week' ? 1 : state.range === 'month' ? 5 : 3;
  // 折线值转小时
  const valuesH = ds.avgs.map((ms) => (ms ? ms / 3600000 : 0));
  const avgLineH = totalAvgMs ? totalAvgMs / 3600000 : 0;

  if (!closed.length) {
    body.innerHTML = `<div class="empty-tip">「${esc(state.active)}」还没有已结束的过程<br><span class="tip-sub">记录开始与结束节点后，这里展示每次的持续时长</span></div>`;
    return;
  }

  body.innerHTML = `
    <div class="cards">
      <div class="card"><b class="num">${periodCount}</b><span class="lbl">会话次数</span></div>
      <div class="card"><b class="num num-sm">${periodCount ? formatGapText(avgMs) : '-'}</b><span class="lbl">平均时长</span></div>
      <div class="card"><b class="num num-sm">${lastEnd ? core.formatRelative(Date.now() - lastEnd) : '-'}</b><span class="lbl">最近结束</span></div>
      <div class="card"><b class="num num-sm">${periodSum ? formatGapText(periodSum) : '-'}</b><span class="lbl">总时长</span></div>
    </div>
    <div class="card chart-card">
      <canvas id="chart" class="chart" style="height:320px"></canvas>
      <div class="chart-tip">折线：该周期内每次过程的持续时长（虚线为总体平均）</div>
    </div>`;

  setupDurationChart(container, { labels: ds.axisLabels, values: valuesH, color, avgLine: avgLineH, tickEvery });
}

function setupDurationChart(container, { labels, values, color, avgLine, tickEvery }) {
  const canvas = container.querySelector('#chart');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || container.querySelector('.chart-card').clientWidth - 24;
  const h = 320;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  drawLineChart(ctx, { width: w, height: h, labels, values, color, avgLine, tickEvery });
}

function setupChart(container, { series, axisLabels, bucketTs, tickEvery, active }) {
  const canvas = container.querySelector('#chart');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || container.querySelector('.chart-card').clientWidth - 24;
  const h = 320;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  drawBarChart(ctx, { width: w, height: h, labels: axisLabels, series, tickEvery });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const idx = indexAtX(e.clientX - rect.left, w, series && series[0] ? series[0].counts.length : 0);
    if (idx < 0 || !bucketTs[idx]) return;
    const fromTs = bucketTs[idx];
    // active 为 null 时 queryEvents 不过滤事件名 -> 当日全部记录
    const dayStats = queryEvents({ name: active, fromTs, toTs: fromTs + DAY - 1 });
    if (!dayStats.length) return;
    listDialog({
      title: axisLabels[idx] + '的记录（' + dayStats.length + ' 条）',
      items: dayStats.map((x) => ({ id: x.id, label: x.name + ' ' + formatHM(x.ts) })),
      onDelete: async (item) => {
        const ok = await confirmbox({ title: '删除记录', message: '确认删除这条记录？', danger: true });
        if (ok) {
          removeEvent(item.id);
          toast('已删除');
          render(viewEl);
        }
      }
    });
  });
}

function setupDistList(container, dist) {
  const head = container.querySelector('#dist-toggle');
  const list = container.querySelector('#dist-list');
  const arrow = container.querySelector('#dist-arrow');
  head.addEventListener('click', () => {
    const hidden = list.classList.toggle('hidden');
    arrow.textContent = hidden ? '▸' : '▾';
  });
  if (!dist.length) {
    list.innerHTML = '<div class="dist-row dist-none">记录不足两条，暂无间隔分析</div>';
    return;
  }
  list.innerHTML = dist.map((d) => `
    <div class="dist-row">${formatFull(d.fromTs)} → ${formatFull(d.toTs)}，间隔 ${d.text}</div>`).join('');
}