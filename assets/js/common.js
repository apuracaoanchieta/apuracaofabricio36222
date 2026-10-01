/* =====================================================================
 * Funções compartilhadas pelas três áreas (Fiscal, Apuração, Partido)
 * ===================================================================== */
var App = (function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  var DEMO = !CFG.API_URL || CFG.API_URL === 'DEMO';

  /* ---------------- Armazenamento local seguro ---------------- */
  var memoria = {};
  function lsGet(k, padrao) {
    try { var v = localStorage.getItem(k); return v === null ? (k in memoria ? memoria[k] : padrao) : JSON.parse(v); }
    catch (e) { return k in memoria ? memoria[k] : padrao; }
  }
  function lsSet(k, v) {
    memoria[k] = v;
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function lsDel(k) { delete memoria[k]; try { localStorage.removeItem(k); } catch (e) { /* ok */ } }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function carimbo(d) {
    d = d || new Date();
    var p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    return p.replace('T', ' ');
  }

  /* ---------------- MODO DEMONSTRAÇÃO (banco no navegador) ---------------- */
  var demoDb = null;
  function DemoDb() {
    var CH = 'fp_demo_v1';
    var salvo = lsGet(CH, null);
    var t = salvo ? salvo.t : {}, props = salvo ? salvo.props : {}, fotos = salvo ? salvo.fotos : {};
    Object.keys(Core.SCHEMA).forEach(function (k) { t[k] = t[k] || []; });
    function persistir() {
      if (!lsSet(CH, { t: t, props: props, fotos: fotos })) {
        // sem espaço: guarda sem as fotos reais
        var leve = {}; Object.keys(fotos).forEach(function (k) { if (fotos[k].length < 2000) leve[k] = fotos[k]; });
        lsSet(CH, { t: t, props: props, fotos: leve });
      }
    }
    function linha(nome, o) { var r = {}; Core.SCHEMA[nome].forEach(function (k) { r[k] = o[k] === undefined || o[k] === null ? '' : o[k]; }); return r; }
    var db = {
      read: function (n) { return t[n].map(function (r, i) { var o = Object.assign({}, r); o._row = i + 2; return o; }); },
      append: function (n, o) { t[n].push(linha(n, o)); persistir(); },
      update: function (n, row, o) { t[n][row - 2] = linha(n, o); persistir(); },
      remove: function (n, row) { t[n].splice(row - 2, 1); persistir(); },
      saveFoto: function (dataUrl) { var id = 'F' + uuid().slice(0, 8); fotos[id] = dataUrl; persistir(); return id; },
      getFoto: function (id) { return fotos[id] || fotoDemo(id); },
      prop: function (k) { return props[k]; },
      setProp: function (k, v) { props[k] = v; persistir(); },
      uuid: uuid,
      stamp: function () { return carimbo(); },
      lock: function (fn) { return fn(); }
    };
    if (!salvo) { Core.instalar(db, { apuracao: 'apuracao', partido: 'partido' }); gerarExemplos(db, t); persistir(); }
    return db;
  }
  function gerarExemplos(db, t) {
    var semente = 7;
    function rnd() { semente = (semente * 9301 + 49297) % 233280; return semente / 233280; }
    var nomes = ['Larissa Ambuzeiro', 'Beatriz Cicilioti', 'Magno Palaoro', 'Aline da Hora', 'Renan Mattos', 'Camila Ziviani', 'Gabriel Neves', 'Vanessa de Jesus', 'Anderson Barboza', 'Roseli Correa'];
    var locais = {}; t.LOCAIS.forEach(function (l) { locais[l.id] = l; });
    var inicio = Date.now() - 85 * 60000;
    t.SECOES.forEach(function (s, i) {
      if (rnd() > 0.62) return;
      var quando = new Date(inicio + rnd() * 80 * 60000);
      var votos = Math.round(25 + rnd() * 120);
      var validado = rnd() < 0.72;
      var nome = nomes[Math.floor(rnd() * nomes.length)];
      t.LANCAMENTOS.push({
        id: 'B' + (1000 + i), client_id: 'demo-' + i, recebido_em: carimbo(quando), origem: 'FISCAL', nome: nome,
        telefone: '2899' + String(1000000 + Math.floor(rnd() * 8999999)), municipio: 'ANCHIETA', local_id: s.local_id,
        local: locais[s.local_id].nome, secao_id: s.id, secao: s.numero, votos: votos, votos_informados: votos,
        foto_id: 'DEMO-' + s.numero + '-' + votos, status: validado ? 'VALIDADO' : 'PENDENTE',
        validado_por: validado ? 'apuracao' : '', validado_em: validado ? carimbo(new Date(quando.getTime() + 4 * 60000)) : '', obs: ''
      });
    });
    // um envio duplicado para demonstrar o alerta
    var pend = t.LANCAMENTOS.filter(function (l) { return l.status === 'PENDENTE'; })[0];
    if (pend) {
      var dup = Object.assign({}, pend, { id: 'B9999', client_id: 'demo-dup', nome: 'Jhonathan Silva', votos: pend.votos + 3, votos_informados: pend.votos + 3, foto_id: 'DEMO-' + pend.secao + '-' + (pend.votos + 3), obs: 'Seção já possuía envio', recebido_em: carimbo() });
      t.LANCAMENTOS.push(dup);
    }
    t.LANCAMENTOS.sort(function (a, b) { return a.recebido_em < b.recebido_em ? -1 : 1; });
  }
  /* Desenha um "boletim de urna" fictício para o modo demonstração */
  function fotoDemo(id) {
    var m = /^DEMO-(\d+)-(\d+)$/.exec(id || '');
    var c = document.createElement('canvas'); c.width = 420; c.height = 760;
    var g = c.getContext('2d');
    g.fillStyle = '#e9e4d8'; g.fillRect(0, 0, 420, 760);
    g.save(); g.translate(210, 380); g.rotate(-0.02); g.translate(-210, -380);
    g.fillStyle = '#fbfaf5'; g.fillRect(60, 20, 300, 720);
    g.fillStyle = '#222'; g.font = 'bold 15px monospace'; g.textAlign = 'center';
    var y = 60;
    function linha(txt, f) { g.font = (f || '13px') + ' monospace'; g.fillText(txt, 210, y); y += 26; }
    linha('BOLETIM DE URNA', 'bold 16px'); linha('ELEIÇÕES GERAIS 2026'); linha('MUNICÍPIO: ANCHIETA');
    linha('ZONA: 0042   SEÇÃO: ' + (m ? m[1] : '?'), 'bold 14px'); linha('------------------------------');
    linha('DEPUTADO ESTADUAL', 'bold 14px'); y += 6;
    g.textAlign = 'left';
    var cands = [['36222', 'FABRICIO PETRI', m ? m[2] : '?'], ['1xxxx', 'CANDIDATO A', '58'], ['4xxxx', 'CANDIDATO B', '41'], ['5xxxx', 'CANDIDATO C', '23']];
    cands.forEach(function (c, i) {
      g.font = (i === 0 ? 'bold ' : '') + '13px monospace';
      g.fillText(c[0] + ' ' + c[1], 78, y); g.textAlign = 'right'; g.fillText(c[2], 342, y); g.textAlign = 'left'; y += 26;
    });
    g.textAlign = 'center'; y += 10; linha('------------------------------'); linha('TOTAL APURADO ...'); y += 30;
    g.fillStyle = '#111';
    for (var i = 0; i < 26; i++) g.fillRect(110 + i * 8, y, (i % 3) + 2, 120);
    g.fillStyle = '#c0392b'; g.font = 'bold 12px sans-serif'; g.fillText('IMAGEM FICTÍCIA — DEMONSTRAÇÃO', 210, 720);
    g.restore();
    return c.toDataURL('image/jpeg', .8);
  }

  /* ---------------- Chamada à API ---------------- */
  function api(action, dados, opcoes) {
    opcoes = opcoes || {};
    var req = Object.assign({ action: action }, dados || {});
    if (DEMO) {
      if (!demoDb) demoDb = DemoDb();
      return new Promise(function (ok, falha) {
        setTimeout(function () {
          if (opcoes.simularOffline && !navigator.onLine) { var e0 = new Error('Sem conexão'); e0.rede = true; return falha(e0); }
          var r = JSON.parse(JSON.stringify(Core.handle(demoDb, req)));
          if (r.ok) ok(r); else { var e = new Error(r.erro); e.servidor = true; falha(e); }
        }, 250 + Math.random() * 350);
      });
    }
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, opcoes.timeout || 30000);
    return fetch(CFG.API_URL, {
      method: 'POST', body: JSON.stringify(req), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined
    }).then(function (resp) {
      if (!resp.ok) { var e = new Error('Servidor indisponível (' + resp.status + ')'); e.rede = true; throw e; }
      return resp.json().catch(function () { var e = new Error('Resposta inválida do servidor'); e.rede = true; throw e; });
    }, function (err) {
      var e = new Error(err && err.name === 'AbortError' ? 'A conexão demorou demais.' : 'Sem conexão com a internet.');
      e.rede = true; throw e;
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) {
        var e = new Error(r.erro || 'Erro desconhecido');
        e.servidor = true;
        if (/^Erro interno/.test(r.erro || '')) e.temporario = true;
        throw e;
      }
      return r;
    }, function (e) { clearTimeout(timer); throw e; });
  }

  /* ---------------- Sessão (login) ---------------- */
  var sessao = {
    get: function (area) {
      var s = lsGet('fp_sessao_' + area, null);
      if (!s || !s.token) return null;
      var exp = Number(String(s.token).split('|')[2] || 0);
      if (exp && exp < Date.now()) { lsDel('fp_sessao_' + area); return null; }
      return s;
    },
    set: function (area, s) { lsSet('fp_sessao_' + area, s); },
    sair: function (area) { lsDel('fp_sessao_' + area); }
  };

  /* ---------------- Utilidades de interface ---------------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function h(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var nf = new Intl.NumberFormat('pt-BR');
  function n(v) { return isNaN(v) || v === null || v === '' ? '—' : nf.format(v); }
  function pct(a, b) { return b ? (a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: a === b || a === 0 ? 0 : 1 }) + '%' : '0%'; }
  function hora(stamp) { return stamp ? String(stamp).substr(11, 5) : ''; }
  function dataHora(stamp) { if (!stamp) return ''; var s = String(stamp); return s.substr(8, 2) + '/' + s.substr(5, 2) + ' ' + s.substr(11, 5); }
  function tel(t) {
    var d = String(t || '').replace(/\D/g, '');
    if (d.length === 11) return '(' + d.substr(0, 2) + ') ' + d.substr(2, 5) + '-' + d.substr(7);
    if (d.length === 10) return '(' + d.substr(0, 2) + ') ' + d.substr(2, 4) + '-' + d.substr(6);
    return d;
  }
  function whatsapp(t) {
    var d = String(t || '').replace(/\D/g, '').replace(/^0+/, '');
    if (d.length <= 11) d = '55' + d;
    return 'https://wa.me/' + d;
  }
  function iniciais(nome) {
    var p = String(nome || '').trim().split(/\s+/);
    return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }

  var ICON = {
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    galeria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    nuvem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z"/><path d="M12 12v5M9.5 14.5 12 12l2.5 2.5"/></svg>',
    offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.8M17.4 11.2A10 10 0 0 1 19 12.9M12 20h.01"/></svg>',
    relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    atualizar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>',
    sair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    olho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    lapis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    lixo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    whats: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3z"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
    seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg>',
    girar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.7L21 8"/><path d="M21 3v5h-5"/></svg>'
  };

  function toast(msg, tipo, ms) {
    var box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var el = document.createElement('div');
    el.className = 'toast ' + (tipo || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 300); }, ms || 3500);
  }

  var modaisAbertos = 0;
  function modal(html, opcoes) {
    opcoes = opcoes || {};
    var fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = '<div class="modal ' + (opcoes.classe || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(fundo);
    document.body.style.overflow = 'hidden';
    modaisAbertos++;
    var fechado = false;
    function fechar() {
      if (fechado) return; fechado = true; modaisAbertos--;
      fundo.remove();
      if (!modaisAbertos) document.body.style.overflow = '';
      document.removeEventListener('keydown', esc);
      if (opcoes.aoFechar) opcoes.aoFechar();
    }
    function esc(e) { if (e.key === 'Escape' && opcoes.fecharFora !== false) fechar(); }
    document.addEventListener('keydown', esc);
    fundo.addEventListener('mousedown', function (e) { if (e.target === fundo && opcoes.fecharFora !== false) fechar(); });
    $$('[data-fechar]', fundo).forEach(function (b) { b.addEventListener('click', fechar); });
    var foco = $('[autofocus]', fundo);
    if (foco) setTimeout(function () { foco.focus(); }, 60);
    return { el: fundo.firstChild, fechar: fechar };
  }
  function haModal() { return modaisAbertos > 0; }
  function cabecalhoModal(titulo, sub) {
    return '<div class="topo"><div><h2>' + h(titulo) + '</h2>' + (sub ? '<div class="muted small">' + sub + '</div>' : '') +
      '</div><button class="fechar" data-fechar aria-label="Fechar">' + ICON.x + '</button></div>';
  }
  function confirmar(titulo, texto, rotuloOk, perigo) {
    return new Promise(function (ok) {
      var resp = false;
      var m = modal(cabecalhoModal(titulo) + '<p class="muted" style="margin:0">' + texto + '</p>' +
        '<div class="acoes"><button class="btn btn-sec" data-fechar>Cancelar</button>' +
        '<button class="btn ' + (perigo ? 'btn-perigo' : 'btn-azul') + '" id="cf-ok">' + h(rotuloOk || 'Confirmar') + '</button></div>',
        { aoFechar: function () { ok(resp); } });
      $('#cf-ok', m.el).addEventListener('click', function () { resp = true; m.fechar(); });
      setTimeout(function () { var b = $('#cf-ok', m.el); if (b) b.focus(); }, 60);
    });
  }
  function carregando(btn, sim, texto) {
    if (!btn) return;
    if (sim) {
      btn.dataset.html = btn.innerHTML; btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span>' + (texto ? ' ' + h(texto) : '');
    } else if (btn.dataset.html !== undefined) {
      btn.innerHTML = btn.dataset.html; btn.disabled = false; delete btn.dataset.html;
    }
  }

  /* Reduz a foto para envio rápido mantendo o BU legível */
  function comprimirFoto(arquivo, ladoMax, qualidade) {
    ladoMax = ladoMax || 1800; qualidade = qualidade || 0.72;
    return new Promise(function (ok, falha) {
      if (!arquivo || !/^image\//.test(arquivo.type || 'image/')) return falha(new Error('Escolha uma imagem.'));
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, hh = img.naturalHeight;
        var esc = Math.min(1, ladoMax / Math.max(w, hh));
        var c = document.createElement('canvas');
        c.width = Math.round(w * esc); c.height = Math.round(hh * esc);
        var g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', qualidade));
      };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error('Não foi possível ler a foto. Tente novamente.')); };
      img.src = url;
    });
  }
  function girarFoto(dataUrl) {
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = img.height; c.height = img.width;
        var g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(img, 0, 0);
        ok(c.toDataURL('image/jpeg', .8));
      };
      img.src = dataUrl;
    });
  }

  function bannerDemo(extra) {
    if (!DEMO) return;
    var d = document.createElement('div');
    d.className = 'demo-banner';
    d.innerHTML = '<b>MODO DEMONSTRAÇÃO</b> — dados fictícios, salvos só neste aparelho. ' + (extra || '');
    document.body.insertBefore(d, document.body.firstChild);
  }
  document.addEventListener('DOMContentLoaded', function () { $$('[data-voltar]').forEach(function (e) { e.innerHTML = ICON.seta; }); });
  function resetDemo() { lsDel('fp_demo_v1'); demoDb = null; }

  return {
    DEMO: DEMO, CFG: CFG, api: api, sessao: sessao, lsGet: lsGet, lsSet: lsSet, lsDel: lsDel, uuid: uuid, carimbo: carimbo,
    $: $, $$: $$, h: h, n: n, pct: pct, hora: hora, dataHora: dataHora, tel: tel, whatsapp: whatsapp, iniciais: iniciais,
    ICON: ICON, toast: toast, modal: modal, haModal: haModal, cabecalhoModal: cabecalhoModal, confirmar: confirmar,
    carregando: carregando, comprimirFoto: comprimirFoto, girarFoto: girarFoto, bannerDemo: bannerDemo, resetDemo: resetDemo
  };
})();
