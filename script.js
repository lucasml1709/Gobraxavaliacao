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

// --- PROCESS DATA --------------------------------------------------------------------
const MONTHS = ['Janeiro', 'Fevereiro', 'Março'];
const MONTH_SHORT = ['Jan', 'Fev', 'Mar'];
const MONTH_KEYS = ['jan', 'fev', 'mar'];

function processDrivers(data) {
  return data.map(r => {
    const months = [r.jan, r.fev, r.mar];
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
let chartDist = null, modalChartRef = null;

// --- FILTERS -------------------------------------------------------------------------
function applyFilters(drivers) {
  let filtered = [...drivers];

  if (currentOp !== 'all') {
    filtered = filtered.filter(d => d.ops.some(op => op && op.includes(currentOp)));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.ops.some(op => op && op.toLowerCase().includes(q))
    );
  }

  if (currentFilter === 'worst') filtered.sort((a,b) => a.avg - b.avg).splice(50);
  else if (currentFilter === 'best') filtered.sort((a,b) => b.avg - a.avg).splice(50);
  else if (currentFilter === 'declined') filtered = filtered.filter(d => d.declined);
  else if (currentFilter === 'improved') filtered = filtered.filter(d => d.improved);
  else if (currentFilter === 'recebe') filtered = filtered.filter(d => d.avg > 80);
  else if (currentFilter === 'never') filtered = filtered.filter(d => d.scores.every(s => s === null || s <= 80));

  return filtered;
}

function setFilter(f) {
  currentFilter = f;
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
    else if (sortKey === 'jan') { va = a.scores[0] ?? -1; vb = b.scores[0] ?? -1; }
    else if (sortKey === 'fev') { va = a.scores[1] ?? -1; vb = b.scores[1] ?? -1; }
    else if (sortKey === 'mar') { va = a.scores[2] ?? -1; vb = b.scores[2] ?? -1; }
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

// --- KPI CARDS -----------------------------------------------------------------------
function renderKPIs() {
  const totalDrivers = ALL_DRIVERS.length;
  const avgAll = Math.round(ALL_DRIVERS.reduce((a,d) => a + d.avg, 0) / totalDrivers);
const best = [...ALL_DRIVERS].sort((a,b) => b.avg - a.avg || b.kmTotal - a.kmTotal)[0];
  const declined = ALL_DRIVERS.filter(d => d.declined).length;
  const recebem = ALL_DRIVERS.filter(d => d.avg > 80).length;
  const nuncaRecebeu = ALL_DRIVERS.filter(d => d.scores.every(s => s === null || s <= 80)).length;

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-card accent">
      <div class="kpi-label">Total Motoristas</div>
      <div class="kpi-value">${totalDrivers}</div>
      <div class="kpi-sub">Vínculos ativos (nome + OP)</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Recebem Bônus</div>
      <div class="kpi-value">${recebem}</div>
      <div class="kpi-sub">Nota média acima de 80</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Melhor Motorista</div>
      <div class="kpi-value">${best.avg}</div>
      <div class="kpi-sub" style="max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${best.name}">${best.name}</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-label">Pioraram</div>
      <div class="kpi-value">${declined}</div>
      <div class="kpi-sub">Queda entre Jan e Mar</div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-label">Nunca Receberam</div>
      <div class="kpi-value">${nuncaRecebeu}</div>
      <div class="kpi-sub">Nota ≤80 em todos os meses</div>
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

  // Distribution histogram — 1 motorista = 1 contagem pela média
  const binEdges = [0,10,20,30,40,50,60,70,80,90,101];
  const binLabels = ['0-9','10-19','20-29','30-39','40-49','50-59','60-69','70-79','80-89','90-100'];
  const counts = new Array(10).fill(0);
  ALL_DRIVERS.forEach(d => {
    if (d.avg !== null) {
      const idx = binEdges.findIndex((edge, i) => i < binEdges.length - 1 && d.avg >= binEdges[i] && d.avg < binEdges[i+1]);
      if (idx >= 0) counts[idx]++;
    }
  });

  const colors = binLabels.map((_, i) => {
    const start = i * 10;
    if (start >= 90) return 'rgba(0,230,118,0.8)';   // 90-100 verde
    if (start >= 80) return 'rgba(0,212,255,0.8)';   // 80-89 azul (recebem se >80)
    if (start >= 60) return 'rgba(255,211,42,0.8)';  // 60-79 amarelo
    return 'rgba(255,71,87,0.8)';                     // <60 vermelho
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
      plugins: { ...chartDefaults.plugins, legend: { display: false } }
    }
  });

  // Top 3
  renderTop3();
}

function renderTop3() {
  const top3 = [...ALL_DRIVERS]
    .sort((a,b) => b.avg - a.avg || b.kmTotal - a.kmTotal)
    .slice(0, 3);
  const medals = [
    { label: '1°', cls: 'gold',   color: '#ffd700' },
    { label: '2°', cls: 'silver', color: '#c0c0c0' },
    { label: '3°', cls: 'bronze', color: '#cd7f32' },
  ];
  const html = top3.map((d, i) => {
    const m = medals[i];
    const ops = [...new Set(d.ops.filter(Boolean))].join(', ');
    const bar = Math.round((d.avg / 100) * 100);
    return `<div class="top3-item" onclick="openModal('${d.name.replace(/'/g,"\\'")}')" style="cursor:pointer">
      <div class="top3-rank ${m.cls}">${m.label}</div>
      <div class="top3-info">
        <div class="top3-name" title="${d.name}">${d.name}</div>
        <div class="top3-detail">${ops || '—'} · ${d.kmTotal.toLocaleString('pt-BR',{maximumFractionDigits:0})} km</div>
        <div class="top3-bar-wrap"><div class="top3-bar" style="width:${bar}%;background:${m.color}"></div></div>
      </div>
      <div class="top3-score" style="color:${m.color}">${d.avg}</div>
    </div>`;
  }).join('');
  document.getElementById('top3Container').innerHTML = html;
}

// --- TABLE ---------------------------------------------------------------------------
function renderTable() {
  let filtered = applyFilters(ALL_DRIVERS);
  const sorted = sortDrivers(filtered);

  document.getElementById('countBadge').textContent = `${sorted.length} motoristas`;

  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');

  if (!sorted.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = sorted.map((d, i) => {
    const trendHtml = d.trend > 0
      ? `<span class="trend-up">↑ +${d.trend}</span>`
      : d.trend < 0
        ? `<span class="trend-down">↓ ${d.trend}</span>`
        : `<span class="trend-same" style="font-size:11px">Sem movimentação</span>`;

    const recebeTag = d.avg > 80
      ? `<span class="badge-recebe">✓ recebe</span>`
      : ``;

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

    const hasGestores = ALL_DRIVERS.some(x => x.gestor);
    if (hasGestores) document.getElementById('th-gestor').style.display = '';

    return `<tr onclick="openModal('${d.name.replace(/'/g,"\\'")}')">
      <td style="color:var(--muted);font-size:12px;width:40px">${i+1}</td>
      <td class="driver-name">${d.name}${recebeTag}</td>
      ${hasGestores ? `<td style="font-size:12px;color:var(--muted)">${d.gestor || '—'}</td>` : ''}
      ${monthCellHtml(d.scores[0], d.kms[0], d.ops[0])}
      ${monthCellHtml(d.scores[1], d.kms[1], d.ops[1])}
      ${monthCellHtml(d.scores[2], d.kms[2], d.ops[2])}
      <td class="right"><span class="score-pill ${scoreClass(d.avg)}">${d.avg}</span></td>
      <td class="right">${trendHtml}</td>
      <td class="right" style="color:var(--muted);font-size:12px;font-family:'JetBrains Mono',monospace">${d.kmTotal ? d.kmTotal.toLocaleString('pt-BR', {maximumFractionDigits:0}) + ' km' : '<span style="font-size:11px">Sem movimentação</span>'}</td>
    </tr>`;
  }).join('');
}

// --- MODAL ---------------------------------------------------------------------------
function openModal(name) {
  const d = ALL_DRIVERS.find(x => x.name === name);
  if (!d) return;

  document.getElementById('modalName').textContent = d.name;
  const recebeStatus = d.avg > 80 ? '✓ Recebe bônus' : '✗ Não recebe bônus';
  const recebeColor = d.avg > 80 ? 'var(--green)' : 'var(--red)';
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
let currentWorstMonth = 'all';
let currentWorstOp = 'all';

function setWorstMonth(month) {
  currentWorstMonth = month;
  // Update selection in menu
  document.querySelectorAll('#ddWorstMonthMenu .dd-item').forEach(el => el.classList.remove('selected'));
  const val = month === 'all' ? 'all' : String(month);
  const sel = document.querySelector(`#ddWorstMonthMenu .dd-item[data-val="${val}"]`);
  if (sel) sel.classList.add('selected');
  // Update trigger label
  const labels = { all: 'Mês', 0: 'Janeiro', 1: 'Fevereiro', 2: 'Março' };
  document.getElementById('ddWorstMonthLabel').textContent = labels[month] ?? 'Mês';
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
  let candidates;
  const monthIdx = currentWorstMonth;

  if (monthIdx === 'all') {
    candidates = ALL_DRIVERS
      .filter(d => {
        const opOk = currentWorstOp === 'all' ? true : d.ops.some(op => op && op.includes(currentWorstOp));
        return d.avg !== null && d.avg < 80 && d.kmTotal > 1500 && opOk;
      })
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 20)
      .map(d => ({ name: d.name, score: d.avg, km: d.kmTotal, driver: d }));
  } else {
    const mi = monthIdx;
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
      .map(d => ({ name: d.name, score: d.scores[mi], km: d.kms[mi], driver: d }));
  }

  // Update subtitle
  const monthLabel = monthIdx === 'all' ? 'todos os meses' : ['Janeiro','Fevereiro','Março'][monthIdx];
  const opLabel = currentWorstOp === 'all' ? 'todas as operações' : currentWorstOp;
  document.getElementById('worstSubtitle').textContent = `· Nota inferior a 80 e mínimo 1.500 km rodados· ${monthLabel} · ${opLabel}`;

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
