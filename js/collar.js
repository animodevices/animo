/*
 * animo · 3D collar configurator (site v11)
 *
 * ES module for three.js r170 (the page provides the import map):
 *   "three":         js/vendor/three/build/three.module.min.js  (r170, лежит в репо: jsDelivr в РФ бывает недоступен)
 *   "three/addons/": js/vendor/three/examples/jsm/
 *
 *   import { mountCollar, CATALOG } from './js/collar.js';
 *   const ctl = await mountCollar({ stage, panel, lang: 'ru', mediaBase: 'media/' });
 *   ctl.setStrap('leather', 'cognac'); ctl.setHardware('steel'); ctl.getState(); ctl.dispose();
 *
 * Assets (resolved against mediaBase):
 *   collar.glb                    meshopt + EXT_texture_webp, node/material names of the designer GLB
 *   strap/strap_n_smooth.jpg      2048² normal map on the STRAP UV atlas (OpenGL), biothane
 *   strap/strap_n_leather.jpg     2048² normal map on the STRAP UV atlas (OpenGL), leather
 *
 * Model orientation (designer GLB, glTF Y-up): the ring stands in the XY plane, pod (TRACKER) on top
 * at +Y, strap hanging down to −Y, strap width along Z. "LOGO TRACKER" is the raised "animo." lettering
 * on BOTH side faces of the pod (Z = ±0.12, mirrored so it reads correctly from +Z and from −Z), so the
 * initial camera simply looks from the +Z side. orientUpright() re-checks this at runtime.
 *
 * Listen for 'collar:change' on the panel BEFORE calling mountCollar (the first event is dispatched
 * in a microtask right after the panel is rendered).
 */
// three.js грузится лениво (loadThree): панель выбора строится сразу и работает, даже если
// 3D-библиотека не загрузилась (нет import maps, сбой сети) — тогда остаётся постер.
let THREE, GLTFLoader, MeshoptDecoder, OrbitControls, RoomEnvironment;
let threePromise = null;
function loadThree() {
  if (!threePromise) {
    threePromise = Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/environments/RoomEnvironment.js'),
    ]).then(([three, gltf, meshopt, orbit, room]) => {
      THREE = three;
      GLTFLoader = gltf.GLTFLoader;
      MeshoptDecoder = meshopt.MeshoptDecoder;
      OrbitControls = orbit.OrbitControls;
      RoomEnvironment = room.RoomEnvironment;
    });
    threePromise.catch(() => { threePromise = null; });
  }
  return threePromise;
}

/*
 * Stitch mask thresholds: LINEAR luminance of the baked strap base colour (STRAP_BaseColor,
 * BezierCurve_004_BaseColor). Below LO = strap body (recoloured to the strap colour), above HI = stitch
 * thread (recoloured to the stitch colour), smoothstep in between.
 * Measured on media/collar.glb (STRAP_BaseColor_2K, webp): body median 0.212 linear, p99 0.231; stitch
 * dashes up to 1.0 (≈ 0.3 % of the used atlas above 0.45). The small loop (BezierCurve_004) has no stitches
 * (max 0.32), so it renders fully in the strap colour. Adjust here if the assets report other values.
 */
export const STITCH_LUM_LO = 0.45;
export const STITCH_LUM_HI = 0.75;

/* ---------------------------------------------------------------------------------------------- */
/* Catalog                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

const col = (id, hex, ru, en, stitch = hex) => ({ id, hex, stitch, name: { ru, en } });
const CREAM = '#E8DCC3';

function deepFreeze(o) {
  Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
}

export const CATALOG = deepFreeze({
  materials: [
    {
      id: 'nylon',
      name: { ru: 'Нейлон', en: 'Nylon' },
      sub: { ru: 'мягкая стропа', en: 'soft webbing' },
      defaultColor: 'fog',
      colors: [
        col('graphite', '#2E2E2C', 'Графит', 'Graphite', '#8A8A84'),
        col('fog', '#9C9C97', 'Туман', 'Fog', '#F2F2EE'), // близко к исходному серому дизайнера (sRGB ≈127 под светом сцены)
        col('red', '#D8262C', 'Красный animo', 'animo red', '#F4D7D8'),
        col('pine', '#2F4A3B', 'Хвоя', 'Pine', '#A9B9AE'),
        col('sand', '#C9B694', 'Песок', 'Sand', '#F3ECDD'),
        col('night', '#22304A', 'Ночь', 'Night', '#9AA6BA'),
      ],
    },
    {
      id: 'biothane',
      name: { ru: 'Биотан', en: 'Biothane' },
      sub: { ru: 'не боится воды и грязи', en: 'waterproof, wipe-clean' },
      defaultColor: 'black',
      colors: [ // stitch = strap colour: no visible stitching
        col('black', '#1C1C1C', 'Чёрный', 'Black'),
        col('white', '#ECECE7', 'Белый', 'White'),
        col('orange', '#EE6420', 'Сигнальный', 'Signal orange'),
        col('mint', '#8DCFBF', 'Мята', 'Mint'),
        col('cobalt', '#24509E', 'Кобальт', 'Cobalt'),
        col('red', '#D8262C', 'Красный animo', 'animo red'),
      ],
    },
    {
      id: 'leather',
      name: { ru: 'Кожа', en: 'Leather' },
      sub: { ru: 'растительное дубление', en: 'vegetable-tanned' },
      defaultColor: 'cognac',
      colors: [
        col('cognac', '#8A4A23', 'Коньяк', 'Cognac', CREAM),
        col('chocolate', '#4A2C1F', 'Шоколад', 'Chocolate', CREAM),
        col('black', '#1F1C1B', 'Чёрная', 'Black', '#6E6A66'),
        col('tan', '#C39A6B', 'Карамель', 'Tan', CREAM),
        col('burgundy', '#5B1F25', 'Бордо', 'Burgundy', CREAM),
      ],
    },
  ],
  hardware: [
    { id: 'graphite', name: { ru: 'Графит', en: 'Graphite' } }, // designer's baked look
    { id: 'steel', name: { ru: 'Сталь', en: 'Steel' }, hex: '#C9CBCC' }, // brushed light steel
  ],
  defaults: { material: 'nylon', hardware: 'graphite' },
});

const UI = {
  ru: {
    mat: 'Материал', matAria: 'Материал ремня',
    col: 'Цвет', colAria: 'Цвет ремня',
    hw: 'Фурнитура', hwAria: 'Фурнитура',
    sum: 'Ваш animo',
    hwLabel: (h) => `фурнитура ${h}`,
    canvas: '3D-модель ошейника animo. Потяните, чтобы повернуть',
    nogl: '3D-просмотр недоступен в этом браузере',
  },
  en: {
    mat: 'Material', matAria: 'Strap material',
    col: 'Colour', colAria: 'Strap colour',
    hw: 'Hardware', hwAria: 'Hardware',
    sum: 'Your animo',
    hwLabel: (h) => `${h} hardware`,
    canvas: 'animo collar 3D model. Drag to rotate',
    nogl: '3D preview is not available in this browser',
  },
};

const findMat = (id) => CATALOG.materials.find((m) => m.id === id) || null;
const findHw = (id) => CATALOG.hardware.find((h) => h.id === id) || null;
const findCol = (mat, id) => (mat && id != null ? mat.colors.find((c) => c.id === id) || null : null);

function labelFor(state, lang) {
  const t = UI[lang];
  const mat = findMat(state.material);
  const c = findCol(mat, state.color);
  const hw = findHw(state.hardware);
  return `${mat.name[lang]} · ${c.name[lang]} · ${t.hwLabel(hw.name[lang].toLocaleLowerCase(lang))}`;
}

/* ---------------------------------------------------------------------------------------------- */
/* Rendering look                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

const ASSET_MODEL = 'collar.glb';

// Per strap material physical parameters. `normal` = variant normal map on the STRAP atlas (null = GLB weave).
const LOOK = {
  nylon: {
    normal: null, roughMap: true, roughness: 1.0,
    clearcoat: 0, clearcoatRoughness: 0,
    sheen: 0.5, sheenRoughness: 0.85, sheenTint: 0.35, // sheenColor = lerp(strap colour, white, sheenTint)
  },
  biothane: {
    normal: 'strap/strap_n_smooth.jpg', roughMap: false, roughness: 0.34,
    clearcoat: 0.65, clearcoatRoughness: 0.22,
    sheen: 0, sheenRoughness: 0.5, sheenTint: 0,
  },
  leather: {
    normal: 'strap/strap_n_leather.jpg', roughMap: false, roughness: 0.58,
    clearcoat: 0.18, clearcoatRoughness: 0.5,
    sheen: 0.15, sheenRoughness: 0.6, sheenTint: 0.5,
  },
};
// When a variant normal map is missing (or for the small strap loop, whose UV atlas differs from the
// STRAP atlas) the GLB weave normal is used, flattened to this scale.
const FALLBACK_NORMAL_SCALE = 0.25;

// Steel hardware: baked normal + roughness maps are kept. The baked roughness (ORM green) of the hardware
// in media/collar.glb is a flat 0.35, so a factor of 0.92 gives the requested brushed ≈ 0.32;
// without a roughness map the factor itself is 0.32.
const STEEL = { color: '#C9CBCC', metalness: 1, roughnessWithMap: 0.92, roughness: 0.32, envMapIntensity: 1.1 };

const TARGET_SIZE = 2; // largest model dimension in scene units
const FOV = 28;
const INIT_AZIMUTH = 35; // deg, from +Z towards +X (front-right)
const INIT_ELEVATION = 15; // deg above the horizon
const FILL = 0.8; // share of the stage the collar should fill
const MIN_POLAR = 55; // deg from +Y
const MAX_POLAR = 105;
const EXPOSURE = 1.0;
const TWEEN_MS = 350;
const PULSE_PERIOD_MS = 4000;
const PULSE_DEPTH = 0.2; // emissiveIntensity × (0.8 … 1.2)
const LAZY_MARGIN = '600px 0px'; // start loading the GLB when the stage is this close to the viewport

// Node keys (normalised node/material names, see norm()).
const KEY_STRAP = 'strap';
const KEY_LOOP = 'beziercurve004';
const KEY_TRACKER = 'tracker';
const KEY_LOGO = 'logotracker';
const HARDWARE_KEYS = new Set(['carbine', 'fixer001', 'fixer002', 'fixercenter001', 'fixercenter002']);
const ALL_KEYS = new Set([KEY_STRAP, KEY_LOOP, KEY_TRACKER, KEY_LOGO, ...HARDWARE_KEYS]);

// "BézierCurve.004" / "BézierCurve004" (three sanitises names) / "BezierCurve_004_baked" / "STRAP_GLTF" → key
function norm(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/_?gltf$/, '')
    .replace(/_?baked$/, '')
    .replace(/[^a-z0-9]/g, '');
}

function partKey(o) {
  const names = [o.userData && o.userData.name, o.name];
  if (o.parent && !o.parent.isScene) names.push(o.parent.userData && o.parent.userData.name, o.parent.name);
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (m) names.push(m.name);
  for (const n of names) {
    const k = norm(n);
    if (ALL_KEYS.has(k)) return k;
  }
  return null;
}

// Strap recolour: luminance of the baked base colour → mix(strap, stitch). Uniform objects are shared by
// every strap material, so colour changes never recompile.
const STRAP_CACHE_KEY = 'animo-strap-recolor-v1';

function patchStrapShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform vec3 uStrap;\nuniform vec3 uStitch;\nuniform float uStLo;\nuniform float uStHi;',
    )
    .replace(
      '#include <map_fragment>',
      [
        '#include <map_fragment>',
        '#ifdef USE_MAP',
        '  float animoLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );',
        '  diffuseColor.rgb = mix( uStrap, uStitch, smoothstep( uStLo, uStHi, animoLum ) );',
        '#else',
        '  diffuseColor.rgb = uStrap;',
        '#endif',
      ].join('\n'),
    );
}

const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const deg = (d) => (d * Math.PI) / 180;

/* ---------------------------------------------------------------------------------------------- */
/* DOM helpers                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style') Object.entries(v).forEach(([p, val]) => n.style.setProperty(p, val));
      else n.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids) if (kid != null) n.append(kid);
  return n;
}

function radio(cls, id, extra, ...kids) {
  return h('button', {
    type: 'button', class: cls, role: 'radio', 'aria-checked': 'false', tabindex: '-1', 'data-id': id, ...extra,
  }, ...kids);
}

function syncGroup(group, selectedId) {
  for (const b of group.querySelectorAll('[role="radio"]')) {
    const on = b.dataset.id === selectedId;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
}

function resolveBase(mediaBase) {
  let base;
  try {
    base = new URL(mediaBase || 'media/', document.baseURI).href;
  } catch (e) {
    base = new URL('media/', document.baseURI).href;
  }
  return base.endsWith('/') ? base : `${base}/`;
}

/* ---------------------------------------------------------------------------------------------- */
/* Public: mountCollar                                                                            */
/* ---------------------------------------------------------------------------------------------- */

export async function mountCollar({ stage, panel, lang = 'ru', mediaBase } = {}) {
  if (!stage || !panel) throw new TypeError('mountCollar: `stage` and `panel` elements are required');
  lang = lang === 'en' ? 'en' : 'ru';
  const t = UI[lang];
  const base = resolveBase(mediaBase);

  const defMat = findMat(CATALOG.defaults.material);
  const state = { material: defMat.id, color: defMat.defaultColor, hardware: CATALOG.defaults.hardware };
  let disposed = false;

  /* ---- panel ---- */
  panel.textContent = '';
  const ui = {
    mats: h('div', { class: 'cfg-mats', role: 'radiogroup', 'aria-label': t.matAria }),
    sws: h('div', { class: 'cfg-sws', role: 'radiogroup', 'aria-label': t.colAria }),
    hws: h('div', { class: 'cfg-hws', role: 'radiogroup', 'aria-label': t.hwAria }),
    cname: h('span', { class: 'cfg-cname' }),
    label: h('b', { class: 'cfg-label' }),
  };
  for (const m of CATALOG.materials) {
    ui.mats.append(radio('cfg-mat', m.id, null, h('b', null, m.name[lang]), h('span', null, m.sub[lang])));
  }
  for (const x of CATALOG.hardware) ui.hws.append(radio('cfg-hw', x.id, null, h('b', null, x.name[lang])));
  panel.append(
    h('div', { class: 'cfg-group' }, h('div', { class: 'cfg-k' }, t.mat), ui.mats),
    h('div', { class: 'cfg-group' }, h('div', { class: 'cfg-k' }, `${t.col} · `, ui.cname), ui.sws),
    h('div', { class: 'cfg-group' }, h('div', { class: 'cfg-k' }, t.hw), ui.hws),
    h('div', { class: 'cfg-sum' }, h('span', null, t.sum), ui.label),
  );

  function renderColors() {
    const mat = findMat(state.material);
    ui.sws.textContent = '';
    for (const c of mat.colors) {
      const name = c.name[lang];
      ui.sws.append(radio('cfg-sw', c.id, { 'aria-label': name, title: name, style: { '--c': c.hex } }));
    }
  }

  function syncPanel() {
    syncGroup(ui.mats, state.material);
    syncGroup(ui.sws, state.color);
    syncGroup(ui.hws, state.hardware);
    ui.cname.textContent = findCol(findMat(state.material), state.color).name[lang];
    ui.label.textContent = labelFor(state, lang);
  }

  const getState = () => ({
    material: state.material, color: state.color, hardware: state.hardware, label: labelFor(state, lang),
  });

  function emit() {
    if (disposed) return;
    panel.dispatchEvent(new CustomEvent('collar:change', { bubbles: true, detail: getState() }));
  }

  let viewer = null;

  function setStrap(materialId, colorId) {
    if (disposed) return false;
    const mat = findMat(materialId);
    if (!mat) return false;
    const c = findCol(mat, colorId) || findCol(mat, state.color) || findCol(mat, mat.defaultColor) || mat.colors[0];
    const matChanged = mat.id !== state.material;
    if (!matChanged && c.id === state.color) return false;
    state.material = mat.id;
    state.color = c.id;
    if (matChanged) renderColors();
    syncPanel();
    if (viewer) viewer.apply(state, false);
    emit();
    return true;
  }

  function setHardware(id) {
    if (disposed) return false;
    const hw = findHw(id);
    if (!hw || hw.id === state.hardware) return false;
    state.hardware = hw.id;
    syncPanel();
    if (viewer) viewer.apply(state, false);
    emit();
    return true;
  }

  function choose(group, id) {
    if (group === ui.mats) setStrap(id, null);
    else if (group === ui.sws) setStrap(state.material, id);
    else if (group === ui.hws) setHardware(id);
  }

  const panelOff = [];
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    panelOff.push(() => target.removeEventListener(type, fn, opts));
  };

  for (const group of [ui.mats, ui.sws, ui.hws]) {
    listen(group, 'click', (e) => {
      const b = e.target.closest('[role="radio"]');
      if (b && group.contains(b)) choose(group, b.dataset.id);
    });
    listen(group, 'keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const btns = [...group.querySelectorAll('[role="radio"]')];
      const i = btns.indexOf(e.target.closest('[role="radio"]'));
      if (i < 0) return;
      const n = btns.length;
      let j;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': j = (i + 1) % n; break;
        case 'ArrowLeft': case 'ArrowUp': j = (i - 1 + n) % n; break;
        case 'Home': j = 0; break;
        case 'End': j = n - 1; break;
        default: return;
      }
      e.preventDefault();
      const id = btns[j].dataset.id;
      choose(group, id);
      const target = [...group.querySelectorAll('[role="radio"]')].find((b) => b.dataset.id === id);
      if (target) target.focus();
    });
  }
  // Warm the variant normal map when the user is about to pick a material.
  const prefetch = (e) => {
    const b = e.target.closest && e.target.closest('[role="radio"]');
    if (b && viewer) viewer.prefetch(b.dataset.id);
  };
  listen(ui.mats, 'pointerover', prefetch);
  listen(ui.mats, 'focusin', prefetch);

  renderColors();
  syncPanel();
  queueMicrotask(emit);

  /* ---- 3D: в фоне, панель уже работает ---- */
  (async () => {
    try {
      await loadThree();
      if (disposed) return;
      viewer = createViewer({ stage, base, t, initialState: state });
    } catch (err) {
      if (disposed) return;
      console.warn('[animo collar] 3D viewer disabled:', err);
      viewer = null;
      stage.classList.add('nogl');
      const loadEl = stage.querySelector('.cfg-load');
      if (loadEl) { loadEl.hidden = false; loadEl.textContent = t.nogl; }
    }
  })();

  return {
    setStrap,
    setHardware,
    getState,
    // Автовращение: on=false — остановить (кнопка паузы на странице), on=true — снова включить.
    setSpin(on) { if (viewer) viewer.setSpin(!!on); },
    dispose() {
      if (disposed) return;
      disposed = true;
      panelOff.splice(0).forEach((off) => off());
      if (viewer) viewer.dispose();
      viewer = null;
      panel.textContent = '';
    },
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* Viewer                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

function createViewer({ stage, base, t, initialState }) {
  let disposed = false;
  let started = false;
  let failed = false;
  let ready = false;
  let ctxLost = false;
  let visible = typeof IntersectionObserver === 'undefined';
  let pending = { ...initialState };

  let canvas = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let envRT = null;
  let dims = null; // scaled model size
  const strapParts = []; // { mat, glbNormal, glbRough, ns, main }
  const hwParts = []; // { mesh, orig, steel }
  let tracker = null; // { mat, base }
  const ownedMaterials = new Set();
  const ownedTextures = new Set();
  const normalCache = new Map();
  let appliedLook = null;
  let lookToken = 0;

  const U = {
    uStrap: { value: new THREE.Color(1, 1, 1) },
    uStitch: { value: new THREE.Color(1, 1, 1) },
    uStLo: { value: STITCH_LUM_LO },
    uStHi: { value: STITCH_LUM_HI },
  };
  const sheenNow = new THREE.Color(1, 1, 1);
  const tween = {
    active: false, t0: 0,
    from: { strap: new THREE.Color(), stitch: new THREE.Color(), sheen: new THREE.Color() },
    to: { strap: new THREE.Color(), stitch: new THREE.Color(), sheen: new THREE.Color() },
  };

  const off = [];
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    off.push(() => target.removeEventListener(type, fn, opts));
  };
  const observers = [];

  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(mq && mq.matches);
  if (mq && mq.addEventListener) {
    listen(mq, 'change', () => {
      reduced = mq.matches;
      requestRender();
    });
  }

  let loadEl = stage.querySelector('.cfg-load');
  const setLoad = (text) => {
    if (!loadEl) return;
    loadEl.hidden = false;
    loadEl.textContent = text;
  };

  function start() {
    if (started || disposed) return;
    started = true;
    init().catch(fail);
  }

  /* ---- loop ---- */
  let raf = 0;
  let lastT = 0;
  let idle = true;
  let idleTimer = 0;
  let pulseAmp = 0;

  const canRun = () => ready && !disposed && !failed && !ctxLost && visible && !document.hidden;

  function requestRender() {
    if (!raf && canRun()) raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastT = 0;
  }

  function tick(now) {
    raf = 0;
    if (!canRun()) { lastT = 0; return; }
    const dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 1 / 60;
    lastT = now;

    controls.autoRotate = idle && !reduced;
    let active = controls.update(dt);
    if (controls.autoRotate) active = true;
    if (stepTween(now)) active = true;
    if (stepPulse(now, dt)) active = true;

    renderer.render(scene, camera);

    if (active) {
      if (!raf && canRun()) raf = requestAnimationFrame(tick);
    } else if (!raf) {
      lastT = 0;
    }
  }

  function stepTween(now) {
    if (!tween.active) return false;
    let k = (now - tween.t0) / TWEEN_MS;
    if (k >= 1) { k = 1; tween.active = false; }
    if (k < 0) k = 0;
    const e = easeInOutCubic(k);
    U.uStrap.value.lerpColors(tween.from.strap, tween.to.strap, e);
    U.uStitch.value.lerpColors(tween.from.stitch, tween.to.stitch, e);
    sheenNow.lerpColors(tween.from.sheen, tween.to.sheen, e);
    for (const p of strapParts) p.mat.sheenColor.copy(sheenNow);
    return tween.active;
  }

  // Very subtle "breathing" of the light slits, only while the loop already runs for auto-rotate.
  function stepPulse(now, dt) {
    if (!tracker) return false;
    const target = controls.autoRotate && !reduced ? 1 : 0;
    pulseAmp += (target - pulseAmp) * Math.min(1, dt * 2.5);
    if (target === 0 && pulseAmp < 0.002) pulseAmp = 0;
    const wave = Math.sin((now / PULSE_PERIOD_MS) * Math.PI * 2);
    tracker.mat.emissiveIntensity = tracker.base * (1 + PULSE_DEPTH * pulseAmp * wave);
    return target === 0 && pulseAmp > 0;
  }

  /* ---- init ---- */
  async function init() {
    setLoad('0%');

    canvas = document.createElement('canvas');
    canvas.className = 'cfg-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', t.canvas);
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

    // Create the WebGL2 context ourselves so an unsupported browser fails quietly (three logs an error).
    let gl = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true, antialias: true, depth: true, stencil: false,
        premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance',
      });
    } catch (e) {
      gl = null;
    }
    if (!gl) throw new Error('WebGL2 is not available');

    renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.setClearColor(0x000000, 0);

    listen(canvas, 'webglcontextlost', (e) => { e.preventDefault(); ctxLost = true; stopLoop(); });
    // После сброса GPU (мобильные, свёрнутая вкладка) three перезальёт обычные текстуры, но не
    // render-target окружения — без пересоздания PMREM модель осталась бы без отражений (чёрная сталь).
    listen(canvas, 'webglcontextrestored', () => {
      ctxLost = false;
      try {
        const pm = new THREE.PMREMGenerator(renderer);
        const rm = new RoomEnvironment();
        envRT = pm.fromScene(rm, 0.04);
        rm.dispose();
        pm.dispose();
        if (scene) scene.environment = envRT.texture;
      } catch (e) { /* без окружения, но не падаем */ }
      requestRender();
    });

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);
    scene.add(camera);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envRT = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    scene.environment = envRT.texture;

    // Soft key light that travels with the camera (upper right of the viewer) for crisper highlights.
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(2.2, 3.0, 1.2);
    camera.add(key); // target stays at the world origin (= model centre)

    stage.appendChild(canvas);

    // Size before anything renders.
    const resize = () => {
      if (disposed || failed || !renderer) return;
      const w = stage.clientWidth;
      const hgt = stage.clientHeight;
      if (!w || !hgt) return;
      renderer.setSize(w, hgt, false);
      camera.aspect = w / hgt;
      camera.updateProjectionMatrix();
      if (dims) refit();
      if (ready && !ctxLost) renderer.render(scene, camera); // setSize clears the buffer: repaint now
    };
    resize();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(resize);
      ro.observe(stage);
      observers.push(ro);
    } else {
      listen(window, 'resize', resize);
    }

    if (typeof IntersectionObserver !== 'undefined') {
      const visIO = new IntersectionObserver((entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) requestRender(); else stopLoop();
      }, { threshold: 0 });
      visIO.observe(stage);
      observers.push(visIO);
    }
    listen(document, 'visibilitychange', () => { if (document.hidden) stopLoop(); else requestRender(); });

    /* ---- load ---- */
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(new URL(ASSET_MODEL, base).href, (ev) => {
      if (disposed || !ev || !ev.total) return;
      setLoad(`${Math.min(99, Math.round((ev.loaded / ev.total) * 100))}%`);
    });
    if (disposed) {
      disposeObject(gltf.scene);
      return;
    }

    setupModel(gltf.scene);
    setupControls();

    const first = { ...pending };
    applyHardware(first.hardware);
    await applyStrap(first, true);
    if (disposed) return;

    try { // optional: otherwise shaders compile on the first render; never wait more than 4 s
      await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 4000))]);
    } catch (e) { /* ignore */ }
    if (disposed) return;

    renderer.render(scene, camera);
    ready = true;
    stage.classList.add('ready');
    if (loadEl) { loadEl.textContent = ''; loadEl.hidden = true; }
    // The user may have changed the selection while the model / variant normal map was loading.
    if (pending.material !== first.material || pending.color !== first.color || pending.hardware !== first.hardware) {
      applyHardware(pending.hardware);
      applyStrap(pending, false).catch((e) => console.warn('[animo collar]', e));
    }
    requestRender();
    // Прогрев шейдеров для других материалов и стали, пока пользователь смотрит: иначе первый клик
    // по «Биотан»/«Кожа»/«Сталь» компилирует программу синхронно и даёт заметный фриз.
    setTimeout(warmUpPrograms, 800);
  }

  function warmUpPrograms() {
    if (disposed || failed || !ready || ctxLost || !renderer) return;
    const keys = ['normalMap', 'roughnessMap', 'roughness', 'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenRoughness'];
    const saved = strapParts.map((p) => {
      const o = {};
      for (const k of keys) o[k] = p.mat[k];
      o.ns = p.mat.normalScale.clone();
      return o;
    });
    const savedLook = appliedLook;
    const savedHw = hwParts.map((p) => p.mesh.material);
    try {
      for (const id of Object.keys(LOOK)) {
        if (id === savedLook) continue;
        applyLook(id, null);
        renderer.compile(scene, camera);
      }
      for (const p of hwParts) p.mesh.material = p.steel;
      renderer.compile(scene, camera);
    } catch (e) { /* прогрев — не обязательная часть */ }
    hwParts.forEach((p, i) => { p.mesh.material = savedHw[i]; });
    strapParts.forEach((p, i) => {
      const o = saved[i];
      const definesChanged = !p.mat.normalMap !== !o.normalMap || !p.mat.roughnessMap !== !o.roughnessMap
        || (p.mat.clearcoat > 0) !== (o.clearcoat > 0) || (p.mat.sheen > 0) !== (o.sheen > 0);
      for (const k of keys) p.mat[k] = o[k];
      p.mat.normalScale.copy(o.ns);
      if (definesChanged) p.mat.needsUpdate = true;
    });
    appliedLook = savedLook;
    requestRender();
  }

  function setupModel(root) {
    const parts = { strap: [], loop: [], hw: [], tracker: null, logo: null };
    root.traverse((o) => {
      if (!o.isMesh) return;
      const k = partKey(o);
      if (k === KEY_STRAP) parts.strap.push(o);
      else if (k === KEY_LOOP) parts.loop.push(o);
      else if (k === KEY_TRACKER) parts.tracker = parts.tracker || o;
      else if (k === KEY_LOGO) parts.logo = parts.logo || o;
      else if (k && HARDWARE_KEYS.has(k)) parts.hw.push(o);
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => m && ownedMaterials.add(m));
    });

    orientUpright(root, parts.tracker, parts.logo);

    // Centre at the origin and scale the largest dimension to TARGET_SIZE.
    const pivot = new THREE.Group();
    pivot.name = 'animo-collar';
    pivot.add(root);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = TARGET_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
    root.position.sub(center);
    pivot.scale.setScalar(s);
    dims = size.multiplyScalar(s);
    scene.add(pivot);

    // Strap fabric: STRAP + the small stitched loop. One physical material per source material,
    // all sharing the recolour uniforms.
    const bySrc = new Map();
    const strapMeshes = [...parts.strap.map((m) => [m, true]), ...parts.loop.map((m) => [m, false])];
    for (const [mesh, main] of strapMeshes) {
      if (Array.isArray(mesh.material)) continue;
      const src = mesh.material;
      let part = bySrc.get(src.uuid);
      if (!part) {
        part = makeStrapPart(src, main);
        bySrc.set(src.uuid, part);
        strapParts.push(part);
      }
      if (main) part.main = true;
      mesh.material = part.mat;
    }

    // Hardware: baked graphite (original) ↔ steel clone.
    const steelBySrc = new Map();
    for (const mesh of parts.hw) {
      if (Array.isArray(mesh.material)) continue;
      const orig = mesh.material;
      let steel = steelBySrc.get(orig.uuid);
      if (!steel) {
        steel = makeSteel(orig);
        steelBySrc.set(orig.uuid, steel);
      }
      hwParts.push({ mesh, orig, steel });
    }

    if (parts.tracker && !Array.isArray(parts.tracker.material) && parts.tracker.material.emissiveMap) {
      tracker = { mat: parts.tracker.material, base: parts.tracker.material.emissiveIntensity };
    }

    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (const p of strapParts) {
      for (const tex of [p.mat.map, p.mat.normalMap]) {
        if (tex) { tex.anisotropy = maxAniso; tex.needsUpdate = true; }
      }
    }

    try {
      scene.add(makeContactShadow(dims));
    } catch (e) { /* optional */ }
  }

  function makeStrapPart(src, main) {
    const m = new THREE.MeshPhysicalMaterial();
    m.name = `${src.name || 'strap'}__animo`;
    m.color.set(0xffffff); // luminance thresholds are calibrated on the texture alone
    m.map = src.map || null;
    m.aoMap = src.aoMap || null;
    m.aoMapIntensity = src.aoMapIntensity != null ? src.aoMapIntensity : 1;
    m.normalMap = src.normalMap || null;
    if (src.normalMapType != null) m.normalMapType = src.normalMapType;
    if (src.normalScale) m.normalScale.copy(src.normalScale);
    m.roughnessMap = src.roughnessMap || null;
    m.roughness = 1;
    m.metalness = 0; // fabric / leather / biothane are dielectrics
    m.metalnessMap = null;
    m.side = src.side;
    m.onBeforeCompile = (shader) => patchStrapShader(shader, U);
    m.customProgramCacheKey = () => STRAP_CACHE_KEY;
    ownedMaterials.add(m);
    return {
      mat: m,
      glbNormal: m.normalMap,
      glbRough: m.roughnessMap,
      ns: m.normalScale.clone(),
      main,
    };
  }

  function makeSteel(src) {
    const m = src.clone(); // shares the baked textures
    m.name = `${src.name || 'hardware'}__steel`;
    m.map = null;
    m.metalnessMap = null;
    m.color.set(STEEL.color);
    m.metalness = STEEL.metalness;
    m.roughness = m.roughnessMap ? STEEL.roughnessWithMap : STEEL.roughness;
    m.envMapIntensity = STEEL.envMapIntensity;
    ownedMaterials.add(m);
    return m;
  }

  function makeContactShadow(d) {
    const N = 128;
    const c = document.createElement('canvas');
    c.width = N;
    c.height = N;
    const g = c.getContext('2d');
    if (!g) return new THREE.Group();
    const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.34)');
    grd.addColorStop(0.4, 'rgba(0,0,0,0.16)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, N, N);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.name = 'animo-contact-shadow';
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(d.x * 0.95, Math.max(d.z * 2.6, 0.5), 1);
    mesh.position.y = -d.y / 2 - 0.004;
    mesh.renderOrder = -1;
    ownedMaterials.add(mat);
    return mesh;
  }

  function setupControls() {
    const target = new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, deg(90 - INIT_ELEVATION), deg(INIT_AZIMUTH));
    camera.position.copy(target).addScaledVector(dir, fitDistance());
    camera.lookAt(target);
    updateClipping();

    controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false; // never hijack the page wheel
    controls.rotateSpeed = 0.8;
    controls.minPolarAngle = deg(MIN_POLAR);
    controls.maxPolarAngle = deg(MAX_POLAR);
    controls.autoRotateSpeed = 0.9;
    controls.autoRotate = !reduced;
    controls.update();
    // OrbitControls.connect() sets touch-action:none; allow vertical page scroll (and pinch-zoom of
    // the page) on touch screens — only horizontal drags rotate the collar.
    canvas.style.touchAction = 'pan-y pinch-zoom';

    // Взаимодействием считается только настоящий поворот: мышью — нажатие, пальцем — сдвиг по
    // горизонтали больше 6 px (вертикальный свайп — это прокрутка страницы, автовращение не трогаем).
    // После первого поворота автовращение не возвращается (пользователь взял модель «в руки», WCAG 2.2.2).
    const interactStart = () => {
      if (idle) setSpinInternal(false);
      stage.classList.add('touched');
    };
    let touchStart = null;
    listen(canvas, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse') interactStart();
      else touchStart = { x: e.clientX, y: e.clientY };
    });
    listen(canvas, 'pointermove', (e) => {
      if (!touchStart || e.pointerType === 'mouse') return;
      const dx = Math.abs(e.clientX - touchStart.x);
      const dy = Math.abs(e.clientY - touchStart.y);
      if (dx > 6 && dx > dy) { touchStart = null; interactStart(); }
    });
    const touchEnd = () => { touchStart = null; };
    listen(canvas, 'pointerup', touchEnd);
    listen(canvas, 'pointercancel', touchEnd); // браузер забрал жест под прокрутку
    controls.addEventListener('change', requestRender);
    off.push(() => controls.removeEventListener('change', requestRender));
  }

  // Единая точка включения/выключения автовращения; сообщает странице (кнопка паузы).
  function setSpinInternal(on) {
    clearTimeout(idleTimer);
    if (idle === on) return;
    idle = on;
    stage.dispatchEvent(new CustomEvent('collar:spin', { detail: { on: on && !reduced } }));
    requestRender();
  }

  // Distance at which the collar fills ~FILL of the stage on both axes, including the extent it reaches
  // while spinning around Y (auto-rotate) and the view from INIT_ELEVATION.
  function fitDistance() {
    const tanV = Math.tan(deg(FOV / 2));
    const tanH = tanV * Math.max(camera.aspect, 0.1);
    const hw = Math.hypot(dims.x, dims.z) / 2;
    const el = deg(INIT_ELEVATION);
    const hh = (dims.y / 2) * Math.cos(el) + hw * Math.sin(el) * 0.6;
    return Math.max(hh / (FILL * tanV), hw / (FILL * tanH)) + hw * 0.15;
  }

  function updateClipping() {
    const dist = camera.position.length();
    camera.near = Math.max(0.01, dist / 50);
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
  }

  function refit() {
    if (!controls) return;
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 1e-9) return;
    camera.position.copy(controls.target).addScaledVector(offset.normalize(), fitDistance());
    updateClipping();
    controls.update();
  }

  /* ---- applying the configuration ---- */
  function loadVariantNormal(id) {
    const look = LOOK[id];
    if (!look || !look.normal) return Promise.resolve(null);
    if (!normalCache.has(id)) {
      const ref = strapParts.find((p) => p.main && p.glbNormal);
      const url = new URL(look.normal, base).href;
      const promise = new THREE.TextureLoader().loadAsync(url).then((tex) => {
        ownedTextures.add(tex);
        if (disposed) return null;
        tex.flipY = false; // glTF UV convention
        tex.colorSpace = THREE.NoColorSpace;
        if (ref) {
          const r = ref.glbNormal;
          tex.channel = r.channel;
          tex.wrapS = r.wrapS;
          tex.wrapT = r.wrapT;
          tex.offset.copy(r.offset);
          tex.repeat.copy(r.repeat);
          tex.rotation = r.rotation;
          tex.center.copy(r.center);
          tex.matrixAutoUpdate = r.matrixAutoUpdate;
          if (!r.matrixAutoUpdate) tex.matrix.copy(r.matrix);
        }
        if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        tex.needsUpdate = true;
        return tex;
      }).catch((err) => {
        console.warn(`[animo collar] ${look.normal} not loaded, using the flattened GLB normal`, err);
        return null;
      });
      normalCache.set(id, promise);
    }
    return normalCache.get(id);
  }

  function applyLook(id, variantTex) {
    const look = LOOK[id];
    for (const p of strapParts) {
      const m = p.mat;
      let nm = p.glbNormal;
      let sx = p.ns.x;
      let sy = p.ns.y;
      if (look.normal) {
        if (p.main && variantTex) {
          nm = variantTex;
          sx = Math.sign(p.ns.x) || 1; // keep the loader's sign convention (e.g. derivative tangents)
          sy = Math.sign(p.ns.y) || 1;
        } else {
          sx *= FALLBACK_NORMAL_SCALE;
          sy *= FALLBACK_NORMAL_SCALE;
        }
      }
      const rm = look.roughMap ? p.glbRough : null;
      const definesChanged = !m.normalMap !== !nm || !m.roughnessMap !== !rm;
      m.normalMap = nm;
      m.normalScale.set(sx, sy);
      m.roughnessMap = rm;
      m.roughness = look.roughness;
      m.clearcoat = look.clearcoat; // MeshPhysicalMaterial bumps its version itself when crossing 0
      m.clearcoatRoughness = look.clearcoatRoughness;
      m.sheen = look.sheen;
      m.sheenRoughness = look.sheenRoughness;
      if (definesChanged) m.needsUpdate = true;
    }
    appliedLook = id;
  }

  function colorTargets(st) {
    const mat = findMat(st.material);
    const c = findCol(mat, st.color);
    const strap = new THREE.Color(c.hex); // sRGB hex → linear working space (ColorManagement)
    const stitch = new THREE.Color(c.stitch);
    const sheen = strap.clone().lerp(new THREE.Color(1, 1, 1), LOOK[mat.id].sheenTint);
    return { strap, stitch, sheen };
  }

  function startColors(st, instant) {
    const to = colorTargets(st);
    if (instant || reduced || !ready) {
      tween.active = false;
      U.uStrap.value.copy(to.strap);
      U.uStitch.value.copy(to.stitch);
      sheenNow.copy(to.sheen);
      for (const p of strapParts) p.mat.sheenColor.copy(sheenNow);
      return;
    }
    tween.from.strap.copy(U.uStrap.value);
    tween.from.stitch.copy(U.uStitch.value);
    tween.from.sheen.copy(sheenNow);
    tween.to.strap.copy(to.strap);
    tween.to.stitch.copy(to.stitch);
    tween.to.sheen.copy(to.sheen);
    tween.t0 = performance.now();
    tween.active = true;
  }

  async function applyStrap(st, instant) {
    if (!strapParts.length) return;
    const token = ++lookToken;
    startColors(st, instant);
    requestRender();
    if (appliedLook === st.material) return;
    const tex = await loadVariantNormal(st.material);
    if (disposed || token !== lookToken) return; // a newer choice superseded this one
    applyLook(st.material, tex);
    requestRender();
  }

  function applyHardware(id) {
    for (const p of hwParts) p.mesh.material = id === 'steel' ? p.steel : p.orig;
    requestRender();
  }

  /* ---- failure / teardown ---- */
  function fail(err) {
    if (disposed) return;
    console.warn('[animo collar] 3D preview unavailable:', err);
    failed = true;
    ready = false;
    teardownGL();
    stage.classList.remove('ready');
    stage.classList.add('nogl');
    if (!loadEl) {
      loadEl = document.createElement('div');
      loadEl.className = 'cfg-load';
      stage.appendChild(loadEl);
    }
    setLoad(t.nogl);
  }

  function disposeObject(obj) {
    const textures = new Set();
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m) continue;
        Object.values(m).forEach((v) => { if (v && v.isTexture) textures.add(v); });
        m.dispose();
      }
    });
    textures.forEach(disposeTexture);
  }

  function disposeTexture(tex) {
    tex.dispose();
    try {
      if (tex.image && typeof tex.image.close === 'function') tex.image.close(); // ImageBitmap
    } catch (e) { /* ignore */ }
  }

  function teardownGL() {
    stopLoop();
    clearTimeout(idleTimer);
    off.splice(0).forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    observers.splice(0).forEach((o) => o.disconnect());
    try { if (controls) controls.dispose(); } catch (e) { /* ignore */ }
    const textures = new Set(ownedTextures);
    const materials = new Set(ownedMaterials);
    if (scene) {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m && materials.add(m));
      });
    }
    for (const m of materials) {
      Object.values(m).forEach((v) => { if (v && v.isTexture) textures.add(v); });
      m.dispose();
    }
    textures.forEach(disposeTexture);
    if (envRT) envRT.dispose();
    if (renderer) {
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    }
    if (canvas) canvas.remove();
    ownedMaterials.clear();
    ownedTextures.clear();
    normalCache.clear();
    strapParts.length = 0;
    hwParts.length = 0;
    tracker = null;
    controls = null;
    renderer = null;
    scene = null;
    envRT = null;
    canvas = null;
  }

  /* ---- lazy start: load the GLB only when the stage gets near the viewport ---- */
  if (typeof IntersectionObserver !== 'undefined') {
    const nearIO = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        nearIO.disconnect();
        start();
      }
    }, { rootMargin: LAZY_MARGIN });
    nearIO.observe(stage);
    observers.push(nearIO);
  } else {
    start();
  }

  return {
    apply(st, instant) {
      pending = { ...st };
      if (!ready || disposed) return;
      applyHardware(st.hardware);
      applyStrap(st, instant).catch((e) => console.warn('[animo collar]', e));
    },
    prefetch(id) {
      if (ready && !disposed && LOOK[id] && LOOK[id].normal) loadVariantNormal(id);
    },
    setSpin(on) {
      if (!disposed) setSpinInternal(on);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      teardownGL();
      stage.classList.remove('ready', 'nogl');
    },
  };
}

/* Keep the ring upright (pod at +Y), the ring plane facing ±Z, and the logo plate towards +Z. */
function orientUpright(root, pod, logo) {
  const V = THREE.Vector3;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (pod) {
    const d = new THREE.Box3().setFromObject(pod).getCenter(new V()).sub(box.getCenter(new V()));
    const a = [Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)];
    const i = a.indexOf(Math.max(...a));
    const from = new V().setComponent(i, Math.sign(d.getComponent(i)) || 1);
    if (from.y < 0.5) {
      root.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(from, new V(0, 1, 0)));
      root.updateMatrixWorld(true);
    }
  }
  const s = new THREE.Box3().setFromObject(root).getSize(new V());
  if (s.x < s.z) {
    root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), Math.PI / 2));
    root.updateMatrixWorld(true);
  }
  if (logo && pod) {
    // The designer's logo plates sit on both sides (centre z ≈ 0); flip only for a one-sided logo on −Z.
    const lz = new THREE.Box3().setFromObject(logo).getCenter(new V()).z;
    const pz = new THREE.Box3().setFromObject(pod).getCenter(new V()).z;
    const thick = new THREE.Box3().setFromObject(pod).getSize(new V()).z || 1;
    if (lz - pz < -0.25 * thick) {
      root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), Math.PI));
      root.updateMatrixWorld(true);
    }
  }
}
