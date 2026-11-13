/* ============================================================
   CMC · 历届真题与知识地图
   纯静态 SPA（hash 路由）+ pdf.js 按页渲染原始试卷
   ============================================================ */
(function () {
  'use strict';

  const D = window.CMC_DATA;
  if (!D) { document.getElementById('view').innerHTML = '<div class="empty">数据未加载</div>'; return; }

  /* ----------------------------- 索引 ----------------------------- */
  const papers   = D.papers;
  const questions= D.questions;
  const syl      = D.syllabus;
  const meta     = D.meta;
  const points   = syl.points;
  const modules  = syl.modules;
  const cards    = D.cards || [];
  const cardTypes= D.cardTypes || [];

  const P    = Object.fromEntries(papers.map(p => [String(p.id).padStart(2, '0'), p]));
  const Q    = Object.fromEntries(questions.map(q => [q.id, q]));
  const PT   = Object.fromEntries(points.map(p => [p.id, p]));
  const TP   = Object.fromEntries(D.topics.map(t => [t.id, t]));
  const MOD  = Object.fromEntries(modules.map(m => [m.id, m]));
  const C    = Object.fromEntries(cards.map(c => [c.id, c]));
  const CT   = Object.fromEntries(cardTypes.map(t => [t.id, t]));
  const Qof  = id => (TP[id] ? TP[id].questions.map(x => Q[x]).filter(Boolean) : []);
  const QofC = id => (C[id] ? C[id].questionIds.map(x => Q[x]).filter(Boolean) : []);
  const cnt  = id => (TP[id] ? TP[id].count : 0);

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const pad2 = n => String(n).padStart(2, '0');
  const $view = $('#view');

  /* ----------------------------- 小组件 ----------------------------- */
  function hbars(items, opts = {}) {
    const max = opts.max || Math.max(1, ...items.map(i => i.value));
    return items.map(i => `
      <div class="bar-row ${opts.click ? 'clickable' : ''}" ${opts.click ? `data-goto="${esc(i.href || '')}"` : ''}
           style="--lw:${opts.labelWidth || 150}px">
        <div class="bl" title="${esc(i.label)}">${i.labelHtml || esc(i.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(1.5, i.value / max * 100)}%;--c:${i.color || '#8b7bff'};--c2:${i.color2 || '#4d8dff'}"></div></div>
        <div class="bv">${i.value}</div>
      </div>`).join('');
  }

  function donut(items, size = 158) {
    const total = items.reduce((a, b) => a + b.value, 0) || 1;
    const r = size / 2 - 15, C = 2 * Math.PI * r;
    let acc = 0;
    const arcs = items.map(i => {
      const len = i.value / total * C;
      const s = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${i.color}"
        stroke-width="15" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"
        stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"
        stroke-linecap="butt"><title>${esc(i.label)}: ${i.value}</title></circle>`;
      acc += len; return s;
    }).join('');
    return `<div class="donut-wrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="15"/>
        ${arcs}
        <text x="${size / 2}" y="${size / 2 - 3}" text-anchor="middle" fill="#e9ebf7"
              font-family="var(--mono)" font-size="23" font-weight="600">${total}</text>
        <text x="${size / 2}" y="${size / 2 + 15}" text-anchor="middle" fill="#727b98" font-size="10">总计</text>
      </svg>
      <div class="donut-legend">${items.map(i => `
        <div class="dl"><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${i.value}</b></div>`).join('')}
      </div></div>`;
  }

  function columns(items, opts = {}) {
    const max = Math.max(1, ...items.map(i => i.value));
    return `<div class="col-chart">${items.map(i => `
      <div class="cc" title="${esc(i.label)}: ${i.value}">
        <span class="cv">${i.value || ''}</span>
        <div class="cb" style="height:${Math.max(2, i.value / max * 100)}%;${i.color ? `background:linear-gradient(180deg,${i.color},rgba(77,141,255,.25))` : ''}"></div>
        <span class="cl">${esc(i.label)}</span>
      </div>`).join('')}</div>`;
  }

  function heatColor(v, max) {
    if (!v) return 'rgba(255,255,255,.045)';
    const t = Math.min(1, v / (max || 1));
    const a = 0.16 + t * 0.8;
    return `rgba(139,123,255,${a.toFixed(2)})`;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  /* ----------------------------- PDF 引擎 ----------------------------- */
  let pdfPromise = null;
  function loadPdf() {
    if (!window.pdfjsLib) return Promise.reject(new Error('pdf.js 未加载'));
    if (!pdfPromise) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/js/pdf.worker.min.js';
      pdfPromise = window.pdfjsLib.getDocument({
        url: 'assets/cmc-papers.pdf',
        cMapUrl: 'assets/js/cmaps/',
        cMapPacked: true,
      }).promise;
    }
    return pdfPromise;
  }

  class Viewer {
    constructor(stage, toolbar, canvas, opts = {}) {
      this.stage = stage; this.toolbar = toolbar; this.canvas = canvas;
      this.page = 1; this.zoom = 1; this.token = 0;
      this.ctx = null;   // {mode, questionPage, solutionPage, label, title}
      this.opts = opts;
      this.buildToolbar();
      this.stage.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); this.setZoom(this.zoom + (e.deltaY > 0 ? -.1 : .1)); } }, { passive: false });
    }
    buildToolbar() {
      this.toolbar.innerHTML = `
        <button class="icon-btn" data-act="prev" title="上一页">‹</button>
        <input class="pnum" type="number" min="1" max="${meta.pageCount}" value="1" aria-label="页码">
        <span class="pg">/ ${meta.pageCount}</span>
        <button class="icon-btn" data-act="next" title="下一页">›</button>
        <span style="width:8px"></span>
        <button class="icon-btn" data-act="zoomout" title="缩小">−</button>
        <button class="icon-btn" data-act="zoomin" title="放大">+</button>
        <button class="btn sm" data-act="fit">适应宽度</button>
        <span class="sp"></span>
        <span class="mode" id="${this.opts.modeId || 'vmode'}">—</span>
        <button class="btn sm" data-act="swap" title="在题目与解答之间跳转">⇄ 切换</button>
        <a class="btn sm" data-act="raw" href="assets/cmc-papers.pdf" target="_blank" rel="noopener">原件 ↗</a>`;
      this.toolbar.addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const a = b.dataset.act;
        if (a === 'prev') this.go(Math.max(1, this.page - 1));
        if (a === 'next') this.go(Math.min(meta.pageCount, this.page + 1));
        if (a === 'zoomin') this.setZoom(this.zoom + .2);
        if (a === 'zoomout') this.setZoom(this.zoom - .2);
        if (a === 'fit') this.setZoom(1);
        if (a === 'swap') this.swap();
      });
      this.toolbar.querySelector('.pnum').addEventListener('change', e => {
        const n = Math.min(meta.pageCount, Math.max(1, parseInt(e.target.value, 10) || 1));
        this.go(n);
      });
    }
    setZoom(z) { this.zoom = Math.min(3, Math.max(.5, z)); this.render(); }
    setContext(ctx) {
      this.ctx = ctx;
      const mode = this.toolbar.querySelector('.mode');
      if (mode) mode.textContent = ctx ? (ctx.mode === 'solution' ? '参考解答' : '题目版') : 'PDF 阅读';
      const raw = this.toolbar.querySelector('[data-act="raw"]');
      if (raw) raw.href = `assets/cmc-papers.pdf#page=${this.page}`;
    }
    async go(page, ctx) {
      this.page = Math.min(meta.pageCount, Math.max(1, page | 0));
      if (ctx) this.setContext(ctx);
      const inp = this.toolbar.querySelector('.pnum'); if (inp) inp.value = this.page;
      const raw = this.toolbar.querySelector('[data-act="raw"]');
      if (raw) raw.href = `assets/cmc-papers.pdf#page=${this.page}`;
      await this.render();
    }
    swap() {
      if (!this.ctx) { toast('请先从试题列表选择一道题'); return; }
      const toSol = this.ctx.mode !== 'solution';
      this.go(toSol ? this.ctx.solutionPage : this.ctx.questionPage,
        Object.assign({}, this.ctx, { mode: toSol ? 'solution' : 'question' }));
    }
    fail(tk, err) {
      if (tk !== this.token) return;
      const detail = err && err.message ? esc(err.message.slice(0, 120)) : '';
      const old = this.stage.querySelector('.pdf-msg'); if (old) old.remove();
      this.stage.insertAdjacentHTML('beforeend',
        `<div class="pdf-msg"><b>无法载入 PDF 第 ${this.page} 页</b>
         请通过 HTTP 服务打开本站（GitHub Pages 或本地 <code>python -m http.server</code>）。
         ${detail ? `<br><span class="mono" style="font-size:10px">${detail}</span>` : ''}
         <br><a class="btn sm" style="margin-top:10px" href="assets/cmc-papers.pdf#page=${this.page}" target="_blank">直接打开 PDF 原件 ↗</a></div>`);
    }
    async render() {
      const tk = ++this.token;
      const msg = this.stage.querySelector('.pdf-msg');
      if (msg) msg.remove();
      this.canvas.style.display = 'none';
      try {
        const doc = await loadPdf();
        if (tk !== this.token) return;
        const page = await doc.getPage(this.page);
        if (tk !== this.token) return;
        const base = page.getViewport({ scale: 1 });
        const avail = Math.max(280, this.stage.clientWidth - 42);
        const fit = Math.min(2.4, Math.max(.45, avail / base.width));
        const vp = page.getViewport({ scale: fit * this.zoom });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.floor(vp.width * dpr);
        this.canvas.height = Math.floor(vp.height * dpr);
        this.canvas.style.width = vp.width + 'px';
        this.canvas.style.height = vp.height + 'px';
        const c2d = this.canvas.getContext('2d', { alpha: false });
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        c2d.fillStyle = '#fff'; c2d.fillRect(0, 0, vp.width, vp.height);
        await page.render({ canvasContext: c2d, viewport: vp }).promise;
        if (tk === this.token) this.canvas.style.display = 'block';
      } catch (err) {
        if (/Rendering cancelled/i.test(String(err && err.message))) return;
        this.fail(tk, err);
      }
    }
  }

  /* ----------------------------- 全局抽屉 ----------------------------- */
  const drawer = $('#drawer');
  let drawerViewer = null;
  function initDrawer() {
    drawerViewer = new Viewer($('#drawerStage'), $('#drawerToolbar'), $('#drawerCanvas'), { modeId: 'drawerMode' });
  }
  function openPdf(page, ctx, title, sub) {
    if (!drawer.classList.contains('open')) {
      drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
    }
    $('#drawerTitle').textContent = title || 'PDF 阅读器';
    $('#drawerSub').textContent = sub || '';
    drawerViewer.go(page, ctx || null);
    document.body.style.overflow = 'hidden';
  }
  function closePdf() {
    drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  drawer.addEventListener('click', e => { if (e.target.closest('[data-close]')) closePdf(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePdf(); });

  function qCtx(q, mode) {
    return { mode, questionPage: q.questionPage, solutionPage: q.solutionPage,
      label: q.id, title: `${P[pad2(q.paperId)].short} · 第 ${q.cnNum} 题` };
  }
  function openQuestion(q, mode = 'question', viaDrawer = true) {
    if (viaDrawer) {
      openPdf(mode === 'solution' ? q.solutionPage : q.questionPage, qCtx(q, mode),
        `${q.id} · ${mode === 'solution' ? '参考解答' : '题目版'}`,
        `${P[pad2(q.paperId)].year} ${P[pad2(q.paperId)].short} · 第 ${q.cnNum} 题 · PDF 第 ${mode === 'solution' ? q.solutionPage : q.questionPage} 页`);
    }
  }

  /* ----------------------------- 知识卡片组件 ----------------------------- */
  function mathHTML(latex, extraClass = '') {
    if (!latex) return '';
    let inner;
    try {
      if (!window.katex) throw new Error('katex missing');
      inner = window.katex.renderToString(latex,
        { throwOnError: false, strict: false, displayMode: false, trust: false });
    } catch (e) {
      inner = `<code>${esc(latex)}</code>`;
    }
    return `<div class="kc-math ${extraClass}">${inner}</div>`;
  }
  function cardChip(id, withCount = false) {
    const c = C[id]; if (!c) return '';
    return `<a class="chip kchip" href="#/card/${id}" title="${esc(c.typeName)} · ${esc(c.title)}">
      <i class="dot" style="background:${c.typeColor}"></i>${esc(c.title)}${withCount ? ` <span class="mono muted">${c.count}</span>` : ''}</a>`;
  }
  function cardTile(c) {
    return `<a class="kcard" href="#/card/${c.id}" style="--kc:${c.typeColor}">
      <div class="kc-top">
        <span class="kc-badge">${esc(c.typeShort)}</span>
        <span class="kc-id">${c.id}</span>
        <span class="kc-mod" style="color:${c.moduleColor}">${esc(c.moduleName)}</span>
      </div>
      <h3>${esc(c.title)}</h3>
      ${mathHTML(c.latex)}
      <p class="kc-body">${esc(c.body.slice(0, 78))}${c.body.length > 78 ? '…' : ''}</p>
      <div class="kc-foot">
        <span class="chip count">关联 ${c.count} 道题</span>
        <span class="kc-pts">${c.pointIds.length} 个考点</span>
        <span class="kc-go">详情 →</span>
      </div>
    </a>`;
  }
  function questionRows(qs, tableId, attr) {
    return `<div class="card" id="${tableId}" style="padding:6px 14px">
      <table class="tbl"><thead><tr><th>题号</th><th>试卷</th><th>题型</th><th>题干摘要</th><th>考点</th><th>题目页</th><th>解答页</th></tr></thead>
      <tbody>${qs.map(q => `<tr>
        <td><a href="#/paper/${pad2(q.paperId)}?q=${q.id}" class="mono">${q.id}</a></td>
        <td>${q.year} ${esc(P[pad2(q.paperId)].short)}</td>
        <td><span class="badge type">${q.type}</span></td>
        <td style="max-width:340px">${esc(q.excerpt.slice(0, 62))}</td>
        <td>${topicChips(q, 2)}</td>
        <td><button class="btn sm" ${attr}="${q.id}" data-m="question">P${q.questionPage}</button></td>
        <td><button class="btn sm" ${attr}="${q.id}" data-m="solution">P${q.solutionPage}</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }
  function bindQuestionRows(tableId, attr) {
    const t = $('#' + tableId);
    if (t) t.addEventListener('click', e => {
      const b = e.target.closest(`[${attr}]`); if (!b) return;
      openQuestion(Q[b.getAttribute(attr)], b.dataset.m);
    });
  }

  /* ----------------------------- 公共片段 ----------------------------- */
  function topicChips(q, limit = 3) {
    return `<div class="chips">${q.topics.slice(0, limit).map(t => {
      const p = PT[t]; if (!p) return '';
      return `<a class="chip" href="#/topic/${t}" title="${esc(p.text)}"><i class="dot" style="background:${p.color}"></i>${esc(p.short)}</a>`;
    }).join('')}</div>`;
  }
  function paperCard(p) {
    return `<a class="paper-card" href="#/paper/${p.code}">
      <div class="pc-top"><span class="pc-code">卷 ${p.code}</span><span class="pc-year">${p.year}</span></div>
      <div class="pc-title">${esc(p.short)}</div>
      <div class="pc-meta">
        <span class="badge stage-${p.stage}">${p.stage}</span>
        <span class="badge group">${esc(p.group)}</span>
        <span class="badge">第 ${p.edition} 届</span>
      </div>
      <div class="pc-foot"><span>${p.questionCount} 道大题</span><span>题目 P${p.questionPage} · 解答 P${p.solutionPage}</span></div>
    </a>`;
  }
  function crumb(parts) {
    $('#crumb').innerHTML = parts.map((p, i) =>
      i === parts.length - 1 ? `<b>${esc(p.t)}</b>` : `<a href="${p.h}">${esc(p.t)}</a><span class="sep">/</span>`
    ).join('');
  }
  function setNav(route) {
    $$('.nav-item[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    $('#sidebar').classList.remove('open');
  }

  /* ----------------------------- 视图：总览 ----------------------------- */
  function viewHome() {
    setNav('home'); crumb([{ t: '总览' }]);
    const byYear = {};
    papers.forEach(p => { byYear[p.year] = (byYear[p.year] || 0) + 1; });
    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
    const modCounts = modules.map(m => ({
      label: m.name, value: points.filter(p => p.moduleId === m.id).reduce((a, p) => a + cnt(p.id), 0), color: m.color
    })).sort((a, b) => b.value - a.value);
    const hot = D.topics.filter(t => !PT[t.id].moduleId.startsWith('M9'))
      .slice().sort((a, b) => b.count - a.count).slice(0, 10)
      .map(t => ({ label: `${PT[t.id].short}（${t.id}）`, value: t.count, href: `#/topic/${t.id}`, color: PT[t.id].color }));
    const recent = papers.slice(-4).reverse();

    $view.innerHTML = `
      <div class="hero">
        <div class="eyebrow">Chinese Mathematics Competitions · Non-Math Track</div>
        <h1>全国大学生数学竞赛<br><em>历届真题 × 考纲知识地图</em></h1>
        <p>第一至第十七届非数学类初赛、补赛与决赛：${meta.paperCount} 套试卷、${meta.questionCount} 道大题，
           按「卷序.题号」双向索引题目与参考解答；并以《CMC 非数 A 高数考纲》的
           ${meta.officialModuleCount} 个模块 / ${meta.officialPointCount} 个考点为骨架，把每道题挂到知识点上，
           再配 ${meta.cardCount} 张公式 / 定理 / 性质 / 解题方法卡片，与真题逐题对应。</p>
        <div class="actions">
          <a class="btn primary" href="#/papers">浏览历届真题 →</a>
          <a class="btn" href="#/map">打开知识地图 ✦</a>
          <a class="btn" href="#/map?tab=cards">知识卡片 ◇</a>
          <a class="btn" href="#/syllabus">查看考纲</a>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card" style="--c:#8b7bff"><div class="lab">试卷 / PAPERS</div><div class="val">${meta.paperCount}</div><div class="sub">初赛 · 补赛 · 决赛</div></div>
        <div class="stat-card" style="--c:#4d8dff"><div class="lab">大题 / QUESTIONS</div><div class="val">${meta.questionCount}</div><div class="sub">每题含题目页 + 解答页</div></div>
        <div class="stat-card" style="--c:#26c6da"><div class="lab">届次 / EDITIONS</div><div class="val">${meta.editionCount}</div><div class="sub">${meta.yearMin} – ${meta.yearMax}</div></div>
        <div class="stat-card" style="--c:#35d0a5"><div class="lab">考纲考点 / TOPICS</div><div class="val">${meta.officialPointCount}</div><div class="sub">${meta.officialModuleCount} 大模块 + 补充专题</div></div>
      </div>
      <div class="card tight" style="margin-bottom:20px">
        <div class="card-head" style="margin-bottom:10px"><h3>知识卡片速览</h3>
          <a class="hint" href="#/map?tab=cards">全部 ${meta.cardCount} 张 →</a></div>
        <div class="kc-stat-row">${cardTypes.map(t => `
          <a class="kc-stat" href="#/map?tab=cards&type=${t.id}" style="--kc:${t.color}">
            <span class="kc-badge">${esc(t.short)}</span>
            <b class="mono">${meta.cardTypeCounts[t.id] || 0}</b>
            <span class="small muted">${esc(t.name)}</span>
          </a>`).join('')}</div>
      </div>

      <div class="section-title">竞赛时间轴 <span class="n">点击年份查看该年试卷</span></div>
      <div class="card tight"><div class="timeline">${years.map(y => `
        <div class="tl-item" data-goto="#/papers?year=${y}" style="--dc:${byYear[y] > 1 ? '#26c6da' : '#8b7bff'}">
          <div class="ty">${y}</div><div class="td"></div><div class="tc">${byYear[y]} 套</div>
        </div>`).join('')}</div></div>

      <div class="grid2" style="margin-top:20px">
        <div class="card">
          <div class="card-head"><h2>高频考点 Top 10</h2><span class="hint">按关联试题数</span></div>
          ${hbars(hot, { click: true, labelWidth: 165 })}
        </div>
        <div class="card">
          <div class="card-head"><h2>考纲模块题量分布</h2><span class="hint">一题可归多个考点</span></div>
          ${donut(modCounts)}
        </div>
      </div>

      <div class="section-title">最新试卷 <span class="n"><a href="#/papers" style="color:var(--acc)">查看全部 ${meta.paperCount} 套 →</a></span></div>
      <div class="paper-grid">${recent.map(paperCard).join('')}</div>

      <div class="card tight" style="margin-top:22px">
        <div class="small muted">📌 呈现方式：题目与解答以 <b style="color:var(--txt2)">PDF 原件按页高保真渲染</b>（保留公式与图形），
        站点提供逐题跳转、双向索引与全文检索。考点对应由关键词规则自动匹配并做少量人工校正，
        标注依据在每个知识点详情中可见；数学公式请以 PDF 原件为准。</div>
      </div>`;
  }

  /* ----------------------------- 视图：试卷库 ----------------------------- */
  let paperFilter = { stage: '全部', group: '全部', year: '全部', q: '' };
  function viewPapers(params) {
    setNav('papers'); crumb([{ t: '历届真题' }]);
    if (params && params.get('year')) paperFilter.year = params.get('year');
    const years = [...new Set(papers.map(p => p.year))].sort((a, b) => a - b);
    $view.innerHTML = `
      <div class="page-head"><div class="eyebrow">Archive · 42 Papers</div>
        <h1>历届真题</h1>
        <p>2009—2026 年，第一至第十七届非数学类初赛、补赛与决赛。每套试卷均可逐题查看题目版与参考解答。</p></div>
      <div class="filter-bar">
        <div class="filter-group" data-f="stage">${['全部', '初赛', '补赛', '决赛'].map(x => `<button data-v="${x}" class="${paperFilter.stage === x ? 'on' : ''}">${x}</button>`).join('')}</div>
        <div class="filter-group" data-f="group">${['全部', 'A 类', 'B 类', '不分 A/B'].map(x => `<button data-v="${x}" class="${paperFilter.group === x ? 'on' : ''}">${x}</button>`).join('')}</div>
        <select id="fYear"><option value="全部">全部年份</option>${years.map(y => `<option value="${y}" ${String(paperFilter.year) === String(y) ? 'selected' : ''}>${y} 年</option>`).join('')}</select>
        <input type="search" id="fQ" placeholder="搜索年份 / 届次 / 卷序" value="${esc(paperFilter.q)}" style="width:210px">
        <span class="count" id="pCount"></span>
      </div>
      <div class="paper-grid" id="paperGrid"></div>`;

    const draw = () => {
      const list = papers.filter(p =>
        (paperFilter.stage === '全部' || p.stage === paperFilter.stage) &&
        (paperFilter.group === '全部' || p.group === paperFilter.group) &&
        (String(paperFilter.year) === '全部' || p.year === Number(paperFilter.year)) &&
        (!paperFilter.q || `${p.year} ${p.short} ${p.code} ${p.edition}`.toLowerCase().includes(paperFilter.q.toLowerCase()))
      );
      $('#paperGrid').innerHTML = list.length ? list.map(paperCard).join('') : '<div class="empty"><span class="big">◌</span>没有符合条件的试卷</div>';
      $('#pCount').textContent = `${list.length} / ${papers.length} 套`;
    };
    draw();
    $$('.filter-group').forEach(g => g.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      paperFilter[g.dataset.f] = b.dataset.v;
      $$('button', g).forEach(x => x.classList.toggle('on', x === b)); draw();
    }));
    $('#fYear').addEventListener('change', e => { paperFilter.year = e.target.value; draw(); });
    $('#fQ').addEventListener('input', e => { paperFilter.q = e.target.value; draw(); });
  }

  /* ----------------------------- 视图：试卷详情 ----------------------------- */
  function viewPaper(code, focusQid) {
    const p = P[code];
    if (!p) { $view.innerHTML = '<div class="empty">未找到该试卷</div>'; return; }
    setNav('papers');
    crumb([{ t: '历届真题', h: '#/papers' }, { t: `第 ${p.code} 套 · ${p.short}` }]);
    const qs = questions.filter(q => q.paperId === p.id);
    $view.innerHTML = `
      <div class="page-head" style="margin-bottom:16px">
        <div class="eyebrow">Paper ${p.code} / ${meta.paperCount}</div>
        <h1>${p.year} 年 · ${esc(p.short)}</h1>
        <p>全国大学生数学竞赛（非数学类） · 第 ${p.edition} 届 · 共 ${qs.length} 道大题 ·
           题目 P${p.questionPage}–P${p.questionEnd} · 参考解答 P${p.solutionPage}–P${p.solutionEnd}</p>
        <div class="chips" style="margin-top:10px">
          <span class="badge stage-${p.stage}">${p.stage}</span><span class="badge group">${esc(p.group)}</span>
          <a class="btn sm" href="#/paper/${pad2(Math.max(1, p.id - 1))}">← 上一套</a>
          <a class="btn sm" href="#/paper/${pad2(Math.min(meta.paperCount, p.id + 1))}">下一套 →</a>
          <button class="btn sm" id="wholePaper">整卷浏览</button>
        </div>
      </div>
      <div class="split">
        <div>
          <div class="card-head" style="padding:0 2px"><h3>试题列表 <span class="muted mono" style="font-size:11px">${qs.length} 题</span></h3>
            <span class="hint">点击「题目 / 解答」切换右侧页面</span></div>
          <div class="q-list" id="qList">${qs.map(q => `
            <div class="q-item" data-q="${q.id}">
              <div class="qi-top">
                <span class="qi-num">${q.id}</span>
                <span class="badge type">${q.type}</span>
                ${q.points ? `<span class="badge">${q.points} 分</span>` : ''}
                <span class="qi-pages">P${q.questionPage} → P${q.solutionPage}</span>
              </div>
              <div class="qi-excerpt" title="${esc(q.excerpt)}">${esc(q.excerpt)}</div>
              ${topicChips(q, 2)}
              ${q.cardIds && q.cardIds.length ? `<div class="chips" style="margin-top:6px">${q.cardIds.slice(0, 2).map(c => cardChip(c)).join('')}</div>` : ''}
              <div class="qi-actions" style="margin-top:9px">
                <button class="btn sm" data-open="${q.id}" data-mode="question">看题目</button>
                <button class="btn sm" data-open="${q.id}" data-mode="solution">看解答</button>
                <button class="btn sm ghost" data-drawer="${q.id}">抽屉打开 ↗</button>
              </div>
            </div>`).join('')}</div>
        </div>
        <div class="viewer card" style="padding:0;overflow:hidden">
          <div class="card-head" style="padding:14px 16px 10px;margin:0">
            <h3>原卷阅读器 <span class="hint">PDF 高保真渲染</span></h3>
            <span class="hint" id="viewerLabel">—</span>
          </div>
          <div class="pdf-toolbar" id="inlineToolbar"></div>
          <div class="pdf-stage" id="inlineStage"><canvas id="inlineCanvas"></canvas></div>
        </div>
      </div>`;

    const v = new Viewer($('#inlineStage'), $('#inlineToolbar'), $('#inlineCanvas'), { modeId: 'inlineMode' });
    const select = (qid, mode) => {
      const q = Q[qid]; if (!q) return;
      $$('.q-item').forEach(x => x.classList.toggle('active', x.dataset.q === qid));
      $('#viewerLabel').textContent = `${q.id} · 第 ${q.cnNum} 题`;
      v.go(mode === 'solution' ? q.solutionPage : q.questionPage, qCtx(q, mode));
    };
    $('#qList').addEventListener('click', e => {
      const b = e.target.closest('[data-open],[data-drawer]'); if (!b) return;
      if (b.dataset.drawer) { openQuestion(Q[b.dataset.drawer], 'question'); return; }
      select(b.dataset.open, b.dataset.mode);
    });
    $('#wholePaper').addEventListener('click', () => {
      $$('.q-item').forEach(x => x.classList.remove('active'));
      $('#viewerLabel').textContent = '整卷 · 题目版';
      v.go(p.questionPage, null);
    });
    const initial = (focusQid && Q[focusQid] && Q[focusQid].paperId === p.id) ? focusQid : qs[0].id;
    select(initial, 'question');
    if (initial === focusQid) {
      setTimeout(() => {
        const item = $(`.q-item[data-q="${initial}"]`);
        if (item) item.scrollIntoView({ block: 'center' });
      }, 80);
    }
  }

  /* ----------------------------- 视图：知识地图 ----------------------------- */
  let mapState = { layout: 'galaxy', module: '全部', labels: false,
                   selected: null, cardType: '全部', cardQ: '' };
  function buildLayout() {
    const W = 1000, H = 720, cx = 500, cy = 360;
    const mods = modules;
    mods.forEach((m, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / mods.length;
      m._x = cx + 330 * Math.cos(a);
      m._y = cy + 218 * Math.sin(a);
    });
    const nodes = [];
    mods.forEach(m => {
      const pts = points.filter(p => p.moduleId === m.id);
      pts.forEach((p, j) => {
        const seed = p.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const a = -Math.PI / 2 + j * 2 * Math.PI / pts.length + (seed % 17) * .006;
        const c = cnt(p.id);
        const rr = 56 + (j % 3) * 12 + Math.min(30, Math.sqrt(c) * 4.5) + (seed % 9);
        p._x = m._x + rr * Math.cos(a);
        p._y = m._y + rr * Math.sin(a);
        p._r = 5 + Math.min(15, Math.sqrt(c) * 3.1);
        p._hx = m._x; p._hy = m._y;
        nodes.push(p);
      });
    });
    // 轻度斥力，避免重叠
    for (let it = 0; it < 70; it++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b._x - a._x, dy = b._y - a._y;
          let d2 = dx * dx + dy * dy; if (d2 < 1) { dx = .5; dy = .5; d2 = .5; }
          const min = a._r + b._r + 7;
          if (d2 < min * min) {
            const d = Math.sqrt(d2), f = (min - d) / d * .28;
            a._x -= dx * f; a._y -= dy * f; b._x += dx * f; b._y += dy * f;
          }
        }
      }
      nodes.forEach(p => { p._x += (p._hx - p._x) * .012; p._y += (p._hy - p._y) * .012; });
    }
    return { W, H, mods, nodes };
  }

  function mapSide(id) {
    const p = PT[id]; if (!p) return '';
    const t = TP[id], qs = Qof(id);
    const years = [...new Set(qs.map(q => q.year))].sort((a, b) => a - b);
    const byYear = years.map(y => ({ label: String(y).slice(2), value: qs.filter(q => q.year === y).length }));
    return `<div class="card tight">
        <div class="eyebrow" style="margin-bottom:6px">${p.moduleId} · 知识点 ${pad2(p.index)}</div>
        <h2 style="margin:0 0 10px;font-size:16px">${esc(p.short)}</h2>
        <p class="small" style="color:var(--txt2);line-height:1.75;margin:0 0 12px">${esc(p.text)}</p>
        <div class="chips" style="margin-bottom:12px">
          <span class="chip count">关联 ${t.count} 道题</span>
          <span class="chip">覆盖 ${years.length} 个年份</span>
          <a class="chip" href="#/topic/${id}">详情 →</a>
        </div>
        <div class="small muted" style="margin-bottom:6px">年度分布</div>
        ${columns(byYear.slice(-12))}
      </div>
      <div class="card tight">
        <div class="card-head"><h3>相关公式 / 定理 / 方法</h3><span class="hint">${(p.cardIds || []).length} 张</span></div>
        <div class="chips">${(p.cardIds || []).slice(0, 12).map(c => cardChip(c)).join('') || '<span class="small muted">暂无卡片</span>'}</div>
      </div>
      <div class="card tight">
        <div class="card-head"><h3>关联试题</h3><span class="hint">${qs.length} 道</span></div>
        <div class="stack" style="gap:6px">${qs.slice(0, 40).map(q => `
          <a class="topic-link" href="#/paper/${pad2(q.paperId)}?q=${q.id}">
            <span class="tl-id">${q.id}</span>
            <span class="tl-ex">${esc(q.excerpt.slice(0, 34))}</span>
            <span class="tl-pg">P${q.questionPage}</span>
          </a>`).join('') || '<div class="small muted">暂无关联试题</div>'}</div>
      </div>`;
  }

  function viewMap(params) {
    if (params && params.get('tab') === 'cards') mapState.layout = 'cards';
    if (params && params.get('type')) mapState.cardType = params.get('type');
    if (params && !params.get('tab') && mapState.layout === 'cards') mapState.layout = 'galaxy';
    setNav(mapState.layout === 'cards' ? 'cards' : 'map');
    crumb(mapState.layout === 'cards'
      ? [{ t: '知识地图', h: '#/map' }, { t: '知识卡片' }]
      : [{ t: '知识地图' }]);
    if (!mapState.selected) {
      mapState.selected = D.topics.slice().sort((a, b) => b.count - a.count)[0].id;
    }
    $view.innerHTML = `
      <div class="page-head"><div class="eyebrow">Knowledge Graph · Syllabus ↔ Questions ↔ Cards</div>
        <h1>考纲知识地图</h1>
        <p>以《CMC 非数 A 高数考纲》为骨架：${meta.officialModuleCount} 个模块 / ${meta.officialPointCount} 个考点，
           另有 ${modules.length - meta.officialModuleCount} 个补充专题；并配 ${meta.cardCount} 张
           <b style="color:var(--txt2)">公式 / 定理 / 性质 / 解题方法</b>卡片，每张卡片都关联到具体真题。</p></div>
      <div class="map-toolbar">
        <div class="filter-group" id="mapLayout">${[['galaxy', '星系图'], ['tree', '树状图'], ['heat', '热力图'], ['cards', '知识卡片']].map(([k, v]) => `<button data-v="${k}" class="${mapState.layout === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <select id="mapModule"><option value="全部">全部模块</option>${modules.map(m => `<option value="${m.id}" ${mapState.module === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <label class="chip" id="mapLabelsWrap" style="cursor:pointer"><input type="checkbox" id="mapLabels" ${mapState.labels ? 'checked' : ''} style="accent-color:var(--acc)"> 显示考点标签</label>
        <span class="count" style="margin-left:auto;font-family:var(--mono)" id="mapCount"></span>
      </div>
      <div class="map-layout" id="mapLayoutRoot">
        <div id="mapMain"></div>
        <div class="map-side" id="mapSide"></div>
      </div>`;

    const renderSide = () => { $('#mapSide').innerHTML = mapSide(mapState.selected); };
    const renderMain = () => {
      const box = $('#mapMain');
      const isCards = mapState.layout === 'cards';
      $('#mapLayoutRoot').classList.toggle('wide', isCards);
      $('#mapLabelsWrap').style.display = isCards ? 'none' : '';
      if (isCards) { box.innerHTML = cardsHTML(); initCards(); }
      else if (mapState.layout === 'galaxy') { box.innerHTML = galaxyHTML(); initGalaxy(renderSide); }
      else if (mapState.layout === 'tree') box.innerHTML = treeHTML();
      else box.innerHTML = heatHTML();
      $('#mapCount').textContent = isCards
        ? `${cards.length} 张卡片`
        : `${modules.length} 模块 · ${points.length} 考点`;
      if (isCards) $('#mapSide').innerHTML = '';
      else renderSide();
    };

    $('#mapLayout').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      mapState.layout = b.dataset.v;
      $$('#mapLayout button').forEach(x => x.classList.toggle('on', x === b));
      setNav(mapState.layout === 'cards' ? 'cards' : 'map');
      crumb(mapState.layout === 'cards'
        ? [{ t: '知识地图', h: '#/map' }, { t: '知识卡片' }] : [{ t: '知识地图' }]);
      renderMain();
    });
    $('#mapModule').addEventListener('change', e => {
      mapState.module = e.target.value;
      if (mapState.layout === 'cards') { /* 卡片墙有自己的模块筛选器 */ }
      renderMain();
    });
    $('#mapLabels').addEventListener('change', e => { mapState.labels = e.target.checked; renderMain(); });
    renderMain();
  }

  /* ---------- 知识卡片墙 ---------- */
  function cardsHTML() {
    return `<div class="card" style="padding:16px 18px">
      <div class="card-head"><h2>公式 / 定理 / 性质 / 解题方法卡片</h2>
        <span class="hint">点击卡片查看条件、要点与关联真题</span></div>
      <div class="card-filters">
        <div class="filter-group" id="cardTypes">${[['全部', '全部']].concat(cardTypes.map(t => [t.id, t.name]))
          .map(([k, v]) => `<button data-v="${k}" class="${mapState.cardType === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <select id="cardModule"><option value="全部">全部模块</option>${modules.map(m => `<option value="${m.id}" ${mapState.module === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <input type="search" id="cardQ" placeholder="搜索卡片标题 / 内容…" value="${esc(mapState.cardQ)}" style="width:230px">
        <span class="count" id="cardCount" style="margin-left:auto;font-family:var(--mono)"></span>
      </div>
      <div class="card-wall" id="cardWall"></div>
    </div>`;
  }
  function initCards() {
    const draw = () => {
      const q = mapState.cardQ.trim().toLowerCase();
      const list = cards.filter(c =>
        (mapState.cardType === '全部' || c.type === mapState.cardType) &&
        (mapState.module === '全部' || c.moduleId === mapState.module) &&
        (!q || `${c.id} ${c.title} ${c.body} ${c.cond} ${c.tip} ${c.moduleName} ${c.latex}`.toLowerCase().includes(q))
      );
      $('#cardWall').innerHTML = list.length
        ? list.map(cardTile).join('')
        : '<div class="empty"><span class="big">◌</span>没有符合条件的卡片，试试「中值」「积分」「级数」</div>';
      $('#cardCount').textContent = `${list.length} / ${cards.length} 张`;
    };
    draw();
    $('#cardTypes').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      mapState.cardType = b.dataset.v;
      $$('#cardTypes button').forEach(x => x.classList.toggle('on', x === b)); draw();
    });
    $('#cardModule').addEventListener('change', e => { mapState.module = e.target.value; draw(); });
    $('#cardQ').addEventListener('input', e => { mapState.cardQ = e.target.value; draw(); });
  }

  function galaxyHTML() {
    const L = buildLayout();
    const visM = mapState.module === '全部' ? L.mods : L.mods.filter(m => m.id === mapState.module);
    const visP = L.nodes.filter(p => mapState.module === '全部' || p.moduleId === mapState.module);
    const edges = visP.map(p => `<path class="edge" d="M${p._hx.toFixed(1)},${p._hy.toFixed(1)} L${p._x.toFixed(1)},${p._y.toFixed(1)}" stroke="${p.color}" stroke-opacity=".22"/>`).join('');
    const spokes = visM.map(m => `<line x1="${L.W / 2}" y1="${L.H / 2}" x2="${m._x}" y2="${m._y}"
        stroke="rgba(139,123,255,.12)" stroke-dasharray="3 7"/>`).join('');
    const hubs = visM.map(m => {
      const c = points.filter(p => p.moduleId === m.id).reduce((a, p) => a + cnt(p.id), 0);
      return `<g>
        <circle cx="${m._x}" cy="${m._y}" r="34" fill="${m.color}" fill-opacity=".1" stroke="${m.color}" stroke-opacity=".45"/>
        <circle cx="${m._x}" cy="${m._y}" r="20" fill="${m.color}" fill-opacity=".28"/>
        <text class="hub-lab" x="${m._x}" y="${m._y + 5}">${m.id}</text>
        <text x="${m._x}" y="${m._y + 52}" text-anchor="middle" font-size="10.5" fill="#a7aec6" style="pointer-events:none">${esc(m.name)}</text>
        <text x="${m._x}" y="${m._y + 67}" text-anchor="middle" font-size="9.5" fill="#6b7391" style="pointer-events:none" font-family="var(--mono)">${c} 题次</text>
      </g>`;
    }).join('');
    const nodes = visP.map(p => {
      const c = cnt(p.id), sel = p.id === mapState.selected;
      const lab = mapState.labels ? `<text class="node-lab" x="${p._x}" y="${p._y + p._r + 12}" text-anchor="middle">${esc(p.short.slice(0, 8))}</text>` : '';
      return `<g data-href="#/topic/${p.id}" data-tip="${esc(p.id + '|' + p.short + '|' + c)}" style="cursor:pointer">
        <circle cx="${p._x}" cy="${p._y}" r="${p._r + (sel ? 7 : 0)}" fill="${p.color}" fill-opacity="${sel ? .18 : .07}"/>
        <circle cx="${p._x}" cy="${p._y}" r="${p._r.toFixed(1)}" fill="${p.color}" fill-opacity="${sel ? .95 : .72}"
                stroke="${sel ? '#fff' : p.color}" stroke-width="${sel ? 2 : 1}" stroke-opacity=".9"/>
        <text x="${p._x}" y="${p._y + 3.5}" text-anchor="middle" font-size="9" fill="#0b0d18" font-family="var(--mono)"
              style="pointer-events:none;font-weight:700">${c}</text>
        ${lab}
      </g>`;
    }).join('');
    return `<div class="map-canvas">
      <svg id="mapSvg" viewBox="0 0 ${L.W} ${L.H}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="coreGrad"><stop offset="0%" stop-color="#8b7bff" stop-opacity=".42"/>
            <stop offset="100%" stop-color="#4d8dff" stop-opacity=".06"/></radialGradient>
        </defs>
        <g id="mapRoot">
          <g>${spokes}</g>
          <g>
            <circle cx="${L.W / 2}" cy="${L.H / 2}" r="72" fill="url(#coreGrad)" stroke="rgba(139,123,255,.35)"/>
            <circle cx="${L.W / 2}" cy="${L.H / 2}" r="50" fill="rgba(139,123,255,.09)" stroke="rgba(139,123,255,.3)"/>
            <text x="${L.W / 2}" y="${L.H / 2 - 5}" text-anchor="middle" font-size="19"
                  font-family="var(--mono)" font-weight="700" fill="#d8d0ff" style="pointer-events:none">CMC</text>
            <text x="${L.W / 2}" y="${L.H / 2 + 15}" text-anchor="middle" font-size="10.5"
                  fill="#8b93b8" style="pointer-events:none">考纲知识地图</text>
            <text x="${L.W / 2}" y="${L.H / 2 + 31}" text-anchor="middle" font-size="9.5"
                  font-family="var(--mono)" fill="#666e90" style="pointer-events:none">8 模块 · 62 考点 · 272 题</text>
          </g>
          <g>${edges}</g><g>${hubs}</g><g>${nodes}</g>
        </g>
      </svg>
      <div class="map-hint">滚轮缩放 · 拖拽平移 · 点击节点</div>
      <div class="map-legend">${modules.map(m => `<span><i style="background:${m.color}"></i>${esc(m.name)}</span>`).join('')}</div>
    </div>`;
  }

  function initGalaxy(onSelect) {
    const svg = $('#mapSvg'); if (!svg) return;
    const root = $('#mapRoot');
    let tx = 0, ty = 0, sc = 1, dragging = false, lx = 0, ly = 0;
    const apply = () => root.setAttribute('transform', `translate(${tx},${ty}) scale(${sc})`);
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width * 1000;
      const my = (e.clientY - r.top) / r.height * 720;
      const old = sc; sc = Math.min(2.6, Math.max(.55, sc * (e.deltaY > 0 ? .9 : 1.11)));
      tx = mx - (mx - tx) * (sc / old); ty = my - (my - ty) * (sc / old); apply();
    }, { passive: false });
    svg.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; svg.classList.add('dragging'); svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => {
      if (dragging) { const r = svg.getBoundingClientRect(); tx += (e.clientX - lx) * 1000 / r.width; ty += (e.clientY - ly) * 720 / r.height; lx = e.clientX; ly = e.clientY; apply(); }
      const t = e.target.closest('[data-tip]');
      const tip = $('#tooltip');
      if (t) {
        const [id, name, c] = t.dataset.tip.split('|');
        tip.innerHTML = `<b>${esc(name)}</b><span class="tsub">${esc(id)} · 关联 ${esc(c)} 道题</span><div style="margin-top:4px;color:var(--txt2)">点击查看考纲条目与试题</div>`;
        tip.hidden = false; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
      } else tip.hidden = true;
    });
    svg.addEventListener('pointerup', e => { dragging = false; svg.classList.remove('dragging'); });
    svg.addEventListener('pointerleave', () => { dragging = false; $('#tooltip').hidden = true; });
    svg.addEventListener('click', e => {
      const t = e.target.closest('[data-href]'); if (!t || dragging) return;
      mapState.selected = t.dataset.href.split('/').pop();
      location.hash = t.dataset.href;
    });
  }

  function treeHTML() {
    const visM = mapState.module === '全部' ? modules : modules.filter(m => m.id === mapState.module);
    const max = Math.max(1, ...points.map(p => cnt(p.id)));
    return `<div class="card"><div class="card-head"><h2>考纲 → 考点 → 试题</h2><span class="hint">条形长度 = 关联试题数</span></div>
      ${visM.map(m => `<div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          <i style="width:10px;height:10px;border-radius:3px;background:${m.color}"></i>
          <b style="font-size:13.5px">${esc(m.name)}</b>
          <span class="mono small muted">${m.id} · ${m.count} 条目${m.extra ? ' · 补充' : ''}</span>
        </div>
        ${hbars(points.filter(p => p.moduleId === m.id).map(p => ({
          label: `${pad2(p.index)}  ${p.short}`, value: cnt(p.id), color: p.color,
          href: `#/topic/${p.id}`, click: true
        })), { max, labelWidth: 200, click: true })}
      </div>`).join('')}</div>`;
  }

  function heatHTML() {
    const eds = [...new Set(papers.map(p => p.edition))].sort((a, b) => a - b);
    const visM = mapState.module === '全部' ? modules : modules.filter(m => m.id === mapState.module);
    const values = [];
    visM.forEach(m => {
      const qs = questions.filter(q => q.topics.some(t => PT[t] && PT[t].moduleId === m.id));
      eds.forEach(e => values.push({ m: m.id, e, v: qs.filter(q => q.edition === e).length }));
    });
    const max = Math.max(1, ...values.map(x => x.v));
    const cols = `28px 132px repeat(${eds.length},minmax(26px,1fr))`;
    return `<div class="card"><div class="card-head"><h2>模块 × 届次 热力图</h2><span class="hint">单元格 = 该届涉及该模块的试题数</span></div>
      <div class="heat-wrap"><div class="heat-grid" style="grid-template-columns:${cols}">
        <div></div><div class="heat-col-lab" style="text-align:left">模块 / 届次</div>
        ${eds.map(e => `<div class="heat-col-lab">${e}</div>`).join('')}
        ${visM.map(m => `
          <div class="heat-row-lab" style="grid-column:1/3"><i style="width:8px;height:8px;border-radius:2px;background:${m.color}"></i>${esc(m.name)}</div>
          ${eds.map(e => {
            const v = values.find(x => x.m === m.id && x.e === e).v;
            return `<div class="heat-cell" style="background:${heatColor(v, max)}" title="第 ${e} 届 · ${esc(m.name)}：${v} 题">${v || ''}</div>`;
          }).join('')}`).join('')}
      </div></div>
      <div class="heat-scale">低 ${[0, .2, .4, .6, .8, 1].map(t => `<i style="background:${heatColor(t * max, max)}"></i>`).join('')} 高（峰值 ${max} 题）</div>
    </div>`;
  }

  /* ----------------------------- 视图：知识点详情 ----------------------------- */
  function viewTopic(id) {
    const p = PT[id], t = TP[id];
    if (!p) { $view.innerHTML = '<div class="empty">未找到该知识点</div>'; return; }
    setNav('map'); mapState.selected = id;
    crumb([{ t: '知识地图', h: '#/map' }, { t: p.moduleName, h: '#/map' }, { t: `${id} ${p.short}` }]);
    const qs = Qof(id);
    const years = [...new Set(qs.map(q => q.year))].sort((a, b) => a - b);
    const byStage = ['初赛', '补赛', '决赛'].map(s => ({ label: s, value: qs.filter(q => q.stage === s).length, color: s === '决赛' ? '#ff7a59' : '#8b7bff' }));
    const byYear = years.map(y => ({ label: String(y).slice(2), value: qs.filter(q => q.year === y).length }));
    const kw = p.keywords.map(k => `<span class="chip">${esc(k.kw)} <span class="mono muted">×${k.w}</span></span>`).join('');
    $view.innerHTML = `
      <div class="page-head">
        <div class="eyebrow">${esc(p.moduleName)} · ${id} · 考纲第 ${pad2(p.index)} 条</div>
        <h1>${esc(p.short)}</h1>
        <p>${esc(p.text)}</p>
      </div>
      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card" style="--c:${p.color}"><div class="lab">关联试题</div><div class="val">${t.count}</div><div class="sub">占全部 ${(t.count / questions.length * 100).toFixed(1)}%</div></div>
        <div class="stat-card" style="--c:#4d8dff"><div class="lab">覆盖年份</div><div class="val">${years.length}</div><div class="sub">${years[0] || '—'} – ${years[years.length - 1] || '—'}</div></div>
        <div class="stat-card" style="--c:#26c6da"><div class="lab">涉及试卷</div><div class="val">${new Set(qs.map(q => q.paperId)).size}</div><div class="sub">共 ${papers.length} 套</div></div>
        <div class="stat-card" style="--c:#35d0a5"><div class="lab">题型</div><div class="val" style="font-size:19px">${['填空题', '解答题', '证明题'].map(x => qs.filter(q => q.type === x).length).join(' / ')}</div><div class="sub">填空 / 解答 / 证明</div></div>
      </div>
      <div class="grid2" style="margin-top:18px">
        <div class="card"><div class="card-head"><h2>年度分布</h2><span class="hint">${years[0] || ''} – ${years[years.length - 1] || ''}</span></div>${columns(byYear)}</div>
        <div class="card"><div class="card-head"><h2>阶段分布</h2><span class="hint">初赛 / 补赛 / 决赛</span></div>${donut(byStage.filter(x => x.value))}
          <div class="divider"></div><div class="small muted" style="margin-bottom:8px">自动标注依据（关键词 · 权重）</div><div class="chips">${kw}</div></div>
      </div>
      <div class="section-title">相关公式 / 定理 / 性质 / 方法 <span class="n">${(p.cardIds || []).length} 张卡片 · 均可跳到真题</span></div>
      <div class="card"><div class="card-wall compact">${(p.cardIds || []).map(id => cardTile(C[id])).join('') || '<div class="small muted">暂无卡片</div>'}</div></div>
      <div class="section-title">关联试题 <span class="n">${qs.length} 道 · 点击直接跳转到 PDF 原页</span></div>
      <div class="card" id="topicTable" style="padding:6px 14px">
        <table class="tbl"><thead><tr><th>题号</th><th>试卷</th><th>题型</th><th>题干摘要</th><th>考点</th><th>题目页</th><th>解答页</th></tr></thead>
        <tbody>${qs.map(q => `<tr>
          <td><a href="#/paper/${pad2(q.paperId)}?q=${q.id}" class="mono">${q.id}</a></td>
          <td>${q.year} ${esc(P[pad2(q.paperId)].short)}</td>
          <td><span class="badge type">${q.type}</span></td>
          <td style="max-width:340px">${esc(q.excerpt.slice(0, 62))}</td>
          <td>${topicChips(q, 2)}</td>
          <td><button class="btn sm" data-openq="${q.id}" data-m="question">P${q.questionPage}</button></td>
          <td><button class="btn sm" data-openq="${q.id}" data-m="solution">P${q.solutionPage}</button></td>
        </tr>`).join('')}</tbody></table>
      </div>`;
    $('#topicTable').addEventListener('click', e => {
      const b = e.target.closest('[data-openq]'); if (!b) return;
      openQuestion(Q[b.dataset.openq], b.dataset.m);
    });
  }

  /* ----------------------------- 视图：知识卡片详情 ----------------------------- */
  function viewCard(id) {
    const c = C[id];
    if (!c) { $view.innerHTML = '<div class="empty">未找到该知识卡片</div>'; return; }
    setNav('cards');
    crumb([{ t: '知识地图', h: '#/map' }, { t: '知识卡片', h: '#/map?tab=cards' }, { t: c.title }]);
    const qs = QofC(id);
    const years = [...new Set(qs.map(q => q.year))].sort((a, b) => a - b);
    const byYear = years.map(y => ({ label: String(y).slice(2), value: qs.filter(q => q.year === y).length }));
    const hitWords = [...new Set(Object.values(c.hits || {}).flat())].slice(0, 12);

    $view.innerHTML = `
      <div class="page-head">
        <div class="eyebrow"><span class="kc-badge" style="--kc:${c.typeColor};display:inline-grid;margin-right:8px">${esc(c.typeShort)}</span>
          ${esc(c.typeName)} · ${c.id} · ${esc(c.moduleName)}</div>
        <h1>${esc(c.title)}</h1>
        <p>${esc(c.body)}</p>
        <div class="chips" style="margin-top:10px">
          <a class="chip count" href="#/map?tab=cards&type=${c.type}">${esc(c.typeName)}卡片</a>
          <span class="chip">关联 ${c.count} 道真题</span>
          <span class="chip">${c.pointIds.length} 个考点</span>
          ${c.match === 'fallback' ? '<span class="chip">含考点兜底关联</span>' : ''}
        </div>
      </div>

      <div class="kdetail-grid">
        <div class="card kdetail-main" style="--kc:${c.typeColor}">
          <div class="card-head"><h2>公式 / 结论</h2><span class="hint">KaTeX 排版</span></div>
          ${mathHTML(c.latex, 'kc-math-big')}
          <div class="divider"></div>
          <div class="kc-sec"><span class="kc-sec-t">条件与适用</span><p>${esc(c.cond) || '—'}</p></div>
          <div class="kc-sec"><span class="kc-sec-t">使用提示 / 易错点</span><p>${esc(c.tip) || '—'}</p></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h2>对应考纲考点</h2></div>
            <div class="chips">${c.pointIds.map(t => `<a class="chip" href="#/topic/${t}"><i class="dot" style="background:${PT[t] ? PT[t].color : '#888'}"></i>${esc(PT[t] ? PT[t].short : t)}</a>`).join('')}</div>
            <div class="divider"></div>
            <div class="card-head"><h2>关联真题 · 年度分布</h2><span class="hint">${c.count} 道</span></div>
            ${columns(byYear.slice(-14))}
          </div>
          <div class="card"><div class="card-head"><h2>匹配依据</h2><span class="hint">关键词自动匹配</span></div>
            <div class="chips">${hitWords.map(w => `<span class="chip">${esc(w)}</span>`).join('') || '<span class="small muted">人工指定 / 考点兜底</span>'}</div>
            <div class="small muted" style="margin-top:10px">卡片与试题的对应由关键词规则生成（人工指定题优先），
              少量题目由关联考点兜底补全；可据此判断某道题是否真正用到本卡片。</div>
          </div>
        </div>
      </div>

      <div class="section-title">关联真题 <span class="n">${qs.length} 道 · 题目页 / 解答页均可直接打开 PDF 原卷</span></div>
      ${questionRows(qs, 'cardTable', 'data-openq')}
      <div class="card tight" style="margin-top:18px"><div class="small muted">
        ◇ 同模块其他卡片：<div class="chips" style="margin-top:8px">${cards.filter(x => x.moduleId === c.moduleId && x.id !== c.id).slice(0, 14).map(x => cardChip(x.id)).join('')}</div>
      </div></div>`;
    bindQuestionRows('cardTable', 'data-openq');
  }

  /* ----------------------------- 视图：考纲全文 ----------------------------- */
  let sylClosed = {};
  function viewSyllabus() {
    setNav('syllabus'); crumb([{ t: '考纲全文' }]);
    $view.innerHTML = `
      <div class="page-head"><div class="eyebrow">Syllabus · CMC 非数 A 类</div>
        <h1>${esc(syl.title)}</h1>
        <p>逐条转录自 <span class="mono">${esc(syl.source)}</span>：${meta.officialModuleCount} 个模块 / ${meta.officialPointCount} 个考点，
           另设补充专题收纳考纲未单列的高频方法与真超纲试题。每个条目后的数字为自动关联到的试题数。</p></div>
      <div id="sylWrap">${modules.map(m => {
        const c = points.filter(p => p.moduleId === m.id).reduce((a, p) => a + cnt(p.id), 0);
        return `<div class="card syl-module ${sylClosed[m.id] ? 'closed' : ''}" data-mid="${m.id}" style="padding:0">
          <div class="syl-head" data-toggle="${m.id}">
            <span class="idx" style="--c:${m.color};background:${m.color}">${m.id.replace('M', '')}</span>
            <h2>${esc(m.name)} ${m.extra ? '<span class="badge" style="margin-left:6px">补充</span>' : ''}</h2>
            <span class="meta">${m.count} 条目 · ${c} 题次</span><span class="chev">⌄</span>
          </div>
          <div class="syl-body">${points.filter(p => p.moduleId === m.id).map(p => `
            <div class="syl-item">
              <span class="n">${pad2(p.index)}</span>
              <span class="tx">${esc(p.text)}</span>
              <span class="go"><a class="chip count" href="#/topic/${p.id}">${cnt(p.id)} 题 →</a>
                <span class="small muted mono">${p.id}</span></span>
            </div>`).join('')}</div>
        </div>`;
      }).join('')}
      </div>
      <div class="card tight" style="margin-top:18px"><div class="small muted">
        📎 说明：试题与考点的对应关系由 <span class="mono">scripts/build_data.py</span> 中的关键词规则自动匹配，
        并对少量超纲题做人工校正。可在知识点详情页查看「自动标注依据」，或编辑
        <span class="mono">scripts/syllabus_source.json</span> 后重新运行脚本更新。</div></div>`;
    $('#sylWrap').addEventListener('click', e => {
      const h = e.target.closest('[data-toggle]'); if (!h) return;
      const mid = h.dataset.toggle; sylClosed[mid] = !sylClosed[mid];
      h.parentElement.classList.toggle('closed', sylClosed[mid]);
    });
  }

  /* ----------------------------- 视图：统计 ----------------------------- */
  function viewStats() {
    setNav('stats'); crumb([{ t: '统计分析' }]);
    const modCounts = modules.map(m => ({
      label: m.name, value: points.filter(p => p.moduleId === m.id).reduce((a, p) => a + cnt(p.id), 0),
      color: m.color, href: '#/map'
    })).sort((a, b) => b.value - a.value);
    const byYearPapers = [...new Set(papers.map(p => p.year))].sort((a, b) => a - b)
      .map(y => ({ label: String(y).slice(2), value: papers.filter(p => p.year === y).length }));
    const byYearQ = [...new Set(questions.map(q => q.year))].sort((a, b) => a - b)
      .map(y => ({ label: String(y).slice(2), value: questions.filter(q => q.year === y).length }));
    const stages = ['初赛', '补赛', '决赛'].map((s, i) => ({
      label: s, value: papers.filter(p => p.stage === s).length,
      color: ['#8b7bff', '#26c6da', '#ff7a59'][i]
    }));
    const types = ['填空题', '解答题', '证明题'].map((s, i) => ({
      label: s, value: questions.filter(q => q.type === s).length,
      color: ['#35d0a5', '#4d8dff', '#f0b429'][i]
    }));
    const hot = D.topics.slice().sort((a, b) => b.count - a.count).slice(0, 15)
      .map(t => ({ label: `${PT[t.id].short} · ${t.id}`, value: t.count, color: PT[t.id].color, href: `#/topic/${t.id}` }));
    const cardDist = cardTypes.map(t => ({
      label: t.name, value: cards.filter(c => c.type === t.id).length,
      color: t.color, href: `#/map?tab=cards&type=${t.id}`
    }));
    $view.innerHTML = `
      <div class="page-head"><div class="eyebrow">Analytics · 272 Questions · ${meta.cardCount} Cards</div><h1>统计分析</h1>
        <p>基于 ${papers.length} 套试卷 / ${questions.length} 道大题 / ${meta.cardCount} 张知识卡片的自动标注结果。一道题可归入多个考点与多张卡片，故分项总和大于试题数。</p></div>
      <div class="grid2">
        <div class="card"><div class="card-head"><h2>各模块题次</h2><span class="hint">点击可前往知识地图</span></div>${hbars(modCounts, { click: true, labelWidth: 145 })}</div>
        <div class="card"><div class="card-head"><h2>试卷阶段 / 试题题型</h2></div>
          <div class="small muted" style="margin-bottom:6px">试卷阶段（套）</div>${donut(stages, 140)}
          <div class="divider"></div><div class="small muted" style="margin-bottom:6px">试题题型（道）</div>${donut(types, 140)}</div>
      </div>
      <div class="grid2" style="margin-top:18px">
        <div class="card"><div class="card-head"><h2>逐年试卷数</h2><span class="hint">2009 – 2026</span></div>${columns(byYearPapers)}</div>
        <div class="card"><div class="card-head"><h2>逐年大题数</h2><span class="hint">按试卷年份归集</span></div>${columns(byYearQ, { color: '#26c6da' })}</div>
      </div>
      <div class="card" style="margin-top:18px"><div class="card-head"><h2>最常考的 15 个知识点</h2><span class="hint">点击查看详情</span></div>
        ${hbars(hot, { click: true, labelWidth: 210 })}</div>
      <div class="card" style="margin-top:18px"><div class="card-head"><h2>知识卡片构成</h2>
          <a class="hint" href="#/map?tab=cards">查看全部 ${cards.length} 张 →</a></div>
        ${hbars(cardDist, { click: true, labelWidth: 130 })}
        <div class="small muted" style="margin-top:12px">每张卡片平均关联 ${(cards.reduce((a, c) => a + c.count, 0) / cards.length).toFixed(1)} 道真题。</div></div>
      <div class="card" style="margin-top:18px"><div class="card-head"><h2>模块 × 届次 热力图</h2><span class="hint">切换「知识地图 → 热力图」可交互</span></div>${heatHTMLInner()}</div>`;
  }

  function heatHTMLInner() {
    const eds = [...new Set(papers.map(p => p.edition))].sort((a, b) => a - b);
    const vals = [];
    modules.forEach(m => {
      const qs = questions.filter(q => q.topics.some(t => PT[t] && PT[t].moduleId === m.id));
      eds.forEach(e => vals.push({ m: m.id, e, v: qs.filter(q => q.edition === e).length }));
    });
    const max = Math.max(1, ...vals.map(x => x.v));
    return `<div class="heat-wrap"><div class="heat-grid" style="grid-template-columns:150px repeat(${eds.length},minmax(24px,1fr))">
      <div></div>${eds.map(e => `<div class="heat-col-lab">${e}</div>`).join('')}
      ${modules.map(m => `<div class="heat-row-lab"><i style="width:8px;height:8px;border-radius:2px;background:${m.color}"></i>${esc(m.name)}</div>
        ${eds.map(e => { const v = vals.find(x => x.m === m.id && x.e === e).v; return `<div class="heat-cell" style="background:${heatColor(v, max)}" title="第 ${e} 届 · ${esc(m.name)}：${v} 题">${v || ''}</div>`; }).join('')}`).join('')}
    </div></div><div class="heat-scale">低 ${[0, .2, .4, .6, .8, 1].map(t => `<i style="background:${heatColor(t * max, max)}"></i>`).join('')} 高（峰值 ${max} 题）</div>`;
  }

  /* ----------------------------- 视图：搜索 ----------------------------- */
  function viewSearch(params) {
    const q = (params.get('q') || '').trim();
    setNav(''); crumb([{ t: `搜索：${q || '全部'}` }]);
    const low = q.toLowerCase();
    const hitQ = q ? questions.filter(x =>
      `${x.id} ${x.heading} ${x.stem} ${x.solution} ${x.excerpt} ${x.topics.map(t => PT[t] ? PT[t].short : '').join(' ')}`.toLowerCase().includes(low)
    ) : [];
    const hitP = q ? papers.filter(x => `${x.year} ${x.short} ${x.title} ${x.code} ${x.stage} ${x.group}`.toLowerCase().includes(low)) : [];
    const hitT = q ? points.filter(x => `${x.id} ${x.text} ${x.moduleName} ${x.short}`.toLowerCase().includes(low)) : [];
    const hitC = q ? cards.filter(x => `${x.id} ${x.title} ${x.typeName} ${x.body} ${x.cond} ${x.tip} ${x.latex} ${x.moduleName}`.toLowerCase().includes(low)) : [];
    $view.innerHTML = `
      <div class="page-head"><div class="eyebrow">Search</div><h1>搜索结果</h1>
        <p>关键词「<b style="color:var(--acc)">${esc(q)}</b>」命中 ${hitQ.length} 道试题 · ${hitP.length} 套试卷 · ${hitT.length} 个考点 · ${hitC.length} 张知识卡片。</p></div>
      ${!q ? '<div class="empty"><span class="big">⌕</span>在右上角输入关键词，或直接按 / 聚焦搜索框</div>' : ''}
      ${hitC.length ? `<div class="section-title">知识卡片 <span class="n">${hitC.length}</span></div>
        <div class="card"><div class="card-wall compact">${hitC.slice(0, 12).map(cardTile).join('')}</div></div>` : ''}
      ${hitT.length ? `<div class="section-title">考点 <span class="n">${hitT.length}</span></div>
        <div class="card"><div class="chips">${hitT.slice(0, 40).map(p => `<a class="chip" href="#/topic/${p.id}"><i class="dot" style="background:${p.color}"></i>${esc(p.short)} · ${cnt(p.id)} 题</a>`).join('')}</div></div>` : ''}
      ${hitP.length ? `<div class="section-title">试卷 <span class="n">${hitP.length}</span></div><div class="paper-grid">${hitP.slice(0, 12).map(paperCard).join('')}</div>` : ''}
      ${hitQ.length ? `<div class="section-title">试题 <span class="n">${hitQ.length}</span></div>
        <div class="card" id="searchTable" style="padding:6px 14px"><table class="tbl"><thead><tr><th>题号</th><th>试卷</th><th>摘要</th><th>考点</th><th>题目</th><th>解答</th></tr></thead>
        <tbody>${hitQ.slice(0, 150).map(x => `<tr>
          <td><a class="mono" href="#/paper/${pad2(x.paperId)}?q=${x.id}">${x.id}</a></td>
          <td class="small">${x.year} ${esc(P[pad2(x.paperId)].short)}</td>
          <td style="max-width:380px">${esc(x.excerpt.slice(0, 70))}</td>
          <td>${topicChips(x, 2)}</td>
          <td><button class="btn sm" data-sq="${x.id}" data-sm="question">P${x.questionPage}</button></td>
          <td><button class="btn sm" data-sq="${x.id}" data-sm="solution">P${x.solutionPage}</button></td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${q && !hitQ.length && !hitP.length && !hitT.length && !hitC.length ? '<div class="empty"><span class="big">◌</span>没有匹配结果，试试「中值定理」「格林」「幂级数」「矩阵」等关键词</div>' : ''}`;
    const st = $('#searchTable');
    if (st) st.addEventListener('click', e => {
      const b = e.target.closest('[data-sq]'); if (!b) return;
      openQuestion(Q[b.dataset.sq], b.dataset.sm);
    });
  }

  /* ----------------------------- 路由 ----------------------------- */
  function route() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    $('#tooltip').hidden = true;
    if (!parts.length) viewHome();
    else if (parts[0] === 'papers') viewPapers(params);
    else if (parts[0] === 'paper') {
      viewPaper(parts[1], params.get('q'));
      return;
    }
    else if (parts[0] === 'map') viewMap(params);
    else if (parts[0] === 'topic') viewTopic(parts[1]);
    else if (parts[0] === 'card') viewCard(parts[1]);
    else if (parts[0] === 'stats') viewStats();
    else if (parts[0] === 'syllabus') viewSyllabus();
    else if (parts[0] === 'search') viewSearch(params);
    else viewHome();
  }

  /* ----------------------------- 全局交互 ----------------------------- */
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]');
    if (g) { location.hash = g.dataset.goto; return; }
    const d = e.target.closest('[data-drawer]');
    // 试卷详情内自行处理，这里兜底其它位置
  });
  $('#openReader').addEventListener('click', () => {
    openPdf(1, null, 'PDF 原件 · 总目录', `《${meta.pdfTitle}》共 ${meta.pageCount} 页`);
  });
  const search = $('#globalSearch');
  let searchTimer;
  function doSearch() {
    const q = search.value.trim();
    if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
  }
  search.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { if (search.value.trim().length >= 3) doSearch(); }, 700); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== search && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault(); search.focus();
    }
  });
  $('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  /* ----------------------------- 启动 ----------------------------- */
  $('#sfPapers').textContent = meta.paperCount;
  $('#sfQuestions').textContent = meta.questionCount;
  $('#sfPoints').textContent = meta.officialPointCount;
  initDrawer();
  window.addEventListener('hashchange', route);
  route();
})();
