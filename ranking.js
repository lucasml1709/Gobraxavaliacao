// =====================================================================================
// RANKING DE PONTUAÇÃO — módulo independente do dashboard de notas (script.js).
// Usa window.RANKING_DATA, definido em rankingData.js.
// =====================================================================================
(function () {
  const DATA = window.RANKING_DATA;
  if (!DATA) {
    console.error('rankingData.js não foi carregado antes de ranking.js');
    return;
  }

  const MESES = DATA.meses;                // ["Janeiro-2026", ... "Agosto-2026"]
  const LABELS = DATA.labels;              // { "Janeiro-2026": "Jan", ... }
  const SHORT = MESES.map(m => LABELS[m]); // ["Jan","Fev",...,"Ago"]

  let rkTab = 'geral';        // 'geral' | índice do mês (0-7)
  let rkSearch = '';
  let rkSortKey = null;       // null = ordem natural dos dados (já vem ordenada por pontuação)
  let rkSortDir = -1;

  // --- Helpers de formatação -----------------------------------------------------
  function fmtKm(km) {
    if (km === null || km === undefined) return '—';
    return km.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km';
  }
  function fmtNum(n) {
    if (n === null || n === undefined) return '—';
    return n.toLocaleString('pt-BR');
  }
  function rankClass(pos) {
    if (pos === 1) return 'gold';
    if (pos === 2) return 'silver';
    if (pos === 3) return 'bronze';
    return '';
  }
  function esc(name) {
    return name.replace(/'/g, "\\'");
  }

  // --- Linhas da aba ativa --------------------------------------------------------
  function getRows() {
    if (rkTab === 'geral') {
      return DATA.acumulado.map(e => ({
        posicao: e.posicaoGeral,
        motorista: e.motorista,
        pontuacao: e.totalPontuacao,
        km: e.totalKm,
        nota: e.mediaNota !== null && e.mediaNota !== undefined ? Math.round(e.mediaNota) : null,
        meses: e.mesesParticipados,
      }));
    }
    const mes = MESES[rkTab];
    return (DATA.mensal[mes] || []).map(r => ({
      posicao: r.posicao,
      motorista: r.motorista,
      pontuacao: r.pontuacao,
      km: r.km,
      nota: r.nota,
      meses: 1,
    }));
  }

  function applyRankingFilters(rows) {
    let filtered = rows;
    if (rkSearch) {
      const q = rkSearch.toLowerCase();
      filtered = filtered.filter(r => r.motorista.toLowerCase().includes(q));
    }
    if (rkSortKey) {
      filtered = [...filtered].sort((a, b) => {
        const va = a[rkSortKey] ?? -Infinity;
        const vb = b[rkSortKey] ?? -Infinity;
        return (vb - va) * rkSortDir;
      });
    }
    return filtered;
  }

  // --- Tabs -------------------------------------------------------------------------
  window.setRankingTab = function (tab) {
    rkTab = tab;
    rkSortKey = null;
    rkSortDir = -1;
    document.querySelectorAll('.rk-tab').forEach(b => {
      b.classList.toggle('active', String(b.dataset.tab) === String(tab));
    });
    const sub = tab === 'geral'
      ? `Acumulado · soma da pontuação de ${SHORT[0]} a ${SHORT[SHORT.length - 1]}/2026`
      : `Ranking de ${MESES[tab]}`;
    document.getElementById('rankingSubtitle').textContent = sub;
    renderRankingPodium();
    renderRankingTable();
  };

  window.onRankingSearch = function () {
    rkSearch = document.getElementById('rankingSearchInput').value.trim();
    renderRankingTable();
  };

  window.sortRankingBy = function (key) {
    if (rkSortKey === key) rkSortDir *= -1;
    else { rkSortKey = key; rkSortDir = -1; }
    renderRankingTable();
  };

  // --- Podium (top 3) ----------------------------------------------------------------
  function renderRankingPodium() {
    const top3 = getRows().slice(0, 3);
    const medals = [
      { label: '1°', cls: 'gold', color: '#ffd700' },
      { label: '2°', cls: 'silver', color: '#c0c0c0' },
      { label: '3°', cls: 'bronze', color: '#cd7f32' },
    ];
    const html = top3.map((r, i) => {
      const m = medals[i];
      const mesesTag = rkTab === 'geral'
        ? `<div class="rk-months-participated" style="margin-top:4px">${SHORT.map((s, si) => {
            const on = DATA.acumulado.find(e => e.motorista === r.motorista)?.detalhePorMes?.[MESES[si]];
            return `<span class="rk-month-dot ${on ? 'on' : ''}" title="${s}"></span>`;
          }).join('')}</div>`
        : '';
      return `<div class="ranking-podium-card">
        <div class="top3-item" style="border-bottom:none;padding:0;cursor:pointer" onclick="openRankingModal('${esc(r.motorista)}')">
          <div class="top3-rank ${m.cls}">${m.label}</div>
          <div class="top3-info">
            <div class="top3-name" title="${r.motorista}">${r.motorista}</div>
            <div class="top3-detail">${fmtKm(r.km)}${r.nota !== null ? ' · nota ' + r.nota : ''}</div>
            ${mesesTag}
          </div>
          <div class="top3-score" style="color:${m.color}">${fmtNum(r.pontuacao)}</div>
        </div>
      </div>`;
    }).join('');
    document.getElementById('rankingPodium').innerHTML = html;
  }

  // --- Tabela -------------------------------------------------------------------------
  function renderRankingHeader() {
    const head = document.getElementById('rankingTableHeader');
    if (rkTab === 'geral') {
      head.innerHTML = `
        <th style="width:44px">#</th>
        <th>Motorista</th>
        <th class="rk-center" onclick="sortRankingBy('meses')">Meses</th>
        <th class="rk-center" onclick="sortRankingBy('nota')">Nota média</th>
        <th class="right" onclick="sortRankingBy('km')">Km total</th>
        <th class="right" onclick="sortRankingBy('pontuacao')">Pontuação</th>`;
    } else {
      head.innerHTML = `
        <th style="width:44px">#</th>
        <th>Motorista</th>
        <th class="right" onclick="sortRankingBy('km')">Km rodado</th>
        <th class="rk-center" onclick="sortRankingBy('nota')">Nota</th>
        <th class="right" onclick="sortRankingBy('pontuacao')">Pontuação</th>`;
    }
  }

  function renderRankingTable() {
    renderRankingHeader();
    const rows = applyRankingFilters(getRows());
    document.getElementById('rankingCountBadge').textContent = `${rows.length} motoristas`;

    const tbody = document.getElementById('rankingTableBody');
    const empty = document.getElementById('rankingEmptyState');
    if (!rows.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = rows.map((r, i) => {
      const rc = rankClass(r.posicao);
      const cells = rkTab === 'geral'
        ? `<td class="rk-center">${r.meses}/${MESES.length}</td>
           <td class="rk-center">${r.nota !== null ? r.nota : '—'}</td>
           <td class="right" style="font-family:'JetBrains Mono',monospace;color:var(--muted);font-size:12px">${fmtKm(r.km)}</td>
           <td class="right"><span class="pt-pill">${fmtNum(r.pontuacao)}</span></td>`
        : `<td class="right" style="font-family:'JetBrains Mono',monospace;color:var(--muted);font-size:12px">${fmtKm(r.km)}</td>
           <td class="rk-center">${r.nota !== null ? r.nota : '—'}</td>
           <td class="right"><span class="pt-pill">${fmtNum(r.pontuacao)}</span></td>`;
      return `<tr onclick="openRankingModal('${esc(r.motorista)}')">
        <td class="rk-rank-cell ${rc}">${r.posicao}</td>
        <td class="driver-name">${r.motorista}</td>
        ${cells}
      </tr>`;
    }).join('');
  }

  // --- Modal de detalhe (sempre mostra a trajetória completa do motorista) -----------
  window.openRankingModal = function (name) {
    const entry = DATA.acumulado.find(e => e.motorista === name);
    if (!entry) return;

    document.getElementById('rankingModalName').textContent = entry.motorista;
    const mediaNotaArred = entry.mediaNota !== null && entry.mediaNota !== undefined ? Math.round(entry.mediaNota) : null;
    document.getElementById('rankingModalSub').innerHTML =
      `Participou de <strong>${entry.mesesParticipados}/${MESES.length}</strong> meses · nota média <strong>${mediaNotaArred ?? '—'}</strong> · ${fmtKm(entry.totalKm)} rodados`;

    const summaryHtml = `
      <div class="modal-month-card">
        <div class="modal-month-name">Pontuação acumulada</div>
        <div class="modal-month-score" style="color:var(--accent2)">${fmtNum(entry.totalPontuacao)}</div>
      </div>
      <div class="modal-month-card">
        <div class="modal-month-name">Posição geral</div>
        <div class="modal-month-score">${entry.posicaoGeral}°</div>
      </div>
      <div class="modal-month-card">
        <div class="modal-month-name">Meses participados</div>
        <div class="modal-month-score">${entry.mesesParticipados}</div>
      </div>
      <div class="modal-month-card">
        <div class="modal-month-name">Km total</div>
        <div class="modal-month-score">${fmtKm(entry.totalKm)}</div>
      </div>`;
    document.getElementById('rankingModalSummary').innerHTML = summaryHtml;

    const rowsHtml = MESES.map((mes, i) => {
      const d = entry.detalhePorMes[mes];
      if (!d) {
        return `<div class="rk-modal-month-row">
          <div>${SHORT[i]}</div>
          <div class="rk-modal-month-empty" style="grid-column:span 4">Sem movimentação neste mês</div>
        </div>`;
      }
      const rc = rankClass(d.posicao);
      const posClass = d.posicao <= 3 ? 'top3' : d.posicao <= 10 ? 'top10' : '';
      return `<div class="rk-modal-month-row">
        <div>${SHORT[i]}</div>
        <div class="rk-pos ${posClass}">${d.posicao}°</div>
        <div class="rk-km">${fmtKm(d.km)}</div>
        <div class="rk-nota">${d.nota ?? '—'}</div>
        <div class="rk-pts">${fmtNum(d.pontuacao)}</div>
      </div>`;
    }).join('');

    document.getElementById('rankingModalMonths').innerHTML = `
      <div class="rk-modal-month-row header">
        <div>Mês</div><div>Posição</div><div>Km</div><div>Nota</div><div>Pontos</div>
      </div>
      ${rowsHtml}`;

    document.getElementById('rankingModalOverlay').classList.add('open');
  };

  window.closeRankingModal = function (e) {
    if (e.target === document.getElementById('rankingModalOverlay')) window.closeRankingModalBtn();
  };
  window.closeRankingModalBtn = function () {
    document.getElementById('rankingModalOverlay').classList.remove('open');
  };

  // --- Init ---------------------------------------------------------------------------
  function initRanking() {
    // monta as abas: Geral + um botão por mês
    const tabsEl = document.getElementById('rankingTabs');
    let tabsHtml = `<button class="rk-tab active" data-tab="geral" onclick="setRankingTab('geral')">Geral</button>`;
    tabsHtml += MESES.map((m, i) => `<button class="rk-tab" data-tab="${i}" onclick="setRankingTab(${i})">${SHORT[i]}</button>`).join('');
    tabsEl.innerHTML = tabsHtml;

    document.getElementById('rankingSubtitle').textContent =
      `Acumulado · soma da pontuação de ${SHORT[0]} a ${SHORT[SHORT.length - 1]}/2026`;

    renderRankingPodium();
    renderRankingTable();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRanking);
  } else {
    initRanking();
  }
})();
