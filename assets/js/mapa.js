/* MAPA DOS VOTOS — tela para a Apuração e para o candidato (somente visualização). */
(function () {
  'use strict';
  var $ = App.$, $$ = App.$$, h = App.h, n = App.n, ICON = App.ICON;
  var area = App.sessao.get('apuracao') ? 'apuracao' : 'partido';
  var sess = App.sessao.get(area);
  var mapa = null, resp = null, dados = null, sel = null, ordem = { campo: 'votos', desc: true }, timer = null, ocupado = false, localDestaque = null;

  App.bannerDemo('Senha: <b>apuracao</b> ou <b>partido</b>.');
  $$('[data-voltar]').forEach(function (e) { e.innerHTML = ICON.seta; });
  $('#btn-telao-mapa').innerHTML = ICON.tv + 'Modo telão';

  function ajustarVoltar() {
    var ap = sess && sess.perfil === 'APURACAO';
    var url = ap ? 'apuracao.html' : 'partido.html';
    $('#btn-voltar').href = url; $('#logo-voltar').href = url;
    $('#btn-voltar').innerHTML = '← <span class="oculto-mobile">Voltar ' + (ap ? 'à Apuração' : 'aos resultados') + '</span><span class="so-mobile">Voltar</span>';
  }

  function telaLogin() {
    $('#tela-app').hidden = true; $('#tela-login').hidden = false;
    if (App.DEMO) { var d = $('#l-demo'); d.hidden = false; d.innerHTML = ICON.info + '<div>Demonstração: senha <strong>apuracao</strong> ou <strong>partido</strong></div>'; }
    setTimeout(function () { $('#l-senha').focus({ preventScroll: true }); }, 50);
  }
  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#l-entrar'); App.carregando(b, true, 'Entrando…');
    App.api('login', { senha: $('#l-senha').value, perfil: 'PARTIDO' }).then(function (r) {
      area = r.perfil === 'APURACAO' ? 'apuracao' : 'partido';
      sess = { token: r.token, usuario: r.usuario, perfil: r.perfil }; App.sessao.set(area, sess); $('#l-senha').value = ''; iniciar();
    }).catch(function (err) { App.toast(err.message, 'erro'); }).then(function () { App.carregando(b, false); });
  });

  function iniciar() {
    $('#tela-login').hidden = true; $('#tela-app').hidden = false;
    ajustarVoltar();
    if (!mapa) {
      mapa = MapaES.criar($('#m-mapa'), {
        aoSelecionar: function (m) { sel = m; localDestaque = null; $('#m-estado').hidden = !m; renderLado(); },
        aoPintar: renderLegenda,
        aoClicarLocal: function (l) { localDestaque = l.id; mapa.destacarLocal(l.id); renderLado(); var it = $('[data-local="' + l.id + '"]'); if (it) it.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      });
      $$('.segmentado [data-metrica]').forEach(function (b) {
        b.onclick = function () { $$('.segmentado [data-metrica]').forEach(function (x) { x.classList.toggle('ativo', x === b); }); mapa.metrica(b.dataset.metrica); };
      });
      $('#m-estado').onclick = function () { mapa.selecionar(null); };
    }
    carregar(true);
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) carregar(false); }, Math.max(60, App.CFG.ATUALIZAR_A_CADA_SEGUNDOS || 30) * 1000);
  }

  function carregar(mostrarErro) {
    if (ocupado) return;
    ocupado = true;
    App.api('mapa.dados', { token: sess.token }).then(function (r) {
      resp = r;
      $('#t-atualizado').lastChild.textContent = 'Atualizado às ' + App.hora(r.agora);
      return mapa.atualizar(r).then(function (d) { dados = d; renderKpis(); renderTabela(); if (!sel) renderLado(); });
    }).catch(function (e) {
      if (/Sessão|acesso/.test(e.message)) { App.sessao.sair(area); sess = null; clearInterval(timer); telaLogin(); }
      if (mostrarErro) App.toast(e.message, 'erro');
    }).then(function () { ocupado = false; });
  }

  function lista() { return mapa.chaves().map(function (k) { return dados.muns[k] || { chave: k, nome: mapa.nomeDe(k), votos: 0, secoes: 0, apuradas: 0, aptos: 0, locais: [], semDado: true }; }); }

  function renderKpis() {
    var todos = lista(), com = todos.filter(function (m) { return m.votos > 0; });
    var melhor = com.slice().sort(function (a, b) { return b.votos - a.votos; })[0];
    var melhorPct = com.filter(function (m) { return m.aptos; }).sort(function (a, b) { return b.votos / b.aptos - a.votos / a.aptos; })[0];
    var locais = 0, locaisCom = 0; todos.forEach(function (m) { m.locais.forEach(function (l) { locais++; if (l.votos) locaisCom++; }); });
    $('#m-kpis').innerHTML =
      '<div class="kpi destaque"><div class="rot">Votos no Espírito Santo</div><div class="val num">' + n(dados.total) + '</div><div class="det">' + (dados.aptos ? MapaES.pct(dados.total, dados.aptos, 2) + ' dos eleitores dos municípios no sistema' : '') + '</div></div>' +
      '<div class="kpi"><div class="rot">Municípios com voto</div><div class="val num">' + com.length + ' <span class="de">/ ' + todos.length + '</span></div><div class="det">' + (todos.length - com.length) + ' sem nenhum voto</div></div>' +
      '<div class="kpi"><div class="rot">Mais votos</div><div class="val val-txt">' + (melhor ? h(melhor.nome) : '—') + '</div><div class="det">' + (melhor ? n(melhor.votos) + ' votos · ' + MapaES.pct(melhor.votos, dados.total) + ' do total' : '') + '</div></div>' +
      '<div class="kpi"><div class="rot">Maior % dos eleitores</div><div class="val val-txt">' + (melhorPct ? h(melhorPct.nome) : '—') + '</div><div class="det">' + (melhorPct ? MapaES.pct(melhorPct.votos, melhorPct.aptos, 2) + ' dos eleitores · ' + locaisCom + ' de ' + locais + ' locais com voto' : '') + '</div></div>';
  }

  function renderLegenda(lg) {
    $('#m-legenda').innerHTML = lg.itens.map(function (i) { return '<span><i style="background:' + i.cor + '"></i>' + i.texto + '</span>'; }).join('') +
      '<span><i class="zero"></i>Sem votos</span><span><i class="pt"></i>Local de votação</span>';
  }

  function barra(v, max) { return '<i class="mini"><b style="width:' + (max ? Math.max(2, v / max * 100) : 0) + '%"></b></i>'; }

  function renderLado() {
    var el = $('#m-lado');
    if (!dados) { el.innerHTML = '<div class="vazio">Carregando…</div>'; return; }
    if (!sel) {
      var todos = lista(), com = todos.filter(function (m) { return m.votos > 0; }).sort(function (a, b) { return b.votos - a.votos; });
      var sem = todos.filter(function (m) { return !(m.votos > 0); }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
      var max = com[0] ? com[0].votos : 1;
      el.innerHTML = '<h3>Onde ele teve mais votos</h3><ol class="rank">' + com.slice(0, 12).map(function (m, i) {
        return '<li><button type="button" data-mun="' + h(m.chave) + '"><span class="pos">' + (i + 1) + '</span><span class="nm">' + h(m.nome) + barra(m.votos, max) + '</span><span class="vt num">' + n(m.votos) + '<small>' + MapaES.pct(m.votos, dados.total) + '</small></span></button></li>';
      }).join('') + '</ol>' +
        '<h3 class="sem-tit">Sem nenhum voto <span class="muted">(' + sem.length + ')</span></h3>' +
        (sem.length ? '<div class="chips-sem">' + sem.map(function (m) { return '<button type="button" data-mun="' + h(m.chave) + '">' + h(m.nome) + '</button>'; }).join('') + '</div>' : '<p class="muted small">Ele teve voto em todos os municípios.</p>');
    } else {
      var m = sel, maxL = m.locais[0] ? m.locais[0].votos : 1, comL = m.locais.filter(function (l) { return l.votos; }).length;
      var semCoord = m.locais.filter(function (l) { return l.lat === null || l.lat === undefined; }).length;
      el.innerHTML = '<div class="lado-cab"><h3>' + h(m.nome) + '</h3><button type="button" class="btn btn-ghost btn-sm" id="m-fechar">Estado</button></div>' +
        '<div class="lado-kpis"><div><b class="num">' + n(m.votos) + '</b><span>votos</span></div><div><b class="num">' + MapaES.pct(m.votos, dados.total) + '</b><span>do total dele</span></div>' +
        '<div><b class="num">' + (m.aptos ? MapaES.pct(m.votos, m.aptos, 2) : '—') + '</b><span>dos eleitores</span></div><div><b class="num">' + comL + '/' + m.locais.length + '</b><span>locais com voto</span></div></div>' +
        (m.locais.length ? '<h4>Locais de votação</h4><ol class="rank rank-locais">' + m.locais.map(function (l, i) {
          return '<li><button type="button" data-local="' + h(l.id) + '" class="' + (localDestaque === l.id ? 'ativo' : '') + (l.votos ? '' : ' zero') + '"><span class="pos">' + (i + 1) + '</span><span class="nm">' + h(l.nome) +
            (l.bairro ? '<small>' + h(l.bairro) + '</small>' : '') + barra(l.votos, maxL) + '</span><span class="vt num">' + n(l.votos) + '<small>' + l.secoes + ' seç.</small></span></button></li>';
        }).join('') + '</ol>' : '<p class="muted small">Nenhum local de votação cadastrado neste município.</p>') +
        (semCoord ? '<p class="muted tiny">' + semCoord + ' local(is) sem coordenadas no TSE não aparecem no mapa.</p>' : '');
      $('#m-fechar').onclick = function () { mapa.selecionar(null); };
      $$('[data-local]', el).forEach(function (b) { b.onclick = function () { localDestaque = b.dataset.local; mapa.destacarLocal(localDestaque); $$('[data-local]', el).forEach(function (x) { x.classList.toggle('ativo', x === b); }); }; });
    }
    $$('[data-mun]', el).forEach(function (b) { b.onclick = function () { mapa.selecionar(b.dataset.mun); window.scrollTo({ top: $('.mapa-grade').offsetTop - 80, behavior: 'smooth' }); }; });
  }

  function renderTabela() {
    var todos = lista();
    var f = { nome: function (m) { return m.nome; }, votos: function (m) { return m.votos; }, pct: function (m) { return m.aptos ? m.votos / m.aptos : -1; }, aptos: function (m) { return m.aptos; }, secoes: function (m) { return m.secoes; } }[ordem.campo];
    todos.sort(function (a, b) { var x = f(a), y = f(b); var c = typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y; return ordem.desc ? -c : c; });
    function th(campo, txt, cls) { return '<th class="' + (cls || '') + ' ordenavel' + (ordem.campo === campo ? ' ord-' + (ordem.desc ? 'desc' : 'asc') : '') + '" data-ord="' + campo + '">' + txt + '</th>'; }
    $('#m-tab-sub').textContent = 'clique no título da coluna para ordenar';
    $('#m-tabela').innerHTML = '<thead><tr>' + th('nome', 'Município') + th('votos', 'Votos', 'r') + '<th class="r">% do total</th>' + th('aptos', 'Eleitores', 'r') + th('pct', '% dos eleitores', 'r') + th('secoes', 'Seções', 'r') + '<th class="r">Locais com voto</th></tr></thead><tbody>' +
      todos.map(function (m) {
        var lc = m.locais.filter(function (l) { return l.votos; }).length;
        return '<tr class="' + (m.votos ? '' : 'linha-zero') + '"><td data-l="Município"><button type="button" class="link" data-mun="' + h(m.chave) + '">' + h(m.nome) + '</button></td>' +
          '<td data-l="Votos" class="r num"><b>' + n(m.votos) + '</b></td><td data-l="% do total" class="r num">' + MapaES.pct(m.votos, dados.total) + '</td>' +
          '<td data-l="Eleitores" class="r num">' + (m.aptos ? n(m.aptos) : '—') + '</td><td data-l="% dos eleitores" class="r num">' + (m.aptos ? MapaES.pct(m.votos, m.aptos, 2) : '—') + '</td>' +
          '<td data-l="Seções" class="r num">' + (m.semDado ? '—' : m.apuradas + '/' + m.secoes) + '</td><td data-l="Locais com voto" class="r num">' + (m.locais.length ? lc + '/' + m.locais.length : '—') + '</td></tr>';
      }).join('') + '</tbody>';
    $$('#m-tabela [data-ord]').forEach(function (t) { t.onclick = function () { var c = t.dataset.ord; ordem = { campo: c, desc: ordem.campo === c ? !ordem.desc : c !== 'nome' }; renderTabela(); }; });
    $$('#m-tabela [data-mun]').forEach(function (b) { b.onclick = function () { mapa.selecionar(b.dataset.mun); window.scrollTo({ top: $('.mapa-grade').offsetTop - 80, behavior: 'smooth' }); }; });
  }

  if (sess) iniciar(); else telaLogin();
})();
