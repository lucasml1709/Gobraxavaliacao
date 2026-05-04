// --- THEME ---------------------------------------------------------------------------
function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function toggleTheme() {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('gobrax-theme', next);
  updateThemeBtn(next);
  // Re-render charts with new colors
  renderCharts();
  renderTableEvolutionChart(applyFilters(ALL_DRIVERS));
}

function updateThemeBtn(theme) {
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (theme === 'light') {
    icon.textContent  = '';
    label.textContent = 'Tema Escuro';
  } else {
    icon.textContent  = '';
    label.textContent = 'Tema Claro';
  }
}

// Apply saved theme on load
(function() {
  const saved = localStorage.getItem('gobrax-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtn(saved);
})();

function chartTickColor() {
  return getTheme() === 'light' ? '#7a8aaa' : '#6b7a99';
}
function chartGridColor() {
  return getTheme() === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
}
function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// --- PROCESS DATA --------------------------------------------------------------------
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril'];
const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr'];
const MONTH_KEYS = ['jan', 'fev', 'mar', 'abr'];
const RANKING_MIN_KM = 1500;

function processDrivers(data) {
  return data.map(r => {
    const months = MONTH_KEYS.map(key => r[key]);
    const scores = months.map(m => m?.score ?? null);
    const kms    = months.map(m => m?.km ?? 0);
    const ops    = months.map(m => m?.op ?? null);
    const validScores = scores.filter(s => s !== null);
    const avg = validScores.length ? Math.round(validScores.reduce((a,b)=>a+b,0) / validScores.length) : null;
    const kmTotal = kms.reduce((a,b)=>a+b, 0);
    const first = scores.find(s => s !== null);
    const last  = [...scores].reverse().find(s => s !== null);
    const trend = (first !== null && last !== null && first !== last) ? last - first : 0;
    return {
      name: r.driver,
      scores, kms, ops, kmTotal, avg, trend,
      declined: trend < 0,
      improved: trend > 0,
    };
  }).filter(d => d.avg !== null);
}

const ALL_DRIVERS = processDrivers(DRIVER_DATA);

// --- STATE ---------------------------------------------------------------------------
let currentFilter = 'all';
let currentOp = 'all';
let searchQuery = '';
let sortKey = 'avg';
let sortDir = -1;
let chartDist = null, chartTableEvolution = null, modalChartRef = null;
let tableMonth = 'all';

// --- GLOBAL MONTH FILTER -------------------------------------------------------------
let globalMonth = 'all'; // 'all' or month index from MONTH_KEYS

function setGlobalMonth(month) {
  globalMonth = month;
  // Reset bin filter whenever month changes
  activeBinFilter = null;
  document.querySelectorAll('.bin-filter-tag').forEach(el => el.remove());
  document.querySelectorAll('.month-btn').forEach(b => {
    b.classList.toggle('active', String(b.dataset.month) === String(month));
  });
  // Update subtitle labels
  const monthLabel = month === 'all' ? 'todos os meses' : MONTHS[month];
  document.getElementById('chartDistTitle').textContent =
    month === 'all' ? 'Distribuição de Notas — Todos os Meses' : `Distribuição de Notas — ${MONTHS[month]}`;

  // Re-render everything
  renderKPIs();
  renderCharts();
  renderTable();
}

// Helper: get score for current global month (null if no data)
function monthScore(driver) {
  if (globalMonth === 'all') return driver.avg;
  return driver.scores[globalMonth];
}

// Helper: get km for current global month
function monthKm(driver) {
  if (globalMonth === 'all') return driver.kmTotal;
  return driver.kms[globalMonth] || 0;
}

// Helper: get op for current global month
function monthOp(driver) {
  if (globalMonth === 'all') return driver.ops.find(o => o) || null;
  return driver.ops[globalMonth] || null;
}

function receivesBonus(driver) {
  if (globalMonth === 'all') return driver.scores.some(s => s !== null && s > 80);
  return monthScore(driver) > 80;
}

function neverReceivedBonus(driver) {
  if (globalMonth === 'all') {
    return driver.scores.some(s => s !== null) && driver.scores.every(s => s === null || s <= 80);
  }
  const s = monthScore(driver);
  return s !== null && s <= 80;
}

// --- FILTERS -------------------------------------------------------------------------
function applyFilters(drivers) {
  let filtered = [...drivers];
  const filterMonth = tableMonth;
  const filterScore = (driver) => filterMonth === 'all' ? driver.avg : driver.scores[filterMonth];
  const filterOp = (driver) => filterMonth === 'all' ? driver.ops.find(o => o) || null : driver.ops[filterMonth] || null;
  const filterReceivesBonus = (driver) => {
    if (filterMonth === 'all') return driver.scores.some(s => s !== null && s > 80);
    return filterScore(driver) > 80;
  };
  const filterNeverReceivedBonus = (driver) => {
    if (filterMonth === 'all') {
      return driver.scores.some(s => s !== null) && driver.scores.every(s => s === null || s <= 80);
    }
    const s = filterScore(driver);
    return s !== null && s <= 80;
  };

  // Filter by current month: driver must have data for that month
  if (filterMonth !== 'all') {
    filtered = filtered.filter(d => d.scores[filterMonth] !== null);
  }

  if (currentOp !== 'all') {
    if (filterMonth === 'all') {
      filtered = filtered.filter(d => d.ops.some(op => op && op.includes(currentOp)));
    } else {
      filtered = filtered.filter(d => {
        const op = filterOp(d);
        return op && op.includes(currentOp);
      });
    }
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.ops.some(op => op && op.toLowerCase().includes(q))
    );
  }

  // Bin filter from chart click
  if (activeBinFilter) {
    filtered = filtered.filter(d => {
      const s = filterScore(d);
      return s !== null && s >= activeBinFilter.low && s <= activeBinFilter.high;
    });
  }

  if (currentFilter === 'worst') filtered.sort((a,b) => filterScore(a) - filterScore(b)).splice(50);
  else if (currentFilter === 'best') filtered.sort((a,b) => filterScore(b) - filterScore(a)).splice(50);
  else if (currentFilter === 'declined') {
    if (filterMonth === 'all') filtered = filtered.filter(d => d.declined);
    else if (filterMonth > 0) {
      const mi = filterMonth;
      filtered = filtered.filter(d => d.scores[mi] !== null && d.scores[mi-1] !== null && d.scores[mi] < d.scores[mi-1]);
    }
  }
  else if (currentFilter === 'improved') {
    if (filterMonth === 'all') filtered = filtered.filter(d => d.improved);
    else if (filterMonth > 0) {
      const mi = filterMonth;
      filtered = filtered.filter(d => d.scores[mi] !== null && d.scores[mi-1] !== null && d.scores[mi] > d.scores[mi-1]);
    }
  }
  else if (currentFilter === 'recebe') filtered = filtered.filter(d => filterReceivesBonus(d));
  else if (currentFilter === 'never') {
    filtered = filtered.filter(d => filterNeverReceivedBonus(d));
  }

  return filtered;
}

function setFilter(f) {
  currentFilter = f;
  // Clear bin filter when changing status filter
  activeBinFilter = null;
  document.querySelectorAll('.bin-filter-tag').forEach(el => el.remove());
  // Update item selection
  document.querySelectorAll('#ddStatusMenu .dd-item').forEach(el => el.classList.remove('selected'));
  const sel = document.querySelector(`#ddStatusMenu .dd-item[data-val="${f}"]`);
  if (sel) sel.classList.add('selected');
  // Update trigger label + color
  const labels = { all:'Status', recebe:'💰 Recebem', never:'❌ Nunca receberam', worst:'🔴 Piores notas', best:'🟢 Melhores', declined:'📉 Pioraram', improved:'📈 Melhoraram' };
  const trigger = document.getElementById('ddStatusBtn');
  document.getElementById('ddStatusLabel').textContent = labels[f] || 'Status';
  trigger.className = 'dd-trigger';
  if (f !== 'all') {
    if (f === 'declined' || f === 'worst' || f === 'never') trigger.classList.add('has-filter-red');
    else trigger.classList.add('has-filter-green');
  }
  closeAllDropdowns();
  renderTable();
}

function setOp(op) {
  currentOp = op;
  document.querySelectorAll('#ddOpMenu .dd-item').forEach(el => el.classList.remove('selected'));
  const sel = document.querySelector(`#ddOpMenu .dd-item[data-val="${op}"]`);
  if (sel) sel.classList.add('selected');
  const trigger = document.getElementById('ddOpBtn');
  document.getElementById('ddOpLabel').textContent = op === 'all' ? 'Operação' : op;
  trigger.className = 'dd-trigger';
  if (op !== 'all') trigger.classList.add('has-filter');
  closeAllDropdowns();
  renderTable();
}

function toggleDropdown(id) {
  const menu = document.getElementById(id + 'Menu');
  const btn  = document.getElementById(id + 'Btn');
  const isOpen = menu.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) {
    menu.classList.add('open');
    btn.classList.add('open');
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.dd-menu').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.dd-trigger').forEach(b => b.classList.remove('open'));
}

function onSearch() {
  searchQuery = document.getElementById('searchInput').value.trim();
  renderTable();
}

function setTableMonth(month) {
  tableMonth = month;
  sortKey = month === 'all' ? 'avg' : MONTH_KEYS[month];
  sortDir = -1;
  document.querySelectorAll('#ddTableMonthMenu .dd-item').forEach(el => el.classList.remove('selected'));
  const sel = document.querySelector(`#ddTableMonthMenu .dd-item[data-val="${month}"]`);
  if (sel) sel.classList.add('selected');
  document.getElementById('ddTableMonthLabel').textContent = month === 'all' ? 'Mês tabela' : MONTHS[month];
  const trigger = document.getElementById('ddTableMonthBtn');
  trigger.className = 'dd-trigger';
  if (month !== 'all') trigger.classList.add('has-filter');
  closeAllDropdowns();
  renderTable();
}

// Close dropdowns on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) closeAllDropdowns();
});

// --- SORT -----------------------------------------------------------------------------
function sortBy(key) {
  if (sortKey === key) sortDir *= -1;
  else { sortKey = key; sortDir = -1; }
  renderTable();
}

function sortDrivers(drivers) {
  return [...drivers].sort((a, b) => {
    let va, vb;
    if (sortKey === 'driver') { va = a.name; vb = b.name; return va < vb ? sortDir : va > vb ? -sortDir : 0; }
    if (sortKey === 'gestor') { va = a.gestor||''; vb = b.gestor||''; return va < vb ? sortDir : va > vb ? -sortDir : 0; }
    if (sortKey === 'op') { va = a.op||''; vb = b.op||''; return va < vb ? sortDir : va > vb ? -sortDir : 0; }
    if (sortKey === 'avg') { va = a.avg ?? -1; vb = b.avg ?? -1; }
    else if (MONTH_KEYS.includes(sortKey)) {
      const monthIndex = MONTH_KEYS.indexOf(sortKey);
      va = a.scores[monthIndex] ?? -1;
      vb = b.scores[monthIndex] ?? -1;
    }
    else if (sortKey === 'tableTrend') {
      va = comparisonDelta(a);
      vb = comparisonDelta(b);
    }
    else if (sortKey === 'tableKm') {
      va = tableKm(a);
      vb = tableKm(b);
    }
    else if (sortKey === 'trend') { va = a.trend; vb = b.trend; }
    else if (sortKey === 'km') { va = a.kmTotal; vb = b.kmTotal; }
    else { va = a.avg ?? -1; vb = b.avg ?? -1; }
    return (vb - va) * sortDir;
  });
}

function scoreColor(s) {
  if (s === null) return 'var(--muted)';
  if (s >= 90) return 'var(--green)';
  if (s > 80) return 'var(--accent)';
  if (s >= 70) return 'var(--yellow)';
  return 'var(--red)';
}

function scoreClass(s) {
  if (s === null) return '';
  if (s >= 90) return 'great';
  if (s > 80) return 'good';
  if (s >= 70) return 'medium';
  return 'bad';
}

function tableScore(driver) {
  return tableMonth === 'all' ? monthScore(driver) : driver.scores[tableMonth];
}

function tableKm(driver) {
  return tableMonth === 'all' ? driver.kmTotal : (driver.kms[tableMonth] || 0);
}

function comparisonDelta(driver) {
  if (tableMonth === 'all' || tableMonth === 0) return 0;
  const prev = driver.scores[tableMonth - 1];
  const curr = driver.scores[tableMonth];
  return prev !== null && curr !== null ? curr - prev : 0;
}

function renderTableHeader(hasGestores) {
  const monthHeaders = MONTH_KEYS.map((key, i) =>
    `<th class="right" onclick="sortBy('${key}')">${MONTHS[i]}</th>`
  ).join('');

  const selectedMonthHeaders = tableMonth === 'all'
    ? `${monthHeaders}
      <th class="right" onclick="sortBy('avg')">Média</th>
      <th class="right" onclick="sortBy('trend')">Tendência</th>
      <th class="right" onclick="sortBy('km')">Km Total</th>`
    : `<th class="right" onclick="sortBy('${MONTH_KEYS[tableMonth]}')">${MONTHS[tableMonth]}</th>
      <th class="right" onclick="sortBy('tableTrend')">Comparativo</th>
      <th class="right" onclick="sortBy('tableKm')">Km ${MONTH_SHORT[tableMonth]}</th>`;

  document.getElementById('tableHeaderRow').innerHTML = `
    <th style="width:40px">#</th>
    <th>Motorista</th>
    ${hasGestores ? '<th id="th-gestor" style="font-size:11px">Gestor</th>' : ''}
    ${selectedMonthHeaders}
  `;
}

// --- KPI CARDS -----------------------------------------------------------------------
function renderKPIs() {
  const monthDrivers = ALL_DRIVERS.map(d => {
    const s = monthScore(d);
    const km = monthKm(d);
    const op = monthOp(d);
    return { ...d, _monthScore: s, _monthKm: km, _monthOp: op };
  }).filter(d => d._monthScore !== null);

  // For "improved/declined" we need two-month comparison
  let declinedCount = 0, improvedCount = 0;
  if (globalMonth === 'all') {
    // Original trend: first month vs latest available month
    declinedCount = ALL_DRIVERS.filter(d => d.declined).length;
    improvedCount = ALL_DRIVERS.filter(d => d.improved).length;
  } else {
    // For specific month, show improved as "nota > avg" vs prior month
    const mi = globalMonth;
    if (mi > 0) {
      ALL_DRIVERS.forEach(d => {
        const prev = d.scores[mi - 1];
        const curr = d.scores[mi];
        if (prev !== null && curr !== null) {
          if (curr < prev) declinedCount++;
          if (curr > prev) improvedCount++;
        }
      });
    } else {
      // January - no trend available
    }
  }

  const totalDrivers = monthDrivers.length;
  const avgAll = totalDrivers ? Math.round(monthDrivers.reduce((a, d) => a + d._monthScore, 0) / totalDrivers) : 0;
  const best = monthDrivers
    .filter(d => d._monthKm > RANKING_MIN_KM)
    .sort((a, b) => b._monthScore - a._monthScore || b._monthKm - a._monthKm)[0];
  const recebem = monthDrivers.filter(d => receivesBonus(d)).length;
  const nuncaRecebeu = monthDrivers.filter(d => neverReceivedBonus(d)).length;

  const subSuffix = globalMonth === 'all' ? 'Vínculos ativos (nome + OP)' : MONTHS[globalMonth];
  const trendSuffix = globalMonth === 'all' ? `Evolução entre ${MONTH_SHORT[0]} e ${MONTH_SHORT[MONTH_SHORT.length - 1]}` : globalMonth > 0 ? `vs ${MONTH_SHORT[globalMonth - 1]}` : '—';

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-card accent">
      <div class="kpi-label">Total Motoristas</div>
      <div class="kpi-value">${totalDrivers}</div>
      <div class="kpi-sub">${subSuffix}</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Recebem Bônus</div>
      <div class="kpi-value">${recebem}</div>
      <div class="kpi-sub">Nota acima de 80</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Melhor Motorista</div>
      <div class="kpi-value">${best ? best._monthScore : '—'}</div>
      <div class="kpi-sub" style="max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${best ? best.name : ''}">${best ? best.name : '—'}</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Melhoraram</div>
      <div class="kpi-value">${improvedCount}</div>
      <div class="kpi-sub">${trendSuffix}</div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-label">Motoristas que não receberam</div>
      <div class="kpi-value">${nuncaRecebeu}</div>
      <div class="kpi-sub">Nota ≤80</div>
    </div>
  `;
}

// --- CHARTS --------------------------------------------------------------------------
function renderCharts() {
  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: chartTickColor(), font: { family: 'Barlow', size: 12 } } } }
  };

  // Distribution histogram — use monthScore if globalMonth is set
  const binEdges = [0,10,20,30,40,50,60,70,80,90,101];
  const binLabels = ['0-9','10-19','20-29','30-39','40-49','50-59','60-69','70-79','80-89','90-100'];
  const counts = new Array(10).fill(0);
  ALL_DRIVERS.forEach(d => {
    const s = monthScore(d);
    if (s !== null) {
      const idx = binEdges.findIndex((edge, i) => i < binEdges.length - 1 && s >= binEdges[i] && s < binEdges[i+1]);
      if (idx >= 0) counts[idx]++;
    }
  });

  const colors = binLabels.map((_, i) => {
    const start = i * 10;
    if (start >= 90) return 'rgba(0,230,118,0.8)';
    if (start >= 80) return 'rgba(0,212,255,0.8)';
    if (start >= 60) return 'rgba(255,211,42,0.8)';
    return 'rgba(255,71,87,0.8)';
  });

  if (chartDist) chartDist.destroy();
  chartDist = new Chart(document.getElementById('chartDist'), {
    type: 'bar',
    data: {
      labels: binLabels,
      datasets: [{ label: 'Motoristas', data: counts, backgroundColor: colors, borderRadius: 4, borderSkipped: false }]
    },
    options: {
      ...chartDefaults,
      scales: {
        x: { ticks: { color: chartTickColor(), font: { family: 'Barlow' } }, grid: { color: chartGridColor() } },
        y: { ticks: { color: chartTickColor(), font: { family: 'Barlow' } }, grid: { color: chartGridColor() } }
      },
      plugins: { ...chartDefaults.plugins, legend: { display: false } },
      onClick: (evt, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const low = binEdges[idx];
          const high = binEdges[idx + 1] - 1;
          setBinFilter(low, high);
        } else {
          clearBinFilter();
        }
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    }
  });

  // Top 3
  renderTop3();
}

let activeBinFilter = null;

function setBinFilter(low, high) {
  activeBinFilter = { low, high };
  // Update dropdown filters accordingly
  setFilter('all');
  renderTable();
}

function clearBinFilter() {
  activeBinFilter = null;
  renderTable();
}

// --- BIN FILTER TAG ---
function getBinFilterHtml() {
  if (!activeBinFilter) return '';
  return `<button class="bin-filter-tag" onclick="clearBinFilter()">&times; Notas ${activeBinFilter.low}-${activeBinFilter.high}</button>`;
}

function renderTop3() {
  const top3 = [...ALL_DRIVERS]
    .filter(d => monthScore(d) !== null && monthKm(d) > RANKING_MIN_KM)
    .sort((a, b) => monthScore(b) - monthScore(a) || monthKm(b) - monthKm(a))
    .slice(0, 3);
  const medals = [
    { label: '1°', cls: 'gold',   color: '#ffd700' },
    { label: '2°', cls: 'silver', color: '#c0c0c0' },
    { label: '3°', cls: 'bronze', color: '#cd7f32' },
  ];
  const html = top3.map((d, i) => {
    const m = medals[i];
    const s = monthScore(d);
    const km = monthKm(d);
    const opsStr = globalMonth === 'all'
      ? [...new Set(d.ops.filter(Boolean))].join(', ')
      : (d.ops[globalMonth] || '—');
    const bar = Math.round((s / 100) * 100);
    return `<div class="top3-item" onclick="openModal('${d.name.replace(/'/g,"\\'")}')" style="cursor:pointer">
      <div class="top3-rank ${m.cls}">${m.label}</div>
      <div class="top3-info">
        <div class="top3-name" title="${d.name}">${d.name}</div>
        <div class="top3-detail">${opsStr || '—'} · ${km.toLocaleString('pt-BR',{maximumFractionDigits:0})} km</div>
        <div class="top3-bar-wrap"><div class="top3-bar" style="width:${bar}%;background:${m.color}"></div></div>
      </div>
      <div class="top3-score" style="color:${m.color}">${s}</div>
    </div>`;
  }).join('');
  document.getElementById('top3Container').innerHTML = html;
}

function renderTableEvolutionChart(drivers) {
  const canvas = document.getElementById('chartTableEvolution');
  if (!canvas) return;

  const monthlyAverages = MONTH_KEYS.map((_, mi) => {
    const scores = drivers.map(d => d.scores[mi]).filter(s => s !== null);
    return scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null;
  });
  const monthlyCounts = MONTH_KEYS.map((_, mi) => drivers.filter(d => d.scores[mi] !== null).length);
  const selectedOpLabel = currentOp === 'all' ? 'Todas as operações' : currentOp;
  const selectedMonthLabel = tableMonth === 'all' ? 'todos os meses' : MONTHS[tableMonth];
  document.getElementById('tableEvolutionTitle').textContent =
    `Evolução geral — ${selectedOpLabel} · ${selectedMonthLabel}`;

  const pointColors = monthlyAverages.map((score, mi) => {
    if (tableMonth !== 'all' && mi === tableMonth) return cssColor('--accent2');
    return score === null ? cssColor('--muted') : cssColor(scoreColor(score).match(/--[^)]+/)?.[0] || '--accent');
  });

  if (chartTableEvolution) chartTableEvolution.destroy();
  const barColors = monthlyAverages.map((score, mi) => {
    if (tableMonth !== 'all' && mi === tableMonth) return cssColor('--accent2');
    if (score === null) return 'rgba(107,122,153,0.18)';
    return score >= 90 ? 'rgba(0,230,118,0.72)'
      : score > 80 ? 'rgba(0,212,255,0.72)'
      : score >= 70 ? 'rgba(255,211,42,0.72)'
      : 'rgba(255,71,87,0.72)';
  });

  chartTableEvolution = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: MONTH_SHORT,
      datasets: [{
        label: 'Média',
        data: monthlyAverages,
        backgroundColor: barColors,
        borderColor: pointColors,
        borderWidth: 1,
        borderRadius: 5,
        borderSkipped: false,
        maxBarThickness: 58
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: chartTickColor(), font: { family: 'Barlow' } }, grid: { color: chartGridColor() } },
        y: { min: 0, max: 100, ticks: { color: chartTickColor(), font: { family: 'Barlow' } }, grid: { color: chartGridColor() } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Média: ${ctx.raw ?? '—'}`,
            afterLabel: ctx => `Motoristas: ${monthlyCounts[ctx.dataIndex]}`
          }
        }
      }
    }
  });
}

// --- TABLE ---------------------------------------------------------------------------
function renderTable() {
  let filtered = applyFilters(ALL_DRIVERS);
  if (tableMonth !== 'all') {
    filtered = filtered.filter(d => d.scores[tableMonth] !== null);
  }
  const sorted = sortDrivers(filtered);
  const hasGestores = ALL_DRIVERS.some(x => x.gestor);
  renderTableHeader(hasGestores);
  renderTableEvolutionChart(sorted);

  document.getElementById('countBadge').textContent = `${sorted.length} motoristas`;
  // Bin filter tag
  const badge = document.getElementById('countBadge').parentElement;
  let existingTag = badge.querySelector('.bin-filter-tag');
  if (existingTag) existingTag.remove();
  if (activeBinFilter) {
    badge.insertAdjacentHTML('afterend', getBinFilterHtml());
  }

  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');

  if (!sorted.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = sorted.map((d, i) => {
    const ms = tableScore(d);
    const tableReceivesBonus = tableMonth === 'all' ? receivesBonus(d) : ms > 80;
    const recebeTag = tableReceivesBonus ? `<span class="badge-recebe">✓ recebe</span>` : ``;

    const trendHtml = d.trend > 0
      ? `<span class="trend-up">↑ +${d.trend}</span>`
      : d.trend < 0
        ? `<span class="trend-down">↓ ${d.trend}</span>`
        : `<span class="trend-same" style="font-size:11px">Sem movimentação</span>`;

    const opTagsHtml = (op) => {
      if (!op) return '';
      return op.split(' + ').map(o => {
        const k = o.trim().replace(/\s/g,'_');
        return `<span class="op-tag op-${k}">${o.trim()}</span>`;
      }).join(' ');
    };

    const monthCellHtml = (s, km, op) => {
      if (s === null && !op) return `<td class="right"><div class="month-cell"><span style="font-size:10px;color:var(--muted)">Sem movimentação</span></div></td>`;
      const kmStr = km ? km.toLocaleString('pt-BR', {maximumFractionDigits:0}) + ' km' : '';
      return `<td class="right"><div class="month-cell">
        ${s !== null ? `<span class="month-score" style="color:${scoreColor(s)};background:${scoreColor(s)}22">${s}</span>` : '<span class="month-score ms-null">—</span>'}
        ${kmStr ? `<span class="month-km-sub">${kmStr}</span>` : ''}
        ${op ? `<div style="margin-top:3px">${opTagsHtml(op)}</div>` : ''}
      </div></td>`;
    };

    const comparisonHtml = () => {
      if (tableMonth === 'all') return '';
      if (tableMonth === 0) {
        return `<td class="right">
          <div class="evolution-cell empty">
            <div class="evolution-main"><span class="evolution-delta">—</span></div>
            <div class="evolution-note">Sem mês anterior</div>
          </div>
        </td>`;
      }
      const prev = d.scores[tableMonth - 1];
      const curr = d.scores[tableMonth];
      const label = `${MONTH_SHORT[tableMonth - 1]} → ${MONTH_SHORT[tableMonth]}`;
      if (prev === null || curr === null) {
        return `<td class="right">
          <div class="evolution-cell empty">
            <div class="evolution-main"><span class="evolution-delta">—</span></div>
            <div class="evolution-note">${label}: sem base</div>
          </div>
        </td>`;
      }
      const delta = curr - prev;
      const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
      const deltaLabel = delta > 0 ? `+${delta}` : String(delta);
      const status = delta > 0 ? 'Melhorou' : delta < 0 ? 'Diminuiu' : 'Sem alteração';
      return `<td class="right">
        <div class="evolution-cell ${cls}">
          <div class="evolution-main">
            <span class="evolution-delta">${deltaLabel}</span>
            <div class="evolution-track" title="${MONTH_SHORT[tableMonth - 1]}: ${prev} · ${MONTH_SHORT[tableMonth]}: ${curr}">
              <span class="evolution-prev" style="width:${prev}%"></span>
              <span class="evolution-curr" style="width:${curr}%"></span>
            </div>
          </div>
          <div class="evolution-label">${label} · ${status}</div>
        </div>
      </td>`;
    };

    const monthCellsHtml = tableMonth === 'all'
      ? `${MONTH_KEYS.map((_, mi) => monthCellHtml(d.scores[mi], d.kms[mi], d.ops[mi])).join('')}
        <td class="right"><span class="score-pill ${scoreClass(ms)}">${ms !== null ? ms : '—'}</span></td>
        <td class="right">${trendHtml}</td>
        <td class="right" style="color:var(--muted);font-size:12px;font-family:'JetBrains Mono',monospace">${d.kmTotal ? d.kmTotal.toLocaleString('pt-BR', {maximumFractionDigits:0}) + ' km' : '<span style="font-size:11px">Sem movimentação</span>'}</td>`
      : `${monthCellHtml(d.scores[tableMonth], d.kms[tableMonth], d.ops[tableMonth])}
        ${comparisonHtml()}
        <td class="right" style="color:var(--muted);font-size:12px;font-family:'JetBrains Mono',monospace">${tableKm(d) ? tableKm(d).toLocaleString('pt-BR', {maximumFractionDigits:0}) + ' km' : '<span style="font-size:11px">Sem movimentação</span>'}</td>`;

    return `<tr onclick="openModal('${d.name.replace(/'/g,"\\'")}')">
      <td style="color:var(--muted);font-size:12px;width:40px">${i+1}</td>
      <td class="driver-name">${d.name}${recebeTag}</td>
      ${hasGestores ? `<td style="font-size:12px;color:var(--muted)">${d.gestor || '—'}</td>` : ''}
      ${monthCellsHtml}
    </tr>`;
  }).join('');
}

// --- MODAL ---------------------------------------------------------------------------
function openModal(name) {
  const d = ALL_DRIVERS.find(x => x.name === name);
  if (!d) return;

  document.getElementById('modalName').textContent = d.name;
  const recebeStatus = receivesBonus(d) ? '✓ Recebe bônus' : '✗ Não recebe bônus';
  const recebeColor = receivesBonus(d) ? 'var(--green)' : 'var(--red)';
  document.getElementById('modalSub').innerHTML = `Média: <strong>${d.avg}</strong> pts · ${d.kmTotal.toLocaleString('pt-BR',{maximumFractionDigits:0})} km rodados · <span style="color:${recebeColor};font-weight:600">${recebeStatus}</span>`;

  const monthsHtml = MONTHS.map((m, i) => {
    const s  = d.scores[i];
    const km = d.kms[i];
    const op = d.ops[i];
    const color = s !== null ? scoreColor(s) : 'var(--muted)';
    const opTagsHtml = op ? op.split(' + ').map(o => {
      const k = o.trim().replace(/\s/g,'_');
      return `<span class="op-tag op-${k}">${o.trim()}</span>`;
    }).join(' ') : '';
    return `<div class="modal-month-card">
      <div class="modal-month-name">${m}</div>
      <div class="modal-month-score" style="color:${color}">${s ?? '—'}</div>
      <div class="modal-month-km">${km ? km.toLocaleString('pt-BR',{maximumFractionDigits:1}) + ' km' : 'Sem movimentação'}</div>
      ${opTagsHtml ? `<div style="margin-top:6px">${opTagsHtml}</div>` : ''}
    </div>`;
  }).join('');
  document.getElementById('modalMonths').innerHTML = monthsHtml;

  // Modal chart
  const mainColor = scoreColor(d.avg);
  const bgColorMap = { 'var(--green)': 'rgba(0,230,118,0.15)', 'var(--accent)': 'rgba(0,212,255,0.15)', 'var(--yellow)': 'rgba(255,211,42,0.15)', 'var(--red)': 'rgba(255,71,87,0.15)' };
  if (modalChartRef) modalChartRef.destroy();
  const ctx = document.getElementById('modalChart');
  modalChartRef = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTH_SHORT,
      datasets: [{
        label: 'Nota',
        data: d.scores,
        borderColor: mainColor,
        backgroundColor: bgColorMap[mainColor] || 'rgba(0,212,255,0.15)',
        pointBackgroundColor: d.scores.map(s => s !== null ? scoreColor(s) : 'transparent'),
        pointRadius: 7,
        tension: 0.3,
        fill: true,
        spanGaps: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: chartTickColor(), font: { family: 'Barlow', size: 13 } }, grid: { color: chartGridColor() } },
        y: { min: 0, max: 100, ticks: { color: chartTickColor(), font: { family: 'Barlow' } }, grid: { color: chartGridColor() } }
      },
      plugins: { legend: { display: false } }
    }
  });

  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModalBtn();
}
function closeModalBtn() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// --- WORST 20 -------------------------------------------------------------------------
let currentWorstOp = 'all';
let currentWorstMonth = 'all';

function setWorstMonth(month) {
  currentWorstMonth = month;
  document.querySelectorAll('#ddWorstMonthMenu .dd-item').forEach(el => el.classList.remove('selected'));
  const sel = document.querySelector(`#ddWorstMonthMenu .dd-item[data-val="${month}"]`);
  if (sel) sel.classList.add('selected');
  document.getElementById('ddWorstMonthLabel').textContent = month === 'all' ? 'Mês' : MONTHS[month];
  const btn = document.getElementById('ddWorstMonthBtn');
  btn.className = 'dd-trigger' + (month !== 'all' ? ' has-filter' : '');
  closeAllDropdowns();
  renderWorst20();
}

function setWorstOp(op) {
  currentWorstOp = op;
  document.querySelectorAll('#ddWorstOpMenu .dd-item').forEach(el => el.classList.remove('selected'));
  const sel = document.querySelector(`#ddWorstOpMenu .dd-item[data-val="${op}"]`);
  if (sel) sel.classList.add('selected');
  document.getElementById('ddWorstOpLabel').textContent = op === 'all' ? 'Operação' : op;
  const btn = document.getElementById('ddWorstOpBtn');
  btn.className = 'dd-trigger' + (op !== 'all' ? ' has-filter' : '');
  closeAllDropdowns();
  renderWorst20();
}

function renderWorst20() {
  const grid = document.getElementById('worstGrid');
  const mi = currentWorstMonth;

  let candidates;
  if (mi === 'all') {
    candidates = ALL_DRIVERS
      .filter(d => {
        const opOk = currentWorstOp === 'all' ? true : d.ops.some(op => op && op.includes(currentWorstOp));
        return d.avg !== null && d.avg < 80 && d.kmTotal > 1500 && opOk;
      })
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 20)
      .map(d => ({ name: d.name, score: d.avg, km: d.kmTotal }));
  } else {
    candidates = ALL_DRIVERS
      .filter(d => {
        const s = d.scores[mi];
        const km = d.kms[mi];
        const op = d.ops[mi];
        const opOk = currentWorstOp === 'all' ? true : (op && op.includes(currentWorstOp));
        return s !== null && s < 80 && km > 1500 && opOk;
      })
      .sort((a, b) => a.scores[mi] - b.scores[mi])
      .slice(0, 20)
      .map(d => ({ name: d.name, score: d.scores[mi], km: d.kms[mi] }));
  }

  // Update subtitle
  const monthLabel = mi === 'all' ? 'todos os meses' : MONTHS[mi];
  const opLabel = currentWorstOp === 'all' ? 'todas as operações' : currentWorstOp;
  document.getElementById('worstSubtitle').textContent = `· Nota inferior a 80 e mínimo 1.500 km rodados · ${monthLabel} · ${opLabel}`;

  if (!candidates.length) {
    grid.innerHTML = `<div class="worst-empty">🎉 Nenhum motorista com nota &lt; 80 e mais de 1.500 km neste filtro.</div>`;
    return;
  }

  grid.innerHTML = `<div class="worst-grid">` +
    candidates.map((c, i) => {
      const kmLabel = c.km ? c.km.toLocaleString('pt-BR', {maximumFractionDigits: 0}) + ' km' : '—';
      return `<div class="worst-item" onclick="openModal('${c.name.replace(/'/g,"\\'")}')">
        <div class="worst-rank">${i + 1}°</div>
        <div class="worst-info">
          <div class="worst-name" title="${c.name}">${c.name}</div>
          <div class="worst-km">${kmLabel}</div>
        </div>
        <div class="worst-score-pill">${c.score}</div>
      </div>`;
    }).join('') +
  `</div>`;
}

// --- INIT ----------------------------------------------------------------------------
renderKPIs();
renderCharts();
renderWorst20();
renderTable();
