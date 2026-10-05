/* MAPA DO ESPÍRITO SANTO — votos do candidato por município e por local de votação.
 * Componente sem bibliotecas: desenha o SVG a partir de assets/data/es-municipios.json.
 * Usado em mapa.html (Apuração e candidato) e telao-mapa.html. Depende de App (common.js). */
var MapaES = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  // escala sequencial (um tom só, do claro ao escuro) — azul da campanha
  var RAMPA = ['#cfe9f3', '#8fcde4', '#45abd3', '#0a83b5', '#0b4f78'];
  var COR_ZERO = '#e9eef1';
  var geoPromessa = null;

  function norm(v) { return String(v || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function carregarGeo() {
    if (!geoPromessa) geoPromessa = fetch('assets/data/es-municipios.json').then(function (r) { if (!r.ok) throw new Error('Mapa não encontrado.'); return r.json(); });
    return geoPromessa;
  }
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function pct(a, b, casas) { return b ? (a / b * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas === undefined ? 1 : casas, maximumFractionDigits: casas === undefined ? 1 : casas }) + '%' : '—'; }

  /* Organiza a resposta de mapa.dados */
  function preparar(d) {
    var muns = {}, total = 0, aptos = 0;
    d.municipios.forEach(function (m) {
      var k = norm(m.municipio);
      muns[k] = { chave: k, nome: m.municipio, votos: m.votos, secoes: m.secoes, apuradas: m.apuradas, aptos: m.aptos, pendentes: m.pendentes || 0, locais: [] };
      total += m.votos; aptos += m.aptos;
    });
    d.locais.forEach(function (x) {
      var k = norm(x[1]), m = muns[k]; if (!m) return;
      m.locais.push({ id: x[0], nome: x[2], bairro: x[3], lat: x[4], lng: x[5], votos: x[6], secoes: x[7], apuradas: x[8], aptos: x[9], zona: x[10] });
    });
    Object.keys(muns).forEach(function (k) { muns[k].locais.sort(function (a, b) { return b.votos - a.votos || a.nome.localeCompare(b.nome, 'pt-BR'); }); });
    return { muns: muns, total: total, aptos: aptos };
  }

  /* quebras por quantis entre os municípios com voto (5 faixas) */
  function quebras(valores) {
    var v = valores.filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    if (!v.length) return [];
    var q = [];
    for (var i = 1; i < RAMPA.length; i++) q.push(v[Math.min(v.length - 1, Math.floor(v.length * i / RAMPA.length))]);
    // remove repetidas
    return q.filter(function (x, i) { return i === 0 || x > q[i - 1]; });
  }
  function classe(v, qs) { if (!(v > 0)) return -1; var i = 0; while (i < qs.length && v > qs[i]) i++; return Math.min(i, RAMPA.length - 1); }

  function criar(alvo, opcoes) {
    opcoes = opcoes || {};
    var estado = { dados: null, geo: null, sel: null, metrica: 'votos', anim: null, vb: null, vbEstado: null };
    alvo.classList.add('mapa-es');
    alvo.innerHTML = '';
    var svg = el('svg', { role: 'img', 'aria-label': 'Mapa do Espírito Santo com os votos por município', preserveAspectRatio: 'xMidYMid meet' });
    var defs = el('defs', {});
    var pat = el('pattern', { id: 'mes-zero-' + (Math.random() * 1e6 | 0), width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(el('rect', { width: 6, height: 6, fill: COR_ZERO }));
    pat.appendChild(el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#c9d3d9', 'stroke-width': 1.6 }));
    defs.appendChild(pat); svg.appendChild(defs);
    var gMun = el('g', { class: 'mes-muns' }), gSel = el('g', { class: 'mes-sel' }), gPts = el('g', { class: 'mes-pts' }), gRot = el('g', { class: 'mes-rot' });
    svg.appendChild(gMun); svg.appendChild(gSel); svg.appendChild(gPts); svg.appendChild(gRot);
    alvo.appendChild(svg);
    var dica = document.createElement('div'); dica.className = 'mes-dica'; dica.hidden = true; alvo.appendChild(dica);
    var paths = {};

    function projetar(geo) {
      var minX = 180, maxX = -180, minY = 90, maxY = -90;
      geo.forEach(function (f) { f.p.forEach(function (poly) { poly[0].forEach(function (c) { if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0]; if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1]; }); }); });
      var lat0 = (minY + maxY) / 2, kx = Math.cos(lat0 * Math.PI / 180), K = 1000 / ((maxX - minX) * kx);
      estado.proj = function (lng, lat) { return [(lng - minX) * kx * K, (maxY - lat) * K]; };
      estado.vbEstado = [-10, -10, (maxX - minX) * kx * K + 20, (maxY - minY) * K + 20];
    }
    function desenharBase(geo) {
      projetar(geo);
      geo.forEach(function (f) {
        var d = '', bx = [1e9, 1e9, -1e9, -1e9];
        f.p.forEach(function (poly) {
          poly.forEach(function (ring) {
            ring.forEach(function (c, i) {
              var p = estado.proj(c[0], c[1]);
              d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
              if (p[0] < bx[0]) bx[0] = p[0]; if (p[1] < bx[1]) bx[1] = p[1]; if (p[0] > bx[2]) bx[2] = p[0]; if (p[1] > bx[3]) bx[3] = p[1];
            });
            d += 'Z';
          });
        });
        var k = norm(f.n);
        var path = el('path', { d: d, class: 'mes-mun', tabindex: opcoes.telao ? -1 : 0, 'data-k': k });
        path.__bbox = bx; path.__nome = f.n;
        path.addEventListener('mouseenter', function (e) { if (estado.sel !== k) mostrarDicaMun(k, e); path.classList.add('hover'); });
        path.addEventListener('mousemove', function (e) { if (estado.sel !== k) moverDica(e); });
        path.addEventListener('mouseleave', function () { esconderDica(); path.classList.remove('hover'); });
        path.addEventListener('click', function () { if (!opcoes.semClique) selecionar(estado.sel === k ? null : k, true); });
        path.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selecionar(estado.sel === k ? null : k, true); } });
        gMun.appendChild(path);
        paths[k] = path;
      });
      definirViewBox(estado.vbEstado, false);
    }

    function nomeExibir(k) { var m = estado.dados && estado.dados.muns[k]; return m ? m.nome : (paths[k] ? paths[k].__nome.toUpperCase() : k); }
    function valorMun(m) { if (!m) return 0; return estado.metrica === 'pct' ? (m.aptos ? m.votos / m.aptos : 0) : m.votos; }

    function pintar() {
      if (!estado.dados) return;
      var muns = estado.dados.muns;
      var vals = Object.keys(paths).map(function (k) { return valorMun(muns[k]); });
      estado.qs = quebras(vals);
      Object.keys(paths).forEach(function (k) {
        var m = muns[k], c = classe(valorMun(m), estado.qs), p = paths[k];
        p.setAttribute('fill', c < 0 ? 'url(#' + pat.id + ')' : RAMPA[c]);
        p.classList.toggle('sem-voto', c < 0);
        p.classList.toggle('sem-dado', !m);
        var rot = (m ? m.nome : p.__nome) + ': ' + (m ? App.n(m.votos) + ' votos' : 'sem dados');
        p.setAttribute('aria-label', rot);
      });
      if (opcoes.aoPintar) opcoes.aoPintar(legenda());
    }
    function legenda() {
      var qs = estado.qs || [], itens = [], fmt = estado.metrica === 'pct' ? function (v) { return pct(v, 1, 2); } : function (v) { return App.n(Math.round(v)); };
      var ini = estado.metrica === 'pct' ? 0 : 1;
      for (var i = 0; i <= qs.length && i < RAMPA.length; i++) {
        var de = i === 0 ? ini : qs[i - 1], ate = qs[i];
        itens.push({ cor: RAMPA[i], texto: ate === undefined ? 'acima de ' + fmt(de) : (i === 0 ? 'até ' + fmt(ate) : fmt(de) + ' – ' + fmt(ate)) });
      }
      return { itens: itens, zero: 'url(#' + pat.id + ')', corZero: COR_ZERO };
    }

    /* ---------- dica (tooltip) ---------- */
    function mostrarDicaMun(k, e) {
      var m = estado.dados && estado.dados.muns[k];
      dica.innerHTML = '<b>' + App.h(m ? m.nome : paths[k].__nome) + '</b>' +
        (m ? '<span class="v">' + App.n(m.votos) + ' voto' + (m.votos === 1 ? '' : 's') + '</span>' +
          '<span>' + pct(m.votos, estado.dados.total) + ' dos votos dele no estado</span>' +
          (m.aptos ? '<span>' + pct(m.votos, m.aptos, 2) + ' dos eleitores da cidade</span>' : '') +
          '<span>' + m.apuradas + ' de ' + m.secoes + ' seções apuradas</span>'
          : '<span>Sem dados no sistema</span>') +
        (!opcoes.semClique ? '<em>' + (estado.sel === k ? 'Clique para tirar a seleção' : 'Clique para ver os detalhes') + '</em>' : '');
      dica.hidden = false; moverDica(e);
    }
    function mostrarDicaLocal(l, e) {
      dica.innerHTML = '<b>' + App.h(l.nome) + '</b>' + (l.bairro ? '<span>' + App.h(l.bairro) + '</span>' : '') +
        '<span class="v">' + App.n(l.votos) + ' voto' + (l.votos === 1 ? '' : 's') + '</span>' +
        '<span>' + l.secoes + ' seç' + (l.secoes === 1 ? 'ão' : 'ões') + (l.aptos ? ' · ' + App.n(l.aptos) + ' eleitores · ' + pct(l.votos, l.aptos, 2) : '') + '</span>';
      dica.hidden = false; moverDica(e);
    }
    function moverDica(e) {
      var r = alvo.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      var w = dica.offsetWidth, hh = dica.offsetHeight;
      dica.style.left = Math.max(6, Math.min(r.width - w - 6, x + 14)) + 'px';
      dica.style.top = Math.max(6, y - hh - 12 < 0 ? y + 18 : y - hh - 12) + 'px';
    }
    function esconderDica() { dica.hidden = true; }

    /* ---------- zoom ---------- */
    function definirViewBox(vb, animar) {
      if (estado.anim) cancelAnimationFrame(estado.anim);
      var de = estado.vb || vb, ini = performance.now(), dur = animar ? 650 : 0;
      function passo(t) {
        var k = dur ? Math.min(1, (t - ini) / dur) : 1, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        var atual = de.map(function (v, i) { return v + (vb[i] - v) * e; });
        svg.setAttribute('viewBox', atual.map(function (v) { return v.toFixed(2); }).join(' '));
        estado.vb = atual;
        escalarPontos();
        if (k < 1) estado.anim = requestAnimationFrame(passo);
      }
      if (dur) estado.anim = requestAnimationFrame(passo); else passo(ini);
    }
    function escala() { return estado.vb ? estado.vb[2] / (svg.clientWidth || 600) : 1; } // unidades do mapa por pixel
    function escalarPontos() {
      var s = escala();
      Array.prototype.forEach.call(gPts.childNodes, function (c) { c.setAttribute('r', (c.__rpx * s).toFixed(2)); c.setAttribute('stroke-width', (1.5 * s).toFixed(2)); });
      Array.prototype.forEach.call(gRot.childNodes, function (t) { t.setAttribute('font-size', (t.__px * s).toFixed(2)); t.setAttribute('stroke-width', (3 * s).toFixed(2)); });
    }

    function selecionar(k, animar) {
      estado.sel = k && paths[k] ? k : null;
      esconderDica();
      Object.keys(paths).forEach(function (x) { paths[x].classList.toggle('apagado', !!estado.sel && x !== estado.sel); paths[x].classList.toggle('ativo', x === estado.sel); });
      gSel.innerHTML = ''; gPts.innerHTML = ''; gRot.innerHTML = '';
      if (estado.sel) {
        // só o município: destaca o contorno, sem aproximar e sem locais de votação
        var c = paths[estado.sel].cloneNode(false); c.removeAttribute('tabindex'); c.setAttribute('class', 'mes-mun-borda'); gSel.appendChild(c);
      }
      if (opcoes.aoSelecionar) opcoes.aoSelecionar(estado.sel ? estado.dados && estado.dados.muns[estado.sel] || { nome: paths[estado.sel].__nome.toUpperCase(), chave: estado.sel, votos: 0, secoes: 0, apuradas: 0, aptos: 0, locais: [] } : null);
    }
    function desenharPontos(k) {
      var m = estado.dados && estado.dados.muns[k]; if (!m) return;
      var max = Math.max.apply(null, m.locais.map(function (l) { return l.votos; }).concat([1]));
      // maiores primeiro, para os pequenos ficarem por cima
      m.locais.slice().sort(function (a, b) { return b.votos - a.votos; }).forEach(function (l) {
        if (l.lat === null || l.lng === null || l.lat === undefined) return;
        var p = estado.proj(l.lng, l.lat);
        var c = el('circle', { cx: p[0].toFixed(2), cy: p[1].toFixed(2), class: 'mes-pt' + (l.votos ? '' : ' zero') });
        c.__rpx = l.votos ? 4 + 18 * Math.sqrt(l.votos / max) : 3.5;
        c.addEventListener('mouseenter', function (e) { mostrarDicaLocal(l, e); });
        c.addEventListener('mousemove', moverDica);
        c.addEventListener('mouseleave', esconderDica);
        c.addEventListener('click', function (e) { e.stopPropagation(); if (opcoes.aoClicarLocal) opcoes.aoClicarLocal(l); });
        gPts.appendChild(c);
      });
      escalarPontos();
    }
    function destacarLocal(id) {
      Array.prototype.forEach.call(gPts.childNodes, function (c) { c.classList.remove('destaque'); });
      var m = estado.sel && estado.dados.muns[estado.sel]; if (!m || !id) return;
      var l = m.locais.filter(function (x) { return x.id === id; })[0]; if (!l || l.lat === null) return;
      var p = estado.proj(l.lng, l.lat);
      Array.prototype.forEach.call(gPts.childNodes, function (c) { if (Math.abs(+c.getAttribute('cx') - p[0]) < .01 && Math.abs(+c.getAttribute('cy') - p[1]) < .01) { c.classList.add('destaque'); gPts.appendChild(c); } });
    }

    window.addEventListener('resize', function () { estado.vb = null; definirViewBox(estado.vbEstado, false); });

    var pronto = carregarGeo().then(function (geo) { estado.geo = geo; desenharBase(geo); if (estado.dados) pintar(); });

    return {
      pronto: pronto,
      atualizar: function (resposta) {
        estado.dados = preparar(resposta);
        esconderDica();
        return pronto.then(function () {
          pintar();
          if (estado.sel && opcoes.aoSelecionar) opcoes.aoSelecionar(estado.dados.muns[estado.sel] || null);
          return estado.dados;
        });
      },
      selecionar: function (k, animar) { return pronto.then(function () { selecionar(k ? norm(k) : null, animar); }); },
      selecionado: function () { return estado.sel; },
      metrica: function (m) { estado.metrica = m === 'pct' ? 'pct' : 'votos'; pintar(); },
      destacarLocal: destacarLocal,
      chaves: function () { return Object.keys(paths); },
      nomeDe: nomeExibir,
      legenda: legenda
    };
  }

  return { criar: criar, norm: norm, preparar: preparar, pct: pct, RAMPA: RAMPA };
})();
