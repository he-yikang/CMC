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
  const subjects = syl.subjects || [];
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
    const sum = items.reduce((a, b) => a + b.value, 0);
    const total = sum || 1;
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
              font-family="var(--mono)" font-size="23" font-weight="600">${sum}</text>
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

  /** 把 PDF 内部跳转目标（命名目标 / 显式页引用）解析成 1-based 页码 */
  async function destToPage(doc, dest) {
    try {
      let d = dest;
      if (typeof d === 'string') d = await doc.getDestination(d);
      if (!Array.isArray(d) || !d.length) return null;
      const ref = d[0];
      if (typeof ref === 'number') return ref + 1;
      const idx = await doc.getPageIndex(ref);
      return idx + 1;
    } catch (e) { return null; }
  }

  /* --------------------- 单题裁切：只显示这一题的版面 --------------------- */
  // 数据里每道题都带 qSegs / sSegs = [[页码, y0, y1], ...]（PDF pt）。
  // 这里把对应页面按固定倍率渲染一次并缓存，再从中裁出该题的横条，
  // 跨页的题目会自动拼成多段竖排，因此不会再看到整页、也不会出现文本乱码。
  const CROP_X0 = 50, CROP_X1 = 548;      // 版心横向范围（与 build_data.py 一致）
  const PAGE_SCALE = 2.0;                 // 页面缓存渲染倍率
  const PAGE_CACHE_MAX = 6;
  let PAGE_W_PT = 595.28;
  const pageCache = new Map();
  const pageJobs = new Map();

  async function pageCanvas(pno) {
    const hit = pageCache.get(pno);
    if (hit) { hit.t = Date.now(); return hit.c; }
    if (pageJobs.has(pno)) return pageJobs.get(pno);   // 同一页只渲染一次
    const job = (async () => {
      const doc = await loadPdf();
      const page = await doc.getPage(pno);
      const base = page.getViewport({ scale: 1 });
      PAGE_W_PT = base.width;
      const vp = page.getViewport({ scale: PAGE_SCALE });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      const g = c.getContext('2d', { alpha: false });
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      pageCache.set(pno, { c, t: Date.now() });
      if (pageCache.size > PAGE_CACHE_MAX) {
        let oldest = null;
        for (const kv of pageCache) if (!oldest || kv[1].t < oldest[1].t) oldest = kv;
        if (oldest) pageCache.delete(oldest[0]);
      }
      pageJobs.delete(pno);
      return c;
    })().catch(err => { pageJobs.delete(pno); throw err; });
    pageJobs.set(pno, job);
    return job;
  }

  /** 列表里的小图预览：从页面缓存里裁一段画进卡片 */
  let thumbChain = Promise.resolve();
  function queueThumb(cv) {
    thumbChain = thumbChain.then(() => drawThumb(cv)).catch(() => {});
    return thumbChain;
  }
  async function drawThumb(cv) {
    const box = cv.parentElement;
    if (!box || box.dataset.done) return;
    const [p, y0, y1] = String(cv.dataset.thumb || '').split(',').map(Number);
    if (!p || !isFinite(y0) || !isFinite(y1) || y1 <= y0) return;
    try {
      const src = await pageCanvas(p);
      const k = src.width / PAGE_W_PT;
      const sw = (CROP_X1 - CROP_X0) * k;
      const sh = (y1 - y0) * k;
      cv.width = Math.max(1, Math.round(sw));
      cv.height = Math.max(1, Math.round(sh));
      const g = cv.getContext('2d', { alpha: false });
      g.fillStyle = '#fff';
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(src, CROP_X0 * k, y0 * k, sw, sh, 0, 0, cv.width, cv.height);
      box.dataset.done = '1';
      box.classList.add('ready');
    } catch (e) {
      box.dataset.done = '1';
      box.classList.add('failed');
    }
  }

  /** 把若干段 [页, y0, y1] 依次画成画布，竖排进 host */
  async function renderSegs(host, segs, owner, token) {
    host.innerHTML = '';
    if (!segs || !segs.length) {
      host.innerHTML = '<div class="sq-empty">这一题在 PDF 中的位置未能定位，请切到「整卷」查看。</div>';
      return;
    }
    const boxes = segs.map(([p, y0, y1]) => {
      const wrap = document.createElement('div');
      wrap.className = 'sq-seg';
      const cv = document.createElement('canvas');
      cv.className = 'sq-canvas';
      cv.style.aspectRatio = `${CROP_X1 - CROP_X0} / ${Math.max(1, y1 - y0)}`;
      wrap.appendChild(cv);
      const tag = document.createElement('span');
      tag.className = 'sq-pg';
      tag.textContent = `P${p}`;
      wrap.appendChild(tag);
      host.appendChild(wrap);
      return { wrap, cv, p, y0, y1 };
    });
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      let src;
      try {
        src = await pageCanvas(b.p);
      } catch (e) {
        b.wrap.classList.add('sq-fail');
        b.wrap.innerHTML = `<div class="sq-empty">第 ${b.p} 页渲染失败（请用 HTTP 方式打开本站）</div>`;
        continue;
      }
      if (owner.__sqTok !== token) return;
      const k = src.width / PAGE_W_PT;
      const sx = CROP_X0 * k, sy = b.y0 * k;
      const sw = (CROP_X1 - CROP_X0) * k, sh = (b.y1 - b.y0) * k;
      b.cv.width = Math.max(1, Math.round(sw));
      b.cv.height = Math.max(1, Math.round(sh));
      b.cv.style.aspectRatio = '';
      const g = b.cv.getContext('2d', { alpha: false });
      g.fillStyle = '#fff';
      g.fillRect(0, 0, b.cv.width, b.cv.height);
      g.drawImage(src, sx, sy, sw, sh, 0, 0, b.cv.width, b.cv.height);
      b.wrap.classList.add('ready');
    }
  }

  /**
   * 渲染「只显示这一题」的阅读视图（题目 + 解答两段）。
   * mode: 'question' | 'solution' | 'both'（只影响滚动定位，两段都会给出）
   */
  async function showQuestion(host, q, mode) {
    const token = (host.__sqTok = (host.__sqTok || 0) + 1);
    const p = P[pad2(q.paperId)] || {};
    const multi = (q.qSegs || []).length + (q.sSegs || []).length > 2;
    host.innerHTML = `
      <div class="sq-head">
        <div class="sq-title">
          <span class="mono sq-id">${q.id}</span>
          <b>第 ${q.cnNum} 题</b>
          <span class="badge type">${q.type}</span>
          ${q.points ? `<span class="badge">${q.points} 分</span>` : ''}
          ${q.subLabel ? `<span class="tl-sub">${esc(q.subLabel)}</span>` : ''}
        </div>
        <div class="sq-sub">${p.year || ''} ${esc(p.short || '')} · 题目 P${q.questionPage} · 解答 P${q.solutionPage}
          ${multi ? ' · 含跨页版面，已按顺序拼接' : ''}</div>
      </div>
      <section class="sq-block" data-block="q">
        <div class="sq-cap"><span class="sq-dot" style="background:#8b7bff"></span>题目
          <span class="sq-meta mono">P${q.questionPage}</span></div>
        <div class="sq-segs" id="sqQ"></div>
      </section>
      <section class="sq-block" data-block="s">
        <div class="sq-cap"><span class="sq-dot" style="background:#35d0a5"></span>参考解答
          <span class="sq-meta mono">P${q.solutionPage}</span></div>
        <div class="sq-segs" id="sqS"></div>
      </section>
      <div class="sq-foot">
        <a class="btn sm" href="assets/cmc-papers.pdf#page=${q.questionPage}" target="_blank" rel="noopener">PDF 原件 P${q.questionPage} ↗</a>
        ${q.topics && q.topics.length ? `<a class="btn sm ghost" href="#/topic/${q.topics[0]}">关联考点 →</a>` : ''}
      </div>`;
    await renderSegs(host.querySelector('#sqQ'), q.qSegs, host, token);
    if (host.__sqTok !== token) return;
    await renderSegs(host.querySelector('#sqS'), q.sSegs, host, token);
    if (host.__sqTok !== token) return;
    if (mode === 'question' || mode === 'solution') {
      // 只在容器内部滚动，不要用 scrollIntoView —— 那会把整个页面也带着跳走
      const el = host.querySelector(`[data-block="${mode === 'solution' ? 's' : 'q'}"]`);
      if (el && host.scrollTo) {
        const top = el.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop - 8;
        host.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    } else if (host.scrollTo) {
      host.scrollTo({ top: 0 });
    }
  }

  class Viewer {
    constructor(stage, toolbar, canvas, opts = {}) {
      this.stage = stage; this.toolbar = toolbar; this.canvas = canvas;
      this.page = 1; this.zoom = 1; this.token = 0;
      this.ctx = null;   // {mode, questionPage, solutionPage, label, title}
      this.seq = null;   // 本卷页序 [{p, kind}]：限定只能在本套试卷内翻阅
      this.opts = opts;
      this.buildToolbar();
      this.ensureWrap();
      this.stage.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); this.setZoom(this.zoom + (e.deltaY > 0 ? -.1 : .1)); } }, { passive: false });
    }
    /** 给 canvas 套一层定位容器，并在其上叠加「PDF 链接注解」层 */
    ensureWrap() {
      if (this.wrap) return this.wrap;
      const wrap = document.createElement('div');
      wrap.className = 'pdf-page';
      this.canvas.parentNode.insertBefore(wrap, this.canvas);
      wrap.appendChild(this.canvas);
      const layer = document.createElement('div');
      layer.className = 'annot-layer';
      wrap.appendChild(layer);
      this.wrap = wrap; this.layer = layer;
      return wrap;
    }
    buildToolbar() {
      this.toolbar.innerHTML = `
        <button class="icon-btn" data-act="prev" title="上一页">‹</button>
        <input class="pnum" type="number" min="1" max="${meta.pageCount}" value="1" aria-label="页码">
        <span class="pg">/ ${meta.pageCount}</span>
        <button class="icon-btn" data-act="next" title="下一页">›</button>
        <span class="seq-tag" id="${this.opts.modeId || 'vmode'}-seq" hidden></span>
        <span style="width:8px"></span>
        <button class="icon-btn" data-act="zoomout" title="缩小">−</button>
        <button class="icon-btn" data-act="zoomin" title="放大">+</button>
        <button class="btn sm" data-act="fit">适应宽度</button>
        <span class="sp"></span>
        <span class="mode" id="${this.opts.modeId || 'vmode'}">—</span>
        <span class="link-hint" title="已启用 PDF 原生内部链接：目录页码、题目页「参考解答(1初.1)」与解答页「返回题目(1初.1)」编号都可直接点击跳转">🔗 内部链接</span>
        <button class="btn sm" data-act="swap" title="在题目与解答之间跳转">⇄ 切换</button>
        <a class="btn sm" data-act="raw" href="assets/cmc-papers.pdf" target="_blank" rel="noopener">原件 ↗</a>`;
      this.toolbar.addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const a = b.dataset.act;
        if (a === 'prev') this.step(-1);
        if (a === 'next') this.step(1);
        if (a === 'zoomin') this.setZoom(this.zoom + .2);
        if (a === 'zoomout') this.setZoom(this.zoom - .2);
        if (a === 'fit') this.setZoom(1);
        if (a === 'swap') this.swap();
      });
      this.toolbar.querySelector('.pnum').addEventListener('change', e => {
        const n = parseInt(e.target.value, 10) || 1;
        if (this.seq) {
          // 输入的是本套第几页；若恰好是真实 PDF 页码（如 314）也认，方便对照原件
          const byPdf = this.seq.findIndex(x => x.p === n);
          const i = byPdf >= 0 ? byPdf : Math.min(this.seq.length, Math.max(1, n)) - 1;
          this.go(this.seq[i].p);
        } else {
          this.go(Math.min(meta.pageCount, Math.max(1, n)));
        }
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
    /** 限定阅读范围：seq = [{p, kind:'q'|'s'}]；传 null 恢复整本文档 */
    setSeq(seq) {
      this.seq = seq && seq.length ? seq.slice() : null;
      // 当前页若不在新范围内，先落到范围内第一页，避免页码显示与画面不一致
      if (this.seq && !this.seq.some(x => x.p === this.page)) this.page = this.seq[0].p;
      this.updatePager();
    }
    /** 在当前范围内前后翻页；越界只提示，绝不跨到别的试卷 */
    step(d) {
      if (!this.seq) { this.go(this.page + d); return; }
      const i = this.seq.findIndex(x => x.p === this.page);
      const j = (i < 0 ? 0 : i) + d;
      if (j < 0 || j >= this.seq.length) {
        toast(d > 0 ? '已经是本套试卷的最后一页' : '已经是本套试卷的第一页');
        return;
      }
      const from = i >= 0 ? this.seq[i].kind : null;
      const to = this.seq[j].kind;
      this.go(this.seq[j].p).then(() => {
        if (from && from !== to) toast(to === 's' ? '进入本套参考解答' : '回到本套题目');
      });
    }
    /** 页码控件在「本卷页序」与「整本文档」两种模式间切换 */
    updatePager() {
      const inp = this.toolbar.querySelector('.pnum');
      const lab = this.toolbar.querySelector('.pg');
      const tag = this.toolbar.querySelector('.seq-tag');
      if (!inp || !lab) return;
      if (this.seq) {
        const i = Math.max(0, this.seq.findIndex(x => x.p === this.page));
        const it = this.seq[i] || {};
        inp.value = i + 1;
        inp.max = this.seq.length;
        inp.title = `本套内第几页（共 ${this.seq.length} 页）`;
        lab.textContent = `/ ${this.seq.length}`;
        if (tag) {
          tag.hidden = false;
          tag.textContent = `${it.kind === 's' ? '参考解答' : '题目'} · P${this.page}`;
        }
        // 本套页序下，标签已经写明「题目 / 参考解答」，不再重复显示模式小标
        const modeEl = this.toolbar.querySelector('.mode');
        if (modeEl) modeEl.hidden = true;
      } else {
        inp.value = this.page;
        inp.max = meta.pageCount;
        inp.title = 'PDF 页码';
        lab.textContent = `/ ${meta.pageCount}`;
        if (tag) tag.hidden = true;
        const modeEl = this.toolbar.querySelector('.mode');
        if (modeEl) modeEl.hidden = false;
      }
    }
    async go(page, ctx) {
      const p = Math.round(page);
      // 有范围限制时，只接受本套试卷内的页
      if (this.seq && !this.seq.some(x => x.p === p)) {
        toast(`P${p} 属于别套试卷，已阻止跳出本套`);
        return;
      }
      this.page = this.seq ? p : Math.min(meta.pageCount, Math.max(1, p | 0));
      if (ctx) this.setContext(ctx);
      this.updatePager();
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
      if (this.layer) this.layer.innerHTML = '';
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
        if (this.wrap) { this.wrap.style.width = vp.width + 'px'; this.wrap.style.height = vp.height + 'px'; }
        const c2d = this.canvas.getContext('2d', { alpha: false });
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        c2d.fillStyle = '#fff'; c2d.fillRect(0, 0, vp.width, vp.height);
        await page.render({ canvasContext: c2d, viewport: vp }).promise;
        if (tk === this.token) this.canvas.style.display = 'block';
        await this.renderLinks(doc, page, vp, tk);
      } catch (err) {
        if (/Rendering cancelled/i.test(String(err && err.message))) return;
        this.fail(tk, err);
      }
    }
    /**
     * 渲染 PDF 的链接注解层。
     * pdf.js 只画页面内容，不画 /Annots；这份真题 PDF 的目录页码、
     * 「参考解答(1初.1)」「返回题目(1初.1)」都是 LINK_GOTO 注解，
     * 因此需要按 page.getAnnotations() 手工铺一层可点的透明热区。
     */
    async renderLinks(doc, page, vp, tk) {
      if (!this.layer) return;
      let annots = [];
      try { annots = await page.getAnnotations({ intent: 'display' }); } catch (e) { return; }
      if (tk !== this.token) return;
      const frag = document.createDocumentFragment();
      let n = 0;
      for (const a of annots) {
        if (a.subtype !== 'Link') continue;
        const rect = a.rect;
        if (!Array.isArray(rect) || rect.length !== 4) continue;
        let v = rect;
        try { v = vp.convertToViewportRectangle(rect); } catch (e) { continue; }
        // 目录里的页码链接在 PDF 中只有约 4pt 宽，直接铺会小到点不中，这里做适度放大
        const PAD_X = 4, PAD_Y = 1.5, MIN_W = 18, MIN_H = 10;
        let left = Math.min(v[0], v[2]) - PAD_X;
        let top = Math.min(v[1], v[3]) - PAD_Y;
        let w = Math.abs(v[2] - v[0]) + PAD_X * 2;
        let h = Math.abs(v[3] - v[1]) + PAD_Y * 2;
        if (w < 2 || h < 2) continue;
        if (w < MIN_W) { left -= (MIN_W - w) / 2; w = MIN_W; }
        if (h < MIN_H) { top -= (MIN_H - h) / 2; h = MIN_H; }
        const el = document.createElement('a');
        el.className = 'pdf-link';
        el.style.cssText = `left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${w.toFixed(2)}px;height:${h.toFixed(2)}px`;
        if (a.url) {
          el.href = a.url; el.target = '_blank'; el.rel = 'noopener';
          el.title = a.url;
        } else if (a.dest != null) {
          el.href = 'javascript:void(0)';
          el.title = 'PDF 内部跳转';
          el.addEventListener('click', async ev => {
            ev.preventDefault(); ev.stopPropagation();
            const p = await destToPage(doc, a.dest);
            if (!p) { toast('该链接目标无法解析'); return; }
            if (this.seq && !this.seq.some(x => x.p === p)) {
              toast(`该链接指向 P${p}（不在本套内），已阻止`);
              return;
            }
            this.go(p);
            toast(`PDF 内部链接 → 本套第 ${this.seq ? this.seq.findIndex(x => x.p === p) + 1 : p} 页`);
          });
        } else continue;
        frag.appendChild(el); n++;
      }
      if (tk === this.token) {
        this.layer.innerHTML = '';
        this.layer.appendChild(frag);
        this.layer.dataset.count = n;
      }
    }
  }

  /* ----------------------------- 全局抽屉 ----------------------------- */
  const drawer = $('#drawer');
  let drawerViewer = null;
  function initDrawer() {
    drawerViewer = new Viewer($('#drawerStage'), $('#drawerToolbar'), $('#drawerCanvas'), { modeId: 'drawerMode' });
  }
  function openPdf(page, ctx, title, sub, seq) {
    if (!drawer.classList.contains('open')) {
      drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
    }
    $('#drawerPanel').classList.remove('crop');
    $('#drawerTitle').textContent = title || 'PDF 阅读器';
    $('#drawerSub').textContent = sub || '';
    // 从某道题进来的「原页」也只在本套试卷内翻阅
    drawerViewer.setSeq(seq || null);
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

  /* 抽屉里的单题视图：默认只显示这一题的题目 + 解答，可切回所在原页 */
  let drawerQ = null;
  function openQuestion(q, mode = 'question', viaDrawer = true) {
    if (!viaDrawer || !q) return;
    drawerQ = q;
    const p = P[pad2(q.paperId)] || {};
    if (!drawer.classList.contains('open')) {
      drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
    }
    $('#drawerPanel').classList.add('crop');
    $('#drawerTitle').textContent = `${q.id} · 第 ${q.cnNum} 题`;
    $('#drawerSub').textContent = `${p.year || ''} ${p.short || ''} · ${q.type}${q.points ? ` · ${q.points} 分` : ''}`;
    $('#drawerBar').innerHTML = `
      <button class="btn sm on" data-pane="${mode === 'solution' ? 's' : 'q'}">${mode === 'solution' ? '看解答' : '看题目'}</button>
      <button class="btn sm" data-pane="${mode === 'solution' ? 'q' : 's'}">${mode === 'solution' ? '看题目' : '看解答'}</button>
      <span class="sp"></span>
      <button class="btn sm ghost" data-orig="${mode === 'solution' ? q.solutionPage : q.questionPage}">查看原页 ↗</button>`;
    document.body.style.overflow = 'hidden';
    showQuestion($('#drawerBody'), q, mode);
  }
  $('#drawerBar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !drawerQ) return;
    if (b.dataset.orig) {
      const pp = P[pad2(drawerQ.paperId)];
      openPdf(Number(b.dataset.orig), qCtx(drawerQ, 'question'), `${drawerQ.id} · 原页`,
        `${pp.year} ${pp.short} · PDF 第 ${b.dataset.orig} 页`, paperSeq(pp));
      return;
    }
    const block = $('#drawerBody').querySelector(`[data-block="${b.dataset.pane}"]`);
    $$('#drawerBar [data-pane]').forEach(x => x.classList.toggle('on', x === b));
    if (block) $('#drawerBody').scrollTo({ top: block.offsetTop - 8, behavior: 'smooth' });
  });

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
  /** 卡片 / 表格里的原卷小图。文本抽取会把公式拆散，所以题目一律用裁切图。 */
  function thumbHTML(q, key = 'thumb', cls = '') {
    return `<div class="qi-pv ${cls}" title="点击看完整题目">
      <div class="qi-pv-wait">原卷载入中…</div>
      <canvas data-thumb="${(q[key] || []).join(',')}"></canvas>
      <div class="qi-pv-fb">${esc(q.excerpt)}</div>
    </div>`;
  }

  let thumbIO = null;
  function observeThumbs(root) {
    const list = $$('canvas[data-thumb]', root || document);
    if (!list.length) return;
    if (!window.IntersectionObserver) { list.forEach(queueThumb); return; }
    if (!thumbIO) {
      thumbIO = new IntersectionObserver(es => {
        es.forEach(en => {
          if (!en.isIntersecting) return;
          thumbIO.unobserve(en.target);
          queueThumb(en.target);
        });
      }, { rootMargin: '300px 0px' });
    }
    list.forEach(c => { if (!c.parentElement.dataset.done) thumbIO.observe(c); });
  }

  function questionRows(qs, tableId, attr) {
    if (!qs.length) {
      return `<div class="card" id="${tableId}"><div class="empty" style="padding:36px 20px">
        <span class="big">◌</span>该条目在 2009–2026 的 42 套试卷中未被单独命中</div></div>`;
    }
    return `<div class="card" id="${tableId}" style="padding:6px 14px">
      <table class="tbl"><thead><tr><th>题号</th><th>试卷</th><th>题型</th><th>题目</th><th>考点</th><th>题目页</th><th>解答页</th></tr></thead>
      <tbody>${qs.map(q => `<tr>
        <td><a href="#/paper/${pad2(q.paperId)}?q=${encodeURIComponent(q.id)}" class="mono">${q.id}</a>${q.subLabel ? ` <span class="tl-sub">${esc(q.subLabel)}</span>` : ''}</td>
        <td>${q.year} ${esc(P[pad2(q.paperId)].short)}</td>
        <td><span class="badge type">${q.type}</span></td>
        <td style="width:300px">${thumbHTML(q, 'thumbS', 'mini')}</td>
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
  function moduleOptions(sel) {
    if (!subjects.length) {
      return modules.map(m => `<option value="${m.id}" ${sel === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
    }
    return subjects.map(s => {
      const ms = modules.filter(m => m.subject === s.name);
      if (!ms.length) return '';
      return `<optgroup label="${esc(s.name)}">` + ms.map(m =>
        `<option value="${m.id}" ${sel === m.id ? 'selected' : ''}>${m.no}. ${esc(m.name)}</option>`).join('') + '</optgroup>';
    }).join('');
  }
  function subjectList() {
    return subjects.length ? subjects : [{ id: '', name: '高等数学' }];
  }

  function topicChips(q, limit = 3) {
    return `<div class="chips">${q.topics.slice(0, limit).map(t => {
      const p = PT[t]; if (!p) return '';
      return `<a class="chip" href="#/topic/${t}" title="${esc(p.text)}"><i class="dot" style="background:${p.color}"></i>${esc(p.short)}</a>`;
    }).join('')}</div>`;
  }
  function paperCard(p) {
    return `<a class="paper-card" href="#/paper/${pad2(p.id)}">
      <div class="pc-top"><span class="pc-code">标号 ${p.code}</span><span class="pc-year">${p.year}</span></div>
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

  /* --------------------- 首页 Hero：动态数学视觉层 ---------------------
     一层实时渲染的 canvas：粒子网络 + 漂浮公式碎片（科技感），
     单位圆动点 / 李萨如曲线 / 流动正弦波 / 刻度环（数学感）。
     文字所在左半区自动压淡，右上角可暂停； prefers-reduced-motion 只画静态一帧。
     -------------------------------------------------------------------- */
  const HeroFX = (() => {
    let canvas = null, ctx = null, raf = 0, ro = null, running = false;
    let W = 1, H = 1, dpr = 1, t0 = 0, last = 0, clock = 0;
    let particles = [], glyphs = [], trail = [];
    let mouse = { x: 0, y: 0 }, onMove = null;

    const V = [139, 123, 255], B = [77, 141, 255], C = [86, 224, 208];
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const GLYPHS = ['∑', '∫', '∂', '∇', 'π', '∞', '√', '∆', 'λ', 'θ', '∮', '⊕',
      '⊗', '∀', '∃', '≈', '∈', '⊂', 'ℝ', 'ℂ', 'lim', 'det A', 'f(x)',
      'π²/6', '∂²u/∂t²', '|A|', 'n→∞', '∇×F'];
    const rnd = (a, b) => a + Math.random() * (b - a);

    function seed() {
      const compact = W < 700;
      particles = Array.from({ length: compact ? 13 : 30 }, () => ({
        x: rnd(0, W), y: rnd(0, H), vx: rnd(-0.16, 0.16), vy: rnd(-0.13, 0.13),
        r: rnd(0.9, 2.0), c: [V, B, C][Math.floor(rnd(0, 3))]
      }));
      glyphs = Array.from({ length: compact ? 0 : 18 }, (_, i) => ({
        x: rnd(W * 0.46, W * 0.98), y: rnd(-H, H), v: rnd(4, 11), s: rnd(13, 22),
        g: GLYPHS[(i * 3 + 1) % GLYPHS.length], ph: rnd(0, 6.28),
        a: rnd(0.24, 0.44), c: [V, B, C][i % 3]
      }));
      trail = [];
    }

    function resize() {
      if (!canvas || !ctx) return;
      const box = canvas.getBoundingClientRect();
      W = Math.max(1, box.width); H = Math.max(1, box.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      draw(clock);
    }

    // 左侧是标题/正文区，把所有前景元素的透明度压到很低
    function fade(x) {
      const u = x / W;
      if (u <= 0.42) return 0.10;
      if (u >= 0.74) return 1;
      return 0.10 + 0.9 * (u - 0.42) / 0.32;
    }

    function ring(cx, cy, r, rot, dash, col, a) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.setLineDash(dash); ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }

    function glowDot(x, y, r, col, a) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = rgba(col, Math.min(1, a + 0.1));
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }

    function draw(t) {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const compact = W < 700;
      const px = mouse.x * (compact ? 3 : 9), py = mouse.y * (compact ? 2 : 6);

      // 1) 缓慢漂移的细网格
      const step = 38, ox = (t * 5) % step, oy = (t * 2.6) % step;
      ctx.lineWidth = 1;
      for (let x = -step + ox; x < W + step; x += step) {
        ctx.strokeStyle = rgba(V, 0.035 * (0.3 + 0.7 * fade(x)));
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = -step + oy; y < H + step; y += step) {
        ctx.strokeStyle = rgba(B, 0.026);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // 2) 粒子网络：近距连线 + 发光节点
      const link = compact ? 96 : 116;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -8) p.x = W + 8; else if (p.x > W + 8) p.x = -8;
        if (p.y < -8) p.y = H + 8; else if (p.y > H + 8) p.y = -8;
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j], dx = p.x - q.x, dy = p.y - q.y;
          const d = Math.hypot(dx, dy);
          if (d < link) {
            ctx.strokeStyle = rgba(B, (1 - d / link) * 0.14 * fade((p.x + q.x) / 2));
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      for (const p of particles) {
        const a = 0.5 * fade(p.x) + 0.05;
        ctx.fillStyle = rgba(p.c, a);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
        ctx.fillStyle = rgba(p.c, a * 0.14);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4.5, 0, 6.2832); ctx.fill();
      }

      // 3) 缓缓上浮的数学符号 / 公式碎片
      ctx.textBaseline = 'middle';
      for (const g of glyphs) {
        const span = H + 90;
        const y = ((g.y - t * g.v) % span + span) % span - 45;
        const x = g.x + Math.sin(t * 0.35 + g.ph) * 12;
        const life = Math.max(0, Math.min(1, Math.min(y + 45, H + 45 - y) / 55));
        if (life <= 0) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t * 0.25 + g.ph) * 0.09);
        ctx.font = `500 ${g.s}px "Cambria Math", "Segoe UI Symbol", ui-monospace, Consolas, monospace`;
        ctx.shadowColor = rgba(g.c, 0.55); ctx.shadowBlur = 7;
        ctx.fillStyle = rgba(g.c, g.a * life * fade(x));
        ctx.fillText(g.g, 0, 0);
        ctx.restore();
      }

      // 4) 右侧「数学仪表盘」：坐标轴、同心环、刻度、正弦波、李萨如曲线、单位圆动点
      const cx = W * (compact ? 0.82 : 0.86) + px;
      const cy = H * (compact ? 0.17 : 0.46) + py;
      const R = compact ? 54 : Math.min(H * 0.38, 120);
      const k = compact ? 0.32 : 1;

      ctx.strokeStyle = rgba(V, 0.09 * k); ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.moveTo(cx - R * 1.45, cy); ctx.lineTo(cx + R * 1.45, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - R * 1.45); ctx.lineTo(cx, cy + R * 1.45); ctx.stroke();
      ctx.setLineDash([]);

      // 公式水印：缓慢呼吸，位置固定在右侧非文字区（窄屏无留白，跳过）
      const wm = 0.20 + 0.10 * (0.5 + 0.5 * Math.sin(t * 0.7));
      if (!compact) {
      ctx.font = '500 13px "Cambria Math", "Segoe UI Symbol", ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(C, wm * k);
      ctx.fillText('∑ 1/n² = π²/6    ·    ∮ f(z)dz', cx, Math.max(24, cy - R * 1.15));
      ctx.textAlign = 'left';
      }

      ring(cx, cy, R, t * 0.12, [2, 8], V, 0.32 * k);
      ring(cx, cy, R * 0.76, -t * 0.22, [1, 13], C, 0.40 * k);

      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.05);
      for (let i = 0; i < 60; i++) {
        const a = i * Math.PI / 30, long = i % 5 === 0;
        const r0 = R * 1.06, r1 = R * (long ? 1.15 : 1.10);
        ctx.strokeStyle = rgba(V, (long ? 0.46 : 0.22) * k);
        ctx.lineWidth = long ? 1.2 : 0.7;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();

      for (let m = 0; m < 2; m++) {
        const amp = R * (m ? 0.30 : 0.42), freq = (m ? 2.3 : 1.6) * Math.PI / R;
        ctx.strokeStyle = rgba(m ? V : C, (m ? 0.13 : 0.24) * k);
        ctx.lineWidth = m ? 1 : 1.3;
        ctx.beginPath();
        for (let xx = -R * 1.4; xx <= R * 1.4; xx += 2) {
          const yy = Math.sin(freq * xx + t * (m ? -0.9 : 1.2) + m * 1.4) * amp;
          if (xx === -R * 1.4) ctx.moveTo(cx + xx, cy + yy);
          else ctx.lineTo(cx + xx, cy + yy);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = rgba(B, 0.22 * k); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 220; i++) {
        const u = i / 220 * Math.PI * 2;
        const x = cx + R * 0.58 * Math.sin(3 * u + t * 0.32);
        const y = cy + R * 0.50 * Math.sin(2 * u);
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const ang = t * 0.6, rr = R * 0.76;
      const dxp = Math.cos(ang) * rr, dyp = Math.sin(ang) * rr;
      ctx.strokeStyle = rgba(C, 0.30 * k); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dxp, cy + dyp); ctx.stroke();
      ctx.strokeStyle = rgba(V, 0.20 * k); ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(cx + dxp, cy + dyp); ctx.lineTo(cx + dxp, cy); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.setLineDash([]);

      trail.push([cx + dxp, cy + dyp]);
      if (trail.length > 46) trail.shift();
      ctx.lineWidth = 1.4;
      for (let i = 1; i < trail.length; i++) {
        ctx.strokeStyle = rgba(C, (i / trail.length) * 0.30 * k);
        ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke();
      }
      glowDot(cx + dxp, cy + dyp, 3.2, C, 0.9 * k);
      glowDot(cx, cy, 2 + Math.sin(t * 2.2) * 0.8, V, 0.7 * k);

      const sx = ((t * 78) % (R * 2.8)) - R * 1.4;
      const sy = Math.sin(1.6 * Math.PI / R * sx + t * 1.2) * R * 0.42;
      glowDot(cx + sx, cy + sy, 2.4, C, 0.75 * k);

      // 5) 极淡的扫描光带
      const scanY = ((t * 20) % (H + 120)) - 60;
      const grd = ctx.createLinearGradient(0, scanY - 34, 0, scanY + 34);
      grd.addColorStop(0, rgba(C, 0));
      grd.addColorStop(0.5, rgba(C, 0.028 * k));
      grd.addColorStop(1, rgba(C, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(0, scanY - 34, W, 68);
    }

    function loop(now) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 24) return;            // ~40fps，动画本就缓慢，省电
      last = now;
      clock = (now - t0) / 1000;
      draw(clock);
    }

    function onVis() {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
      else if (running && !raf) { t0 = performance.now() - clock * 1000; raf = requestAnimationFrame(loop); }
    }

    function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function resume() {
      if (running) return;
      running = true; t0 = performance.now() - clock * 1000; last = 0;
      raf = requestAnimationFrame(loop);
    }
    function toggle() { running ? pause() : resume(); return running; }

    function start(cv) {
      stop();
      if (!cv) return;
      canvas = cv; ctx = canvas.getContext('2d');
      if (!ctx) return;
      t0 = performance.now(); last = 0; clock = 0;
      mouse = { x: 0, y: 0 };
      resize();
      ro = new ResizeObserver(resize); ro.observe(canvas);
      onMove = e => {
        const b = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - b.left) / b.width * 2 - 1;
        mouse.y = (e.clientY - b.top) / b.height * 2 - 1;
      };
      window.addEventListener('mousemove', onMove, { passive: true });
      document.addEventListener('visibilitychange', onVis);
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) { draw(0); return; }        // 尊重系统「减少动态效果」
      running = true;
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ro) { ro.disconnect(); ro = null; }
      if (onMove) { window.removeEventListener('mousemove', onMove); onMove = null; }
      document.removeEventListener('visibilitychange', onVis);
      canvas = null; ctx = null; particles = []; glyphs = []; trail = [];
    }

    return { start, stop, toggle, isRunning: () => running };
  })();

  function viewHome() {
    setNav('home'); crumb([{ t: '总览' }]);
    const byYear = {};
    papers.forEach(p => { byYear[p.year] = (byYear[p.year] || 0) + 1; });
    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
    const modCounts = modules.map(m => ({
      label: m.name, value: points.filter(p => p.moduleId === m.id).reduce((a, p) => a + cnt(p.id), 0), color: m.color
    })).sort((a, b) => b.value - a.value);
    const hot = D.topics.filter(t => !(MOD[PT[t.id].moduleId] || {}).extra)
      .slice().sort((a, b) => b.count - a.count).slice(0, 10)
      .map(t => ({ label: `${PT[t.id].short}（${t.id}）`, value: t.count, href: `#/topic/${t.id}`, color: PT[t.id].color }));
    const recent = papers.slice(-4).reverse();

    $view.innerHTML = `
      <div class="hero">
        <canvas class="hero-fx" aria-hidden="true"></canvas>
        <button class="hero-fx-toggle" type="button" title="暂停 / 播放背景动效" aria-label="暂停背景动效">⏸</button>
        <div class="eyebrow">Chinese Mathematics Competitions · Non-Math Track</div>
        <h1>全国大学生数学竞赛<br><em>历届真题 × 考纲知识地图</em></h1>
        <p>第一至第十七届非数学类初赛、补赛与决赛：${meta.paperCount} 套试卷、${meta.questionCount} 道大题，
           按「标号.题号」双向索引题目与参考解答；知识地图并置两套考纲：
           <b style="color:var(--txt2)">高等数学</b> 9 个模块（${(meta.subjectStats['高等数学'] || {}).pointCount} 个考点）、
           <b style="color:var(--txt2)">线性代数</b> 6 个模块（${(meta.subjectStats['线性代数'] || {}).pointCount} 个考点），
           把每道题挂到对应知识点上，并配 ${meta.cardCount} 张公式 / 定理 / 性质 / 解题方法卡片。</p>
        <div class="actions">
          <a class="btn primary" href="#/papers">浏览历届真题 →</a>
          <a class="btn" href="#/map">打开知识地图 ✦</a>
          <a class="btn" href="#/map?subject=GS">高等数学 ∫</a>
          <a class="btn" href="#/map?subject=LA">线性代数 ▦</a>
          <a class="btn" href="#/map?tab=cards">知识卡片 ◇</a>
          <a class="btn" href="#/syllabus">查看考纲</a>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card" style="--c:#8b7bff"><div class="lab">试卷 / PAPERS</div><div class="val">${meta.paperCount}</div><div class="sub">初赛 · 补赛 · 决赛</div></div>
        <div class="stat-card" style="--c:#4d8dff"><div class="lab">大题 / QUESTIONS</div><div class="val">${meta.questionCount}</div><div class="sub">每题含题目页 + 解答页</div></div>
        <div class="stat-card" style="--c:#26c6da"><div class="lab">届次 / EDITIONS</div><div class="val">${meta.editionCount}</div><div class="sub">${meta.yearMin} – ${meta.yearMax}</div></div>
        <div class="stat-card" style="--c:#35d0a5"><div class="lab">考纲考点 / TOPICS</div><div class="val">${meta.pointCount}</div><div class="sub">高数 ${meta.subjectStats['高等数学'] ? meta.subjectStats['高等数学'].pointCount : ''} + 线代 ${meta.subjectStats['线性代数'] ? meta.subjectStats['线性代数'].pointCount : ''}</div></div>
      </div>
      <div class="grid2" style="margin-bottom:20px">
        ${subjectList().map(s => {
          const st = meta.subjectStats[s.name] || {};
          const ms = modules.filter(m => m.subject === s.name);
          return `<a class="card tight subj-card" href="#/map?subject=${s.id || ''}" style="--c:${(ms[0] || {}).color || '#8b7bff'}">
            <div class="card-head" style="margin-bottom:8px"><h3>${esc(s.name)}</h3>
              <span class="hint">${st.moduleCount || 0} 模块 · ${st.pointCount || 0} 考点 · ${st.questionCount || 0} 题</span></div>
            <div class="chips">${ms.map(m => `<span class="chip"><i class="dot" style="background:${m.color}"></i>${m.no}. ${esc(m.name)}</span>`).join('')}</div>
          </a>`;
        }).join('')}
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
          <div class="card-head"><h2>学科 / 模块题量分布</h2><span class="hint">一题可归多个考点</span></div>
          ${donut(subjectList().map(s => ({
            label: s.name,
            value: points.filter(p => p.subject === s.name).reduce((a, p) => a + cnt(p.id), 0),
            color: s.name === '线性代数' ? '#d946ef' : '#8b7bff'
          })), 140)}
          <div class="divider"></div>
          ${hbars(modCounts.slice(0, 8), { labelWidth: 138 })}
        </div>
      </div>

      <div class="section-title">最新试卷 <span class="n"><a href="#/papers" style="color:var(--acc)">查看全部 ${meta.paperCount} 套 →</a></span></div>
      <div class="paper-grid">${recent.map(paperCard).join('')}</div>

      <div class="card tight" style="margin-top:22px">
        <div class="small muted">📌 呈现方式：题目与解答以 <b style="color:var(--txt2)">PDF 原件按页高保真渲染</b>（保留公式与图形），
        站点提供逐题跳转、双向索引与全文检索。考点对应由关键词规则自动匹配并做少量人工校正，
        标注依据在每个知识点详情中可见；数学公式请以 PDF 原件为准。</div>
      </div>`;

    const fxCanvas = $view.querySelector('.hero-fx');
    HeroFX.start(fxCanvas);
    const fxBtn = $view.querySelector('.hero-fx-toggle');
    if (fxBtn) {
      const sync = () => {
        const on = HeroFX.isRunning();
        fxBtn.textContent = on ? '⏸' : '▶';
        fxBtn.setAttribute('aria-label', on ? '暂停背景动效' : '播放背景动效');
      };
      sync();
      fxBtn.addEventListener('click', () => { HeroFX.toggle(); sync(); });
    }
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
        <input type="search" id="fQ" placeholder="搜索年份 / 届次 / 标号" value="${esc(paperFilter.q)}" style="width:210px">
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
  /** 本套试卷的页序：[题目页...] + [参考解答页...]，整卷阅读只允许在这一串里走 */
  function paperSeq(p) {
    const seq = [];
    for (let i = p.questionPage; i <= p.questionEnd; i++) seq.push({ p: i, kind: 'q' });
    for (let j = p.solutionPage; j <= p.solutionEnd; j++) seq.push({ p: j, kind: 's' });
    return seq;
  }

  function viewPaper(code, focusQid) {
    const p = P[code];
    if (!p) { $view.innerHTML = '<div class="empty">未找到该试卷</div>'; return; }
    setNav('papers');
    crumb([{ t: '历届真题', h: '#/papers' }, { t: `${p.code} · ${p.short}` }]);
    const qs = questions.filter(q => q.paperId === p.id);
    $view.innerHTML = `
      <div class="page-head" style="margin-bottom:16px">
        <div class="eyebrow">${p.code} · 第 ${p.edition} 届 ${p.stage}${p.group && p.group !== '不分 A/B' ? ' · ' + p.group : ''}</div>
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
            <span class="hint">点卡片看这一题的题目与解答</span></div>
          <div class="q-list" id="qList">${qs.map(q => `
            <div class="q-item" data-q="${q.id}">
              <div class="qi-top">
                <span class="qi-num">${q.id}</span>
                ${q.subLabel ? `<span class="tl-sub">${esc(q.subLabel)}</span>` : ''}
                ${q.linalg ? '<span class="badge" style="color:#e9a8ff;border-color:rgba(217,70,239,.4);background:rgba(217,70,239,.1)">线性代数</span>' : ''}
                <span class="badge type">${q.type}</span>
                ${q.points ? `<span class="badge">${q.points} 分</span>` : ''}
                <span class="qi-pages">P${q.questionPage} → P${q.solutionPage}</span>
              </div>
              ${thumbHTML(q, 'thumb')}
              ${topicChips(q, 2)}
              ${q.cardIds && q.cardIds.length ? `<div class="chips" style="margin-top:6px">${q.cardIds.slice(0, 2).map(c => cardChip(c)).join('')}</div>` : ''}
              <div class="qi-actions" style="margin-top:9px">
                <button class="btn sm" data-open="${q.id}" data-mode="question">看题目</button>
                <button class="btn sm" data-open="${q.id}" data-mode="solution">看解答</button>
                <button class="btn sm ghost" data-drawer="${q.id}">抽屉打开 ↗</button>
              </div>
            </div>`).join('')}</div>
        </div>
        <div class="viewer card" id="qViewer" style="padding:0;overflow:hidden">
          <div class="card-head" style="padding:12px 16px 10px;margin:0">
            <h3><span id="pvTitleMain">单题阅读</span> <span class="hint" id="pvTitleHint">原卷裁切 · 只显示这一题</span></h3>
            <div class="seg-toggle" id="pvToggle">
              <button data-m="crop" class="on">单题</button>
              <button data-m="page">整卷</button>
            </div>
          </div>
          <div class="sq-scroll" id="inlineQ"></div>
          <div id="inlinePageWrap" hidden>
            <div class="pdf-toolbar" id="inlineToolbar"></div>
            <div class="pdf-stage" id="inlineStage"><canvas id="inlineCanvas"></canvas></div>
          </div>
        </div>
      </div>`;

    observeThumbs($('#qList'));

    const v = new Viewer($('#inlineStage'), $('#inlineToolbar'), $('#inlineCanvas'), { modeId: 'inlineMode' });
    // 整卷模式只在本套范围内翻阅：先本套题目页，再本套参考解答页
    v.setSeq(paperSeq(p));
    let pvMode = 'crop';
    let current = null;

    const setPane = m => {
      pvMode = m;
      $$('#pvToggle button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      $('#inlineQ').hidden = m !== 'crop';
      $('#inlinePageWrap').hidden = m !== 'page';
      // 标题必须跟着模式走：整卷时再说「只显示这一题」是错的
      const isPage = m === 'page';
      const nPage = v.seq ? v.seq.length : 0;
      $('#pvTitleMain').textContent = isPage ? '整卷浏览' : '单题阅读';
      // 长短两版副标题由 CSS 按屏宽切换，窄屏不出现孤字换行
      $('#pvTitleHint').innerHTML = isPage
        ? `<span class="hint-long">${esc(p.code)} · 本套 ${nPage} 页（题目 + 参考解答）</span><span class="hint-short">本套 ${nPage} 页</span>`
        : `<span class="hint-long">原卷裁切 · 只显示这一题</span><span class="hint-short">只显示这一题</span>`;
      if (isPage && current) {
        v.go(current.mode === 'solution' ? current.q.solutionPage : current.q.questionPage, qCtx(current.q, current.mode));
      }
    };
    // 窄屏是上下堆叠：点完卡片要跳到下面的阅读区，否则看起来像没反应
    const jumpToViewer = () => {
      if (window.matchMedia && window.matchMedia('(max-width:1200px)').matches) {
        const box = $('#qViewer');
        if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    const select = (qid, mode) => {
      const q = Q[qid]; if (!q) return;
      current = { q, mode };
      $$('.q-item').forEach(x => x.classList.toggle('active', x.dataset.q === qid));
      setPane('crop');
      showQuestion($('#inlineQ'), q, mode);
    };
    $('#qList').addEventListener('click', e => {
      const item = e.target.closest('.q-item'); if (!item) return;
      const b = e.target.closest('[data-open],[data-drawer]');
      if (b) {
        if (b.dataset.drawer) { openQuestion(Q[b.dataset.drawer], 'question'); return; }
        select(b.dataset.open, b.dataset.mode);
        jumpToViewer();
        return;
      }
      select(item.dataset.q, 'both');
      jumpToViewer();
    });
    $('#pvToggle').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      setPane(b.dataset.m);
    });
    $('#wholePaper').addEventListener('click', () => {
      $$('.q-item').forEach(x => x.classList.remove('active'));
      current = null;
      setPane('page');
      v.go(p.questionPage, null);
    });
    const initial = (focusQid && Q[focusQid] && Q[focusQid].paperId === p.id) ? focusQid : qs[0].id;
    select(initial, 'both');
    if (initial === focusQid) {
      setTimeout(() => {
        const item = $(`.q-item[data-q="${initial}"]`);
        if (item) item.scrollIntoView({ block: 'center' });
      }, 80);
    }
  }

  /* ----------------------------- 视图：知识地图 ----------------------------- */
  let mapState = { layout: 'galaxy', module: '全部', subject: '全部',
                   labels: false, selected: null, cardType: '全部', cardQ: '' };
  function buildLayout() {
    const W = 1000, H = 760, cx = 500, cy = 380;
    const mods = modules;
    // 按学科分组：高等数学 / 线性代数 各自成弧，组与组之间留出空白角
    const groups = [];
    mods.forEach(m => {
      const key = m.subject || '';
      const g = groups.find(x => x.name === key);
      if (g) g.mods.push(m); else groups.push({ name: key, mods: [m] });
    });
    const GAP = 0.30;                                  // 组间间隙（弧度）
    const total = mods.length + GAP * groups.length;
    let acc = 0;
    groups.forEach(g => {
      g.mods.forEach((m, i) => {
        const a = -Math.PI / 2 + (acc + i + 0.5) / total * 2 * Math.PI;
        m._x = cx + 360 * Math.cos(a);
        m._y = cy + 244 * Math.sin(a);
      });
      acc += g.mods.length + GAP;
    });
    const nodes = [];
    // 模块名标签固定挂在 hub 正下方（y+38..y+70），节点环避开这一段角度，
    // 否则气泡会直接盖住文字 —— 这是原先「打架」的主因。
    const LBL_START = Math.PI / 2 + 0.66;
    const LBL_SPAN = 2 * Math.PI - 1.32;
    const labelBoxes = mods.map(m => ({ x0: m._x - 62, x1: m._x + 62,
                                        y0: m._y + 38, y1: m._y + 72 }));
    mods.forEach(m => {
      const pts = points.filter(p => p.moduleId === m.id);
      pts.forEach((p, j) => {
        const seed = p.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const a = LBL_START + (j + 0.5) / pts.length * LBL_SPAN + (seed % 17) * .006;
        const c = cnt(p.id);
        const rr = 56 + (j % 3) * 12 + Math.min(30, Math.sqrt(c) * 4.5) + (seed % 9);
        p._x = m._x + rr * Math.cos(a);
        p._y = m._y + rr * Math.sin(a);
        p._r = 5 + Math.min(15, Math.sqrt(c) * 3.1);
        p._hx = m._x; p._hy = m._y;
        nodes.push(p);
      });
    });
    // 斥力 + 标签保护区：节点之间分开，且不得进入任何模块名标签框
    for (let it = 0; it < 140; it++) {
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
      nodes.forEach(p => {
        p._x += (p._hx - p._x) * .010; p._y += (p._hy - p._y) * .010;
        // 不压任何模块编号圈
        for (const m of mods) {
          const dx = p._x - m._x, dy = p._y - m._y;
          const d = Math.hypot(dx, dy) || 1, minD = 34 + p._r + 5;
          if (d < minD) {
            p._x = m._x + dx / d * minD;
            p._y = m._y + dy / d * minD;
          }
        }
        // 落在标签框里时向下 / 左右推出（不往上推，避免压到 hub 圆）
        for (const b of labelBoxes) {
          const pad = p._r + 4;
          if (p._x > b.x0 - pad && p._x < b.x1 + pad &&
              p._y > b.y0 - pad && p._y < b.y1 + pad) {
            const dl = p._x - (b.x0 - pad), dr = (b.x1 + pad) - p._x;
            const db = (b.y1 + pad) - p._y;
            const mn = Math.min(dl, dr, db);
            if (mn === db) p._y = b.y1 + pad + 1;
            else if (mn === dl) p._x = b.x0 - pad - 1;
            else p._x = b.x1 + pad + 1;
          }
        }
      });
    }
    return { W, H, mods, nodes };
  }

  function mapSide(id) {
    const p = PT[id]; if (!p) return '';
    const t = TP[id], qs = Qof(id);
    const years = [...new Set(qs.map(q => q.year))].sort((a, b) => a - b);
    const byYear = years.map(y => ({ label: String(y).slice(2), value: qs.filter(q => q.year === y).length }));
    return `<div class="card tight">
        <div class="eyebrow" style="margin-bottom:6px">当前选中 · ${esc(p.subject || '')} · 模块 ${(MOD[p.moduleId] || {}).no || ''} · 考点 ${pad2(p.index)}</div>
        <h2 style="margin:0 0 10px;font-size:16px">${esc(p.short)}</h2>
        <p class="small" style="color:var(--txt2);line-height:1.75;margin:0 0 12px">${esc(p.text)}</p>
        <div class="chips" style="margin-bottom:12px">
          <span class="chip count">关联 ${t.count} 道题</span>
          <span class="chip">覆盖 ${years.length} 个年份</span>
          <a class="chip" href="#/topic/${id}">完整详情 →</a>
        </div>
        <div class="small muted" style="margin-bottom:6px">年度分布</div>
        ${columns(byYear.slice(-12))}
      </div>
      <div class="card tight">
        <div class="card-head"><h3>相关公式 / 定理 / 方法</h3><span class="hint">${(p.cardIds || []).length} 张</span></div>
        <div class="chips">${(p.cardIds || []).slice(0, 12).map(c => cardChip(c)).join('') || '<span class="small muted">暂无卡片</span>'}</div>
      </div>
      <div class="card tight">
        <div class="card-head"><h3>该考点对应考题</h3><span class="hint">${qs.length} 道 · 点击左侧节点切换</span></div>
        <div class="stack" style="gap:6px">${qs.slice(0, 40).map(q => `
          <div class="topic-link">
            <span class="tl-id">${q.id}${q.subLabel ? `<i class="tl-sub">${esc(q.subLabel)}</i>` : ''}</span>
            <span class="tl-ex">${esc(q.heading || q.type)}</span>
            <button class="btn sm" data-sq="${q.id}" data-sm="question" title="打开题目页">题</button>
            <button class="btn sm" data-sq="${q.id}" data-sm="solution" title="打开解答页">解</button>
          </div>`).join('') || '<div class="small muted">暂无关联试题</div>'}</div>
      </div>`;
  }

  function viewMap(params) {
    if (params && params.get('tab') === 'cards') mapState.layout = 'cards';
    if (params && params.get('type')) mapState.cardType = params.get('type');
    if (params && params.get('module')) mapState.module = params.get('module');
    if (params && params.get('subject')) {
      const sid = params.get('subject');
      const s = subjects.find(x => x.id === sid) || subjects.find(x => x.name === sid);
      if (s) mapState.subject = s.name;
    }
    if (params && !params.get('tab') && !params.get('module') && !params.get('type')
        && !params.get('subject')) {
      mapState.layout = 'galaxy';        // 侧栏「知识地图」回到全景
      mapState.module = '全部';
      mapState.subject = '全部';
    }
    const curSubj = subjects.find(s => s.name === mapState.subject);
    setNav(mapState.layout === 'cards' ? 'cards'
      : (curSubj ? (curSubj.id === 'LA' ? 'la' : 'gs') : 'map'));
    crumb(mapState.layout === 'cards'
      ? [{ t: '知识地图', h: '#/map' }, { t: '知识卡片' }]
      : (curSubj ? [{ t: '知识地图', h: '#/map' }, { t: curSubj.name }] : [{ t: '知识地图' }]));
    if (!mapState.selected) {
      mapState.selected = D.topics.slice().sort((a, b) => b.count - a.count)[0].id;
    }
    $view.innerHTML = `
      <div class="page-head"><div class="eyebrow">Knowledge Graph · Syllabus ↔ Questions ↔ Cards</div>
        <h1>考纲知识地图</h1>
        <p>两套考纲并置：<b style="color:var(--txt2)">高等数学</b> 9 个模块（含 1 个补充专题）、
           <b style="color:var(--txt2)">线性代数</b> 6 个模块，共 ${meta.moduleCount} 个模块 / ${meta.pointCount} 个考点；
           并配 ${meta.cardCount} 张 <b style="color:var(--txt2)">公式 / 定理 / 性质 / 解题方法</b>卡片。
           <b style="color:var(--acc)">点击任意节点，右侧栏即刻切换为该考点的考纲原文、相关卡片与对应考题。</b></p></div>
      <div class="map-toolbar">
        <div class="filter-group" id="mapLayout">${[['galaxy', '星系图'], ['tree', '树状图'], ['heat', '热力图'], ['cards', '知识卡片']].map(([k, v]) => `<button data-v="${k}" class="${mapState.layout === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <div class="filter-group" id="mapSubject">${['全部'].concat(subjects.map(s => s.name)).map(x => `<button data-v="${x}" class="${mapState.subject === x ? 'on' : ''}">${x}</button>`).join('')}</div>
        <select id="mapModule"><option value="全部">全部模块</option>${moduleOptions(mapState.module)}</select>
        <label class="chip" id="mapLabelsWrap" style="cursor:pointer"><input type="checkbox" id="mapLabels" ${mapState.labels ? 'checked' : ''} style="accent-color:var(--acc)"> 显示考点标签</label>
        <span class="count" style="margin-left:auto;font-family:var(--mono)" id="mapCount"></span>
      </div>
      <div class="map-layout" id="mapLayoutRoot">
        <div id="mapMain"></div>
        <div class="map-side" id="mapSide"></div>
      </div>`;

    // 侧栏题目按钮：直接在抽屉里打开 PDF，不离开知识地图
    $('#mapSide').addEventListener('click', e => {
      const b = e.target.closest('[data-sq]'); if (!b) return;
      openQuestion(Q[b.dataset.sq], b.dataset.sm);
    });

    const renderSide = () => { $('#mapSide').innerHTML = mapSide(mapState.selected); };
    const renderMain = () => {
      const box = $('#mapMain');
      const isCards = mapState.layout === 'cards';
      // 模块/学科筛选后，侧栏自动切到范围内的第一个考点
      const inScope = p => p &&
        (mapState.module === '全部' || p.moduleId === mapState.module) &&
        (mapState.subject === '全部' || p.subject === mapState.subject);
      if (!inScope(PT[mapState.selected])) {
        const first = points.find(inScope);
        if (first) mapState.selected = first.id;
      }
      $('#mapLayoutRoot').classList.toggle('wide', isCards);
      $('#mapLabelsWrap').style.display = isCards ? 'none' : '';
      if (isCards) { box.innerHTML = cardsHTML(); initCards(); }
      else if (mapState.layout === 'galaxy') { box.innerHTML = galaxyHTML(); initGalaxy(renderSide); }
      else if (mapState.layout === 'tree') box.innerHTML = treeHTML();
      else box.innerHTML = heatHTML();
      if (isCards) {
        $('#mapCount').textContent = `${cards.length} 张卡片`;
        $('#mapSide').innerHTML = '';
      } else {
        const ms = modules.filter(m => mapState.subject === '全部' || m.subject === mapState.subject);
        const ps = points.filter(p => mapState.subject === '全部' || p.subject === mapState.subject);
        $('#mapCount').textContent = `${ms.length} 模块 · ${ps.length} 考点`;
        renderSide();
      }
    };

    $('#mapSubject').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      mapState.subject = b.dataset.v;
      mapState.module = '全部';
      $$('#mapSubject button').forEach(x => x.classList.toggle('on', x === b));
      const cur = subjects.find(s => s.name === mapState.subject);
      setNav(cur ? (cur.id === 'LA' ? 'la' : 'gs') : 'map');
      crumb(cur ? [{ t: '知识地图', h: '#/map' }, { t: cur.name }] : [{ t: '知识地图' }]);
      renderMain();
    });

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
    const inSubj = m => mapState.subject === '全部' || (m && m.subject === mapState.subject);
    const visM = L.mods.filter(m => inSubj(m) && (mapState.module === '全部' || m.id === mapState.module));
    const visP = L.nodes.filter(p => inSubj(MOD[p.moduleId]) &&
      (mapState.module === '全部' || p.moduleId === mapState.module));
    const edges = visP.map(p => `<path class="edge" d="M${p._hx.toFixed(1)},${p._hy.toFixed(1)} L${p._x.toFixed(1)},${p._y.toFixed(1)}" stroke="${p.color}" stroke-opacity=".22"/>`).join('');
    const all = mapState.module === '全部' && mapState.subject === '全部';
    const spokes = all ? visM.map(m => `<line x1="${L.W / 2}" y1="${L.H / 2}" x2="${m._x}" y2="${m._y}"
        stroke="rgba(139,123,255,.12)" stroke-dasharray="3 7"/>`).join('') : '';
    const hubs = visM.map(m => `<g>
        <circle cx="${m._x}" cy="${m._y}" r="34" fill="${m.color}" fill-opacity=".1" stroke="${m.color}"
                stroke-opacity=".45" ${m.subject === '线性代数' ? 'stroke-dasharray="4 3"' : ''}/>
        <circle cx="${m._x}" cy="${m._y}" r="20" fill="${m.color}" fill-opacity=".28"/>
      </g>`).join('');
    // 模块名单独成层、最后绘制：即使还有个别气泡靠近，文字也不会被盖住
    const hubLabels = visM.map(m => {
      const c = points.filter(p => p.moduleId === m.id).reduce((a, p) => a + cnt(p.id), 0);
      const nm = m.name.length > 10 ? m.name.slice(0, 10) + '…' : m.name;
      const w = 126, h = 32, x = m._x - w / 2, y = m._y + 40;
      return `<g class="hub-tag" style="pointer-events:none">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"
              fill="#121428" fill-opacity=".95" stroke="${m.color}" stroke-opacity=".38"/>
        <text x="${m._x}" y="${y + 14}" text-anchor="middle" font-size="10" fill="#cbd1e8">${esc(nm)}</text>
        <text x="${m._x}" y="${y + 26}" text-anchor="middle" font-size="9" fill="#7d87ab"
              font-family="var(--mono)">${c} 题次</text>
      </g>`;
    }).join('');
    // 模块编号最后绘制，带小底衬，任何情况下都清晰
    const hubNums = visM.map(m => `<g class="hub-num" style="pointer-events:none">
        <circle cx="${m._x}" cy="${m._y}" r="15" fill="#121428" fill-opacity=".92"
                stroke="${m.color}" stroke-opacity=".5"/>
        <text class="hub-lab" x="${m._x}" y="${m._y + 6}" style="font-size:17px">${m.no}</text>
      </g>`).join('');
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
          ${all ? `<g>
            <circle cx="${L.W / 2}" cy="${L.H / 2}" r="72" fill="url(#coreGrad)" stroke="rgba(139,123,255,.35)"/>
            <circle cx="${L.W / 2}" cy="${L.H / 2}" r="50" fill="rgba(139,123,255,.09)" stroke="rgba(139,123,255,.3)"/>
            <text x="${L.W / 2}" y="${L.H / 2 - 5}" text-anchor="middle" font-size="19"
                  font-family="var(--mono)" font-weight="700" fill="#d8d0ff" style="pointer-events:none">CMC</text>
            <text x="${L.W / 2}" y="${L.H / 2 + 15}" text-anchor="middle" font-size="10.5"
                  fill="#8b93b8" style="pointer-events:none">考纲知识地图</text>
            <text x="${L.W / 2}" y="${L.H / 2 + 31}" text-anchor="middle" font-size="9.5"
                  font-family="var(--mono)" fill="#666e90" style="pointer-events:none">${modules.length} 模块 · ${points.length} 考点 · ${meta.questionCount} 题</text>
          </g>` : ''}
          <g>${edges}</g><g>${hubs}</g><g>${nodes}</g><g>${hubLabels}</g><g>${hubNums}</g>
        </g>
      </svg>
      <div class="map-hint">滚轮缩放 · 拖拽平移 · 点击节点</div>
      <div class="map-legend">
        ${subjectList().map(s => {
          const ms = modules.filter(m => m.subject === s.name);
          const c = ms[0] ? ms[0].color : '#888';
          return `<span><i style="background:${c}"></i>${esc(s.name)} · ${ms.length} 模块（${ms.length ? '1–' + ms[ms.length - 1].no : ''}）</span>`;
        }).join('')}
        <span class="mono" style="opacity:.65">圈内数字 = 学科内模块序号</span>
      </div>
    </div>`;
  }

  function initGalaxy(onSelect) {
    const svg = $('#mapSvg'); if (!svg) return;
    const root = $('#mapRoot');
    const VB_W = 1000, VB_H = 760;
    let tx = 0, ty = 0, sc = 1, dragging = false, lx = 0, ly = 0;
    let downX = 0, downY = 0, downNode = null, moved = false;
    const apply = () => root.setAttribute('transform', `translate(${tx},${ty}) scale(${sc})`);
    // 用坐标反查节点，避免指针捕获 / 透明覆盖层导致 e.target 不是节点本身
    const nodeAt = e => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return el && el.closest ? el.closest('[data-href]') : null;
    };
    const select = t => {
      if (!t) return;
      mapState.selected = t.dataset.href.split('/').pop();
      $$('#mapSvg [data-href]').forEach(g => g.classList.toggle('sel', g === t));
      if (onSelect) onSelect();                 // 原地刷新右侧栏，不跳转页面
    };
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width * VB_W;
      const my = (e.clientY - r.top) / r.height * VB_H;
      const old = sc; sc = Math.min(2.6, Math.max(.55, sc * (e.deltaY > 0 ? .9 : 1.11)));
      tx = mx - (mx - tx) * (sc / old); ty = my - (my - ty) * (sc / old); apply();
    }, { passive: false });
    svg.addEventListener('pointerdown', e => {
      dragging = true; moved = false;
      lx = downX = e.clientX; ly = downY = e.clientY;
      downNode = (e.target.closest ? e.target.closest('[data-href]') : null) || nodeAt(e);
      svg.classList.add('dragging');
      // 注意：这里不要 setPointerCapture，否则 click 的 target 会变成 svg 本身
    });
    svg.addEventListener('pointermove', e => {
      if (dragging) {
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 5) moved = true;
        if (moved) {
          const r = svg.getBoundingClientRect();
          tx += (e.clientX - lx) * VB_W / r.width; ty += (e.clientY - ly) * VB_H / r.height;
          apply();
        }
        lx = e.clientX; ly = e.clientY;
      }
      const t = nodeAt(e) || (e.target.closest ? e.target.closest('[data-tip]') : null);
      const tip = $('#tooltip');
      if (t && t.dataset.tip) {
        const [id, name, c] = t.dataset.tip.split('|');
        tip.innerHTML = `<b>${esc(name)}</b><span class="tsub">${esc(id)} · 关联 ${esc(c)} 道题</span><div style="margin-top:4px;color:var(--txt2)">点击右侧栏查看考纲条目与试题</div>`;
        tip.hidden = false; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
      } else tip.hidden = true;
    });
    svg.addEventListener('pointerup', e => {
      if (dragging && !moved) select(downNode || nodeAt(e));
      dragging = false; svg.classList.remove('dragging');
      $('#tooltip').hidden = true;
    });
    svg.addEventListener('pointercancel', () => { dragging = false; svg.classList.remove('dragging'); });
    svg.addEventListener('pointerleave', () => { dragging = false; $('#tooltip').hidden = true; });
    // 兜底：键盘/合成 click 事件也能选中
    svg.addEventListener('click', e => {
      const t = (e.target.closest ? e.target.closest('[data-href]') : null) || nodeAt(e);
      if (t) select(t);
    });
    $$('#mapSvg [data-href]').forEach(g =>
      g.classList.toggle('sel', g.dataset.href === '#/topic/' + mapState.selected));
    // 单模块 / 单学科筛选时，把对应星团移到画布中央
    let cx0 = null, cy0 = null;
    if (mapState.module !== '全部' && MOD[mapState.module] && MOD[mapState.module]._x != null) {
      cx0 = MOD[mapState.module]._x; cy0 = MOD[mapState.module]._y;
    } else if (mapState.subject !== '全部') {
      const ms = modules.filter(m => m.subject === mapState.subject && m._x != null);
      if (ms.length) {
        cx0 = ms.reduce((a, m) => a + m._x, 0) / ms.length;
        cy0 = ms.reduce((a, m) => a + m._y, 0) / ms.length;
      }
    }
    if (cx0 != null) {
      tx = VB_W / 2 - cx0;
      ty = VB_H / 2 - cy0;
      apply();
    }
  }

  function treeHTML() {
    const visM = modules.filter(m =>
      (mapState.subject === '全部' || m.subject === mapState.subject) &&
      (mapState.module === '全部' || m.id === mapState.module));
    const max = Math.max(1, ...points.map(p => cnt(p.id)));
    let lastSubj = null;
    return `<div class="card"><div class="card-head"><h2>考纲 → 模块 → 考点 → 试题</h2><span class="hint">条形长度 = 关联试题数</span></div>
      ${visM.map(m => {
        const head = m.subject !== lastSubj
          ? `<div class="tree-subject"><b>${esc(m.subject)}</b><span class="mono">${modules.filter(x => x.subject === m.subject).length} 个模块</span></div>` : '';
        lastSubj = m.subject;
        return `${head}<div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          <i style="width:10px;height:10px;border-radius:3px;background:${m.color}"></i>
          <b style="font-size:13.5px">${m.no}. ${esc(m.name)}</b>
          <span class="mono small muted">${m.count} 条目${m.extra ? ' · 补充' : ''}</span>
        </div>
        ${hbars(points.filter(p => p.moduleId === m.id).map(p => ({
          label: `${pad2(p.index)}  ${p.short}`, value: cnt(p.id), color: p.color,
          href: `#/topic/${p.id}`, click: true
        })), { max, labelWidth: 200, click: true })}
      </div>`;
      }).join('')}</div>`;
  }

  function heatHTML() {
    const eds = [...new Set(papers.map(p => p.edition))].sort((a, b) => a - b);
    const visM = modules.filter(m =>
      (mapState.subject === '全部' || m.subject === mapState.subject) &&
      (mapState.module === '全部' || m.id === mapState.module));
    const values = [];
    visM.forEach(m => {
      const qs = questions.filter(q => q.topics.some(t => PT[t] && PT[t].moduleId === m.id));
      eds.forEach(e => values.push({ m: m.id, e, v: qs.filter(q => q.edition === e).length }));
    });
    const max = Math.max(1, ...values.map(x => x.v));
    const cols = `28px 148px repeat(${eds.length},minmax(26px,1fr))`;
    return `<div class="card"><div class="card-head"><h2>模块 × 届次 热力图</h2><span class="hint">单元格 = 该届涉及该模块的试题数</span></div>
      <div class="heat-wrap"><div class="heat-grid" style="grid-template-columns:${cols}">
        <div></div><div class="heat-col-lab" style="text-align:left">模块 / 届次</div>
        ${eds.map(e => `<div class="heat-col-lab">${e}</div>`).join('')}
        ${visM.map(m => `
          <div class="heat-row-lab" style="grid-column:1/3"><i style="width:8px;height:8px;border-radius:2px;background:${m.color}"></i>${m.no}. ${esc(m.name)}</div>
          ${eds.map(e => {
            const v = values.find(x => x.m === m.id && x.e === e).v;
            return `<div class="heat-cell" style="background:${heatColor(v, max)}" title="${esc(m.subject)} 模块 ${m.no} · 第 ${e} 届：${v} 题">${v || ''}</div>`;
          }).join('')}`).join('')}
      </div></div>
      <div class="heat-scale">低 ${[0, .2, .4, .6, .8, 1].map(t => `<i style="background:${heatColor(t * max, max)}"></i>`).join('')} 高（峰值 ${max} 题）</div>
    </div>`;
  }

  /* ----------------------------- 视图：知识点详情 ----------------------------- */
  function viewTopic(id) {
    const p = PT[id], t = TP[id];
    if (!p) { $view.innerHTML = '<div class="empty">未找到该知识点</div>'; return; }
    const mod = MOD[p.moduleId] || {};
    const isLA = p.subject === '线性代数';
    setNav(isLA ? 'la' : 'gs'); mapState.selected = id;
    crumb([{ t: '知识地图', h: '#/map' },
           { t: esc(p.subject), h: `#/map?subject=${mod.subjectId || ''}` },
           { t: `${mod.no}. ${p.moduleName}`, h: `#/map?module=${p.moduleId}` },
           { t: `${id} ${p.short}` }]);
    const qs = Qof(id);
    const years = [...new Set(qs.map(q => q.year))].sort((a, b) => a - b);
    const byStage = ['初赛', '补赛', '决赛'].map(s => ({ label: s, value: qs.filter(q => q.stage === s).length, color: s === '决赛' ? '#ff7a59' : '#8b7bff' }));
    const byYear = years.map(y => ({ label: String(y).slice(2), value: qs.filter(q => q.year === y).length }));
    const kw = p.keywords.map(k => `<span class="chip">${esc(k.kw)} <span class="mono muted">×${k.w}</span></span>`).join('');
    $view.innerHTML = `
      <div class="page-head">
        <div class="eyebrow">${esc(p.subject)} · 模块 ${mod.no} · ${esc(p.moduleName)} · 考点 ${pad2(p.index)}（${id}）</div>
        <h1>${esc(p.short)}</h1>
        <p>${esc(p.text)}</p>
        ${isLA ? `<div class="card tight syl-note" style="--c:${p.color};margin-top:12px">
          本条来自《线性代数考纲》第 ${mod.no} 模块「${esc(p.moduleName)}」。
          历届决赛中的线性代数题按用户核对的清单显式标注（共 ${meta.linalgQuestionCount} 道），不做关键词自动匹配；
          题目表中的 <span class="tl-sub">一(4)</span> 等标记表示「填空题第 4 小题」，其余为整道大题。
          ${qs.length ? '' : '<br><b>本考点近 17 届未单独出题</b>，可作为复习清单中的知识覆盖项。'}</div>` : ''}
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
      ${questionRows(qs, 'topicTable', 'data-openq')}`;
    bindQuestionRows('topicTable', 'data-openq');
    observeThumbs($('#topicTable'));
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
    observeThumbs($('#cardTable'));
  }

  /* ----------------------------- 视图：考纲全文 ----------------------------- */
  let sylClosed = {};
  function viewSyllabus() {
    setNav('syllabus'); crumb([{ t: '考纲全文' }]);
    $view.innerHTML = `
      <div class="page-head"><div class="eyebrow">Syllabus · CMC 非数 A 类</div>
        <h1>${esc(syl.title)}</h1>
        <p>两套考纲分别转录自 <span class="mono">CMC非数A高数考纲.docx</span> 与
           <span class="mono">CMC非数A线代考纲.docx</span>，按学科分栏：共
           ${meta.moduleCount} 个模块 / ${meta.pointCount} 个考点
           （高等数学 ${(meta.subjectStats['高等数学'] || {}).moduleCount} 模块 / ${(meta.subjectStats['高等数学'] || {}).pointCount} 考点，
           线性代数 ${(meta.subjectStats['线性代数'] || {}).moduleCount} 模块 / ${(meta.subjectStats['线性代数'] || {}).pointCount} 考点）。
           模块序号为各学科内部编号；每条后面的数字为关联到的试题数。</p></div>
      <div id="sylWrap">${subjectList().map(s => {
        const ms = modules.filter(m => m.subject === s.name);
        const pc = points.filter(p => p.subject === s.name).length;
        return `<div class="syl-subject">
          <div class="syl-subject-head">
            <span class="ss-dot"></span><b>${esc(s.name)}</b>
            <span class="mono">${ms.length} 个模块 · ${pc} 个考点</span>
            <a class="chip" href="#/map?subject=${s.id || ''}" style="margin-left:auto">在知识地图中查看 →</a>
          </div>
          ${ms.map(m => {
            const c = points.filter(p => p.moduleId === m.id).reduce((a, p) => a + cnt(p.id), 0);
            return `<div class="card syl-module ${sylClosed[m.id] ? 'closed' : ''}" data-mid="${m.id}" style="padding:0">
              <div class="syl-head" data-toggle="${m.id}">
                <span class="idx" style="--c:${m.color};background:${m.color}">${m.no}</span>
                <h2>${esc(m.name)} ${m.tag ? `<span class="badge" style="margin-left:6px;color:${m.color};border-color:${m.color}55">${esc(m.tag)}</span>` : ''}</h2>
                <span class="meta">${m.count} 条目 · ${c} 题次</span><span class="chev">⌄</span>
              </div>
              <div class="syl-body">
                ${m.note ? `<div class="syl-note" style="--c:${m.color}">${esc(m.note)}</div>` : ''}
                ${points.filter(p => p.moduleId === m.id).map(p => `
                <div class="syl-item">
                  <span class="n">${pad2(p.index)}</span>
                  <span class="tx">${esc(p.text)}</span>
                  <span class="go"><a class="chip count" href="#/topic/${p.id}">${cnt(p.id)} 题 →</a>
                    <span class="small muted mono">${p.id}</span></span>
                </div>`).join('')}</div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
      </div>
      <div class="card tight" style="margin-top:18px"><div class="small muted">
        📎 说明：高等数学与线性代数两套考纲分别转录自对应 docx，模块序号按各学科内部顺序编号（圈内数字）。
        考点与试题的对应由 <span class="mono">scripts/build_data.py</span> 的关键词规则自动匹配；线性代数题按人工核对的决赛清单显式标注。
        可编辑 <span class="mono">scripts/syllabus_source.json</span> 后重新运行脚本更新。</div></div>`;
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
      label: `${m.no}. ${m.name}`, value: points.filter(p => p.moduleId === m.id).reduce((a, p) => a + cnt(p.id), 0),
      color: m.color, color2: m.subject === '线性代数' ? '#d946ef' : '#4d8dff', href: `#/map?module=${m.id}`
    })).sort((a, b) => b.value - a.value);
    const subjDist = subjectList().map(s => ({
      label: s.name,
      value: points.filter(p => p.subject === s.name).reduce((a, p) => a + cnt(p.id), 0),
      color: s.name === '线性代数' ? '#d946ef' : '#8b7bff'
    }));
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
        <div class="card"><div class="card-head"><h2>各模块题次</h2><span class="hint">高数 1–9 / 线代 1–6 · 点击前往</span></div>${hbars(modCounts, { click: true, labelWidth: 168 })}</div>
        <div class="card"><div class="card-head"><h2>学科 · 阶段 · 题型</h2></div>
          <div class="small muted" style="margin-bottom:6px">学科题次（高数 / 线代）</div>${donut(subjDist, 132)}
          <div class="divider"></div><div class="small muted" style="margin-bottom:6px">试卷阶段（套）</div>${donut(stages, 132)}
          <div class="divider"></div><div class="small muted" style="margin-bottom:6px">试题题型（道）</div>${donut(types, 132)}</div>
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
        <div class="card" id="searchTable" style="padding:6px 14px"><table class="tbl"><thead><tr><th>题号</th><th>试卷</th><th>题目</th><th>考点</th><th>题目</th><th>解答</th></tr></thead>
        <tbody>${hitQ.slice(0, 150).map(x => `<tr>
          <td><a class="mono" href="#/paper/${pad2(x.paperId)}?q=${encodeURIComponent(x.id)}">${x.id}</a></td>
          <td class="small">${x.year} ${esc(P[pad2(x.paperId)].short)}</td>
          <td style="width:320px">${thumbHTML(x, 'thumbS', 'mini')}</td>
          <td>${topicChips(x, 2)}</td>
          <td><button class="btn sm" data-sq="${x.id}" data-sm="question">P${x.questionPage}</button></td>
          <td><button class="btn sm" data-sq="${x.id}" data-sm="solution">P${x.solutionPage}</button></td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${q && !hitQ.length && !hitP.length && !hitT.length && !hitC.length ? '<div class="empty"><span class="big">◌</span>没有匹配结果，试试「中值定理」「格林」「幂级数」「矩阵」等关键词</div>' : ''}`;
    const st = $('#searchTable');
    if (st) {
      observeThumbs(st);
      st.addEventListener('click', e => {
        const b = e.target.closest('[data-sq]'); if (!b) return;
        openQuestion(Q[b.dataset.sq], b.dataset.sm);
      });
    }
  }

  /* ----------------------------- 路由 ----------------------------- */
  function route() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    $('#tooltip').hidden = true;
    HeroFX.stop();          // 离开首页即停止动画，不占后台 CPU
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
