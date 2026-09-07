'use strict';

const PAD_L = 6;
const PAD_R = 6;

/**
 * Canvas 2D 手绘柱状图，坐标使用 CSS 像素。
 * 支持两种输入：
 * - 单序列：opts.counts + opts.color
 * - 多序列堆叠：opts.series = [{ name?, color, counts: number[] }]（同一天各事件分段着色）
 * opts: { width, height, labels, counts, color, series, tickEvery }
 */
export function drawBarChart(ctx, opts) {
  const {
    width, height, labels, counts, series, color,
    tickEvery = 1
  } = opts || {};
  const padT = 24;
  const padB = 26;

  const stacked = !counts && series && series.length;
  const n = counts ? counts.length : (stacked && series[0].counts ? series[0].counts.length : 0);
  if (!n) return;

  const totals = counts
    ? counts.slice()
    : series[0].counts.map((_, i) => series.reduce((s, se) => s + (se.counts[i] || 0), 0));

  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const plotH = Math.max(10, height - padT - padB);
  const max = Math.max(1, ...totals);

  ctx.clearRect(0, 0, width, height);

  // 网格线 + y 轴刻度（4 档）
  ctx.font = '10px sans-serif';
  ctx.strokeStyle = '#ececec';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const ratio = g / 3;
    const baseline = padT + plotH;
    const y = baseline - plotH * ratio;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y + 8);
    ctx.lineTo(PAD_L + plotW, y + 8);
    ctx.stroke();
    ctx.fillStyle = '#b0b0b0';
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.round(max * ratio)), PAD_L, y + 12);
  }

  const colW = plotW / n;
  const barW = Math.max(3, Math.min(colW * 0.6, 26));
  const baseline = padT + plotH;

  const stackSeries = stacked
    ? series
    : [{ color: color || '#4ECDC4', counts: counts || [] }];

  for (let i = 0; i < n; i++) {
    const x = PAD_L + i * colW + (colW - barW) / 2;
    const total = totals[i] || 0;

    if (total > 0) {
      // 从基线向上堆叠各事件段
      let offset = 0;
      stackSeries.forEach((se) => {
        const c = (se.counts && se.counts[i]) || 0;
        if (c <= 0) return;
        const segH = (c / max) * plotH;
        const y = baseline - offset - segH;
        ctx.fillStyle = se.color;
        ctx.beginPath();
        ctx.rect(x, y, barW, segH);
        ctx.fill();
        offset += segH;
      });
      // 柱顶总数
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.fillText(String(total), x + barW / 2, baseline - offset - 4);
    }

    // x 轴标签抽稀
    const label = labels && labels[i];
    if (label && i % tickEvery === 0) {
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.fillText(label, PAD_L + i * colW + colW / 2, baseline + 12);
    }
  }
}

/**
 * 按点击 x（CSS 像素）反查柱索引；未命中返回 -1。
 */
export function indexAtX(x, width, count) {
  const plotW = Math.max(10, width - PAD_L - PAD_R);
  if (x < PAD_L || x > PAD_L + plotW || !count) return -1;
  return Math.min(count - 1, Math.floor((x - PAD_L) / (plotW / count)));
}

function fmtHours(h) {
  if (h < 0.1) return String(Math.round(h * 60)) + 'm';
  return (Math.round(h * 10) / 10) + 'h';
}

/**
 * Canvas 2D 手绘折线图（用于过程事件"持续时长"）。
 * values 为每个桶的数值（小时）；avgLine 为平均参考线（小时）。
 */
export function drawLineChart(ctx, opts) {
  const { width, height, labels, values, color = '#2b2b2b', tickEvery = 1, avgLine = 0 } = opts || {};
  const padT = 24;
  const padB = 26;
  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const plotH = Math.max(10, height - padT - padB);
  const n = values ? values.length : 0;
  if (!n) return;
  const max = Math.max(0.5, ...values, avgLine);

  ctx.clearRect(0, 0, width, height);
  ctx.font = '10px sans-serif';

  // 网格 + y 轴刻度
  ctx.strokeStyle = '#ececec';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const ratio = g / 3;
    const y = padT + plotH - plotH * ratio;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y + 8);
    ctx.lineTo(PAD_L + plotW, y + 8);
    ctx.stroke();
    ctx.fillStyle = '#b0b0b0';
    ctx.textAlign = 'left';
    ctx.fillText(fmtHours(max * ratio), PAD_L, y + 12);
  }

  const colW = plotW / n;
  const baseline = padT + plotH;
  const xAt = (i) => PAD_L + i * colW + colW / 2;
  const yAt = (v) => baseline - (v / max) * plotH;

  // 平均参考虚线
  if (avgLine > 0) {
    ctx.strokeStyle = '#c5c8cb';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD_L, yAt(avgLine));
    ctx.lineTo(PAD_L + plotW, yAt(avgLine));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#999';
    ctx.textAlign = 'left';
    ctx.fillText('平均', PAD_L + 2, yAt(avgLine) - 4);
  }

  // 折线
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 数据点 + 数值
  values.forEach((v, i) => {
    if (v <= 0) return;
    const x = xAt(i);
    const y = yAt(v);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText(fmtHours(v), x, y - 6);
  });

  // x 轴标签抽稀
  if (labels) {
    labels.forEach((l, i) => {
      if (l && i % tickEvery === 0) {
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.fillText(l, xAt(i), baseline + 12);
      }
    });
  }
}

export const CHART_PAD_L = PAD_L;
export const CHART_PAD_R = PAD_R;