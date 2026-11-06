/*
 * TYAFF site v15 — shared page script for / (EN), /ru/ and /hy/.
 * All visible texts live in the page itself (data-* attributes), so a new language = a translated HTML copy.
 * Asset paths are prefixed with <html data-root="">: "" at the site root, "../" in /ru/ and /hy/.
 */
(function () {
  'use strict';
  const html = document.documentElement;
  const ROOT = html.getAttribute('data-root') || '';
  const LANG = (html.lang || 'en').slice(0, 2).toLowerCase();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const $ = (s) => document.querySelector(s);
  const abs = (p) => new URL(ROOT + p, location.href).href;

  /* ---- reveal on scroll ---- */
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('.rv').forEach((el) => io.observe(el));

  const ag = $('#appgrid');
  if (ag) {
    const ioA = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { ag.classList.add('on'); ioA.disconnect(); }
    }), { threshold: 0.25 });
    ioA.observe(ag);
  }

  /* ---- counters in the specs row + masked headings ---- */
  document.querySelectorAll('[data-count]').forEach((e) => { e.textContent = '0'; });
  addEventListener('beforeprint', () => {
    document.querySelectorAll('[data-count]').forEach((e) => { e.textContent = e.dataset.count; });
  });
  function runCounters(scope) {
    scope.querySelectorAll('[data-count]').forEach((el) => {
      const target = +el.dataset.count;
      if (reduced) { el.textContent = target; return; }
      const t0 = performance.now(), dur = 1200;
      (function tick(now) {
        const t = Math.max(0, Math.min(1, (now - t0) / dur));
        el.textContent = Math.round(t >= 1 ? target : target * (1 - Math.pow(2, -10 * t)));
        if (t < 1) requestAnimationFrame(tick);
      })(performance.now());
    });
  }
  const ioG = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('go');
    if (e.target.classList.contains('specs-row')) runCounters(e.target);
    ioG.unobserve(e.target);
  }), { threshold: 0.3 });
  document.querySelectorAll('.mrv,.wipe,.specs-row').forEach((el) => ioG.observe(el));

  /* ---- nav: translucent with blur after scrolling ---- */
  (function () {
    const nav = $('#nav');
    if (!nav) return;
    const upd = () => nav.classList.toggle('solid', (scrollY || 0) > 50);
    upd();
    addEventListener('scroll', upd, { passive: true });
  })();

  /* ---- testing application form ---- */
  (function () {
    // FORM_ENDPOINT: вставить URL сервиса форм (например https://api.web3forms.com/submit)
    // и добавить в форму hidden-поле access_key. Пока пусто — заявки НЕ отправляются.
    // Отправляются ВСЕ поля формы с name: email, breed, age, city, product, config,
    // consent (=yes, обязательная галочка), notify_sales (=yes, только если отмечена),
    // consent_version, consent_lang, consent_at (время ISO), consent_text (точный текст согласия) —
    // это доказательство согласия (ст. 9(8) закона РА «О защите персональных данных»).
    // LEGAL: до подключения сервиса — страна хранения данных (ст. 27) и поручение обработчику / DPA (ст. 14), см. privacy/.
    const ENDPOINT = '';
    // live site (tyaff.com): with an empty ENDPOINT the form shows the send error instead of a false "thank you";
    // local previews still show the thanks text so the flow can be checked.
    const LIVE = /(^|\.)tyaff\.com$/i.test(location.hostname);
    // thanks text: [[ЗАПОЛНИТЬ: …]] placeholders get the same yellow outline as in the page (span.ph)
    const showThanks = (el, s) => {
      el.textContent = '';
      s.split(/(\[\[[^\]]+\]\])/).forEach((part) => {
        if (!part) return;
        if (/^\[\[[^\]]+\]\]$/.test(part)) {
          const ph = document.createElement('span');
          ph.className = 'ph';
          ph.textContent = part;
          el.append(ph);
        } else el.append(document.createTextNode(part));
      });
    };
    const f = $('#waitform'), t = $('#thanks'), err = $('#mailerr'), sendErr = $('#senderr');
    if (!f) return;
    const em = f.querySelector('input[type=email]');
    const btn = f.querySelector('[type=submit]');
    let busy = false;
    // error message of a field: #mailerr for the email, [data-err-for="<name>"] for the others (consent)
    const msgOf = (el) => (el === em ? err : (el.name ? f.querySelector(`[data-err-for="${el.name}"]`) : null));
    const mark = (el, bad) => {
      const m = msgOf(el);
      el.classList.toggle('bad', bad);
      if (bad) {
        el.setAttribute('aria-invalid', 'true');
        if (m && m.id) el.setAttribute('aria-describedby', m.id);
      } else {
        el.removeAttribute('aria-invalid');
        el.removeAttribute('aria-describedby');
      }
      if (m) m.hidden = !bad;
    };
    const setField = (name, val) => {
      const i = f.querySelector(`input[type=hidden][name="${name}"]`);
      if (i) i.value = val;
    };
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const v = (em.value || '').trim();
      em.value = v;
      const invalid = [];
      const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
      mark(em, !okMail);
      if (!okMail) invalid.push(em);
      // a required checkbox (consent to personal data processing) blocks sending until it is ticked
      f.querySelectorAll('input[type=checkbox][required]').forEach((c) => {
        mark(c, !c.checked);
        if (!c.checked) invalid.push(c);
      });
      if (invalid.length) { invalid[0].focus(); return; }
      // proof of consent: which wording, in which language, when
      const ct = f.querySelector('#consentTxt');
      let txt = '';
      if (ct) {
        const c = ct.cloneNode(true);
        c.querySelectorAll('.vh').forEach((n) => n.remove());
        txt = c.textContent.replace(/\s+/g, ' ').trim();
      }
      setField('consent_text', txt);
      setField('consent_lang', LANG);
      setField('consent_at', new Date().toISOString());
      if (sendErr) sendErr.hidden = true;
      // v15 fix: on the live domain without an endpoint nothing can be sent, so do not claim the application is in
      if (!ENDPOINT && LIVE) {
        console.warn('TYAFF form: ENDPOINT is empty — the application was not sent');
        if (sendErr) sendErr.hidden = false;
        return;
      }
      if (ENDPOINT) {
        busy = true;
        if (btn) btn.disabled = true;
        let ok = false;
        try {
          const r = await fetch(ENDPOINT, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } });
          ok = r.ok;
        } catch (_) { ok = false; }
        busy = false;
        if (btn) btn.disabled = false;
        if (!ok) { if (sendErr) sendErr.hidden = false; return; }
      }
      f.hidden = true;
      if (t) { showThanks(t, f.dataset.thanks || ''); t.focus(); }
    });
    em.addEventListener('input', () => { if (em.classList.contains('bad')) mark(em, false); });
    f.addEventListener('change', (e) => {
      const c = e.target;
      if (c.type === 'checkbox' && c.required && c.checked) mark(c, false);
    });
  })();

  /* ---- signals video: loads near the viewport, pauses off-screen ---- */
  (function () {
    const v = $('.sig-video'), pp = $('#sigPP');
    if (!v || !pp || reduced || saveData) return;
    let set = false;
    const play = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    const paused = () => pp.getAttribute('aria-pressed') === 'true';
    v.addEventListener('playing', () => pp.classList.add('show'), { once: true });
    pp.addEventListener('click', () => {
      if (paused()) { pp.setAttribute('aria-pressed', 'false'); play(); } else { pp.setAttribute('aria-pressed', 'true'); v.pause(); }
    });
    new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { if (!set) { v.src = v.dataset.src; set = true; } if (!paused()) play(); } else if (set) v.pause();
    }), { rootMargin: '300px 0px' }).observe(v);
  })();

  /* ---- hero video: after first paint, sized to the screen; without video the poster stays ---- */
  (function () {
    const v = $('.hero-video'), pp = $('#heroPP'), top = $('#top');
    if (!v || !pp || !top || reduced || saveData) return;
    const M = ROOT + 'media/';
    // v16: пока черновик Seedance 480p — 720p (увеличен из 480p) на больших экранах, 480p на маленьких, вертикальная вырезка на телефоне
    const pick = () => {
      if (matchMedia('(max-width: 600px) and (orientation: portrait)').matches) return M + 'hero-v16-m.mp4?v=1';
      const need = Math.max(top.clientWidth, top.clientHeight * 16 / 9) * Math.min(devicePixelRatio || 1, 2);
      return need > 900 ? M + 'hero-v16-720.mp4?v=1' : M + 'hero-v16-480.mp4?v=1';
    };
    let cur = pick();
    v.src = cur;
    const userPaused = () => pp.getAttribute('aria-pressed') === 'true';
    v.addEventListener('playing', () => { v.classList.add('on'); pp.classList.add('show'); });
    const start = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    let loaded = document.readyState === 'complete', inView = false;
    const go = () => { if (loaded && inView && !userPaused()) start(); };
    if (!loaded) addEventListener('load', () => { loaded = true; go(); }, { once: true });
    new IntersectionObserver((es) => es.forEach((e) => { inView = e.isIntersecting; if (inView) go(); else v.pause(); })).observe(top);
    let rt, onMeta = null;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const n = pick();
        if (n === cur) return;
        const t = v.currentTime, was = !v.paused;
        cur = n;
        if (onMeta) v.removeEventListener('loadedmetadata', onMeta);
        onMeta = () => { onMeta = null; try { v.currentTime = t; } catch (_) { /* ignore */ } };
        v.addEventListener('loadedmetadata', onMeta, { once: true });
        v.src = n;
        if (was) start(); else { v.preload = 'metadata'; v.load(); } // paused: load metadata to restore the frame
      }, 250);
    });
    pp.addEventListener('click', () => {
      if (userPaused()) { pp.setAttribute('aria-pressed', 'false'); start(); } else { pp.setAttribute('aria-pressed', 'true'); v.pause(); }
    });
  })();

  /* ---- 3D configurator + the two buy buttons ---- */
  (function () {
    const stage = $('#cfgStage'), panel = $('#cfgPanel');
    if (!stage || !panel) return;
    const fProduct = $('#fProduct'), fConfig = $('#fConfig'), line = $('#choiceLine'), lbl = $('#choiceLbl');
    let product = '';
    const labelOf = (p) => {
      const c = window.__collar;
      if (c) { const s = c.getState(); return p === 'tracker' ? s.trackerLabel : s.collarLabel; }
      const b = document.querySelector(`.cfg-buy [data-product="${p}"]`); // configurator not loaded: product name only
      return (b && b.dataset.name) || '';
    };
    const pick = (p) => {
      product = p;
      const l = labelOf(p);
      if (fProduct) fProduct.value = p;
      if (fConfig) fConfig.value = l;
      if (lbl) lbl.textContent = l;
      if (line) line.hidden = false;
    };
    // after a buy click the form keeps following the configurator
    panel.addEventListener('collar:change', () => { if (product) pick(product); });
    document.querySelectorAll('.cfg-buy [data-product]').forEach((b) => {
      b.addEventListener('click', () => pick(b.dataset.product));
    });

    const spinPP = $('#cfgPP');
    if (spinPP) {
      spinPP.addEventListener('click', () => {
        const stop = spinPP.getAttribute('aria-pressed') !== 'true';
        spinPP.setAttribute('aria-pressed', String(stop));
        if (window.__collar) window.__collar.setSpin(!stop);
      });
      stage.addEventListener('collar:spin', (e) => spinPP.setAttribute('aria-pressed', String(!e.detail.on)));
    }

    // v15 fix: the colour/material panel is built right away (small module, no three.js), so the buy buttons and
    // the form never jump when it appears; only the 3D (three.js + GLB, ~3 MB) waits for `gate`.
    let openGate;
    const gate = new Promise((r) => { openGate = r; });
    // with Save-Data on, the 3D loads only on tap
    if (saveData) {
      stage.classList.add('sd');
      const l = stage.querySelector('.cfg-load');
      if (l) l.textContent = stage.dataset.sd || '';
      stage.addEventListener('click', () => { stage.classList.remove('sd'); openGate(); }, { once: true });
    } else {
      const io3 = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting)) { io3.disconnect(); openGate(); }
      }, { rootMargin: '600px 0px' });
      io3.observe(stage);
    }
    panel.classList.add('cfg-reserve'); // reserves the panel height until it is built (css: .cfg-panel.cfg-reserve:empty)
    (async () => {
      try {
        const { mountCollar } = await import(abs('js/collar-v15.js'));
        window.__collar = await mountCollar({ stage, panel, lang: LANG, mediaBase: abs('media/'), glGate: gate });
        if (product) pick(product);
      } catch (err) {
        console.warn('collar viewer failed', err);
        stage.classList.add('nogl');
        const l = stage.querySelector('.cfg-load');
        if (l) l.textContent = stage.dataset.nogl || '';
      } finally {
        panel.classList.remove('cfg-reserve');
      }
    })();
  })();
})();
