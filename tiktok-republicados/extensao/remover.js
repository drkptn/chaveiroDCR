/*!
 * Faxina de Republicados v1.0.0
 * Remove os seus republicados (reposts) do TikTok, um por um, clicando nos
 * mesmos botões que você clicaria. Roda só dentro da sua aba do tiktok.com:
 * não pede senha, não guarda nada fora do navegador e não manda dados pra ninguém.
 *
 * Formas de usar: favorito (bookmarklet), colar no console ou extensão do Chrome.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';

  // Já aberto nesta aba? Só mostra o painel de novo.
  var existing = document.getElementById('trr-root');
  if (existing) {
    existing.dispatchEvent(new CustomEvent('trr:open'));
    return;
  }

  if (!/(^|\.)tiktok\.com$/i.test(location.hostname)) {
    alert('Faxina de Republicados: abra o tiktok.com (logado na sua conta) e rode de novo.');
    return;
  }

  var IS_EXT = (function () {
    try { return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  })();

  /* ------------------------------------------------------------------ *
   * Seletores (data-e2e do TikTok web) e textos em vários idiomas
   * ------------------------------------------------------------------ */
  var SEL = {
    navProfile: ['a[data-e2e="nav-profile"]', '[data-e2e="nav-profile"] a', '[data-e2e="nav-profile"]'],
    editProfile: ['[data-e2e="edit-profile-entrance"]', '[data-e2e="edit-profile"]'],
    videosTab: ['[data-e2e="videos-tab"]'],
    repostTab: ['[data-e2e="repost-tab"]', '[data-e2e="profile-repost-tab"]'],
    repostItem: ['[data-e2e="user-repost-item"]', '#user-repost-item-list [data-e2e$="-item"]'],
    repostDirect: [
      '[data-e2e="video-share-repost"]',
      '[data-e2e="browse-share-repost"]',
      '#icon-element-repost',
      '[data-e2e*="share-repost" i]:not([data-e2e="share-repost"])'
    ],
    repostTag: ['[data-e2e="repost-action-tag"]'],
    shareOpen: [
      '[data-e2e="browse-share-icon"]',
      '[data-e2e="share-icon"]',
      'button[data-e2e="share-btn"]',
      '[data-e2e="video-share-icon"]'
    ],
    repostMenu: ['[data-e2e="share-repost"]'],
    next: [
      'button[data-e2e="arrow-right"]',
      '[data-e2e="arrow-right"]',
      'button[aria-label*="next video" i]',
      'button[aria-label*="próximo" i]',
      'button[aria-label*="proximo" i]',
      'button[aria-label*="siguiente" i]',
      'button[aria-label*="suivant" i]',
      'button[aria-label="Next" i]'
    ],
    close: [
      'button[data-e2e="browse-close"]',
      '[data-e2e="browse-close"]',
      'button[aria-label*="close" i]',
      'button[aria-label*="fechar" i]',
      'button[aria-label*="cerrar" i]'
    ],
    dialog: ['[role="dialog"]', '[role="alertdialog"]', '[class*="Modal" i]', '[class*="Dialog" i]', '[class*="Popup" i]'],
    captcha: [
      '#captcha-verify-container',
      '#captcha_container',
      '.captcha_verify_container',
      'div[class*="captcha_verify" i]',
      'div[class*="captcha-verify" i]',
      'iframe[src*="captcha" i]'
    ]
  };

  // "Remover republicação", "Remove repost", "Quitar republicación"...
  var RE_REMOVE = new RegExp([
    '(remove|undo|delete|cancel)\\s*(the\\s+|this\\s+|your\\s+)?re-?post',
    'unrepost',
    '(remov|desfaz|exclu|apag|cancel|retir)\\S*.{0,30}(republica|repost)',
    '(quitar|eliminar|deshacer|borrar)\\S*.{0,30}(repost|republica)',
    '(retirer|supprimer|annuler).{0,30}(republi|repost)',
    'repost.{0,12}(entfernen|rückgängig|löschen)',
    '(rimuovi|annulla|elimina).{0,30}(repost|ripubblica)',
    '(удалить|убрать|отменить).{0,25}репост',
    '(hapus|batalkan).{0,25}(repost|posting ulang)'
  ].join('|'), 'i');

  // "Você republicou", "You reposted"... (selo que aparece no vídeo)
  var RE_BADGE = /(you reposted|voc[eê] republicou|voc[eê] repostou|republicado por voc[eê]|has republicado|reposteaste|vous avez republi|du hast .{0,12}repost|hai ripubblicato|вы сделали репост|kamu memposting ulang)/i;

  // Botão "Republicar" puro = ainda NÃO republicado (aceita contador no fim)
  var RE_ADD = /^(re-?post|republicar|repostar|republique|repostear|volver a publicar|compartir de nuevo|republier|reposten|ripubblica|репост|сделать репост|posting ulang)(\s+[\d.,]+\s*[kmb]?)?$/i;

  var RE_TAB = /^(reposts?|republicad[oa]s|republicações|repostagens|republicaciones|reposteos|republications|ripubblicati|репосты)(\s+\d+)?$/i;

  var RE_CONFIRM = /^(remove|remover|excluir|apagar|delete|confirm|confirmar|ok|yes|sim|quitar|eliminar|retirer|supprimer|entfernen|rimuovi|удалить|убрать|подтвердить|hapus)$/i;

  var SPEEDS = {
    tranquilo: { label: 'Tranquilo', min: 3500, max: 6500 },
    normal: { label: 'Normal', min: 2000, max: 4000 },
    turbo: { label: 'Turbo', min: 900, max: 1800 }
  };

  var MAX_PASSES = 40;
  var MAX_ATTEMPTS_PER_VIDEO = 3;
  var COOLDOWN_MS = 60000;

  /* ------------------------------------------------------------------ *
   * Estado (sessionStorage sobrevive a recarregar a aba)
   * ------------------------------------------------------------------ */
  var STATE_KEY = 'trr:state:v1';
  var SETTINGS_KEY = 'trr:settings:v1';

  function readJSON(store, key) {
    try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(store, key, val) {
    try { store.setItem(key, JSON.stringify(val)); } catch (e) { /* aba anônima etc. */ }
  }

  var saved = readJSON(sessionStorage, STATE_KEY) || {};
  var settings = Object.assign({ speed: 'normal', limit: 0 }, readJSON(localStorage, SETTINGS_KEY) || {});
  if (!SPEEDS[settings.speed]) settings.speed = 'normal';

  var stats = {
    removed: saved.removed || 0,
    skipped: saved.skipped || 0,
    failed: saved.failed || 0
  };
  var attempts = saved.attempts || {}; // id -> tentativas (persistente na aba)
  var handled = new Set();              // ids já resolvidos nesta carga da página
  var runRemoved = 0;                   // removidos nesta execução (pro limite)
  var running = false, paused = false, stopRequested = false;
  var consecutiveFails = 0, listRefreshes = 0;
  var logLines = [];

  function persist(extra) {
    writeJSON(sessionStorage, STATE_KEY, Object.assign({
      removed: stats.removed, skipped: stats.skipped, failed: stats.failed, attempts: attempts
    }, extra || {}));
  }

  var STOP = { stop: true };

  /* ------------------------------------------------------------------ *
   * Utilitários de DOM
   * ------------------------------------------------------------------ */
  var host; // raiz do painel (definida no buildPanel)

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rand(a, b) { return Math.round(a + Math.random() * (b - a)); }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function queryAll(selectors, root) {
    var out = [];
    for (var i = 0; i < selectors.length; i++) {
      var found;
      try { found = (root || document).querySelectorAll(selectors[i]); } catch (e) { continue; }
      for (var j = 0; j < found.length; j++) {
        var el = found[j];
        if (out.indexOf(el) === -1 && !(host && host.contains(el))) out.push(el);
      }
    }
    return out;
  }

  function centerScore(el) {
    var r = el.getBoundingClientRect();
    var onScreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    var d = Math.hypot(r.left + r.width / 2 - innerWidth / 2, r.top + r.height / 2 - innerHeight / 2);
    return (onScreen ? 0 : 1e6) + d;
  }

  // Respeita a prioridade dos seletores; entre iguais, pega o mais perto do centro da tela.
  function pick(selectors, root) {
    for (var i = 0; i < selectors.length; i++) {
      var els = queryAll([selectors[i]], root).filter(isVisible);
      if (els.length === 1) return els[0];
      if (els.length > 1) return els.sort(function (a, b) { return centerScore(a) - centerScore(b); })[0];
    }
    return null;
  }

  function textParts(el) {
    var parts = [];
    function push(v) {
      if (!v || typeof v !== 'string') return;
      v = v.replace(/\s+/g, ' ').trim();
      if (v && v.length <= 140 && parts.indexOf(v) === -1) parts.push(v);
    }
    if (!el) return parts;
    push(el.getAttribute('aria-label'));
    push(el.getAttribute('title'));
    push((el.innerText || el.textContent || '').slice(0, 140));
    var btn = el.closest('button,[role="button"],a');
    if (btn && btn !== el) {
      push(btn.getAttribute('aria-label'));
      push(btn.getAttribute('title'));
    }
    var kids = el.querySelectorAll('[aria-label],[title]');
    for (var i = 0; i < kids.length && i < 10; i++) {
      push(kids[i].getAttribute('aria-label'));
      push(kids[i].getAttribute('title'));
    }
    // texto quebrado em linhas (ex.: "Republicar\n12")
    var lines = (el.innerText || '').split('\n');
    for (var k = 0; k < lines.length && k < 4; k++) push(lines[k]);
    return parts;
  }

  // 'on' = republicado por você | 'off' = não republicado | 'unknown'
  function stateOf(el) {
    if (!el) return 'unknown';
    var parts = textParts(el);
    for (var i = 0; i < parts.length; i++) if (RE_REMOVE.test(parts[i])) return 'on';
    var pressed = el.getAttribute('aria-pressed') || (el.closest('[aria-pressed]') || { getAttribute: function () { return null; } }).getAttribute('aria-pressed');
    if (pressed === 'true') return 'on';
    for (var j = 0; j < parts.length; j++) if (RE_ADD.test(parts[j])) return 'off';
    if (pressed === 'false') return 'off';
    return 'unknown';
  }

  function badgeEl() {
    var tag = pick(SEL.repostTag);
    if (tag) return tag;
    var cands = document.querySelectorAll('span, p, h4, div[class*="Repost" i], [data-e2e*="repost" i]');
    var best = null, bestScore = Infinity;
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      var t = el.textContent;
      if (!t || t.length > 80 || !RE_BADGE.test(t)) continue;
      if (host && host.contains(el)) continue;
      if (!isVisible(el)) continue;
      var s = centerScore(el);
      if (s < bestScore) { best = el; bestScore = s; }
    }
    return best;
  }

  function findByText(regex, root, selector) {
    var els = (root || document).querySelectorAll(selector || 'button, a, [role="button"], [role="menuitem"], [role="tab"], p, span, div');
    var hits = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (host && host.contains(el)) continue;
      var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 60) continue;
      var a = el.getAttribute('aria-label') || '';
      if ((regex.test(t) || (a && regex.test(a))) && isVisible(el)) hits.push(el);
    }
    // prefere o elemento mais interno (o texto "de verdade")
    hits = hits.filter(function (el) { return !hits.some(function (o) { return o !== el && el.contains(o); }); });
    if (!hits.length) return null;
    return hits.sort(function (a, b) { return centerScore(a) - centerScore(b); })[0];
  }

  // Onde procurar textos de ação (nunca em comentários/legendas soltas)
  var ACTION_SEL = 'button, a, li, [role="button"], [role="menuitem"], [data-e2e*="share" i], [data-e2e*="repost" i]';

  function fireClick(el) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { /* ok */ }
    var r = el.getBoundingClientRect();
    var opts = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    var pOpts = Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, opts);
    try { el.dispatchEvent(new PointerEvent('pointerover', pOpts)); } catch (e) { /* ok */ }
    try { el.dispatchEvent(new MouseEvent('mouseover', opts)); } catch (e) { /* ok */ }
    try { el.dispatchEvent(new PointerEvent('pointerdown', pOpts)); } catch (e) { /* ok */ }
    try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (e) { /* ok */ }
    try { el.dispatchEvent(new PointerEvent('pointerup', pOpts)); } catch (e) { /* ok */ }
    try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (e) { /* ok */ }
    el.click();
  }

  function hover(el) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    var opts = { bubbles: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove'].forEach(function (type) {
      try {
        var Ctor = type.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ctor(type, Object.assign({ bubbles: type.indexOf('enter') === -1 }, opts)));
      } catch (e) { /* ok */ }
    });
  }

  function pressKey(key) {
    var target = document.activeElement && !(host && host.contains(document.activeElement)) ? document.activeElement : document.body;
    var codes = { ArrowDown: 40, ArrowRight: 39, Escape: 27 };
    ['keydown', 'keyup'].forEach(function (type) {
      try {
        target.dispatchEvent(new KeyboardEvent(type, { key: key, code: key, keyCode: codes[key], which: codes[key], bubbles: true, cancelable: true, composed: true }));
      } catch (e) { /* ok */ }
    });
  }

  function isDisabled(el) {
    return !!(el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[disabled],[aria-disabled="true"]'));
  }

  /* ------------------------------------------------------------------ *
   * Controle de fluxo: pausa, parar, captcha
   * ------------------------------------------------------------------ */
  function captchaVisible() {
    return !!pick(SEL.captcha);
  }

  async function checkpoint() {
    if (stopRequested) throw STOP;
    if (captchaVisible()) {
      setStatus('O TikTok mostrou um captcha. Resolve ele aí que eu continuo sozinho 🧩', 'warn');
      log('Captcha detectado — esperando você resolver.');
      while (captchaVisible()) {
        if (stopRequested) throw STOP;
        await sleep(800);
      }
      log('Captcha resolvido, bora continuar.');
      setStatus('Continuando a faxina...', 'run');
      await sleep(2500);
    }
    if (paused) {
      setStatus('Pausado. Clica em "Continuar" quando quiser.', 'warn');
      while (paused) {
        if (stopRequested) throw STOP;
        await sleep(300);
      }
      setStatus('Continuando a faxina...', 'run');
    }
  }

  async function nap(ms) {
    var end = Date.now() + ms;
    while (Date.now() < end) {
      await checkpoint();
      await sleep(Math.min(250, Math.max(0, end - Date.now())));
    }
  }

  async function waitFor(fn, timeout, step) {
    var t0 = Date.now();
    timeout = timeout || 8000;
    step = step || 250;
    while (Date.now() - t0 < timeout) {
      await checkpoint();
      var v = null;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  function limitReached() {
    var lim = Number(settings.limit) || 0;
    return lim > 0 && runRemoved >= lim;
  }

  function speed() { return SPEEDS[settings.speed] || SPEEDS.normal; }

  /* ------------------------------------------------------------------ *
   * Navegação no TikTok
   * ------------------------------------------------------------------ */
  function myHandle() {
    try {
      var raw = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__').textContent;
      var u = JSON.parse(raw).__DEFAULT_SCOPE__['webapp.app-context'].user;
      return (u && u.uniqueId) || null;
    } catch (e) { /* segue */ }
    var a = document.querySelector('a[data-e2e="nav-profile"][href*="/@"]');
    if (a) {
      var m = a.getAttribute('href').match(/\/@([^/?#]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    return null;
  }

  function onOwnProfile(handle) {
    var p = decodeURIComponent(location.pathname).toLowerCase().replace(/\/+$/, '');
    if (handle) return p === '/@' + handle.toLowerCase();
    return /^\/@[^/]+$/.test(p) && !!pick(SEL.editProfile);
  }

  function inViewer() { return /\/(video|photo)\/\d+/.test(location.pathname); }
  function currentId() {
    var m = location.pathname.match(/\/(?:video|photo)\/(\d+)/);
    return m ? m[1] : null;
  }

  async function closeViewer() {
    if (!inViewer()) return true;
    var btn = pick(SEL.close);
    if (btn) {
      fireClick(btn);
      if (await waitFor(function () { return !inViewer(); }, 5000)) { await nap(800); return true; }
    }
    pressKey('Escape');
    if (await waitFor(function () { return !inViewer(); }, 3000)) { await nap(800); return true; }
    history.back();
    var ok = await waitFor(function () { return !inViewer(); }, 4000);
    await nap(800);
    return !!ok;
  }

  async function ensureProfile() {
    if (inViewer()) await closeViewer();
    var handle = myHandle();
    if (onOwnProfile(handle)) return;

    var nav = pick(SEL.navProfile);
    if (nav) {
      log('Indo pro seu perfil...');
      fireClick(nav);
      var ok = await waitFor(function () {
        return onOwnProfile(handle || myHandle()) && (pick(SEL.videosTab) || pick(SEL.repostTab));
      }, 12000);
      if (ok) return;
    }

    handle = handle || myHandle();
    if (!handle) throw new UserError('Não achei sua conta. Você tá logado no TikTok nesse navegador?');

    if (IS_EXT) {
      log('Abrindo seu perfil (a página vai recarregar e eu continuo sozinho).');
      persist({ resume: true });
      location.href = '/@' + encodeURIComponent(handle);
      await sleep(60000);
      throw STOP;
    }
    persist();
    location.href = '/@' + encodeURIComponent(handle);
    throw new UserError('Abri seu perfil. Quando carregar, rode a Faxina de novo e clique em Começar.');
  }

  function findRepostTab() {
    return pick(SEL.repostTab) || findByText(RE_TAB, document, '[role="tab"], [data-e2e$="-tab"], p, span');
  }

  // true = aba aberta | false = não tem aba (= nenhum republicado)
  async function openRepostTab() {
    var loaded = await waitFor(function () { return findRepostTab() || pick(SEL.videosTab); }, 15000);
    if (!loaded) throw new UserError('O perfil não carregou. Recarrega a página e tenta de novo.');
    var tab = findRepostTab();
    if (!tab) {
      await nap(3000);
      tab = findRepostTab();
    }
    if (!tab) return false;
    var tabBtn = tab.closest('[role="tab"]') || tab;
    if (tabBtn.getAttribute('aria-selected') !== 'true') {
      fireClick(tabBtn);
      await nap(1800);
    }
    return true;
  }

  function repostItems() {
    var items = queryAll(SEL.repostItem).filter(isVisible);
    if (!items.length) {
      var list = document.querySelector('#user-repost-item-list');
      if (list) items = Array.prototype.slice.call(list.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]')).filter(isVisible);
    }
    return items.map(function (el) {
      var a = el.matches('a[href]') ? el : el.querySelector('a[href*="/video/"], a[href*="/photo/"]') || el.querySelector('a[href]');
      var href = a ? a.getAttribute('href') : '';
      var m = href && href.match(/\/(?:video|photo)\/(\d+)/);
      return { el: el, link: a || el, id: m ? m[1] : null };
    });
  }

  // 'opened' | 'empty' | 'stale' | 'failed'
  async function openNextFromList() {
    var items = await waitFor(function () { var v = repostItems(); return v.length ? v : null; }, 10000);
    if (!items) return 'empty';
    for (var round = 0; round < 25; round++) {
      items = repostItems();
      var target = null;
      for (var i = 0; i < items.length; i++) {
        if (!items[i].id || !handled.has(items[i].id)) { target = items[i]; break; }
      }
      if (target) {
        fireClick(target.link);
        var ok = await waitFor(inViewer, 10000);
        if (!ok) {
          log('Não consegui abrir o vídeo da lista.');
          return 'failed';
        }
        await nap(1200);
        return 'opened';
      }
      // todos os visíveis já foram resolvidos: rola pra carregar mais
      var before = items.length;
      try { items[items.length - 1].el.scrollIntoView({ block: 'end' }); } catch (e) { /* ok */ }
      window.scrollBy(0, innerHeight);
      await nap(2000);
      if (repostItems().length <= before) return 'stale';
    }
    return 'stale';
  }

  async function refreshList() {
    listRefreshes++;
    if (listRefreshes <= 2) {
      log('Atualizando a lista de republicados...');
      var vt = pick(SEL.videosTab);
      if (vt) { fireClick(vt); await nap(1800); }
      window.scrollTo(0, 0);
      return true;
    }
    if (IS_EXT) {
      log('Recarregando a página pra lista vir fresquinha (eu continuo sozinho).');
      persist({ resume: true });
      location.reload();
      await sleep(60000);
      throw STOP;
    }
    return false;
  }

  async function goNext() {
    var before = location.href;
    var btn = pick(SEL.next);
    if (btn && !isDisabled(btn)) {
      fireClick(btn);
      if (await waitFor(function () { return location.href !== before; }, 7000)) { await nap(900); return true; }
    }
    if (btn && isDisabled(btn)) return false;
    pressKey('ArrowDown');
    if (await waitFor(function () { return location.href !== before; }, 4000)) { await nap(900); return true; }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * Desfazer o republicado do vídeo aberto
   * ------------------------------------------------------------------ */
  async function confirmIfAsked() {
    var dialogs = queryAll(SEL.dialog).filter(isVisible);
    for (var i = 0; i < dialogs.length; i++) {
      var btn = findByText(RE_CONFIRM, dialogs[i], 'button, [role="button"]');
      if (btn) {
        log('Confirmando a remoção ("' + (btn.innerText || '').trim() + '").');
        fireClick(btn);
        await nap(900);
        return true;
      }
    }
    return false;
  }

  function evidenceOn() {
    var d = pick(SEL.repostDirect);
    if (d && stateOf(d) === 'on') return true;
    return !!badgeEl();
  }

  async function verifyOff(timeout) {
    var t0 = Date.now(), confirmed = false;
    while (Date.now() - t0 < timeout) {
      await checkpoint();
      if (!confirmed && (await confirmIfAsked())) confirmed = true;
      if (!evidenceOn()) return true;
      await sleep(300);
    }
    return !evidenceOn();
  }

  async function openShareMenu() {
    var share = pick(SEL.shareOpen);
    if (!share) return null;
    hover(share);
    var item = await waitFor(function () { return pick(SEL.repostMenu); }, 1500);
    if (item) return item;
    fireClick(share);
    return await waitFor(function () {
      return pick(SEL.repostMenu) || findByText(RE_REMOVE, document, ACTION_SEL) || findByText(RE_ADD, document, ACTION_SEL);
    }, 3500);
  }

  function unhover(el) {
    if (!el) return;
    ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'].forEach(function (type) {
      try {
        var Ctor = type.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ctor(type, { bubbles: type.indexOf('leave') === -1, composed: true, clientX: 1, clientY: 1 }));
      } catch (e) { /* ok */ }
    });
  }

  // Fecha o menu de compartilhar sem fechar o vídeo (Esc só em último caso)
  async function closeMenus() {
    function menuOpen() { return pick(SEL.repostMenu); }
    if (!menuOpen()) return;
    unhover(menuOpen());
    unhover(pick(SEL.shareOpen));
    await sleep(500);
    if (!menuOpen()) return;
    var share = pick(SEL.shareOpen);
    if (share) { fireClick(share); await sleep(500); }
    if (!menuOpen()) return;
    pressKey('Escape');
    await sleep(500);
  }

  function shortLabel(el) { return textParts(el).join(' | ').slice(0, 90) || '(sem texto)'; }

  // Retorna 'removed' | 'skipped' | 'failed'
  async function processCurrent() {
    await checkpoint();
    await waitFor(function () { return pick(SEL.repostDirect) || pick(SEL.shareOpen) || badgeEl(); }, 7000);

    var badge = badgeEl();
    var direct = pick(SEL.repostDirect);

    // Caminho 1: botão de republicar direto na barra do vídeo
    if (direct) {
      var st = stateOf(direct);
      if (st === 'on' || (st === 'unknown' && badge)) {
        fireClick(direct);
        await nap(600);
        // às vezes abre um menuzinho com "Remover republicação"
        var sub = findByText(RE_REMOVE, document, ACTION_SEL);
        if (sub && sub !== direct && !direct.contains(sub) && evidenceOn()) { fireClick(sub); await nap(500); }
        if (await verifyOff(5000)) return 'removed';
        log('Cliquei mas não confirmou (' + shortLabel(direct) + ').');
        return 'failed';
      }
      if (st === 'off' && !badge) return 'skipped';
    }

    // Caminho 2: menu de compartilhar → "Remover republicação"
    var item = await openShareMenu();
    if (item) {
      var st2 = stateOf(item);
      if (st2 === 'on' || (st2 === 'unknown' && badge)) {
        fireClick(item);
        await nap(700);
        await confirmIfAsked();
        await closeMenus();
        if (badge || (direct && stateOf(direct) === 'on')) {
          if (await verifyOff(5000)) return 'removed';
          log('Cliquei no menu mas o selo continuou (' + shortLabel(item) + ').');
          return 'failed';
        }
        // sem selo pra conferir: reabre o menu e olha o texto
        var again = await openShareMenu();
        var st3 = again ? stateOf(again) : 'unknown';
        await closeMenus();
        if (st3 === 'on') { log('O menu ainda mostra "remover" depois do clique.'); return 'failed'; }
        return 'removed';
      }
      await closeMenus();
      if (st2 === 'off') return 'skipped';
      log('Opção do menu com texto desconhecido: "' + shortLabel(item) + '".');
    }

    // Caminho 3: selo "Você republicou" clicável
    var tag = pick(SEL.repostTag);
    if (tag) {
      fireClick(tag);
      await nap(700);
      var rm = findByText(RE_REMOVE, document, ACTION_SEL);
      if (rm) { fireClick(rm); await nap(600); }
      if (await verifyOff(5000)) return 'removed';
      await closeMenus();
      return 'failed';
    }

    if (!direct && !item) log('Não achei o botão de republicar neste vídeo.');
    else if (direct) log('Botão de republicar com estado desconhecido: "' + shortLabel(direct) + '".');
    return 'skipped';
  }

  async function handleResult(id, r) {
    if (r === 'removed') {
      stats.removed++; runRemoved++; consecutiveFails = 0;
      if (id) handled.add(id);
      log('✔ Removido: ' + (id || 'vídeo'));
    } else if (r === 'skipped') {
      stats.skipped++; consecutiveFails = 0;
      if (id) handled.add(id);
      log('↷ Pulado (não estava republicado ou não deu pra ler): ' + (id || 'vídeo'));
    } else {
      stats.failed++; consecutiveFails++;
      if (id) {
        attempts[id] = (attempts[id] || 0) + 1;
        if (attempts[id] >= MAX_ATTEMPTS_PER_VIDEO) {
          handled.add(id);
          log('✖ Desisti desse aqui depois de ' + MAX_ATTEMPTS_PER_VIDEO + ' tentativas: ' + id);
        }
      }
    }
    persist();
    renderStats();
    if (consecutiveFails >= 5) {
      consecutiveFails = 0;
      paused = true;
      updateButtons();
      log('Muitas falhas seguidas. Pausei pra não forçar a barra.');
      setStatus('Pausei: 5 falhas seguidas. Clica em "Diagnóstico", depois em "Continuar" ou "Parar".', 'warn');
    } else if (consecutiveFails >= 2) {
      log('Duas falhas seguidas — dando um respiro de ' + COOLDOWN_MS / 1000 + 's pro TikTok.');
      setStatus('Respirando ' + COOLDOWN_MS / 1000 + 's pro TikTok não achar que é robô... 😮‍💨', 'warn');
      await nap(COOLDOWN_MS);
      setStatus('Continuando a faxina...', 'run');
    }
  }

  async function viewerLoop() {
    var removedHere = 0, steps = 0, repeats = 0;
    var seen = new Set();
    while (true) {
      await checkpoint();
      if (limitReached()) return removedHere;
      var id = currentId();
      if (id && seen.has(id)) {
        if (++repeats >= 2) return removedHere;
      } else {
        if (id) seen.add(id);
        if (!id || !handled.has(id)) {
          setStatus('Faxinando... vídeo ' + (seen.size) + ' desta rodada', 'run');
          var r = await processCurrent();
          await handleResult(id, r);
          if (r === 'removed') removedHere++;
          if (limitReached()) return removedHere;
        }
      }
      await nap(rand(speed().min, speed().max));
      if (!inViewer()) return removedHere;
      var moved = await goNext();
      if (!moved) return removedHere;
      if (++steps > 3000) return removedHere;
    }
  }

  function UserError(msg) { this.message = msg; }

  async function run() {
    if (running) return;
    running = true; paused = false; stopRequested = false;
    runRemoved = 0; consecutiveFails = 0;
    updateButtons();
    setStatus('Começando a faxina 🧹', 'run');
    log('— Início (v' + VERSION + ', velocidade ' + speed().label + (Number(settings.limit) ? ', limite ' + settings.limit : '') + ')');
    var zeroPasses = 0;
    try {
      await ensureProfile();
      for (var pass = 1; pass <= MAX_PASSES; pass++) {
        await checkpoint();
        if (inViewer()) await closeViewer();
        log('Rodada ' + pass + '...');
        var hasTab = await openRepostTab();
        if (!hasTab) return finish('Nenhum republicado sobrando. Perfil limpinho! ✨', 'ok');
        var r = await openNextFromList();
        if (r === 'empty') return finish('A aba de republicados tá vazia. Perfil limpinho! ✨', 'ok');
        if (r === 'stale') {
          if (await refreshList()) continue;
          return finish('Terminei o que dava. Recarrega a página (F5) e roda de novo pra conferir se sobrou algum.', 'ok');
        }
        if (r === 'failed') { zeroPasses++; if (zeroPasses >= 3) break; continue; }
        var n = await viewerLoop();
        await closeViewer();
        if (limitReached()) return finish('Limite de ' + settings.limit + ' atingido. Se curtiu o resultado, zera o limite e manda bala.', 'ok');
        if (n === 0) zeroPasses++; else { zeroPasses = 0; listRefreshes = 0; }
        if (zeroPasses >= 3) break;
        await nap(1500);
      }
      finish('Parei: várias rodadas sem conseguir remover nada. Clica em "Diagnóstico" e depois em "Copiar log".', 'warn');
    } catch (e) {
      if (e === STOP) return finish('Parado. Removidos até aqui: ' + stats.removed + '.', 'idle');
      if (e instanceof UserError) return finish(e.message, 'warn');
      log('Erro inesperado: ' + (e && e.message ? e.message : String(e)));
      finish('Deu um erro inesperado. Clica em "Copiar log" pra ver o que foi.', 'warn');
    }
  }

  function finish(msg, kind) {
    running = false; paused = false; stopRequested = false;
    persist({ resume: false });
    log('— Fim: ' + msg);
    setStatus(msg, kind || 'idle');
    updateButtons();
  }

  function diagnose() {
    var lines = ['— Diagnóstico v' + VERSION];
    lines.push('URL: ' + location.pathname);
    lines.push('Conta: ' + (myHandle() || '(não achei)') + ' | no próprio perfil: ' + onOwnProfile(myHandle()) + ' | viewer: ' + inViewer());
    Object.keys(SEL).forEach(function (k) {
      var els = queryAll(SEL[k]);
      var vis = els.filter(isVisible);
      if (els.length) lines.push(k + ': ' + vis.length + '/' + els.length + ' visíveis' + (vis[0] ? ' → "' + shortLabel(vis[0]) + '" [' + stateOf(vis[0]) + ']' : ''));
      else lines.push(k + ': nada');
    });
    var b = badgeEl();
    lines.push('Selo "você republicou": ' + (b ? '"' + (b.textContent || '').trim().slice(0, 60) + '"' : 'não'));
    lines.push('Itens na lista de republicados: ' + repostItems().length + ' | resolvidos nesta carga: ' + handled.size);
    var e2e = {};
    document.querySelectorAll('[data-e2e]').forEach(function (el) {
      var v = el.getAttribute('data-e2e');
      if (/repost|share|arrow|browse|tab|close/i.test(v)) e2e[v] = (e2e[v] || 0) + 1;
    });
    lines.push('data-e2e relevantes: ' + (Object.keys(e2e).map(function (k) { return k + '×' + e2e[k]; }).join(', ') || 'nenhum'));
    lines.forEach(log);
  }

  /* ------------------------------------------------------------------ *
   * Painel (Shadow DOM, sem innerHTML)
   * ------------------------------------------------------------------ */
  var ui = {};

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'text') el.textContent = props[k];
      else if (k === 'on') Object.keys(props.on).forEach(function (ev) { el.addEventListener(ev, props.on[ev]); });
      else el.setAttribute(k, props[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;max-width:calc(100vw - 24px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;',
    'background:#14141a;color:#f2f2f5;border:1px solid #2c2c36;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden;font-size:13px;line-height:1.4}',
    '.hd{display:flex;align-items:center;gap:8px;padding:12px 12px 10px 14px;border-bottom:1px solid #26262f}',
    '.hd b{font-size:14px;flex:1;letter-spacing:.2px}',
    '.hd small{color:#8b8b99;font-size:11px}',
    '.ic{all:unset;cursor:pointer;width:26px;height:26px;display:grid;place-items:center;border-radius:8px;color:#b5b5c3;font-size:15px}',
    '.ic:hover{background:#23232c;color:#fff}',
    '.bd{padding:12px 14px;display:flex;flex-direction:column;gap:10px;overflow:auto}',
    '.st{padding:9px 11px;border-radius:10px;background:#1d1d25;border:1px solid #2a2a34;color:#dcdce4}',
    '.st.run{border-color:#3d5f2a;background:#18210f;color:#d6f5bf}',
    '.st.ok{border-color:#2f6b4a;background:#10231a;color:#bff2d6}',
    '.st.warn{border-color:#6b5a22;background:#241f0d;color:#f5e5a8}',
    '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
    '.stat{background:#1b1b22;border:1px solid #262630;border-radius:10px;padding:7px 8px;text-align:center}',
    '.stat i{display:block;font-style:normal;font-size:19px;font-weight:700;font-variant-numeric:tabular-nums}',
    '.stat span{font-size:11px;color:#9a9aa8}',
    '.stat.rm i{color:#c6f432}',
    '.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.row label{color:#a9a9b6;font-size:12px}',
    'select,input{all:unset;background:#1d1d25;border:1px solid #30303b;border-radius:8px;padding:6px 8px;color:#f2f2f5;font-size:12px}',
    'input{width:52px;text-align:center}',
    '.seg{display:flex;background:#1d1d25;border:1px solid #30303b;border-radius:9px;padding:2px;gap:2px}',
    '.seg button{all:unset;cursor:pointer;padding:5px 9px;border-radius:7px;font-size:12px;color:#b5b5c3}',
    '.seg button[aria-pressed="true"]{background:#c6f432;color:#14141a;font-weight:600}',
    '.btns{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:6px}',
    '.btn{all:unset;cursor:pointer;text-align:center;padding:9px 8px;border-radius:10px;font-weight:600;font-size:13px;background:#23232c;color:#f2f2f5;border:1px solid #30303b}',
    '.btn:hover{filter:brightness(1.15)}',
    '.btn.pri{background:#c6f432;color:#14141a;border-color:#c6f432}',
    '.btn.dan{color:#ff9a9a}',
    '.btn[disabled]{opacity:.4;pointer-events:none}',
    '.links{display:flex;gap:12px}',
    '.lk{all:unset;cursor:pointer;color:#9fd0ff;font-size:12px}',
    '.lk:hover{text-decoration:underline}',
    '.log{background:#0e0e12;border:1px solid #23232c;border-radius:10px;padding:8px;height:130px;overflow:auto;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#b9b9c6;white-space:pre-wrap;word-break:break-word}',
    '.note{color:#8b8b99;font-size:11px}',
    '.pill{all:unset;cursor:pointer;position:fixed;left:16px;bottom:16px;z-index:2147483647;',
    'background:#14141a;color:#f2f2f5;border:1px solid #30303b;border-radius:999px;padding:8px 13px;font:600 12px ui-sans-serif,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)}',
    '.pill b{color:#c6f432}',
    '.hidden{display:none !important}'
  ].join('\n');

  function buildPanel() {
    host = document.createElement('div');
    host.id = 'trr-root';
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(h('style', { text: CSS }));

    ui.status = h('div', { class: 'st' }, 'Pronto pra faxina. Abre o TikTok logado e clica em Começar.');
    ui.removed = h('i', { text: String(stats.removed) });
    ui.skipped = h('i', { text: String(stats.skipped) });
    ui.failed = h('i', { text: String(stats.failed) });

    ui.speedBtns = {};
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Velocidade' });
    Object.keys(SPEEDS).forEach(function (k) {
      var b = h('button', {
        type: 'button', 'aria-pressed': String(settings.speed === k), text: SPEEDS[k].label,
        on: { click: function () { settings.speed = k; saveSettings(); renderSpeed(); } }
      });
      ui.speedBtns[k] = b;
      seg.appendChild(b);
    });

    ui.limit = h('input', { type: 'number', min: '0', step: '1', value: String(settings.limit || 0), 'aria-label': 'Limite de remoções (0 = todos)' });
    ui.limit.addEventListener('change', function () {
      var v = Math.max(0, Math.floor(Number(ui.limit.value) || 0));
      ui.limit.value = String(v); settings.limit = v; saveSettings();
    });

    ui.start = h('button', { class: 'btn pri', type: 'button', text: 'Começar', on: { click: onStart } });
    ui.pause = h('button', { class: 'btn', type: 'button', text: 'Pausar', on: { click: onPause } });
    ui.stop = h('button', { class: 'btn dan', type: 'button', text: 'Parar', on: { click: onStop } });

    ui.log = h('div', { class: 'log', role: 'log', 'aria-live': 'polite' });

    ui.panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Faxina de Republicados' },
      h('div', { class: 'hd' },
        h('b', null, '🧹 Faxina de Republicados'),
        h('small', { text: 'v' + VERSION }),
        h('button', { class: 'ic', type: 'button', title: 'Minimizar', 'aria-label': 'Minimizar', text: '–', on: { click: function () { showPanel(false); } } }),
        h('button', { class: 'ic', type: 'button', title: 'Fechar', 'aria-label': 'Fechar painel', text: '×', on: { click: onClose } })
      ),
      h('div', { class: 'bd' },
        ui.status,
        h('div', { class: 'stats' },
          h('div', { class: 'stat rm' }, ui.removed, h('span', { text: 'removidos' })),
          h('div', { class: 'stat' }, ui.skipped, h('span', { text: 'pulados' })),
          h('div', { class: 'stat' }, ui.failed, h('span', { text: 'falhas' }))
        ),
        h('div', { class: 'row' }, h('label', { text: 'Velocidade' }), seg),
        h('div', { class: 'row' },
          h('label', { text: 'Parar depois de' }), ui.limit, h('label', { text: 'remoções (0 = todos)' })
        ),
        h('div', { class: 'btns' }, ui.start, ui.pause, ui.stop),
        h('div', { class: 'links' },
          h('button', { class: 'lk', type: 'button', text: 'Diagnóstico', on: { click: diagnose } }),
          h('button', { class: 'lk', type: 'button', text: 'Copiar log', on: { click: copyLog } }),
          h('button', { class: 'lk', type: 'button', text: 'Zerar contadores', on: { click: resetStats } })
        ),
        ui.log,
        h('div', { class: 'note', text: 'Deixa essa aba aberta e visível enquanto roda. Pode usar outra janela à vontade.' })
      )
    );

    ui.pill = h('button', { class: 'pill hidden', type: 'button', title: 'Abrir Faxina de Republicados', on: { click: function () { showPanel(true); } } });
    renderPill();

    shadow.appendChild(ui.panel);
    shadow.appendChild(ui.pill);
    host.addEventListener('trr:open', function () { host.style.display = ''; showPanel(true); });
    (document.body || document.documentElement).appendChild(host);
    renderSpeed();
    updateButtons();
  }

  function showPanel(open) {
    ui.panel.classList.toggle('hidden', !open);
    ui.pill.classList.toggle('hidden', open);
    renderPill();
  }

  function renderPill() {
    ui.pill.textContent = '';
    ui.pill.appendChild(document.createTextNode('🧹 Republicados '));
    ui.pill.appendChild(h('b', { text: running ? String(stats.removed) + ' removidos' : 'abrir' }));
  }

  function renderSpeed() {
    Object.keys(ui.speedBtns).forEach(function (k) { ui.speedBtns[k].setAttribute('aria-pressed', String(settings.speed === k)); });
  }

  function renderStats() {
    ui.removed.textContent = String(stats.removed);
    ui.skipped.textContent = String(stats.skipped);
    ui.failed.textContent = String(stats.failed);
    if (!ui.pill.classList.contains('hidden')) renderPill();
  }

  function updateButtons() {
    ui.start.disabled = running && !paused;
    ui.start.textContent = running && paused ? 'Continuar' : 'Começar';
    ui.pause.disabled = !running || paused;
    ui.stop.disabled = !running;
    ui.limit.disabled = running;
  }

  function setStatus(msg, kind) {
    ui.status.textContent = msg;
    ui.status.className = 'st' + (kind && kind !== 'idle' ? ' ' + kind : '');
  }

  function log(msg) {
    var t = new Date();
    var line = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2) + '  ' + msg;
    logLines.push(line);
    if (logLines.length > 400) logLines.shift();
    if (ui.log) {
      ui.log.appendChild(h('div', { text: line }));
      while (ui.log.childNodes.length > 200) ui.log.removeChild(ui.log.firstChild);
      ui.log.scrollTop = ui.log.scrollHeight;
    }
    try { console.log('[Faxina] ' + msg); } catch (e) { /* ok */ }
  }

  function saveSettings() { writeJSON(localStorage, SETTINGS_KEY, settings); }

  function onStart() {
    if (running && paused) { paused = false; updateButtons(); log('Continuando.'); return; }
    if (running) return;
    run();
  }
  function onPause() { if (!running) return; paused = true; updateButtons(); log('Pausado.'); setStatus('Pausando no próximo passo...', 'warn'); }
  function onStop() { if (!running) return; stopRequested = true; paused = false; log('Parando...'); setStatus('Parando no próximo passo...', 'warn'); }
  function onClose() {
    if (running && !confirm('A faxina tá rodando. Fechar o painel vai parar. Fechar mesmo?')) return;
    stopRequested = true; paused = false;
    if (IS_EXT) host.style.display = 'none'; // a extensão reabre pelo ícone
    else host.remove();
  }
  function resetStats() {
    if (running) return;
    stats.removed = stats.skipped = stats.failed = 0;
    attempts = {}; handled.clear();
    persist(); renderStats(); log('Contadores zerados.');
  }

  function copyLog() {
    var text = logLines.join('\n');
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      log(ok ? 'Log copiado.' : 'Não consegui copiar. Seleciona o texto do log na mão.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { log('Log copiado.'); }, fallback);
    } else fallback();
  }

  /* ------------------------------------------------------------------ *
   * Início
   * ------------------------------------------------------------------ */
  buildPanel();

  if (IS_EXT) {
    // Extensão: começa minimizado; o popup da extensão abre o painel.
    showPanel(false);
    try {
      chrome.runtime.onMessage.addListener(function (msg, _sender, reply) {
        if (!msg || (msg.type !== 'trr:open' && msg.type !== 'trr:start')) return;
        host.style.display = '';
        showPanel(true);
        if (msg.type === 'trr:start') onStart();
        reply({ ok: true, running: running, removed: stats.removed });
      });
    } catch (e) { /* ok */ }
    if (saved.resume) {
      showPanel(true);
      log('Retomando a faxina depois de recarregar a página...');
      setTimeout(run, 3500);
    }
  } else {
    showPanel(true);
    log('Painel aberto (v' + VERSION + '). Ajusta a velocidade e clica em Começar.');
    if (stats.removed) log('Contadores desta aba: ' + stats.removed + ' removidos até agora.');
  }
})();
