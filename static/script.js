const C = {
    primary: '#7C3AED',
    primaryLight: '#C4B5FD',
    info: '#06B6D4',
    pink: '#EC4899',
    orange: '#F59E0B',
    green: '#10B981',
    red: '#EF4444',
    purple: '#8B5CF6',
    gray: '#9CA3AF',
};

let view = 'portfolio';
let currentBrand = null;
let brandsMeta = [];
let portfolioCache = null;
let charts = {};

Chart.defaults.font.family = "'Inter', 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
Chart.defaults.color = '#6B7280';
Chart.defaults.borderColor = '#E5E7EB';

const colorFor = c => c === 'green' ? C.green : c === 'orange' ? C.orange : C.red;
const destroy = k => { if (charts[k]) { charts[k].destroy(); delete charts[k]; } };
const destroyAll = () => Object.keys(charts).forEach(destroy);

/* ============ KPI 카드 렌더 (SPBT 스타일) ============ */
function renderKpiRow(targetId, items) {
    const row = document.getElementById(targetId);
    row.innerHTML = items.map((it, i) => {
        const hasFoot = it.footLeft || it.footRight;
        const clickable = !!(it.scrollTo || it.onClick);
        return `
        <div class="kpi-card ${it.tint ? 'kpi-tint-' + it.tint : ''} ${clickable ? 'kpi-card-clickable' : ''}">
            <div class="kpi-head">
                <div class="kpi-label">${it.label}</div>
            </div>
            <div class="kpi-value ${it.valueColor || ''}">${it.value}</div>
            ${hasFoot ? `
                <div class="kpi-foot">
                    <span>${it.footLeft || ''}</span>
                    <span class="right">${it.footRight || ''}</span>
                </div>
            ` : ''}
        </div>
    `;
    }).join('');

    // 카드별 클릭 동작 (scrollTo 또는 onClick 콜백)
    row.querySelectorAll('.kpi-card').forEach((el, idx) => {
        const it = items[idx];
        if (it.scrollTo) {
            el.addEventListener('click', () => {
                const target = document.getElementById(it.scrollTo);
                if (!target) return;
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                target.classList.add('flash-highlight');
                setTimeout(() => target.classList.remove('flash-highlight'), 1600);
            });
        } else if (typeof it.onClick === 'function') {
            el.addEventListener('click', () => it.onClick());
        }
    });
}

/* ============ Modal ============ */
function openModal({ title, sub, bodyHtml }) {
    document.getElementById('modalTitle').textContent = title || '';
    document.getElementById('modalSub').textContent = sub || '';
    document.getElementById('modalBody').innerHTML = bodyHtml || '';
    document.getElementById('modalBackdrop').style.display = 'flex';
}
function closeModal() {
    document.getElementById('modalBackdrop').style.display = 'none';
}
(function setupModalCloseHandlers() {
    const backdrop = document.getElementById('modalBackdrop');
    if (!backdrop) return;
    backdrop.addEventListener('click', e => {
        if (e.target === backdrop) closeModal();
    });
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
})();

function buildIssuesTableHtml(issues, includeBrand) {
    if (!issues.length) {
        return '<div class="modal-empty">등록된 안건이 없습니다.</div>';
    }
    let html = '<table class="issues-table"><thead><tr>';
    if (includeBrand) html += '<th>브랜드</th>';
    html += '<th>구분</th><th>내용</th><th>완료 예정일</th><th>진행률</th>';
    html += '</tr></thead><tbody>';
    issues.forEach(i => {
        const progress = i.progress || 0;
        const low = progress < 50;
        html += '<tr>';
        if (includeBrand) html += `<td><span class="brand-tag" style="--accent:${i.accent}">${i.brand}</span></td>`;
        html += `<td><span class="badge badge-category">${i.category || '-'}</span></td>`;
        html += `<td><b>${i.title}</b></td>`;
        html += `<td>${i.due_date || '-'}</td>`;
        html += `<td class="progress-cell">
            <div class="progress-bar"><div class="progress-bar-fill ${low ? 'low' : ''}" style="width:${progress}%"></div></div>
            <div class="progress-text">${progress}%</div>
        </td>`;
        html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

function openPortfolioIssuesModal(issues) {
    openModal({
        title: `미해결 이슈 (${issues.length}건)`,
        sub: `전 브랜드 미완료 안건 · 우선순위순 정렬`,
        bodyHtml: buildIssuesTableHtml(issues, true),
    });
}

function openBrandIssuesModal(brandName, issues) {
    openModal({
        title: `${brandName} 미해결 이슈 (${issues.length}건)`,
        sub: `우선순위순 정렬`,
        bodyHtml: buildIssuesTableHtml(issues.map(i => ({...i})), false),
    });
}

/* ============ 상단 카운트 탭 ============ */
function renderToptabs(brands) {
    const goodCount = brands.filter(b => b.kpi_color === 'green').length;
    const warnCount = brands.filter(b => b.kpi_color === 'orange').length;
    const badCount  = brands.filter(b => b.kpi_color === 'red').length;
    const tabs = [
        { key: 'all',  label: '전체',     count: brands.length },
        { key: 'good', label: '양호',     count: goodCount, cls: 'green' },
        { key: 'warn', label: '주의',     count: warnCount, cls: 'orange' },
        { key: 'bad',  label: '경고',     count: badCount,  cls: 'red' },
    ];
    const el = document.getElementById('toptabs');
    el.innerHTML = tabs.map((t, i) => `
        <button class="toptab ${i === 0 ? 'active' : ''}" data-filter="${t.key}">
            ${t.label}
            <span class="toptab-count">${t.count}</span>
        </button>
    `).join('');
    el.querySelectorAll('.toptab').forEach(btn => {
        btn.addEventListener('click', () => {
            el.querySelectorAll('.toptab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterBrandCards(btn.dataset.filter);
        });
    });
}

function filterBrandCards(filter) {
    if (!portfolioCache) return;
    let filtered = portfolioCache.brands;
    if (filter === 'good') filtered = filtered.filter(b => b.kpi_color === 'green');
    else if (filter === 'warn') filtered = filtered.filter(b => b.kpi_color === 'orange');
    else if (filter === 'bad') filtered = filtered.filter(b => b.kpi_color === 'red');
    renderBrandCards(filtered);
}

/* ============ Sidebar ============ */
async function loadSidebar() {
    const res = await fetch('/api/portfolio');
    const d = await res.json();
    brandsMeta = d.brands;
    portfolioCache = d;
    const list = document.getElementById('brandList');
    list.innerHTML = brandsMeta.map(b => `
        <li class="brand-item" data-id="${b.code}">
            <span class="dot" style="background:${b.accent}"></span>${b.name}
        </li>
    `).join('');

    list.addEventListener('click', e => {
        const item = e.target.closest('.brand-item');
        if (!item) return;
        setView('brand', item.dataset.id);
    });
    document.querySelectorAll('.view-item').forEach(el => {
        el.addEventListener('click', () => setView('portfolio'));
    });
    return d;
}

/* ============ View switching ============ */
function setView(newView, code = null, opts = {}) {
    view = newView;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.view-panel[data-view="${newView}"]`).classList.add('active');
    document.querySelectorAll('.brand-item, .view-item').forEach(el => el.classList.remove('active'));
    destroyAll();

    // URL 해시 동기화 — 새로고침해도 같은 페이지 유지
    if (!opts.skipHash) {
        const newHash = newView === 'brand' && code ? '#brand=' + code : '';
        if (newHash) {
            history.replaceState(null, '', location.pathname + location.search + newHash);
        } else {
            history.replaceState(null, '', location.pathname + location.search);
        }
    }

    if (newView === 'portfolio') {
        document.querySelector('.view-item[data-view="portfolio"]').classList.add('active');
        document.getElementById('logoMark').textContent = 'S';
        document.getElementById('logoMark').style.background = 'linear-gradient(135deg, #8B5CF6, #6366F1)';
        document.getElementById('topTitle').textContent = 'SPBT 운영 관리';
        document.getElementById('topSub').textContent = '멀티 브랜드 대시보드';
        loadPortfolio();
    } else {
        currentBrand = code;
        const meta = brandsMeta.find(b => b.code === code);
        if (!meta) { setView('portfolio'); return; }
        document.querySelector(`.brand-item[data-id="${code}"]`).classList.add('active');
        document.getElementById('logoMark').textContent = meta.name.charAt(0);
        document.getElementById('logoMark').style.background = meta.accent;
        document.getElementById('topTitle').textContent = meta.name;
        document.getElementById('topSub').textContent = '';
        loadBrand(code);
    }
}

/* ============ Portfolio view ============ */
async function loadPortfolio(data) {
    const d = data || portfolioCache || await (await fetch('/api/portfolio')).json();
    portfolioCache = d;
    const m = d.main_kpi;

    const avgColor = m.avg_kpi_color === 'green' ? 'green' : m.avg_kpi_color === 'orange' ? 'orange' : 'red';
    const avgTag = m.avg_kpi_color === 'green' ? '양호' : m.avg_kpi_color === 'orange' ? '주의' : '경고';

    renderKpiRow('kpiRow', [
        {
            label: 'KPI 달성 현황',
            tint: avgColor,
            value: `${m.avg_kpi}<span class="unit">%</span>`,
            valueColor: avgColor,
            footLeft: '',
            footRight: '',
            scrollTo: 'kpiChartCard',
        },
        {
            label: '운영 / 오픈 예정',
            tint: 'purple',
            value: `<span class="kpi-value-split">${m.total_stores}<span class="split-sub">/ +${m.total_opening}</span></span>`,
            footLeft: '',
            footRight: '',
        },
        {
            label: '미해결 이슈',
            tint: m.total_issues > 0 ? 'red' : 'green',
            value: `${m.total_issues}<span class="unit">건</span>`,
            valueColor: m.total_issues > 0 ? 'red' : '',
            footLeft: '',
            footRight: '',
            onClick: () => openPortfolioIssuesModal(d.issues || []),
        },
    ]);

    renderBrandCards(d.brands, d.special_cards || []);

    // ⓪ 가맹점 월 평균 매출 (전전월 vs 전월)
    const fr = d.chart_franchise_avg_rev;
    document.getElementById('franchiseRevSub').textContent =
        `기준 ${fr.prev_month} · 전월 대비 · 단위 만원`;
    destroy('franchiseRev');
    charts.franchiseRev = new Chart(document.getElementById('franchiseRevChart'), {
        type: 'bar',
        data: {
            labels: fr.items.map(b => b.name),
            datasets: [
                {
                    label: `전전월 (${fr.prev_prev_month})`,
                    data: fr.items.map(b => Math.round(b.prev_prev / 1e4)),
                    backgroundColor: '#D1D5DB',
                    borderRadius: 5,
                    borderSkipped: false,
                    barPercentage: 0.78,
                    categoryPercentage: 0.78,
                },
                {
                    label: `전월 (${fr.prev_month})`,
                    data: fr.items.map(b => Math.round(b.prev / 1e4)),
                    backgroundColor: fr.items.map(b => b.prev < b.prev_prev ? '#EF4444' : b.accent),
                    borderRadius: 5,
                    borderSkipped: false,
                    barPercentage: 0.78,
                    categoryPercentage: 0.78,
                },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const b = fr.items[ctx.dataIndex];
                            const pct = b.prev_prev ? ((b.prev - b.prev_prev) / b.prev_prev * 100) : 0;
                            const sign = pct >= 0 ? '+' : '';
                            const base = ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() + '만원';
                            if (ctx.datasetIndex === 1) return base + `  (${sign}${pct.toFixed(1)}%)`;
                            return base;
                        },
                    },
                },
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { callback: v => v.toLocaleString() + '만' } },
            },
            layout: { padding: { top: 28 } },
        },
        plugins: [{
            id: 'changeBadge',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                const meta1 = chart.getDatasetMeta(1);  // 전월 막대
                meta1.data.forEach((bar, i) => {
                    const b = fr.items[i];
                    if (!b.prev_prev) return;
                    const pct = (b.prev - b.prev_prev) / b.prev_prev * 100;
                    const sign = pct >= 0 ? '+' : '';
                    ctx.save();
                    // 값 라벨
                    ctx.font = '600 12px Inter, sans-serif';
                    ctx.fillStyle = '#111827';
                    ctx.textAlign = 'center';
                    ctx.fillText(Math.round(b.prev / 1e4).toLocaleString() + '만', bar.x, bar.y - 22);
                    // 변화율 라벨
                    ctx.font = '600 11px Inter, sans-serif';
                    ctx.fillStyle = pct >= 0 ? '#10B981' : '#EF4444';
                    ctx.fillText(`${sign}${pct.toFixed(1)}%`, bar.x, bar.y - 7);
                    ctx.restore();
                });
            },
        }],
    });

    // ① 브랜드별 KPI 달성률
    destroy('kpi');
    charts.kpi = new Chart(document.getElementById('kpiChart'), {
        type: 'bar',
        data: {
            labels: d.chart_kpi.map(b => b.name),
            datasets: [{
                label: 'KPI 달성률 (%)',
                data: d.chart_kpi.map(b => b.kpi),
                backgroundColor: d.chart_kpi.map(b => colorFor(b.color)),
                borderRadius: 6, borderSkipped: false,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y + '%' } } },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, max: 100, grid: { color: '#F3F4F6' }, ticks: { callback: v => v + '%' } },
            },
        },
    });

    // ② 브랜드별 가맹점 현황 (스택)
    destroy('pipe');
    charts.pipe = new Chart(document.getElementById('pipelineChart'), {
        type: 'bar',
        data: {
            labels: d.chart_pipeline.map(b => b.name),
            datasets: [
                { label: '운영',      data: d.chart_pipeline.map(b => b.opened),  backgroundColor: C.green,  borderRadius: 5, borderSkipped: false, stack: 'p' },
                { label: '오픈 예정', data: d.chart_pipeline.map(b => b.opening), backgroundColor: C.orange, borderRadius: 5, borderSkipped: false, stack: 'p' },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 10 } } },
            scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: '#F3F4F6' } } },
        },
    });

    renderIssueStats('issuesStats', m.total_projects, m.total_issues);
    renderIssuesTable('issuesTable', d.issues, true);
}

function renderBrandCards(brands, specialCards = []) {
    const grid = document.getElementById('brandCardGrid');
    grid.innerHTML = '';
    brands.forEach(b => {
        const div = document.createElement('div');
        div.className = 'brand-card';
        div.style.setProperty('--accent', b.accent);
        div.innerHTML = `
            <div class="brand-card-head">
                <div>
                    <div class="brand-card-title">${b.name}</div>
                </div>
            </div>
            <div class="brand-card-stats">
                <div><div class="brand-stat-label">운영중</div><div class="brand-stat-value">${b.store_total}개</div></div>
                <div><div class="brand-stat-label">오픈 예정</div><div class="brand-stat-value">${b.opening_count}개</div></div>
                <div><div class="brand-stat-label">진행 프로젝트</div><div class="brand-stat-value">${b.projects_count}건</div></div>
                <div><div class="brand-stat-label">미해결 이슈</div><div class="brand-stat-value" style="color:${b.issues_count > 0 ? 'var(--danger)' : 'var(--text)'}">${b.issues_count}건</div></div>
            </div>
        `;
        div.addEventListener('click', () => setView('brand', b.code));
        grid.appendChild(div);
    });
    // 특수 카드 (SPBT · 해외진출) — 일반 카드와 동일 스타일
    specialCards.forEach(c => grid.appendChild(buildSpecialCard(c)));
}

function buildSpecialCard(c) {
    const div = document.createElement('div');
    div.className = 'brand-card';
    div.style.setProperty('--accent', c.accent);
    const statsHtml = c.stats.map(s => `
        <div><div class="brand-stat-label">${s.label}</div><div class="brand-stat-value">${s.value || '-'}</div></div>
    `).join('');
    div.innerHTML = `
        <div class="brand-card-head">
            <div>
                <div class="brand-card-title">${c.name}</div>
            </div>
        </div>
        <div class="brand-card-stats">${statsHtml}</div>
    `;
    div.addEventListener('click', () => {
        if (c.click_action === 'external') {
            if (c.external_url) {
                window.open(c.external_url, '_blank', 'noopener');
            } else {
                openModal({
                    title: c.name,
                    sub: '외부 링크 준비 중',
                    bodyHtml: '<div class="modal-empty">외부 대시보드 URL이 아직 설정되지 않았습니다.<br>관리자에게 문의해주세요.</div>',
                });
            }
        } else if (c.click_action === 'modal' && c.modal) {
            openGlobalModal(c.modal);
        }
    });
    return div;
}

function openGlobalModal(m) {
    let rows = '<table class="issues-table"><thead><tr><th>국가</th><th>진행 단계</th><th>진행 브랜드</th><th>상태</th></tr></thead><tbody>';
    m.countries.forEach(co => {
        rows += `<tr>
            <td><b>${co.name}</b></td>
            <td>${co.stage}</td>
            <td>${co.brands.join(', ')}</td>
            <td><span class="badge badge-status-진행중">${co.status}</span></td>
        </tr>`;
    });
    rows += '</tbody></table>';
    openModal({ title: m.title, sub: m.subtitle, bodyHtml: rows });
}

function renderIssueStats(elemId, projectCount, issueCount) {
    const el = document.getElementById(elemId);
    if (!el) return;
    const issueCls = issueCount === 0 ? 'ok' : issueCount >= 3 ? 'high' : 'mid';
    el.innerHTML = `
        <div class="issues-stat">진행중 프로젝트<span class="issues-stat-value">${projectCount}건</span></div>
        <div class="issues-stat">미해결 이슈<span class="issues-stat-value ${issueCls}">${issueCount}건</span></div>
    `;
}

function renderIssuesTable(elemId, issues, includeBrand) {
    let html = '<thead><tr>';
    if (includeBrand) html += '<th>브랜드</th>';
    html += '<th>구분</th><th>내용</th><th>완료 예정일</th><th>진행률</th>';
    html += '</tr></thead><tbody>';
    const colCount = includeBrand ? 5 : 4;
    if (!issues.length) {
        html += `<tr><td colspan="${colCount}" style="text-align:center; color:var(--text-muted); padding:20px;">등록된 안건이 없습니다.</td></tr>`;
    } else {
        issues.forEach(i => {
            const progress = i.progress || 0;
            const low = progress < 50;
            html += '<tr>';
            if (includeBrand) html += `<td><span class="brand-tag" style="--accent:${i.accent}">${i.brand}</span></td>`;
            html += `<td><span class="badge badge-category">${i.category || '-'}</span></td>`;
            html += `<td><b>${i.title}</b></td>`;
            html += `<td>${i.due_date || '-'}</td>`;
            html += `<td class="progress-cell">
                <div class="progress-bar"><div class="progress-bar-fill ${low ? 'low' : ''}" style="width:${progress}%"></div></div>
                <div class="progress-text">${progress}%</div>
            </td>`;
            html += '</tr>';
        });
    }
    html += '</tbody>';
    document.getElementById(elemId).innerHTML = html;
}

/* ============ Brand detail view ============ */
async function loadBrand(code) {
    const res = await fetch('/api/brand/' + code);
    const d = await res.json();
    const m = d.main_kpi;

    const kpiColor = m.kpi_color;
    const kpiTag = kpiColor === 'green' ? '양호' : kpiColor === 'orange' ? '주의' : '경고';

    // 브랜드 상세 KPI 카드 — 모든 브랜드 동일 색조(보라/주황/빨강)로 통일
    renderKpiRow('brandKpiRow', [
        {
            label: 'KPI 달성률',
            tint: 'purple',
            value: `${m.kpi}<span class="unit">%</span>`,
            valueColor: kpiColor,
            footLeft: '',
            footRight: '',
        },
        {
            label: '운영 / 오픈 예정',
            tint: 'orange',
            value: `<span class="kpi-value-split">${m.store_total}<span class="split-sub">/ +${m.opening_count}</span></span>`,
            footLeft: '',
            footRight: '',
        },
        {
            label: '미해결 이슈',
            tint: 'red',
            value: `${m.issues_count}<span class="unit">건</span>`,
            valueColor: m.issues_count > 0 ? 'red' : '',
            footLeft: '',
            footRight: '',
            onClick: () => openBrandIssuesModal(d.name, d.issues || []),
        },
    ]);

    destroy('btrend');
    charts.btrend = new Chart(document.getElementById('brandTrendChart'), {
        type: 'line',
        data: {
            labels: d.month_labels,
            datasets: [{
                label: 'KPI 달성률',
                data: d.kpi_trend,
                borderColor: d.accent,
                backgroundColor: d.accent + '22',
                borderWidth: 2.5,
                tension: 0.35,
                pointRadius: 5,
                pointBackgroundColor: '#fff',
                pointBorderColor: d.accent,
                pointBorderWidth: 2,
                fill: true,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y + '%' } } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: false, suggestedMin: 50, suggestedMax: 100, grid: { color: '#F3F4F6' }, ticks: { callback: v => v + '%' } } },
        },
    });

    destroy('bpipe');
    const pipeOrder = ['상담중', '계약완료', '오픈예정', '오픈완료'];
    const pipeColors = [C.primary, C.purple, C.orange, C.green];
    charts.bpipe = new Chart(document.getElementById('brandPipelineChart'), {
        type: 'bar',
        data: {
            labels: pipeOrder,
            datasets: [{
                label: '건수',
                data: pipeOrder.map(k => d.pipeline[k]),
                backgroundColor: pipeColors,
                borderRadius: 6, borderSkipped: false,
                hoverBackgroundColor: pipeColors.map(c => c),
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            onHover: (e, els) => { e.native.target.style.cursor = els[0] ? 'pointer' : 'default'; },
            onClick: (e, els) => {
                if (!els.length) return;
                const stage = pipeOrder[els[0].index];
                // 외부 대시보드 링크가 설정된 단계는 새 탭으로 이동, 아니면 카드 내부에 상세 펼침
                const pipelineLinks = (d.external_links && d.external_links.pipeline) || {};
                if (pipelineLinks[stage]) {
                    window.open(pipelineLinks[stage], '_blank', 'noopener');
                    return;
                }
                openPipelineDetail(d, stage, pipeColors[els[0].index]);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const stage = pipeOrder[ctx.dataIndex];
                            const pipelineLinks = (d.external_links && d.external_links.pipeline) || {};
                            const suffix = pipelineLinks[stage] ? '건 · 클릭하면 외부 대시보드 열림 ↗' : '건 · 클릭하면 상세 보기';
                            return ctx.parsed.x + suffix;
                        },
                    },
                },
            },
            scales: { x: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { stepSize: 5 } }, y: { grid: { display: false } } },
        },
    });

    // 초기 펼침 닫기
    document.getElementById('pipelineDetail').classList.remove('open');

    // 매장별 전월 매출 비교 (전전월 대비)
    renderStoresMonthly(d);

    // 월 마케팅 진행 현황
    renderMarketing(d);

    // 본사 손익 / 가용 예산 / 사이트 계정
    renderHqPl(d);
    renderBudget(d);
    renderAccounts(d);

    const activeProjects = d.projects.filter(p => p.status !== '완료');
    renderIssueStats('brandProjectStats', activeProjects.length, m.issues_count);

    let ph = '<thead><tr><th>프로젝트명</th><th>진행률</th><th>예정 완료일</th><th>상태</th></tr></thead><tbody>';
    if (!d.projects.length) {
        ph += '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">등록된 프로젝트가 없습니다.</td></tr>';
    } else {
        [...d.projects].sort((a,b) => b.progress - a.progress).forEach(p => {
            const low = p.progress < 50;
            const nameHtml = p.sheet_url
                ? `<a href="${p.sheet_url}" target="_blank" rel="noopener" class="project-link"><b>${p.name}</b> <span class="link-icon">↗</span></a>`
                : `<b>${p.name}</b>`;
            ph += `<tr>
                <td>${nameHtml}</td>
                <td class="progress-cell">
                    <div class="progress-bar"><div class="progress-bar-fill ${low ? 'low' : ''}" style="width:${p.progress}%"></div></div>
                    <div class="progress-text">${p.progress}%</div>
                </td>
                <td>${p.due}</td>
                <td><span class="badge badge-status-${p.status}">${p.status}</span></td>
            </tr>`;
        });
    }
    ph += '</tbody>';
    document.getElementById('projectsTable').innerHTML = ph;

    renderIssueStats('brandIssueStats', activeProjects.length, m.issues_count);
    renderIssuesTable('brandIssuesTable', d.issues, false);
}

function renderStoresMonthly(d) {
    const stores = d.stores_monthly || [];
    const meta = d.stores_monthly_meta || {};
    const wrap = document.querySelector('.stores-monthly-wrap');

    // 차트 높이를 매장 수에 비례하게 (매장당 36px + 헤더/패딩 80px)
    const heightPx = Math.max(220, stores.length * 36 + 80);
    wrap.style.height = heightPx + 'px';

    // 매출 하락한 매장 수 카운트 (헤더 우측 통계)
    const declined = stores.filter(s => s.prev < s.prev_prev).length;
    const grown = stores.filter(s => s.prev > s.prev_prev).length;
    document.getElementById('storesMonthlySub').textContent =
        `기준 ${meta.prev_month} · 전월 대비`;

    const statsEl = document.getElementById('storesMonthlyStats');
    if (statsEl) {
        const decCls = declined === 0 ? 'ok' : declined >= 3 ? 'high' : 'mid';
        statsEl.innerHTML = `
            <div class="issues-stat">상승<span class="issues-stat-value ok">${grown}개</span></div>
            <div class="issues-stat">하락<span class="issues-stat-value ${decCls}">${declined}개</span></div>
        `;
    }

    destroy('storesMonthly');
    const accent = d.accent;
    charts.storesMonthly = new Chart(document.getElementById('storesMonthlyChart'), {
        type: 'bar',
        data: {
            labels: stores.map(s => s.name),
            datasets: [
                {
                    label: `전전월 (${meta.prev_prev_month})`,
                    data: stores.map(s => Math.round(s.prev_prev / 1e4)),
                    backgroundColor: '#D1D5DB',
                    borderRadius: 4,
                    borderSkipped: false,
                    barPercentage: 0.85,
                    categoryPercentage: 0.78,
                },
                {
                    label: `전월 (${meta.prev_month})`,
                    data: stores.map(s => Math.round(s.prev / 1e4)),
                    backgroundColor: stores.map(s => s.prev < s.prev_prev ? '#EF4444' : accent),
                    borderRadius: 4,
                    borderSkipped: false,
                    barPercentage: 0.85,
                    categoryPercentage: 0.78,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const s = stores[ctx.dataIndex];
                            const pct = s.prev_prev ? ((s.prev - s.prev_prev) / s.prev_prev * 100) : 0;
                            const sign = pct >= 0 ? '+' : '';
                            const base = ctx.dataset.label + ': ' + ctx.parsed.x.toLocaleString() + '만원';
                            if (ctx.datasetIndex === 1) return base + `  (${sign}${pct.toFixed(1)}%)`;
                            return base;
                        },
                    },
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: '#F3F4F6' },
                    ticks: { callback: v => v.toLocaleString() + '만' },
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 12, weight: 500 } },
                },
            },
        },
        plugins: [{
            id: 'changeBadge',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                const meta1 = chart.getDatasetMeta(1);   // 전월 막대
                meta1.data.forEach((bar, i) => {
                    const s = stores[i];
                    if (!s.prev_prev) return;
                    const pct = (s.prev - s.prev_prev) / s.prev_prev * 100;
                    const sign = pct >= 0 ? '+' : '';
                    const txt = `${sign}${pct.toFixed(1)}%`;
                    ctx.save();
                    ctx.font = '600 11px Inter, sans-serif';
                    ctx.fillStyle = pct >= 0 ? '#10B981' : '#EF4444';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(txt, bar.x + 6, bar.y);
                    ctx.restore();
                });
            },
        }],
    });
}

/* ============ 가맹점 현황 단계별 상세 펼침 ============ */
function openPipelineDetail(d, stage, accent) {
    const wrap = document.getElementById('pipelineDetail');
    const detail = d.pipeline_detail || {};
    const total = d.pipeline[stage] || 0;

    let bodyHtml = '';
    if (stage === '오픈완료') {
        // 오픈완료는 stores_monthly 데이터 활용
        const stores = d.stores_monthly || [];
        if (!stores.length) {
            bodyHtml = '<div class="pipeline-detail-empty">표시할 매장이 없습니다.</div>';
        } else {
            bodyHtml = '<table class="issues-table"><thead><tr><th>매장명</th><th class="cell-num">전월 매출(만원)</th><th>변동</th></tr></thead><tbody>';
            stores.forEach(s => {
                const pct = s.prev_prev ? ((s.prev - s.prev_prev) / s.prev_prev * 100) : 0;
                const sign = pct >= 0 ? '+' : '';
                const cls = pct >= 0 ? 'ok' : 'high';
                bodyHtml += `<tr>
                    <td><b>${s.name}</b></td>
                    <td class="cell-num">${Math.round(s.prev / 1e4).toLocaleString()}</td>
                    <td><span class="issues-stat-value ${cls}">${sign}${pct.toFixed(1)}%</span></td>
                </tr>`;
            });
            bodyHtml += '</tbody></table>';
        }
    } else {
        const items = detail[stage] || [];
        if (!items.length) {
            bodyHtml = '<div class="pipeline-detail-empty">표시할 항목이 없습니다.</div>';
        } else if (stage === '상담중') {
            bodyHtml = '<table class="issues-table"><thead><tr><th>성함</th><th>희망 지역</th><th>예산</th><th>단계</th><th>유입일</th></tr></thead><tbody>';
            items.forEach(i => {
                bodyHtml += `<tr>
                    <td><b>${i.name}</b></td>
                    <td>${i.region}</td>
                    <td>${i.budget}</td>
                    <td>${i.stage}</td>
                    <td>${i.due}</td>
                </tr>`;
            });
            bodyHtml += '</tbody></table>';
            const more = total - items.length;
            if (more > 0) bodyHtml += `<div class="pipeline-detail-empty">전체 ${total}건 중 대표 ${items.length}건 · 외 ${more}건</div>`;
        } else {
            // 계약완료 / 오픈예정
            bodyHtml = '<table class="issues-table"><thead><tr><th>매장명</th><th>지역</th><th>오픈 예정일</th><th>현재 단계</th></tr></thead><tbody>';
            items.forEach(i => {
                bodyHtml += `<tr>
                    <td><b>${i.name}</b></td>
                    <td>${i.region}</td>
                    <td>${i.open_plan}</td>
                    <td>${i.stage}</td>
                </tr>`;
            });
            bodyHtml += '</tbody></table>';
            const more = total - items.length;
            if (more > 0) bodyHtml += `<div class="pipeline-detail-empty">전체 ${total}건 중 대표 ${items.length}건 · 외 ${more}건</div>`;
        }
    }

    wrap.innerHTML = `
        <div class="pipeline-detail-head">
            <div class="pipeline-detail-title">
                <span style="color:${accent}">●</span> ${stage} 상세
                <span class="badge" style="background:${accent}22; color:${accent}">${total}건</span>
            </div>
            <button class="pipeline-detail-close" id="pipelineCloseBtn">✕ 닫기</button>
        </div>
        ${bodyHtml}
    `;
    wrap.classList.add('open');
    document.getElementById('pipelineCloseBtn').addEventListener('click', () => {
        wrap.classList.remove('open');
    });
}

/* ============ 월 마케팅 진행 현황 ============ */
function renderMarketing(d) {
    const mk = d.marketing || { month: '', items: [] };
    document.getElementById('marketingSub').textContent = `기준 ${mk.month} · 채널별 예산 대비 집행`;

    const totalBudget = mk.items.reduce((s, x) => s + x.budget, 0);
    const totalSpent = mk.items.reduce((s, x) => s + x.spent, 0);
    const execRate = totalBudget > 0 ? (totalSpent / totalBudget * 100) : 0;
    const statsEl = document.getElementById('marketingStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="issues-stat">총 예산<span class="issues-stat-value">${totalBudget.toLocaleString()}만</span></div>
            <div class="issues-stat">집행<span class="issues-stat-value">${totalSpent.toLocaleString()}만 (${execRate.toFixed(1)}%)</span></div>
        `;
    }

    // 차트: 채널별 예산/집행 가로 그룹 막대
    destroy('marketing');
    charts.marketing = new Chart(document.getElementById('marketingChart'), {
        type: 'bar',
        data: {
            labels: mk.items.map(x => x.channel),
            datasets: [
                { label: '예산', data: mk.items.map(x => x.budget), backgroundColor: '#E5E7EB', borderRadius: 4, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.78 },
                { label: '집행', data: mk.items.map(x => x.spent),  backgroundColor: d.accent,  borderRadius: 4, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.78 },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.x.toLocaleString() + '만원' } },
            },
            scales: {
                x: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { callback: v => v.toLocaleString() + '만' } },
                y: { grid: { display: false }, ticks: { font: { size: 12 } } },
            },
        },
    });

    // 테이블: 채널 / 예산 / 집행률 / 성과
    let html = '<thead><tr><th>채널</th><th class="col-num">예산</th><th>집행률</th><th>성과</th></tr></thead><tbody>';
    mk.items.forEach(x => {
        const rate = x.budget > 0 ? (x.spent / x.budget * 100) : 0;
        const under = rate < 80;
        html += `<tr>
            <td><b>${x.channel}</b></td>
            <td class="col-num">${x.budget.toLocaleString()}만</td>
            <td class="exec-bar-cell">
                <div class="exec-bar"><div class="exec-bar-fill ${under ? 'under' : ''}" style="width:${Math.min(rate, 100)}%; background:${under ? '' : d.accent};"></div></div>
                <div class="exec-bar-text">${x.spent.toLocaleString()}만 (${rate.toFixed(0)}%)</div>
            </td>
            <td style="color:var(--text-soft); font-size:12px;">${x.metric}</td>
        </tr>`;
    });
    html += '</tbody>';
    document.getElementById('marketingTable').innerHTML = html;
}

/* ============ 본사 손익 ============ */
function renderHqPl(d) {
    const wrap = document.getElementById('hqPlWrap');
    if (!wrap) return;
    const hq = d.hq_pl || {};
    if (!Object.keys(hq).length) {
        wrap.innerHTML = '<div class="modal-empty">데이터 없음</div>';
        return;
    }
    const items = [
        { key: 'rev', label: '매출액', prev_prev: hq.prev_prev_rev || 0, prev: hq.prev_rev || 0 },
        { key: 'op',  label: '영업이익', prev_prev: hq.prev_prev_op || 0, prev: hq.prev_op || 0 },
    ];
    const maxAbs = Math.max(...items.flatMap(i => [Math.abs(i.prev_prev), Math.abs(i.prev)]), 1);
    const fmt = v => {
        const sign = v < 0 ? '-' : '+';
        const abs = Math.abs(v);
        if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + '억';
        return sign + (abs / 1e4).toFixed(0) + '만';
    };
    wrap.innerHTML = items.map(it => {
        const pct = it.prev_prev ? ((it.prev - it.prev_prev) / Math.abs(it.prev_prev) * 100) : 0;
        const upDown = pct >= 0 ? 'up' : 'down';
        const sign = pct >= 0 ? '+' : '';
        const prevPrevWidth = Math.abs(it.prev_prev) / maxAbs * 100;
        const prevWidth = Math.abs(it.prev) / maxAbs * 100;
        const prevPosClass = it.prev >= 0 ? 'positive' : 'negative';
        const prevPrevPosClass = it.prev_prev >= 0 ? 'positive' : 'negative';
        return `
        <div class="hq-pl-row">
            <div class="hq-pl-label">${it.label}</div>
            <div class="hq-pl-bars">
                <div class="hq-pl-bar-row">
                    <span class="hq-pl-bar-period">전전월</span>
                    <div class="hq-pl-bar"><div class="hq-pl-bar-fill prev_prev" style="width:${prevPrevWidth}%"></div></div>
                    <span class="hq-pl-bar-value ${prevPrevPosClass}">${fmt(it.prev_prev)}</span>
                </div>
                <div class="hq-pl-bar-row">
                    <span class="hq-pl-bar-period">전월</span>
                    <div class="hq-pl-bar"><div class="hq-pl-bar-fill prev ${it.prev < 0 ? 'negative' : ''}" style="width:${prevWidth}%"></div></div>
                    <span class="hq-pl-bar-value ${prevPosClass}">${fmt(it.prev)}</span>
                </div>
                <div class="hq-pl-change ${upDown}">전월 대비 ${sign}${pct.toFixed(1)}%</div>
            </div>
        </div>`;
    }).join('');
}

/* ============ 가용 예산 (도넛) ============ */
function renderBudget(d) {
    const budget = d.budget || {};
    const keys = Object.keys(budget);
    if (!keys.length) return;
    const total = keys.reduce((s, k) => s + budget[k], 0);
    document.getElementById('budgetTotal').innerHTML =
        `<div class="issues-stat">총 예산<span class="issues-stat-value">${total.toLocaleString()}만</span></div>`;

    const palette = { '투자금': C.primary, '지원금': C.green, '대출': C.orange, '영업이익': C.info };

    destroy('budget');
    charts.budget = new Chart(document.getElementById('budgetChart'), {
        type: 'doughnut',
        data: {
            labels: keys,
            datasets: [{
                data: keys.map(k => budget[k]),
                backgroundColor: keys.map(k => palette[k] || C.gray),
                borderWidth: 0,
                hoverOffset: 6,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '60%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, padding: 12, font: { size: 12 } },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed;
                            const pct = total > 0 ? (v / total * 100).toFixed(1) : 0;
                            return `${ctx.label}: ${v.toLocaleString()}만 (${pct}%)`;
                        },
                    },
                },
            },
        },
    });
}

/* ============ 매출·물류 사이트 계정 (모달) ============ */
let _currentAccounts = [];
function renderAccounts(d) {
    // 데이터만 저장 — 표시는 버튼 클릭 시 모달로
    _currentAccounts = d.accounts || [];
    document.getElementById('accountsBtn').onclick = openAccountsModal;
}

function openAccountsModal() {
    const accounts = _currentAccounts || [];
    let bodyHtml;
    if (!accounts.length) {
        bodyHtml = '<div class="modal-empty">등록된 계정이 없습니다.</div>';
    } else {
        let html = '<table class="issues-table"><thead><tr><th>사이트</th><th>URL</th><th>아이디</th><th>비밀번호</th></tr></thead><tbody>';
        accounts.forEach((a, idx) => {
            html += `<tr>
                <td><b>${a.site}</b></td>
                <td><a href="${a.url}" target="_blank" rel="noopener" class="project-link">${a.url} <span class="link-icon">↗</span></a></td>
                <td><code class="account-code">${a.id}</code></td>
                <td><code class="account-code account-pw" data-idx="${idx}" data-pw="${a.pw}">••••••••</code></td>
            </tr>`;
        });
        html += '</tbody></table>';
        bodyHtml = html;
    }
    openModal({
        title: '주요 사이트 · 계정 정보',
        sub: '비밀번호 칸을 클릭하면 보기/숨기기',
        bodyHtml,
    });
    // 모달 렌더 후 비밀번호 토글 핸들러 연결
    document.querySelectorAll('#modalBody .account-pw').forEach(el => {
        el.style.cursor = 'pointer';
        let shown = false;
        el.addEventListener('click', () => {
            shown = !shown;
            el.textContent = shown ? el.dataset.pw : '••••••••';
        });
    });
}

/* ============ Init ============ */
document.getElementById('btnRefresh')?.addEventListener('click', async () => {
    portfolioCache = null;
    if (view === 'portfolio') {
        await loadSidebar();
        loadPortfolio();
    } else {
        loadBrand(currentBrand);
    }
});

function _parseHashBrand() {
    const m = (location.hash || '').match(/brand=([A-Za-z0-9_]+)/);
    return m ? m[1] : null;
}

(async function init() {
    const portfolioData = await loadSidebar();
    const code = _parseHashBrand();
    if (code && brandsMeta.find(b => b.code === code)) {
        // URL 해시에 브랜드 코드가 있으면 그 브랜드 페이지로 바로 진입
        setView('brand', code, { skipHash: true });
    } else {
        loadPortfolio(portfolioData);
    }
})();

// 뒤로/앞으로 가기 + URL 직접 수정 시 hashchange 핸들
window.addEventListener('hashchange', () => {
    const code = _parseHashBrand();
    if (code && brandsMeta.find(b => b.code === code)) {
        if (view !== 'brand' || currentBrand !== code) setView('brand', code, { skipHash: true });
    } else {
        if (view !== 'portfolio') setView('portfolio', null, { skipHash: true });
    }
});
