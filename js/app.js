// AdCap Capital Collection viewer: the Career screen's Swag and Inventory tabs, built from the game's prefabs.
'use strict';

(async () => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const W = 1080; // CanvasScaler reference width (match width)
  const SLOTS = ['head', 'shirt', 'pants', 'badge0', 'badge1', 'badge2'];

  // ------------------------------------------------------------ data
  const [data, themeRaw] = await Promise.all([fetch('data/items.json').then(r => r.json()), fetch('data/theme.json').then(r => r.json())]);
  const S = data.strings;
  const L = k => S[k] !== undefined ? S[k] : k;
  const items = data.items;
  const byId = new Map(items.map(i => [i.ID, i]));
  const rarity = id => data.rarities[id] || data.rarities['rarity.common'];
  const rgba = (c, a = 255) => [c[0] / 255, c[1] / 255, c[2] / 255, (c[3] === undefined ? a : c[3]) / 255];
  const defaults = {};
  for (const i of items) if (i.GroupID === 'equipment.set.default.underdressed' && ['head', 'shirt', 'pants'].includes(i.Type) && !defaults[i.Type]) defaults[i.Type] = i;

  UI.setTheme(themeRaw);
  UI.setImageBase('img/ui/');
  const prefabNames = ['CareerScreen', 'EquipmentGridRow', 'EquipmentItemView', 'EquipmentItemDetailsPopup', 'ChangingRoomEquipmentItemView', 'SwagContainer_earth', 'InfoPopup', 'InfoPopupBodyItemView'];
  await Promise.all([UI.loadFonts('fonts'), ...prefabNames.map(n => UI.loadPrefab(n, `data/ui/${n}.json`))]);
  const uiFiles = new Set();
  for (const p of UI.prefabs.values()) for (const n of p.all()) if (n.img && n.img.file) uiFiles.add('img/ui/' + n.img.file);
  await UI.preload([...uiFiles]);
  document.getElementById('loading').remove();

  // ------------------------------------------------------------ state (shareable through the URL hash)
  const state = { tab: 0, viewing: 0, planet: 0, sort: 0, gender: 'm', equipped: {}, detail: null, info: null, dropdown: null };
  function loadState() {
    const h = new URLSearchParams(location.hash.slice(1));
    let src = h.has('e') ? h : null;
    if (!src) { try { src = new URLSearchParams(localStorage.getItem('adcap-outfit') || ''); } catch (e) { src = new URLSearchParams(); } }
    state.gender = src.get('g') === 'f' ? 'f' : 'm';
    state.equipped = {};
    (src.get('e') || '').split(',').forEach((v, i) => { const it = items[parseInt(v, 36)]; if (v && v !== '-' && it && SLOTS[i]) state.equipped[SLOTS[i]] = it.ID; });
  }
  function saveState() {
    const e = SLOTS.map(s => state.equipped[s] ? items.indexOf(byId.get(state.equipped[s])).toString(36) : '-').join(',');
    const q = `g=${state.gender}&e=${e}`;
    history.replaceState(null, '', '#' + q);
    try { localStorage.setItem('adcap-outfit', q); } catch (err) { /* private mode */ }
  }
  loadState();
  const equippedSlot = id => SLOTS.find(s => state.equipped[s] === id);
  const setWorn = gid => { if (!gid) return [0, 0]; const set = items.filter(i => i.GroupID === gid && ['head', 'shirt', 'pants'].includes(i.Type)); return [set.filter(i => equippedSlot(i.ID)).length, set.length]; };
  function equip(it) {
    if (it.Type === 'badge') {
      if (equippedSlot(it.ID)) return;
      const free = ['badge0', 'badge1', 'badge2'].find(s => !state.equipped[s]) || 'badge2';
      state.equipped[free] = it.ID;
    } else if (['head', 'shirt', 'pants'].includes(it.Type)) state.equipped[it.Type] = it.ID;
    saveState();
  }
  function unequip(it) { const s = equippedSlot(it.ID); if (s) delete state.equipped[s]; saveState(); }

  // value shown in the item's description: base value, x set bonus when the whole set is worn
  const effectValue = it => it.ModifierIntensity;
  const setBonusText = sb => !sb ? '' : sb >= 1 ? `Set bonus x${trim(sb)}` : `Set bonus +${trim(sb * 100)}%`;
  const trim = v => { const r = Math.round(v * 1000) / 1000; return String(+r.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 3)); };
  function effectText(it) {
    const v = effectValue(it);
    const s = it.ModifierEffect === 'output' ? 'x' + trim(v) : trim(v * 100) + '%';
    return (it.Description || '').replace('{0}', s);
  }

  // ------------------------------------------------------------ helpers
  const inst = name => { const n = UI.instantiate(name); UI.applyTheme(n); return n; };
  const on = (root, path, v) => { const n = root.find(path); if (n) n.active = v; return n; };
  const txt = (root, path, v) => { const n = root.find(path); if (n && n.txt) n.txt.text = v; return n; };
  const art = (node, src) => { if (node && node.img) { node.img.override = src || null; if (src) node.img.preserve = node.img.preserve || false; } };
  function attach(parent, child) { child.parent = parent; parent.children.push(child); return child; }
  function scrollContent(viewport) {
    const ct = viewport.children.find(c => c.name.startsWith('Content'));
    if (!ct.group || !ct.group.enabled) {
      ct.group = { kind: 1, l: 0, r: 0, t: 0, b: 0, spacing: 0, spacingY: 0, align: 1, enabled: true, ctrlW: true, ctrlH: true, expW: false, expH: false, reverse: false };
      ct.hasFitter = true; ct.fitH = 0; ct.fitV = 2; ct.pivY = 1; ct.aMinY = 1; ct.aMaxY = 1; ct.posY = 0; ct.sizeY = 0;
    }
    return ct;
  }

  // ------------------------------------------------------------ screen
  const root = inst('CareerScreen');
  const top = 'SafeArea-Top/';
  const content = top + 'Content/';
  txt(root, top + 'TitleGroup/TitleBanner/img_Banner/txt_Title', L('ID_INFO_BTN_CAREER_INVENTORY_TITLE'));
  on(root, top + 'TitleGroup/ModalCloseButton', false);
  const nav = root.find(content + 'PageNavGroup');
  const tabs = [nav.find('nav_Swag'), nav.find('nav_Inventory')];
  nav.find('nav_Stats').active = false;
  [L('ID_SWAG'), L('ID_INVENTORY')].forEach((label, i) => { txt(tabs[i], 'Title/txt_Label', label); tabs[i].click = () => { state.tab = i; state.dropdown = null; closeMenus(); dirty(); }; });
  root.find(content + 'InfoButton').click = () => { state.info = state.tab === 0 ? 'career' : 'inventory'; dirty(); };
  const panels = root.find(content + 'PanelContent');
  const swagPanel = panels.find('CareerPanel'), invPanel = panels.find('InventoryPanel');
  panels.find('StatsPanel').active = false;

  // Swag tab: ChangingRoomPortrait with the Earth swag scene behind the capitalist
  const swagViewport = swagPanel.find('ScrollGroup/ScrollView/Viewport');
  const swagContent = scrollContent(swagViewport);
  const portrait = swagContent.find('ChangingRoomPortrait');
  portrait.aMinY = portrait.aMaxY = 1; portrait.sizeY = 0;
  const swagC = portrait.find('SwagContentContainer');
  const scene = inst('SwagContainer_earth');
  for (const c of scene.children) if (c.name !== 'Unused Images') c.active = true;
  for (const c of scene.children) if (c.img) c.img.enabled = true;
  attach(swagC.find('SwagContent/SwagItemParent'), scene);
  on(swagC, 'SwagContent/VIP Frame', false);
  for (const fx of ['equip-rarity', 'equip-sparkle', 'smoke-curtain']) on(swagC, fx, false);
  on(portrait, 'LtdDescriptionContainer', false);
  on(portrait, 'SettingsContainer/Button container right', false);
  on(portrait, 'SettingsContainer/Button container left/btn_Language', false);
  const genderBtn = { f: portrait.find('SettingsContainer/Button container left/btn_Female'), m: portrait.find('SettingsContainer/Button container left/btn_Male') };
  genderBtn.f.click = () => { state.gender = 'f'; saveState(); dirty(); };
  genderBtn.m.click = () => { state.gender = 'm'; saveState(); dirty(); };
  const equipC = portrait.find('EquipmentContainer');
  const slotButtons = ['ItemButton--hat', 'ItemButton--jacket', 'ItemButton--pants', 'ItemButton--badge', 'ItemButton--badge (1)', 'ItemButton--badge (2)'].map(n => equipC.find(n));
  const slotLabels = [L('ID_HATS'), L('ID_JACKETS'), L('ID_PANTS'), L('ID_BADGE'), L('ID_BADGE'), L('ID_BADGE')];
  const slotViewing = [1, 2, 3, 4, 4, 4];
  const slotViews = slotButtons.map((b, i) => {
    on(b, 'NoEffectIndicator', false);
    txt(b, 'txt_Label', slotLabels[i]);
    const holder = b.children.find(c => c.name.startsWith('EquipmentSlot'));
    const v = inst('ChangingRoomEquipmentItemView'); v.active = false;
    attach(holder, v);
    b.click = () => {
      const id = state.equipped[SLOTS[i]];
      if (id) { state.detail = id; }
      else { state.tab = 1; state.viewing = slotViewing[i]; state.planet = 0; scroll.inv = 0; rebuildGrid(); }
      dirty();
    };
    return v;
  });

  function bindSwag() {
    for (const g of ['m', 'f']) {
      genderBtn[g].alpha = state.gender === g ? 1 : 0.45;
    }
    const cont = swagC.find('CapitalistContainer');
    const male = cont.find('Capitalist'), female = cont.find('Capitalist--female');
    male.active = state.gender === 'm'; female.active = state.gender === 'f';
    const cap = state.gender === 'm' ? male : female;
    for (const [slot, node] of [['pants', 'img_Pants'], ['shirt', 'img_Jacket'], ['head', 'img_Hat']]) {
      const it = byId.get(state.equipped[slot]) || defaults[slot];
      art(cap.find(node), it ? (state.gender === 'm' ? it.Male : it.Female) : null);
    }
    SLOTS.forEach((slot, i) => {
      const it = byId.get(state.equipped[slot]), v = slotViews[i], b = slotButtons[i];
      v.active = !!it;
      on(b, 'icon_ItemAdd', !it); on(b, 'txt_Label', !it);
      if (!it) return;
      v.img.color = rgba(rarity(it.RarityID).bg);
      art(v.find('Image_Icon'), it.Icon); v.find('Image_Icon').img.preserve = true;
      on(v, 'ItemLevelBar', true);
      v.find('ItemLevelBar/ItemLevelBarBG').img.fillAmount = 1 / Math.max(1, it.MaxLevel || 1);
      txt(v, 'ItemLevelBar/LabelGroup/txt_ProgressLabel', `1/${it.MaxLevel || 1}`);
    });
  }

  // Inventory tab
  const invViewport = invPanel.find('ScrollGroup/ScrollView/Viewport');
  const invContent = scrollContent(invViewport);
  invContent.group.t = 0; invContent.group.b = 40;
  const empty = invContent.find('InventoryEmpty');
  empty.posY = 0;
  on(empty, 'Standard Buttons (1)', false); on(empty, 'txt_Body', false);
  txt(empty, 'txt_Title', L('ID_NO_ITEM_IN_INVENTORY_TEXT'));
  const filters = invPanel.find('PreScrollContent/Filters');
  filters.find('btn_Back').click = () => { state.tab = 0; dirty(); };
  const typeNames = [L('ID_ALL'), L('ID_HATS'), L('ID_JACKETS'), L('ID_PANTS'), L('ID_BADGES'), L('ID_TROPHIES')];
  const typeIds = [null, 'head', 'shirt', 'pants', 'badge', 'trophy'];
  const planetNames = [L('ID_ALL'), L('ID_EARTH'), L('ID_MOON'), L('ID_MARS'), 'Resort', L('ID_EVENTS'), 'Any Planet'];
  const planetTest = [() => true, l => l === 'balance.earth', l => l === 'balance.moon', l => l === 'balance.mars', l => l === 'balance.vacationisland',
    l => l === 'events' || (l && l.startsWith('balance.') && !['balance.earth', 'balance.moon', 'balance.mars', 'balance.vacationisland'].includes(l)), l => l === 'evergreen' || l === 'planets'];
  const sortNames = [L('ID_RARITY'), L('ID_EQUIPPED'), 'Name'];
  const dropdowns = [
    { node: filters.find('DropdownViewing'), label: L('ID_VIEWING'), names: typeNames, key: 'viewing' },
    { node: filters.find('DropdownPlanets'), label: L('ID_PLANETS') + ':', names: planetNames, key: 'planet' },
    { node: filters.find('DropdownRarity'), label: L('ID_SORT'), names: sortNames, key: 'sort' }
  ];
  function closeMenus() { for (const d of dropdowns) d.menu.active = false; state.dropdown = null; }
  dropdowns.forEach((d, di) => {
    d.menu = d.node.find('DropdownMenu');
    d.template = d.menu.children.find(c => c.name.endsWith('_Template'));
    d.menu.active = false;
    txt(d.node, 'DropdownButton/Labels/txt_Label', d.label);
    d.node.find('DropdownButton').click = () => {
      const open = state.dropdown === di; closeMenus();
      if (!open) {
        state.dropdown = di; d.menu.active = true;
        d.menu.children = d.menu.children.filter(c => c === d.template);
        d.names.forEach((name, i) => {
          const row = d.template.clone(); row.active = true; row.parent = d.menu;
          txt(row, 'txt_Value', name);
          const sel = row.find('img_Selected'); if (sel) sel.active = state[d.key] === i;
          row.click = () => { state[d.key] = i; closeMenus(); scroll.inv = 0; rebuildGrid(); dirty(); };
          d.menu.children.push(row);
        });
      }
      dirty();
    };
  });
  function bindFilters() { dropdowns.forEach(d => txt(d.node, 'DropdownButton/Labels/txt_Value', d.names[state[d.key]])); }

  const rarityRank = id => data.rarityOrder[id] === undefined ? 99 : data.rarityOrder[id];
  function filtered() {
    let list = items.filter(i => (typeIds[state.viewing] === null || i.Type === typeIds[state.viewing]) && planetTest[state.planet](i.ModifierLocation) && i.Icon);
    const byName = (a, b) => (a.Name || '').localeCompare(b.Name || '');
    if (state.sort === 0) list.sort((a, b) => rarityRank(a.RarityID) - rarityRank(b.RarityID) || byName(a, b));
    else if (state.sort === 1) list.sort((a, b) => (equippedSlot(b.ID) ? 1 : 0) - (equippedSlot(a.ID) ? 1 : 0) || rarityRank(a.RarityID) - rarityRank(b.RarityID) || byName(a, b));
    else list.sort(byName);
    return list;
  }
  let gridViews = [];
  function rebuildGrid() {
    invContent.children = invContent.children.filter(c => c === empty);
    gridViews = [];
    const list = filtered();
    empty.active = list.length === 0;
    for (let i = 0; i < list.length; i += 3) {
      const row = inst('EquipmentGridRow');
      row.sizeY = 350; row.cull = true; if (row.le) row.le.minH = 350;
      for (const it of list.slice(i, i + 3)) {
        const v = inst('EquipmentItemView');
        v.tag = it;
        v.click = () => { state.detail = it.ID; dirty(); };
        attach(row, v); gridViews.push(v);
      }
      attach(invContent, row);
    }
  }
  function bindItemView(v) {
    const it = v.tag, rc = rgba(rarity(it.RarityID).bg);
    v.find('Item/img_Bg').img.color = rc;
    on(v, 'Item/img_Checkmark', !!equippedSlot(it.ID));
    const icon = v.find('Item/LayoutGroup/img_Icon');
    art(icon, it.Icon); icon.img.preserve = true;
    const bar = v.find('Item/LayoutGroup/EquipmentLevelBar');
    bar.find('ItemLevelBarBG').img.fillAmount = 1 / Math.max(1, it.MaxLevel || 1);
    txt(bar, 'txt_Label', `1/${it.MaxLevel || 1}`);
  }

  // ------------------------------------------------------------ popups
  let popup = null, popupKey = null;
  function buildDetail(it) {
    const p = inst('EquipmentItemDetailsPopup');
    const c = 'SafeArea/PopupLayout/Window/Content/';
    const r = rarity(it.RarityID);
    p.find(c + 'IconContainer').img.color = rgba(r.bg);
    const im = p.find(c + 'IconContainer/img_Image'); art(im, it.Icon); im.img.preserve = true;
    on(p, c + 'IconContainer/NoEffectIndicator', false);
    txt(p, c + 'txt_Title', it.Name);
    const stars = Math.max(0, r.stars);
    on(p, c + 'RarityStarsView (1)', stars > 0);
    const sv = p.find(c + 'RarityStarsView (1)');
    sv.find('RarityStars').children.forEach((s, i) => { s.active = i < stars; const st = s.find('img_Star'); if (st) st.img.color = rgba(r.star); });
    sv.find('EmptyStars').children.forEach((s, i) => { s.active = i < 5; });
    const rt = txt(p, c + 'txt_RarityTitle', r.name);
    rt.txt.color = rgba(r.star);
    txt(p, c + 'txt_Body', effectText(it));
    on(p, c + 'txt_Body_LTD', false);
    const equipable = ['head', 'shirt', 'pants', 'badge'].includes(it.Type);
    const worn = !!equippedSlot(it.ID);
    on(p, c + 'ButtonContainer', equipable);
    on(p, c + 'ButtonContainer/btn_Swap', false);
    on(p, c + 'ButtonContainer/btn_Equip', equipable && !worn);
    on(p, c + 'ButtonContainer/btn_Unequip', equipable && worn);
    txt(p, c + 'ButtonContainer/btn_Equip/txt_Label', L('ID_EQUIP'));
    txt(p, c + 'ButtonContainer/btn_Unequip/txt_Label', L('ID_UNEQUIP'));
    p.find(c + 'ButtonContainer/btn_Equip').click = () => { equip(it); state.detail = null; dirty(); };
    p.find(c + 'ButtonContainer/btn_Unequip').click = () => { unequip(it); state.detail = null; dirty(); };
    p.find('SafeArea/PopupLayout/Window/ModalCloseButton').click = () => { state.detail = null; dirty(); };
    p.find('SafeArea/PopupLayout/Window').click = () => {};
    // set progress strip under the window
    const [wornN, total] = setWorn(it.GroupID);
    const eff = p.find('SafeArea/EffectContainer');
    eff.active = total > 1;
    if (total > 1) {
      const set = data.sets[it.GroupID];
      const tl = 'EffectDescription/Content/TextLayout/';
      txt(eff, tl + 'txt_Title', (set && set.Name) || '');
      txt(eff, tl + 'txt_Description', L('ID_NUM_PIECES_EQUIPPED').replace('{0}', '').replace('{1}', wornN).replace('{2}', total).replace('{3}', set && set.Name ? '' : '').replace(/\s+/g, ' ').trim() + (it.SetBonus ? '  ' + setBonusText(it.SetBonus) : ''));
    }
    return p;
  }
  function buildInfo(id) {
    const d = data.info[id]; if (!d) return null;
    const p = inst('InfoPopup');
    const c = 'PopupLayout/Window/Content/';
    txt(p, c + 'txt_Title', L(d.title));
    const body = p.find(c + 'BodyLayout');
    body.children = [];
    for (const b of d.bodies || []) { const item = inst('InfoPopupBodyItemView'); const t = [...item.all()].find(n => n.txt); if (t) t.txt.text = L(b); attach(body, item); }
    on(p, c + 'Art', false);
    on(p, c + 'ButtonContainer/btn_Confirm', !!d.hasAction);
    txt(p, c + 'ButtonContainer/btn_Confirm/txt_Label', L(d.button || 'ID_CLOSE'));
    const close = () => { state.info = null; dirty(); };
    const cb = p.find(c + 'ButtonContainer/btn_Confirm'); if (cb) cb.click = close;
    const mc = p.find('PopupLayout/Window/ModalCloseButton'); if (mc) { mc.active = !!d.hasClose; mc.click = close; }
    const w = p.find('PopupLayout/Window'); if (w) w.click = () => {};
    return p;
  }

  // ------------------------------------------------------------ frame
  const scroll = { swag: 0, inv: 0 };
  let H = 2340, scale = 1, needs = true;
  function dirty() { needs = true; }
  UI.onImageLoaded(dirty);
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const cssW = Math.min(vw, vh * 0.62), cssH = vh;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    scale = canvas.width / W; H = canvas.height / scale;
    dirty();
  }
  window.addEventListener('resize', resize);
  resize();
  rebuildGrid();

  const vpDevice = vp => ({ x: vp.rect.x * scale, y: vp.rect.y * scale, w: vp.rect.w * scale, h: vp.rect.h * scale });
  function clampScroll() {
    let again = false;
    for (const [k, vp, ct] of [['swag', swagViewport, swagContent], ['inv', invViewport, invContent]]) {
      const max = Math.max(0, ct.rect.h - vp.rect.h);
      const v = Math.max(0, Math.min(max, scroll[k]));
      if (v !== scroll[k]) { scroll[k] = v; again = true; }
    }
    return again;
  }
  function frame() {
    requestAnimationFrame(frame);
    if (!needs) return;
    needs = false;
    // bind
    tabs.forEach((t, i) => { on(t, 'img_Bg', state.tab !== i); on(t, 'img_BgActive', state.tab === i); });
    swagPanel.active = state.tab === 0; invPanel.active = state.tab === 1; swagPanel.alpha = invPanel.alpha = 1;
    bindSwag(); bindFilters();
    for (const v of gridViews) bindItemView(v);
    swagContent.posY = scroll.swag; invContent.posY = scroll.inv;
    UI.layoutRoot(root, { x: 0, y: 0, w: W, h: H });
    if (clampScroll()) { swagContent.posY = scroll.swag; invContent.posY = scroll.inv; UI.layoutRoot(root, { x: 0, y: 0, w: W, h: H }); }
    // popups
    const key = state.detail ? 'd:' + state.detail + ':' + JSON.stringify(state.equipped) : state.info ? 'i:' + state.info : null;
    if (key !== popupKey) { popupKey = key; popup = state.detail ? buildDetail(byId.get(state.detail)) : state.info ? buildInfo(state.info) : null; }
    if (popup) UI.layoutRoot(popup, { x: 0, y: 0, w: W, h: H });
    // draw
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1d3b52'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    UI.hits.hits = [];
    UI.render(ctx, root, () => { if (state.dropdown !== null) UI.hits.hits.push({ r: { x: 0, y: 0, w: canvas.width, h: canvas.height }, fn: () => { closeMenus(); dirty(); } }); });
    if (popup) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
      UI.hits.hits = [{ r: { x: 0, y: 0, w: canvas.width, h: canvas.height }, fn: () => { state.detail = null; state.info = null; dirty(); } }];
      UI.render(ctx, popup);
    }
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------------ input: tap, drag-scroll and wheel
  const toCanvas = e => { const b = canvas.getBoundingClientRect(); return { x: (e.clientX - b.left) * canvas.width / b.width, y: (e.clientY - b.top) * canvas.height / b.height }; };
  const inside = (p, r) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
  const scrollKeyAt = p => {
    if (popup) return null;
    if (state.tab === 0 && inside(p, vpDevice(swagViewport))) return 'swag';
    if (state.tab === 1 && inside(p, vpDevice(invViewport))) return 'inv';
    return null;
  };
  let drag = null;
  canvas.addEventListener('pointerdown', e => { const p = toCanvas(e); drag = { start: p, last: p, key: scrollKeyAt(p), moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = toCanvas(e);
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 10 * (window.devicePixelRatio || 1)) drag.moved = true;
    if (drag.moved && drag.key) { scroll[drag.key] -= (p.y - drag.last.y) / scale; dirty(); }
    drag.last = p;
  });
  canvas.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (!d || d.moved) return;
    const h = UI.hitAt(d.start.x, d.start.y);
    if (h) { h.fn(); dirty(); }
  });
  canvas.addEventListener('wheel', e => { const k = scrollKeyAt(toCanvas(e)); if (!k) return; e.preventDefault(); scroll[k] += e.deltaY * (e.deltaMode === 1 ? 40 : 1) * 1.5; dirty(); }, { passive: false });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') { state.detail = null; state.info = null; closeMenus(); dirty(); } });
  window.addEventListener('hashchange', () => { loadState(); popupKey = null; dirty(); });
})();
