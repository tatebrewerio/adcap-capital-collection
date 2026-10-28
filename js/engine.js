// Unity UI renderer for prefabs exported from AdVenture Capitalist 9.28.
// RectTransform anchoring, Horizontal/Vertical/Grid/Flow layout groups, LayoutElement, ContentSizeFitter,
// AspectRatioFitter, Image (simple, sliced, filled, tint, preserve aspect), the game's PhotoshopUIOverlay and
// ReplaceColorUI materials, Shadow/Outline effects, Mask/RectMask2D, CanvasGroup alpha and TextMeshPro text
// rasterised from the game's own signed distance field atlases. Canvas units: 1080 wide, y pointing down.
'use strict';

const UI = (() => {
  const WHITE = [1, 1, 1, 1];
  const num = (v, d = 0) => (v === undefined || v === null || isNaN(+v)) ? d : +v;
  const col = (a, d = WHITE) => (Array.isArray(a) && a.length >= 4) ? a.map(Number) : d.slice();

  // ---------------------------------------------------------------- images
  const images = new Map();
  let onImageLoaded = () => {};
  function image(src) {
    if (!src) return null;
    let e = images.get(src);
    if (!e) {
      e = { img: new Image(), ok: false, failed: false };
      e.img.onload = () => { e.ok = true; onImageLoaded(); };
      e.img.onerror = () => { e.failed = true; };
      e.img.src = src;
      images.set(src, e);
    }
    return e;
  }
  function preload(srcs) {
    return Promise.all(srcs.map(s => new Promise(res => {
      const e = image(s);
      if (e.ok || e.failed) return res();
      e.img.addEventListener('load', res, { once: true });
      e.img.addEventListener('error', res, { once: true });
    })));
  }
  const pixelCache = new Map();
  function pixelOp(key, img, fn) {
    let c = pixelCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    if (c.width > 0 && c.height > 0) {
      const d = g.getImageData(0, 0, c.width, c.height);
      fn(d.data);
      g.putImageData(d, 0, 0);
    }
    if (pixelCache.size > 800) pixelCache.clear();
    pixelCache.set(key, c);
    return c;
  }
  // Multiply tint (Unity vertex colour); alpha goes through globalAlpha.
  function tinted(src, img, c) {
    if (c[0] >= 0.999 && c[1] >= 0.999 && c[2] >= 0.999) return img;
    return pixelOp('t|' + src + '|' + c.slice(0, 3).join(','), img, p => {
      for (let i = 0; i < p.length; i += 4) { p[i] *= c[0]; p[i + 1] *= c[1]; p[i + 2] *= c[2]; }
    });
  }
  // Silhouette: rgb = colour, alpha = texture alpha (Shadow/Outline effects and ReplaceColorUI).
  function silhouette(src, img, c) {
    return pixelOp('s|' + src + '|' + c.slice(0, 3).join(','), img, p => {
      const r = c[0] * 255, g = c[1] * 255, b = c[2] * 255;
      for (let i = 0; i < p.length; i += 4) { p[i] = r; p[i + 1] = g; p[i + 2] = b; }
    });
  }
  // Custom/UI/PhotoshopOverlay: L = luminance(tex); L<0.5 ? 2LC : C+(2L-1)(1-C); alpha = tex.a*C.a
  function overlay(src, img, c) {
    return pixelOp('o|' + src + '|' + c.slice(0, 3).join(','), img, p => {
      for (let i = 0; i < p.length; i += 4) {
        const L = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
        for (let k = 0; k < 3; k++) { const C = c[k]; p[i + k] = Math.max(0, Math.min(255, (L <= 0.5 ? 2 * L * C : C + (2 * L - 1) * (1 - C)) * 255)); }
      }
    });
  }
  function alphaShape(src, img) {
    const key = 'a|' + src;
    if (pixelCache.has(key)) return pixelCache.get(key);
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    let v = false;
    const w = c.width, h = c.height;
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [0, h >> 1]]) {
      if (g.getImageData(x, y, 1, 1).data[3] < 250) { v = true; break; }
    }
    pixelCache.set(key, v);
    return v;
  }

  // ---------------------------------------------------------------- SDF fonts (TextMeshPro)
  const GRADIENT = 13, PADDING = 12;
  class SdfFont {
    constructor(metrics, atlasImg) {
      this.face = metrics.face;
      const c = document.createElement('canvas'); c.width = atlasImg.naturalWidth; c.height = atlasImg.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(atlasImg, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      this.aw = c.width; this.ah = c.height;
      this.alpha = new Uint8Array(this.aw * this.ah);
      for (let i = 0; i < this.alpha.length; i++) this.alpha[i] = d[i * 4 + 3];
      const glyphs = new Map(metrics.glyphs.map(q => [q.m_Index, q]));
      this.map = new Map();
      for (const ch of metrics.characters) {
        const q = glyphs.get(ch.m_GlyphIndex); if (!q) continue;
        const m = q.m_Metrics, r = q.m_GlyphRect;
        this.map.set(String.fromCodePoint(ch.m_Unicode), { W: m.m_Width, H: m.m_Height, BX: m.m_HorizontalBearingX, BY: m.m_HorizontalBearingY, Adv: m.m_HorizontalAdvance, X: r.m_X, Y: this.ah - r.m_Y - r.m_Height, RW: r.m_Width, RH: r.m_Height });
      }
    }
    get(c) { return this.map.get(c) || this.map.get(c.toUpperCase()) || this.map.get('?'); }
    width(line, k) { let w = 0; for (const c of line) { const g = this.get(c); if (g) w += g.Adv * k; } return w; }
    sample(u, v) {
      if (u < 0 || v < 0 || u >= this.aw - 1 || v >= this.ah - 1) return 0;
      const x = u | 0, y = v | 0, fx = u - x, fy = v - y, A = this.alpha, i = y * this.aw + x;
      const a = A[i] + (A[i + 1] - A[i]) * fx, b = A[i + this.aw] + (A[i + this.aw + 1] - A[i + this.aw]) * fx;
      return (a + (b - a) * fy) / 255;
    }
    // TMP_Material.UpdateShaderRatios + the SDF shader's face/outline/underlay composition, on the CPU.
    render(text, k, ppu, face, m, bold, extra) {
      const ppt = k * ppu, cl = v => v < 0 ? 0 : v > 1 ? 1 : v;
      const weight = bold ? 0.1875 : 0;
      const ratioA = (GRADIENT - 1) / (GRADIENT * Math.max(1, weight + m.dilate + m.outlineWidth));
      const range = (weight + m.dilate) * (GRADIENT - 1);
      const ratioC = Math.max(0, GRADIENT - 1 - range) / (GRADIENT * Math.max(1, Math.max(Math.abs(m.ulX), Math.abs(m.ulY)) + m.ulDilate));
      const edge = (m.dilate + weight) * ratioA * GRADIENT * 0.5, half = m.outlineWidth * ratioA * GRADIENT * 0.5;
      const ulx = m.ulX * ratioC * GRADIENT * ppt, uly = -m.ulY * ratioC * GRADIENT * ppt;
      const margin = (edge + half + PADDING) * ppt + Math.max(Math.abs(ulx), Math.abs(uly)) + m.ulDilate * ratioC * GRADIENT * ppt + 2;
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, pen = 0;
      for (const c of text) { const g = this.get(c); if (!g) continue; if (g.RW > 0) { minX = Math.min(minX, (pen + g.BX * k) * ppu); maxX = Math.max(maxX, (pen + (g.BX + g.W) * k) * ppu); minY = Math.min(minY, -g.BY * k * ppu); maxY = Math.max(maxY, (-g.BY * k + g.H * k) * ppu); } pen += g.Adv * k + extra; }
      if (minX > maxX) return null;
      const ox = Math.floor(minX - margin), oy = Math.floor(minY - margin);
      const W = Math.ceil(maxX + margin - ox), H = Math.ceil(maxY + margin - oy);
      if (W <= 0 || H <= 0 || W * H > 6e6) return null;
      const D = new Float32Array(W * H).fill(-GRADIENT);
      pen = 0;
      for (const c of text) {
        const g = this.get(c); if (!g) continue;
        if (g.RW > 0) {
          const gx = (pen + g.BX * k) * ppu - PADDING * ppt - ox, gy = -g.BY * k * ppu - PADDING * ppt - oy;
          const gw = (g.RW + 2 * PADDING) * ppt, gh = (g.RH + 2 * PADDING) * ppt;
          const x0 = Math.max(0, gx | 0), y0 = Math.max(0, gy | 0), x1 = Math.min(W, Math.ceil(gx + gw)), y1 = Math.min(H, Math.ceil(gy + gh));
          for (let y = y0; y < y1; y++) {
            const v = g.Y - PADDING + (y + 0.5 - gy) / ppt;
            for (let x = x0; x < x1; x++) {
              const u = g.X - PADDING + (x + 0.5 - gx) / ppt;
              const t = (this.sample(u - 0.5, v - 0.5) - 0.5) * GRADIENT, i = y * W + x;
              if (t > D[i]) D[i] = t;
            }
          }
        }
        pen += g.Adv * k + extra;
      }
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d'), out = ctx.createImageData(W, H), px = out.data;
      const fa = face[3], oc = m.outlineColor, uc = m.underlayColor, oa = oc[3], ua = uc[3];
      const dx = Math.round(ulx), dy = Math.round(uly), uedge = m.ulDilate * ratioC * GRADIENT * 0.5, usoft = 1 + m.ulSoftness * ratioC * GRADIENT * ppt;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, t = D[i];
        const faceA = cl((t + edge - half) * ppt + 0.5) * fa;
        const outA = half > 0 ? cl((t + edge + half) * ppt + 0.5) * oa : 0;
        let r = oc[0] * outA, g = oc[1] * outA, b = oc[2] * outA, a = outA;
        r = face[0] * faceA + r * (1 - faceA); g = face[1] * faceA + g * (1 - faceA); b = face[2] * faceA + b * (1 - faceA); a = faceA + a * (1 - faceA);
        if (ua > 0) {
          const sx = x - dx, sy = y - dy;
          const tu = (sx >= 0 && sy >= 0 && sx < W && sy < H) ? D[sy * W + sx] : -GRADIENT;
          const uA = cl(((tu + uedge) * ppt) / usoft + 0.5) * ua * (1 - a);
          r += uc[0] * uA; g += uc[1] * uA; b += uc[2] * uA; a += uA;
        }
        if (a <= 0.002) continue;
        const j = i * 4;
        px[j] = cl(r / a) * 255; px[j + 1] = cl(g / a) * 255; px[j + 2] = cl(b / a) * 255; px[j + 3] = cl(a) * 255;
      }
      ctx.putImageData(out, 0, 0);
      return { canvas, ox, oy };
    }
  }
  const fonts = {};
  const textCache = new Map();
  function materialOf(m) {
    if (!m) return { key: 'none', outlineWidth: 0, dilate: 0, outlineColor: [0, 0, 0, 1], ulX: 0, ulY: 0, ulDilate: 0, ulSoftness: 0, underlayColor: [0, 0, 0, 0], faceColor: WHITE };
    const fl = m.floats || {}, co = m.colors || {};
    const kw = Array.isArray(m.keywords) ? m.keywords.join(' ') : (m.keywords || '');
    const underlay = kw.includes('UNDERLAY'), outline = kw.includes('OUTLINE') || num(fl._OutlineWidth) > 0;
    return {
      key: m.name || '', outlineWidth: outline ? num(fl._OutlineWidth) : 0, dilate: num(fl._FaceDilate), outlineColor: col(co._OutlineColor, [0, 0, 0, 1]),
      ulX: underlay ? num(fl._UnderlayOffsetX) : 0, ulY: underlay ? num(fl._UnderlayOffsetY) : 0, ulDilate: underlay ? num(fl._UnderlayDilate) : 0,
      ulSoftness: underlay ? num(fl._UnderlaySoftness) : 0, underlayColor: underlay ? col(co._UnderlayColor, [0, 0, 0, 0]) : [0, 0, 0, 0], faceColor: col(co._FaceColor)
    };
  }

  // ---------------------------------------------------------------- prefab model
  let nodeIds = 0;
  class Node {
    constructor() {
      this.id = ++nodeIds; this.name = ''; this.active = true; this.parent = null; this.children = [];
      this.hasRect = false; this.aMinX = 0; this.aMinY = 0; this.aMaxX = 0; this.aMaxY = 0; this.posX = 0; this.posY = 0; this.sizeX = 0; this.sizeY = 0;
      this.pivX = 0.5; this.pivY = 0.5; this.scaleX = 1; this.scaleY = 1; this.rotZ = 0;
      this.img = null; this.txt = null; this.group = null; this.le = null; this.fitH = 0; this.fitV = 0; this.hasFitter = false; this.effects = null;
      this.mask = false; this.maskShow = true; this.rectMask = false; this.arMode = 0; this.arRatio = 1; this.alpha = 1; this.sel = null; this.ownCanvas = false;
      this.scripts = [];
      this.rect = { x: 0, y: 0, w: 0, h: 0 }; this.driven = false; this.tintMul = null; this.click = null; this.tag = null;
    }
    find(path) { let n = this; for (const part of path.split('/')) { if (!part) continue; n = n.children.find(c => c.name === part); if (!n) return null; } return n; }
    findDeep(name) { if (this.name === name) return this; for (const c of this.children) { const r = c.findDeep(name); if (r) return r; } return null; }
    *all() { yield this; for (const c of this.children) yield* c.all(); }
    get activeInHierarchy() { for (let n = this; n; n = n.parent) if (!n.active) return false; return true; }
    clone() {
      const n = Object.assign(Object.create(Node.prototype), this);
      n.id = ++nodeIds;
      n.rect = { x: 0, y: 0, w: 0, h: 0 };
      if (this.img) n.img = Object.assign({}, this.img);
      if (this.txt) n.txt = Object.assign({}, this.txt);
      if (this.sel) n.sel = Object.assign({}, this.sel);
      n.children = this.children.map(c => { const cc = c.clone(); cc.parent = n; return cc; });
      return n;
    }
    script(name) { return this.scripts.find(s => s.script === name); }
  }
  function parse(d, parent) {
    const n = new Node();
    n.name = d.name; n.active = !!num(d.active, 1); n.parent = parent;
    const r = d.rect;
    if (r && r.anchorMin) {
      n.hasRect = true;
      [n.aMinX, n.aMinY] = r.anchorMin.map(Number); [n.aMaxX, n.aMaxY] = r.anchorMax.map(Number);
      [n.posX, n.posY] = r.pos.map(Number); [n.sizeX, n.sizeY] = r.size.map(Number); [n.pivX, n.pivY] = r.pivot.map(Number);
      if (r.scale) [n.scaleX, n.scaleY] = r.scale.map(Number);
      if (r.rot) n.rotZ = 2 * Math.atan2(num(r.rot.z), num(r.rot.w)) * 180 / Math.PI;
    }
    let isRoot = !parent;
    for (const c of d.components || []) {
      const en = c.enabled === undefined || !!num(c.enabled, 1);
      switch (c.type) {
        case 'Image': {
          const sp = c.sprite;
          const im = { type: num(c.imageType), color: col(c.color), fillMethod: num(c.fillMethod), fillOrigin: num(c.fillOrigin), fillAmount: c.fillAmount === undefined ? 1 : num(c.fillAmount),
            fillCenter: c.fillCenter === undefined || !!num(c.fillCenter), preserve: !!num(c.preserveAspect), ppum: c.ppum === undefined ? 1 : Math.max(0.01, num(c.ppum)), enabled: en, cpid: num(c.cpid), material: c.material || null,
            file: null, sprite: null, border: null, sprW: 0, sprH: 0, ppu: 100, override: null };
          if (sp && sp.file) {
            im.sprite = sp.name; im.file = sp.file; im.border = (sp.border || []).map(Number);
            if (sp.rect && sp.rect.length > 1) { im.sprW = num(sp.rect[0]); im.sprH = num(sp.rect[1]); }
            im.ppu = sp.ppu === undefined ? 100 : num(sp.ppu);
          }
          n.img = im; break;
        }
        case 'TMP': {
          const t = { text: c.text || '', font: c.font || '', size: num(c.size), sizeMin: num(c.sizeMin), sizeMax: num(c.sizeMax), auto: !!num(c.autoSize), color: col(c.color), hAlign: num(c.hAlign), vAlign: num(c.vAlign),
            style: num(c.style), charSpacing: num(c.charSpacing), lineSpacing: num(c.lineSpacing), enabled: en, cpid: num(c.cpid), wrap: c.wrap === undefined || !!num(c.wrap), margin: [0, 0, 0, 0] };
          if (c.margin) t.margin = [num(c.margin.x), num(c.margin.y), num(c.margin.z), num(c.margin.w)];
          t.mat = materialOf(c.material);
          n.txt = t; break;
        }
        case 'HorizontalLayoutGroup': case 'VerticalLayoutGroup': case 'GridLayoutGroup': case 'LayoutGroup': {
          const pd = c.Padding || {};
          const kind = c.type === 'HorizontalLayoutGroup' ? 0 : c.type === 'VerticalLayoutGroup' ? 1 : c.type === 'GridLayoutGroup' ? 2 : c.script === 'FlowLayoutGroup' ? 3 : 1;
          const g = { kind, l: num(pd.m_Left), r: num(pd.m_Right), t: num(pd.m_Top), b: num(pd.m_Bottom), align: num(c.ChildAlignment), enabled: en && num(c.Enabled, 1) !== 0,
            ctrlW: !!num(c.ChildControlWidth), ctrlH: !!num(c.ChildControlHeight), expW: !!num(c.ChildForceExpandWidth), expH: !!num(c.ChildForceExpandHeight), reverse: !!num(c.ReverseArrangement),
            spacing: 0, spacingY: 0, cellW: 0, cellH: 0, startCorner: 0, startAxis: num(c.StartAxis), constraint: 0, constraintCount: 0 };
          if (c.Spacing && typeof c.Spacing === 'object') { g.spacing = num(c.Spacing.x); g.spacingY = num(c.Spacing.y); } else g.spacing = num(c.Spacing);
          if (kind === 3) { g.spacing = num(c.SpacingX, 30); g.spacingY = num(c.SpacingY, 30); }
          if (c.CellSize) { g.cellW = num(c.CellSize.x); g.cellH = num(c.CellSize.y); g.startCorner = num(c.StartCorner); g.constraint = num(c.Constraint); g.constraintCount = num(c.ConstraintCount); }
          if (!n.group || !n.group.enabled) n.group = g;
          break;
        }
        case 'LayoutElement':
          n.le = { minW: num(c.MinWidth, -1), minH: num(c.MinHeight, -1), prefW: num(c.PreferredWidth, -1), prefH: num(c.PreferredHeight, -1), flexW: num(c.FlexibleWidth, -1), flexH: num(c.FlexibleHeight, -1),
            ignore: !!num(c.IgnoreLayout), enabled: en && num(c.Enabled, 1) !== 0, priority: c.LayoutPriority === undefined ? 1 : num(c.LayoutPriority) };
          break;
        case 'ContentSizeFitter': if (en) { n.hasFitter = true; n.fitH = num(c.h); n.fitV = num(c.v); } break;
        case 'Shadow': case 'Outline': if (en) { (n.effects = n.effects || []).push({ outline: c.type === 'Outline', color: col(c.color, [0, 0, 0, 1]), x: num(c.distance[0]), y: num(c.distance[1]) }); } break;
        case 'Mask': if (en) { n.mask = true; n.maskShow = !!num(c.showGraphic); } break;
        case 'RectMask2D': if (en) n.rectMask = true; break;
        case 'AspectRatioFitter': if (en) { n.arMode = num(c.mode); n.arRatio = Math.max(0.0001, num(c.ratio)); } break;
        case 'CanvasGroup': n.alpha = num(c.alpha, 1); break;
        case 'Canvas': if (!isRoot) n.ownCanvas = true; break;
        case 'Selectable': {
          const s = { target: num(c.target), transition: num(c.transition), interactable: !!num(c.interactable, 1), mult: c.mult === undefined ? 1 : num(c.mult), cpid: num(c.cpid),
            normal: WHITE.slice(), disabled: [0.78, 0.78, 0.78, 0.5], pressed: [0.78, 0.78, 0.78, 1] };
          if (c.colors) { s.normal = col(c.colors.m_NormalColor); s.disabled = col(c.colors.m_DisabledColor, s.disabled); s.pressed = col(c.colors.m_PressedColor, s.pressed); }
          n.sel = s; break;
        }
        case 'Script': n.scripts.push(c); break;
      }
    }
    for (const ch of d.children || []) n.children.push(parse(ch, n));
    return n;
  }
  const prefabs = new Map();
  async function loadPrefab(name, url) { const j = await (await fetch(url)).json(); prefabs.set(name, parse(j, null)); }
  function instantiate(name) { const p = prefabs.get(name); if (!p) throw new Error('prefab ' + name); return p.clone(); }

  // ---------------------------------------------------------------- text helpers
  const fontFor = t => (t.font || '').toLowerCase().startsWith('tabitha') ? fonts.tabitha : fonts.marytodd;
  function stripTags(s) { return (s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''); }
  function display(t) { let s = stripTags(t.text); if (t.style & 16) s = s.toUpperCase(); else if (t.style & 8) s = s.toLowerCase(); return s; }
  function wrapLines(f, text, k, sp, width, wrap) {
    const lines = [];
    for (const para of text.split('\n')) {
      if (!wrap || !isFinite(width)) { lines.push(para); continue; }
      let cur = '';
      for (const w of para.split(' ')) {
        const cand = cur.length === 0 ? w : cur + ' ' + w;
        if (cur.length > 0 && f.width(cand, k) + sp * cand.length > width + 0.5) { lines.push(cur); cur = w; } else cur = cand;
      }
      lines.push(cur);
    }
    return lines;
  }
  function measure(t, width, size) {
    const f = fontFor(t); if (!f) return { w: 0, h: 0 };
    const s = display(t), k = size / f.face.m_PointSize, sp = t.charSpacing * size / 100;
    const lines = wrapLines(f, s, k, sp, width, t.wrap);
    const w = lines.length ? Math.max(...lines.map(l => f.width(l, k) + sp * Math.max(0, l.length - 1))) : 0;
    const lh = (f.face.m_LineHeight + t.lineSpacing / 100 * f.face.m_PointSize) * k;
    return { w, h: (f.face.m_AscentLine - f.face.m_DescentLine) * k + (lines.length - 1) * lh };
  }
  function fits(t, bw, bh, size) {
    const f = fontFor(t), sz = measure(t, t.wrap ? bw : Infinity, size);
    if (t.wrap) { const k = size / f.face.m_PointSize; if (wrapLines(f, display(t), k, t.charSpacing * size / 100, bw, true).some(l => f.width(l, k) > bw + 0.5)) return false; }
    return sz.w <= bw + 0.5 && sz.h <= bh + 0.5;
  }

  // ---------------------------------------------------------------- layout (port of Unity's layout system)
  const participates = c => c.active && !(c.le && c.le.enabled && c.le.ignore) && c.hasRect;
  function prop(n, axis, which) {
    let best = -1, bestPri = -1e9;
    const consider = (v, pri) => { if (v < 0) return; if (pri > bestPri) { bestPri = pri; best = v; } else if (pri === bestPri && v > best) best = v; };
    if (n.le && n.le.enabled) consider(which === 0 ? (axis === 0 ? n.le.minW : n.le.minH) : which === 1 ? (axis === 0 ? n.le.prefW : n.le.prefH) : (axis === 0 ? n.le.flexW : n.le.flexH), n.le.priority);
    if (n.group && n.group.enabled) { const s = groupSizes(n, axis); consider(which === 0 ? s.min : which === 1 ? s.pref : s.flex, 0); }
    else {
      if (n.img && n.img.enabled) {
        let v = 0;
        if (which === 1) {
          if (n.img.type === 1 || n.img.type === 2) { if (n.img.border && n.img.border.length === 4) { const k = 100 / n.img.ppu / n.img.ppum; v = axis === 0 ? (n.img.border[0] + n.img.border[2]) * k : (n.img.border[1] + n.img.border[3]) * k; } }
          else v = (axis === 0 ? n.img.sprW : n.img.sprH) * 100 / n.img.ppu;
        }
        consider(which === 2 ? -1 : v, 0);
      }
      if (n.txt && n.txt.enabled) {
        if (which === 1) {
          const width = axis === 0 ? Infinity : Math.max(1, n.rect.w > 0 ? n.rect.w : n.sizeX);
          const sz = measure(n.txt, width, n.txt.auto ? n.txt.sizeMax : n.txt.size);
          consider(axis === 0 ? sz.w + n.txt.margin[0] + n.txt.margin[2] : sz.h + n.txt.margin[1] + n.txt.margin[3], 0);
        } else consider(which === 2 ? -1 : 0, 0);
      }
    }
    if (which === 1) return Math.max(Math.max(best, 0), prop(n, axis, 0));
    return best;
  }
  const minOf = (n, a) => Math.max(0, prop(n, a, 0)), prefOf = (n, a) => prop(n, a, 1), flexOf = (n, a) => Math.max(0, prop(n, a, 2));
  // Size a group keeps for a child it does not control: a ContentSizeFitter on the child still sizes it.
  function ownSize(c, axis) {
    const fit = axis === 0 ? c.fitH : c.fitV;
    if (c.hasFitter && fit) return fit === 1 ? minOf(c, axis) : prefOf(c, axis);
    let v = axis === 0 ? c.rect.w : c.rect.h;
    if (!c.driven && v === 0) v = axis === 0 ? c.sizeX : c.sizeY;
    return v;
  }
  function childSizes(c, axis, control, expand) {
    let mn, pf, fx;
    if (!control) { mn = ownSize(c, axis); pf = mn; fx = 0; }
    else { mn = minOf(c, axis); pf = prefOf(c, axis); fx = flexOf(c, axis); }
    if (expand) fx = Math.max(fx, 1);
    return { mn, pf, fx };
  }
  function flowRows(n, kids, width) {
    const g = n.group, rows = []; let row = [], x = 0;
    const inner = width - g.l - g.r;
    for (const c of kids) {
      const w = prefOf(c, 0);
      if (row.length && x + g.spacing + w > inner + 0.5) { rows.push(row); row = []; x = 0; }
      x += (row.length ? g.spacing : 0) + w; row.push(c);
    }
    if (row.length) rows.push(row);
    return rows;
  }
  function groupSizes(n, axis) {
    const g = n.group, kids = n.children.filter(participates);
    if (g.kind === 3) {
      const width = n.rect.w > 0 ? n.rect.w : prefFromLE(n, 0);
      if (axis === 0) { const w = g.l + g.r + kids.reduce((s, c, i) => s + prefOf(c, 0) + (i ? g.spacing : 0), 0); return { min: 0, pref: w, flex: -1 }; }
      const rows = flowRows(n, kids, width);
      const h = g.t + g.b + rows.reduce((s, r, i) => s + Math.max(...r.map(c => prefOf(c, 1))) + (i ? g.spacingY : 0), 0);
      return { min: h, pref: h, flex: -1 };
    }
    if (g.kind === 2) {
      const cnt = kids.length; let cols = 1, rows = 1;
      if (g.constraint === 1) { cols = g.constraintCount; rows = Math.ceil(cnt / Math.max(1, cols)); }
      else if (g.constraint === 2) { rows = g.constraintCount; cols = Math.ceil(cnt / Math.max(1, rows)); }
      else { cols = Math.ceil(Math.sqrt(cnt)); rows = Math.ceil(cnt / Math.max(1, cols)); }
      if (axis === 0) return { min: g.l + g.r + g.cellW * (g.constraint === 1 ? cols : 1) + (g.constraint === 1 ? g.spacing * (cols - 1) : 0), pref: g.l + g.r + g.cellW * cols + g.spacing * Math.max(0, cols - 1), flex: -1 };
      const r2 = g.constraint === 1 ? Math.ceil(cnt / Math.max(1, cols)) : rows;
      const v = g.t + g.b + g.cellH * r2 + g.spacingY * Math.max(0, r2 - 1);
      return { min: v, pref: v, flex: -1 };
    }
    const isVert = g.kind === 1, pad = axis === 0 ? g.l + g.r : g.t + g.b, ctrl = axis === 0 ? g.ctrlW : g.ctrlH, exp = axis === 0 ? g.expW : g.expH, other = isVert !== (axis === 1);
    let tMin = pad, tPref = pad, tFlex = 0;
    for (const c of kids) {
      const s = childSizes(c, axis, ctrl, exp);
      if (other) { tMin = Math.max(s.mn + pad, tMin); tPref = Math.max(s.pf + pad, tPref); tFlex = Math.max(s.fx, tFlex); }
      else { tMin += s.mn + g.spacing; tPref += s.pf + g.spacing; tFlex += s.fx; }
    }
    if (!other && kids.length) { tMin -= g.spacing; tPref -= g.spacing; }
    return { min: tMin, pref: Math.max(tMin, tPref), flex: tFlex };
  }
  function prefFromLE(n, axis) { if (n.le && n.le.enabled) { const v = axis === 0 ? n.le.prefW : n.le.prefH; if (v > 0) return v; } return axis === 0 ? n.sizeX : n.sizeY; }
  function layout(n, p) {
    if (!n.hasRect) n.rect = { x: p.x, y: p.y, w: p.w, h: p.h };
    else if (!n.driven) {
      const x0 = p.x + p.w * n.aMinX, x1 = p.x + p.w * n.aMaxX, yb0 = p.y + p.h - p.h * n.aMinY, yb1 = p.y + p.h - p.h * n.aMaxY;
      const w = (x1 - x0) + n.sizeX, h = (yb0 - yb1) + n.sizeY;
      const px = x0 + (x1 - x0) * n.pivX + n.posX, py = yb0 - (yb0 - yb1) * n.pivY - n.posY;
      n.rect = { x: px - w * n.pivX, y: py - h * (1 - n.pivY), w, h };
    }
    if (n.arMode !== 0 && !n.driven) {
      const R = n.rect; let w = R.w, h = R.h;
      if (n.arMode === 1) { h = w / n.arRatio; const pyb = R.y + R.h - R.h * n.pivY; n.rect = { x: R.x, y: pyb - h * (1 - n.pivY), w, h }; }
      else if (n.arMode === 2) { w = h * n.arRatio; const px = R.x + R.w * n.pivX; n.rect = { x: px - w * n.pivX, y: R.y, w, h }; }
      else { const fit = n.arMode === 3; if ((p.w / p.h > n.arRatio) === fit) { h = p.h; w = h * n.arRatio; } else { w = p.w; h = w / n.arRatio; } n.rect = { x: p.x + (p.w - w) * n.pivX, y: p.y + (p.h - h) * (1 - n.pivY), w, h }; }
    }
    if (n.hasFitter && !n.driven) {
      let w = n.rect.w, h;
      if (n.fitH === 1) w = minOf(n, 0); else if (n.fitH === 2) w = prefOf(n, 0);
      if (n.fitH !== 0) { const px = n.rect.x + n.rect.w * n.pivX; n.rect = { x: px - w * n.pivX, y: n.rect.y, w, h: n.rect.h }; }
      h = n.rect.h;
      if (n.fitV === 1) h = minOf(n, 1); else if (n.fitV === 2) h = prefOf(n, 1);
      if (n.fitV !== 0) { const pyb = n.rect.y + n.rect.h - n.rect.h * n.pivY; n.rect = { x: n.rect.x, y: pyb - h * (1 - n.pivY), w: n.rect.w, h }; }
    }
    if (n.group && n.group.enabled) arrange(n);
    for (const c of n.children) if (c.active) layout(c, n.rect);
    for (const c of n.children) c.driven = false;
  }
  function setChild(parent, c, axis, pos, size) {
    let r = c.rect;
    if (!c.driven) r = { x: parent.rect.x, y: parent.rect.y, w: r.w, h: r.h };
    if (axis === 0) r = { x: parent.rect.x + pos, y: r.y, w: size, h: r.h }; else r = { x: r.x, y: parent.rect.y + pos, w: r.w, h: size };
    c.rect = r; c.driven = true;
  }
  function arrange(n) {
    const g = n.group, kids = n.children.filter(participates);
    if (g.reverse) kids.reverse();
    for (const c of kids) if (c.rect.w === 0 && c.rect.h === 0) c.rect = { x: 0, y: 0, w: c.sizeX, h: c.sizeY };
    if (g.kind === 2) return arrangeGrid(n, kids);
    if (g.kind === 3) return arrangeFlow(n, kids);
    for (let axis = 0; axis < 2; axis++) {
      const isVert = g.kind === 1, ctrl = axis === 0 ? g.ctrlW : g.ctrlH, exp = axis === 0 ? g.expW : g.expH, other = isVert !== (axis === 1);
      const size = axis === 0 ? n.rect.w : n.rect.h, padStart = axis === 0 ? g.l : g.t, pad = axis === 0 ? g.l + g.r : g.t + g.b;
      const align = axis === 0 ? (g.align % 3) * 0.5 : Math.floor(g.align / 3) * 0.5;
      if (other) {
        const inner = size - pad;
        for (const c of kids) {
          const s = childSizes(c, axis, ctrl, exp);
          const req = Math.max(s.mn, Math.min(inner, s.fx > 0 ? size : s.pf));
          const start = padStart + (size - (req + pad)) * align;
          if (ctrl) setChild(n, c, axis, start, req);
          else { const cur = ownSize(c, axis); setChild(n, c, axis, start + (req - cur) * align, cur); }
        }
      } else {
        const t = groupSizes(n, axis);
        let pos = padStart, mult = 0;
        const surplus = size - t.pref;
        if (surplus > 0) { if (t.flex === 0) pos = padStart + (size - t.pref) * align; else mult = surplus / t.flex; }
        let lerp = 0; if (t.min !== t.pref) lerp = Math.max(0, Math.min(1, (size - t.min) / (t.pref - t.min)));
        for (const c of kids) {
          const s = childSizes(c, axis, ctrl, exp);
          const cs = s.mn + (s.pf - s.mn) * lerp + s.fx * mult;
          if (ctrl) setChild(n, c, axis, pos, cs);
          else { const cur = ownSize(c, axis); setChild(n, c, axis, pos + (cs - cur) * align, cur); }
          pos += cs + g.spacing;
        }
      }
    }
  }
  function arrangeFlow(n, kids) {
    const g = n.group, rows = flowRows(n, kids, n.rect.w), ax = (g.align % 3) * 0.5;
    let y = g.t;
    for (const row of rows) {
      const ws = row.map(c => prefOf(c, 0)), hs = row.map(c => prefOf(c, 1));
      const total = ws.reduce((a, b) => a + b, 0) + g.spacing * (row.length - 1), rh = Math.max(...hs);
      let x = g.l + (n.rect.w - g.l - g.r - total) * ax;
      row.forEach((c, i) => { setChild(n, c, 0, x, ws[i]); setChild(n, c, 1, y, hs[i]); x += ws[i] + g.spacing; });
      y += rh + g.spacingY;
    }
  }
  function arrangeGrid(n, kids) {
    const g = n.group, w = n.rect.w, h = n.rect.h, cnt = kids.length;
    let cellX = 1, cellY = 1;
    if (g.constraint === 1) { cellX = g.constraintCount; cellY = Math.ceil(cnt / Math.max(1, cellX)); }
    else if (g.constraint === 2) { cellY = g.constraintCount; cellX = Math.ceil(cnt / Math.max(1, cellY)); }
    else { cellX = g.cellW + g.spacing <= 0 ? 1e9 : Math.max(1, Math.floor((w - g.l - g.r + g.spacing + 0.001) / (g.cellW + g.spacing))); cellY = g.cellH + g.spacingY <= 0 ? 1e9 : Math.max(1, Math.floor((h - g.t - g.b + g.spacingY + 0.001) / (g.cellH + g.spacingY))); }
    const cornerX = g.startCorner % 2, cornerY = Math.floor(g.startCorner / 2);
    let primary, ax, ay;
    if (g.startAxis === 0) { primary = cellX; ax = Math.max(1, Math.min(cellX, cnt)); ay = Math.max(1, Math.min(cellY, Math.ceil(cnt / primary))); }
    else { primary = cellY; ay = Math.max(1, Math.min(cellY, cnt)); ax = Math.max(1, Math.min(cellX, Math.ceil(cnt / primary))); }
    const reqW = ax * g.cellW + (ax - 1) * g.spacing, reqH = ay * g.cellH + (ay - 1) * g.spacingY;
    const sx = g.l + (w - (reqW + g.l + g.r)) * ((g.align % 3) * 0.5), sy = g.t + (h - (reqH + g.t + g.b)) * (Math.floor(g.align / 3) * 0.5);
    for (let i = 0; i < cnt; i++) {
      let px, py;
      if (g.startAxis === 0) { px = i % primary; py = Math.floor(i / primary); } else { px = Math.floor(i / primary); py = i % primary; }
      if (cornerX === 1) px = ax - 1 - px; if (cornerY === 1) py = ay - 1 - py;
      setChild(n, kids[i], 0, sx + (g.cellW + g.spacing) * px, g.cellW);
      setChild(n, kids[i], 1, sy + (g.cellH + g.spacingY) * py, g.cellH);
    }
  }
  // Two passes: the second measures wrapped text with the widths the first pass settled (Unity lays out
  // horizontally before vertically for the same reason).
  function layoutRoot(root, rect, passes = 2) {
    for (let i = 0; i < passes; i++) {
      root.rect = { ...rect };
      for (const n of root.all()) n.driven = false;
      root.driven = true;
      layout(root, root.rect);
    }
  }

  // ---------------------------------------------------------------- drawing
  let imageBase = 'img/ui/';
  const R = { hits: [], clipStack: [], deferred: [] };
  function deviceRect(ctx, r) {
    const m = ctx.getTransform();
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  function intersect(a, b) { if (!b) return a; const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y); return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) }; }
  function imgSrc(im) { return im.override || (im.file ? imageBase + im.file : null); }
  function roundedPath(ctx, r, rad) {
    rad = Math.min(rad, r.w / 2, r.h / 2);
    ctx.beginPath();
    if (rad < 1) { ctx.rect(r.x, r.y, r.w, r.h); return; }
    ctx.moveTo(r.x + rad, r.y); ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad); ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
    ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad); ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad); ctx.closePath();
  }
  function drawTree(ctx, n, alpha, deferOK = true) {
    if (!n.active) return;
    if (n.ownCanvas && deferOK) { R.deferred.push({ n, alpha, m: ctx.getTransform(), clip: R.clipStack[R.clipStack.length - 1] || null }); return; }
    const a = alpha * n.alpha; if (a <= 0.001) return;
    const r = n.rect;
    if (n.cull && R.clipStack.length) { const d = intersect(deviceRect(ctx, r), R.clipStack[R.clipStack.length - 1]); if (d.w <= 0 || d.h <= 0) return; }
    ctx.save();
    if (n.scaleX !== 1 || n.scaleY !== 1 || Math.abs(n.rotZ) > 0.01) {
      if (n.scaleX === 0 || n.scaleY === 0) { ctx.restore(); return; }
      const px = r.x + r.w * n.pivX, py = r.y + r.h - r.h * n.pivY;
      ctx.translate(px, py); if (Math.abs(n.rotZ) > 0.01) ctx.rotate(-n.rotZ * Math.PI / 180); ctx.scale(n.scaleX, n.scaleY); ctx.translate(-px, -py);
    }
    let layer = null, lctx = null, dr = null;
    const maskSrc = n.mask && n.img && n.img.type === 0 ? imgSrc(n.img) : null;
    const me = maskSrc ? image(maskSrc) : null;
    if (me && me.ok && alphaShape(maskSrc, me.img)) {
      dr = deviceRect(ctx, r);
      const W = Math.ceil(dr.w) + 2, H = Math.ceil(dr.h) + 2;
      if (W > 0 && H > 0 && W * H < 8e6) {
        layer = document.createElement('canvas'); layer.width = W; layer.height = H; lctx = layer.getContext('2d');
        const m = ctx.getTransform(); lctx.setTransform(m.a, m.b, m.c, m.d, m.e - Math.floor(dr.x), m.f - Math.floor(dr.y));
        lctx.imageSmoothingQuality = 'high';
      }
    }
    const dc = lctx || ctx;
    let clipDev = null;
    if (n.mask && !layer) {
      if (n.img && n.img.type === 3 && n.img.fillAmount < 1) {
        const f = n.img.fillAmount, im = n.img;
        const fr = im.fillMethod === 1 ? (im.fillOrigin === 1 ? { x: r.x, y: r.y, w: r.w, h: r.h * f } : { x: r.x, y: r.y + r.h - r.h * f, w: r.w, h: r.h * f })
          : (im.fillOrigin === 1 ? { x: r.x + r.w - r.w * f, y: r.y, w: r.w * f, h: r.h } : { x: r.x, y: r.y, w: r.w * f, h: r.h });
        dc.beginPath(); dc.rect(fr.x, fr.y, fr.w, fr.h); dc.clip(); clipDev = deviceRect(ctx, fr);
      } else if (n.img && n.img.type === 1 && n.img.border && n.img.border.length === 4) {
        const k = 100 / n.img.ppu / n.img.ppum; roundedPath(dc, r, Math.min(...n.img.border) * k); dc.clip(); clipDev = deviceRect(ctx, r);
      } else { dc.beginPath(); dc.rect(r.x, r.y, r.w, r.h); dc.clip(); clipDev = deviceRect(ctx, r); }
    }
    if (n.rectMask) { dc.beginPath(); dc.rect(r.x, r.y, r.w, r.h); dc.clip(); clipDev = intersect(deviceRect(ctx, r), clipDev); }
    if (layer) clipDev = dr;
    if (n.img && n.img.enabled && (!n.mask || n.maskShow)) drawImage(dc, n, a);
    if (n.txt && n.txt.enabled) drawText(dc, n, a);
    if (n.click) { const d = intersect(deviceRect(ctx, r), R.clipStack[R.clipStack.length - 1]); R.hits.push({ r: d, fn: n.click, node: n }); }
    const pushed = clipDev != null;
    if (pushed) R.clipStack.push(intersect(clipDev, R.clipStack[R.clipStack.length - 1]));
    for (const c of n.children) drawTree(dc, c, a, deferOK);
    if (pushed) R.clipStack.pop();
    if (layer) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(me.img, dr.x - Math.floor(dr.x), dr.y - Math.floor(dr.y), dr.w, dr.h);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, Math.floor(dr.x), Math.floor(dr.y)); ctx.restore();
    }
    ctx.restore();
  }
  function drawImage(ctx, n, alpha) {
    const im = n.img, r = n.rect;
    if (r.w <= 0 || r.h <= 0) return;
    let c = im.color.slice();
    if (n.effects) for (const e of n.effects) {
      const offs = e.outline ? [[e.x, -e.y], [-e.x, -e.y], [e.x, e.y], [-e.x, e.y]] : [[e.x, -e.y]];
      for (const [ox, oy] of offs) paint(ctx, n, { x: r.x + ox, y: r.y + oy, w: r.w, h: r.h }, [e.color[0], e.color[1], e.color[2], e.color[3] * c[3]], alpha, true);
    }
    if (n.tintMul) c = c.map((v, i) => v * n.tintMul[i]);
    paint(ctx, n, r, c, alpha, false);
  }
  function paint(ctx, n, r, c, alpha, shadow) {
    const im = n.img, src = imgSrc(im);
    const e = src ? image(src) : null;
    if (!e) { if (im.file) return; ctx.globalAlpha = c[3] * alpha; ctx.fillStyle = `rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; return; }
    if (!e.ok) return;
    let bmp = e.img;
    const replace = im.material === 'ReplaceColorUI';
    if (shadow || replace) bmp = silhouette(src, e.img, c);
    else if (im.material === 'PhotoshopUIOverlay' && !im.override) bmp = overlay(src, e.img, c);
    else bmp = tinted(src, e.img, c);
    ctx.globalAlpha = Math.max(0, Math.min(1, c[3] * alpha));
    const W = e.img.naturalWidth, H = e.img.naturalHeight;
    if (im.type === 3 && im.fillAmount < 1) {
      const f = Math.max(0, Math.min(1, im.fillAmount)); if (f <= 0) { ctx.globalAlpha = 1; return; }
      ctx.save(); ctx.beginPath();
      if (im.fillMethod === 0) { const w = r.w * f; ctx.rect(im.fillOrigin === 1 ? r.x + r.w - w : r.x, r.y, w, r.h); }
      else if (im.fillMethod === 1) { const h = r.h * f; ctx.rect(r.x, im.fillOrigin === 1 ? r.y : r.y + r.h - h, r.w, h); }
      else { const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.hypot(r.w, r.h), st = ([90, 180, 270, 0][Math.max(0, Math.min(3, im.fillOrigin))] - 90) * Math.PI / 180; ctx.moveTo(cx, cy); ctx.arc(cx, cy, rad, st, st + Math.PI * 2 * f); ctx.closePath(); }
      ctx.clip();
      if (im.border && im.border.some(v => v > 0) && !im.override) nineSlice(ctx, bmp, W, H, r, im); else ctx.drawImage(bmp, r.x, r.y, r.w, r.h);
      ctx.restore(); ctx.globalAlpha = 1; return;
    }
    if (im.type === 1 && im.border && im.border.some(v => v > 0) && !im.override) { nineSlice(ctx, bmp, W, H, r, im); ctx.globalAlpha = 1; return; }
    let d = r;
    if (im.preserve && W > 0 && H > 0) { const s = Math.min(r.w / W, r.h / H), w = W * s, h = H * s; d = { x: r.x + (r.w - w) * n.pivX, y: r.y + (r.h - h) * (1 - n.pivY), w, h }; }
    ctx.drawImage(bmp, d.x, d.y, d.w, d.h);
    ctx.globalAlpha = 1;
  }
  function nineSlice(ctx, bmp, W, H, r, im) {
    const sx = W / Math.max(1, im.sprW || W), sy = H / Math.max(1, im.sprH || H);
    const [bl, bb, br, bt] = im.border, k = 100 / im.ppu / im.ppum;
    let dl = bl * k, dR = br * k, dt = bt * k, db = bb * k;
    if (dl + dR > r.w && dl + dR > 0) { const f = r.w / (dl + dR); dl *= f; dR *= f; }
    if (dt + db > r.h && dt + db > 0) { const f = r.h / (dt + db); dt *= f; db *= f; }
    const srcX = [0, bl * sx, W - br * sx, W], srcY = [0, bt * sy, H - bb * sy, H];
    const dx = [r.x, r.x + dl, r.x + r.w - dR, r.x + r.w], dy = [r.y, r.y + dt, r.y + r.h - db, r.y + r.h];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      if (x === 1 && y === 1 && !im.fillCenter) continue;
      const sw = srcX[x + 1] - srcX[x], sh = srcY[y + 1] - srcY[y], dw = dx[x + 1] - dx[x], dh = dy[y + 1] - dy[y];
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) continue;
      // overlap by a hair to hide seams between slices
      ctx.drawImage(bmp, srcX[x] + (x === 1 ? 0.5 : 0), srcY[y] + (y === 1 ? 0.5 : 0), sw - (x === 1 ? 1 : 0), sh - (y === 1 ? 1 : 0), dx[x] - 0.25, dy[y] - 0.25, dw + 0.5, dh + 0.5);
    }
  }
  function drawText(ctx, n, alpha) {
    const t = n.txt, s = display(t); if (!s.trim()) return;
    const f = fontFor(t); if (!f) return;
    const r = n.rect, box = { x: r.x + t.margin[0], y: r.y + t.margin[1], w: r.w - t.margin[0] - t.margin[2], h: r.h - t.margin[1] - t.margin[3] };
    if (box.w <= 0 || box.h <= 0) return;
    let size = t.size;
    if (t.auto) { let lo = t.sizeMin, hi = t.sizeMax; if (fits(t, box.w, box.h, hi)) size = hi; else { for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (fits(t, box.w, box.h, mid)) lo = mid; else hi = mid; } size = lo; } }
    const k = size / f.face.m_PointSize, sp = t.charSpacing * size / 100;
    const lines = wrapLines(f, s, k, sp, box.w, t.wrap);
    const lh = (f.face.m_LineHeight + t.lineSpacing / 100 * f.face.m_PointSize) * k;
    const asc = f.face.m_AscentLine * k, desc = f.face.m_DescentLine * k, cap = f.face.m_CapLine * k, va = t.vAlign;
    const blockH = asc - desc + (lines.length - 1) * lh;
    let first;
    if (va & 256) first = box.y + asc;
    else if (va & 1024) first = box.y + box.h + desc - (lines.length - 1) * lh;
    else if (va & 2048) first = box.y + box.h / 2 - (lines.length - 1) * lh / 2;
    else if (va & 8192) first = box.y + box.h / 2 + cap / 2 - (lines.length - 1) * lh / 2;
    else if (va & 4096) { const gh = (lines.length - 1) * lh + cap; first = box.y + box.h / 2 - gh / 2 + cap; }
    else first = box.y + box.h / 2 - blockH / 2 + asc;
    const face = [t.color[0] * t.mat.faceColor[0], t.color[1] * t.mat.faceColor[1], t.color[2] * t.mat.faceColor[2], t.color[3] * t.mat.faceColor[3] * alpha];
    const bold = (t.style & 1) !== 0;
    lines.forEach((line, i) => {
      const w = f.width(line, k) + sp * Math.max(0, line.length - 1), ha = t.hAlign;
      const x = (ha & 1) ? box.x : (ha & 4) ? box.x + box.w - w : box.x + (box.w - w) / 2;
      textAt(ctx, line, x, first + i * lh, f, k, face, t.mat, bold, sp, alpha);
    });
  }
  function textAt(ctx, text, x, by, f, k, face, mat, bold, sp, alpha) {
    if (!text) return;
    const m = ctx.getTransform();
    const uniform = Math.abs(m.b) < 1e-4 && Math.abs(m.c) < 1e-4 && m.a > 0 && m.d > 0;
    const ppu = Math.max(0.25, Math.max(Math.abs(m.a), Math.abs(m.d)));
    const mm = alpha < 0.999 ? Object.assign({}, mat, { outlineColor: [...mat.outlineColor.slice(0, 3), mat.outlineColor[3] * alpha], underlayColor: [...mat.underlayColor.slice(0, 3), mat.underlayColor[3] * alpha] }) : mat;
    const key = [f === fonts.tabitha ? 'T' : 'M', text, k.toFixed(4), ppu.toFixed(3), face.map(v => v.toFixed(3)).join(','), mat.key, alpha.toFixed(2), bold, sp.toFixed(2)].join('|');
    let tb = textCache.get(key);
    if (tb === undefined) {
      tb = f.render(text, k, ppu, face, mm, bold, sp);
      if (textCache.size > 2500) { let i = 0; for (const kk of textCache.keys()) { textCache.delete(kk); if (++i > 800) break; } }
      textCache.set(key, tb);
    }
    if (!tb) return;
    if (uniform) {
      const dx = m.a * x + m.e, dy = m.d * by + m.f;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(tb.canvas, Math.round(dx + tb.ox), Math.round(dy + tb.oy)); ctx.restore();
    } else ctx.drawImage(tb.canvas, x + tb.ox / ppu, by + tb.oy / ppu, tb.canvas.width / ppu, tb.canvas.height / ppu);
  }
  // Draws a laid-out tree; nodes on their own Canvas (dropdown menus) draw last, like Unity's override sorting.
  function render(ctx, root, beforeDeferred) {
    R.clipStack = []; R.deferred = [];
    drawTree(ctx, root, 1);
    if (beforeDeferred && R.deferred.length) beforeDeferred();
    const list = R.deferred; R.deferred = [];
    for (const d of list) {
      ctx.save(); ctx.setTransform(d.m);
      R.clipStack = d.clip ? [d.clip] : [];
      drawTree(ctx, d.n, d.alpha, false);
      ctx.restore();
    }
    R.clipStack = [];
  }
  function hitAt(x, y) {
    for (let i = R.hits.length - 1; i >= 0; i--) { const h = R.hits[i]; if (x >= h.r.x && y >= h.r.y && x <= h.r.x + h.r.w && y <= h.r.y + h.r.h) return h; }
    return null;
  }

  // ---------------------------------------------------------------- themes and selectables
  let theme = {};
  function setTheme(raw) {
    theme = {};
    for (const man of Object.values(raw)) for (const [k, d] of Object.entries(man)) {
      const e = { color: d.color ? col(d.color) : null, block: !!d.colors };
      if (d.colors) { e.normal = col(d.colors.m_NormalColor); e.disabled = col(d.colors.m_DisabledColor, [0.78, 0.78, 0.78, 0.5]); e.pressed = col(d.colors.m_PressedColor, [0.78, 0.78, 0.78, 1]); }
      theme[k.toLowerCase()] = e;
    }
  }
  function themeFor(key) {
    if (!key) return null;
    let k = key.slice(key.lastIndexOf('.') + 1);
    for (const c of [k, k + 'Theme', k.replace('Color', ''), k.replace('Color', '') + 'Theme', k.endsWith('Color') ? k.slice(0, -5) : k]) { const e = theme[c.toLowerCase()]; if (e) return e; }
    return null;
  }
  const field = (s, f) => s.fields ? s.fields[f] : undefined;
  const pptr = (s, f) => { const v = field(s, f); return v && v.m_PathID !== undefined ? Number(v.m_PathID) : 0; };
  // AddressableThemedColorImageBinder / AddressableThemedButtonColorsBinder, keyed by assetKeyKey.
  function applyTheme(root, extra) {
    const all = [...root.all()];
    for (const n of all) for (const s of n.scripts) {
      const key = field(s, 'assetKeyKey'); if (!key) continue;
      const e = (extra && extra[key]) || themeFor(key); if (!e) continue;
      if (s.script === 'AddressableThemedColorImageBinder') { const id = pptr(s, 'image'); const t = all.find(x => x.img && x.img.cpid === id) || (n.img ? n : null); if (t && e.color) t.img.color = e.color.slice(); }
      else if (s.script === 'AddressableThemedButtonColorsBinder') { const id = pptr(s, 'button'); const t = all.find(x => x.sel && x.sel.cpid === id) || (n.sel ? n : null); if (t && e.block) { t.sel.normal = e.normal; t.sel.disabled = e.disabled; t.sel.pressed = e.pressed; } }
    }
    refreshTints(root);
  }
  // Selectable ColorTint: the target graphic is multiplied by the state colour.
  function refreshTints(root) {
    const all = [...root.all()];
    for (const n of all) if (n.sel && n.sel.transition === 1 && n.sel.target) {
      const t = all.find(x => x.img && x.img.cpid === n.sel.target); if (!t) continue;
      const c = n.sel.interactable ? n.sel.normal : n.sel.disabled, m = n.sel.mult;
      t.tintMul = [Math.min(1, c[0] * m), Math.min(1, c[1] * m), Math.min(1, c[2] * m), Math.min(1, c[3] * m)];
    }
  }

  async function loadFonts(base) {
    const load = async name => {
      const [metrics, atlas] = await Promise.all([fetch(`${base}/${name}-metrics.json`).then(r => r.json()), new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `${base}/${name}-atlas.png`; })]);
      fonts[name] = new SdfFont(metrics, atlas);
    };
    await Promise.all([load('marytodd'), load('tabitha')]);
  }

  return {
    Node, parse, loadPrefab, instantiate, prefabs, layoutRoot, render, hitAt, hits: R, applyTheme, refreshTints, setTheme, loadFonts, preload, image,
    setImageBase: b => { imageBase = b; }, onImageLoaded: fn => { onImageLoaded = fn; }, prefOf, minOf, deviceRect
  };
})();
