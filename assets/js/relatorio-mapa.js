/* RELATÓRIO DO MAPA DOS VOTOS (impressão / PDF): votos do candidato em cada município do ES.
 * Mesmos dados da tela Mapa dos votos (planilha + resultado oficial do TSE no estado). */
(function () {
  'use strict';
  /* votos válidos por município (TSE): carregam à parte e, quando chegam, a tela é redesenhada */
  var validosCache = null;
  function pedirValidos(depois) {
    if (validosCache || !window.EstadoTSE) return;
    EstadoTSE.validos().then(function (v) { if (v && Object.keys(v).length && !validosCache) { validosCache = v; depois(); } });
  }
  var $ = App.$, h = App.h, n = App.n;
  var area = App.sessao.get('apuracao') ? 'apuracao' : 'partido';
  var sess = App.sessao.get(area);
  var dados = null, resp = null, mapa = null, metrica = 'votos', ordem = 'votos';

  App.bannerDemo('Senha: <b>apuracao</b> ou <b>partido</b>.');
  App.$$('[data-voltar]').forEach(function (e) { e.innerHTML = App.ICON.seta; });

  function telaLogin() {
    $('#tela-rel').hidden = true; $('#tela-login').hidden = false;
    if (App.DEMO) { var d = $('#l-demo'); d.hidden = false; d.innerHTML = App.ICON.info + '<div>Demonstração: senha <strong>apuracao</strong> ou <strong>partido</strong></div>'; }
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
  function iniciar() { $('#tela-login').hidden = true; $('#tela-rel').hidden = false; carregar(); }

  function carregar() {
    var b = $('#r-atualizar'); App.carregando(b, true, 'Atualizando…');
    $('#rel').innerHTML = '<p class="rel-carregando">Carregando os votos de todos os municípios…</p>';
    mapa = null;
    return Promise.all([App.api('partido.dados', { token: sess.token }), EstadoTSE.carregar(), MapaES.carregarGeo(), EstadoTSE.validos()]).then(function (x) {
      if (x[3] && Object.keys(x[3]).length) validosCache = x[3];
      resp = MapaES.deVisao(EstadoTSE.mesclar(x[0]), validosCache);
      dados = MapaES.preparar(resp);
      desenhar();
    }).catch(function (e) {
      if (/Sessão|acesso/.test(e.message)) { App.sessao.sair(area); sess = null; telaLogin(); }
      App.toast(e.message, 'erro');
      $('#rel').innerHTML = '<p class="rel-carregando">Não foi possível carregar: ' + h(e.message) + '</p>';
    }).then(function () { App.carregando(b, false); });
  }
  $('#r-metrica').addEventListener('change', function () { metrica = this.value; if (mapa) { mapa.metrica(metrica); } desenharTabela(); });
  $('#r-ordem').addEventListener('change', function () { ordem = this.value; desenharTabela(); });
  $('#r-atualizar').addEventListener('click', carregar);
  $('#r-imprimir').addEventListener('click', function () { window.print(); });

  function pct(a, b, c) { return MapaES.pct(a, b, c); }
  function dataBr(s) { s = String(s || ''); return s.length >= 16 ? s.substr(8, 2) + '/' + s.substr(5, 2) + '/' + s.substr(0, 4) + ' às ' + s.substr(11, 5) : s; }

  /* os 78 municípios (inclusive os sem nenhum dado no sistema) */
  function todos() {
    var lista = [];
    MapaES.chavesGeo().forEach(function (g) {
      var m = dados.muns[g.chave];
      lista.push(m || { chave: g.chave, nome: g.nome.toUpperCase(), votos: 0, secoes: 0, apuradas: 0, aptos: 0, locais: [] });
    });
    return lista;
  }

  function desenhar() {
    var cfg = resp.config || {}, lista = todos();
    var com = lista.filter(function (m) { return m.votos > 0; }).sort(function (a, b) { return b.votos - a.votos; });
    var sem = lista.filter(function (m) { return !(m.votos > 0); }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    var melhorPct = com.filter(function (m) { return m.validos; }).sort(function (a, b) { return b.votos / b.validos - a.votos / a.validos; })[0];
    var secoes = 0, apuradas = 0; lista.forEach(function (m) { secoes += m.secoes; apuradas += m.apuradas; });
    var completo = secoes && apuradas >= secoes;
    var agora = new Date(), gerado = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    var max = com[0] ? com[0].votos : 1;

    $('#rel').innerHTML =
      '<header class="rel-cab"><img class="rel-logo" src="assets/img/logo-480.png" alt="">' +
      '<div class="rel-cab-txt"><h1>Mapa dos votos — Espírito Santo</h1>' +
      '<p class="rel-cand">' + h(cfg.candidato_nome || 'Fabricio Petri') + ' · ' + h(cfg.candidato_numero || '36.222') + ' · Deputado Estadual · ' + h(cfg.partido || 'AGIR') + '</p>' +
      '<p class="rel-meta">Eleições 2026 · 1º turno · Gerado em ' + gerado + '</p></div>' +
      '<div class="rel-selo ' + (completo ? 'final' : 'parcial') + '">' + (completo ? 'RESULTADO FINAL' : 'RESULTADO PARCIAL') + '<small>' + pct(apuradas, secoes) + ' das seções</small></div></header>' +

      '<div class="rel-kpis rel-kpis-4">' +
      '<div class="rel-kpi destaque"><span>Votos no Espírito Santo</span><b>' + n(dados.total) + '</b><em>' + (dados.validos ? pct(dados.total, dados.validos, 2) + ' dos votos válidos do estado' : (dados.aptos ? pct(dados.total, dados.aptos, 2) + ' dos eleitores do estado' : '')) + '</em></div>' +
      '<div class="rel-kpi"><span>Municípios com voto</span><b>' + com.length + ' <small style="font-size:12pt;color:#4b6576">/ ' + lista.length + '</small></b><em>' + sem.length + ' sem nenhum voto</em></div>' +
      '<div class="rel-kpi"><span>Mais votos</span><b class="rel-kpi-txt">' + (com[0] ? h(com[0].nome) : '—') + '</b><em>' + (com[0] ? n(com[0].votos) + ' votos · ' + pct(com[0].votos, dados.total) + ' do total' : '') + '</em></div>' +
      '<div class="rel-kpi"><span>Maior % dos votos válidos</span><b class="rel-kpi-txt">' + (melhorPct ? h(melhorPct.nome) : '—') + '</b><em>' + (melhorPct ? pct(melhorPct.votos, melhorPct.validos, 2) + ' dos votos válidos da cidade' : '') + '</em></div>' +
      '</div>' +

      '<div class="relm-grade">' +
      '<section class="relm-mapa"><div class="relm-mapa-svg" id="rm-mapa"></div><div class="relm-legenda" id="rm-legenda"></div></section>' +
      '<section class="relm-top"><h2>Os 15 municípios com mais votos</h2><ol>' + com.slice(0, 15).map(function (m, i) {
        return '<li><span class="p">' + (i + 1) + 'º</span><span class="nm">' + h(m.nome) + '<i><b style="width:' + Math.max(2, m.votos / max * 100) + '%"></b></i></span><span class="v">' + n(m.votos) + '<small>' + pct(m.votos, dados.total) + '</small></span></li>';
      }).join('') + '</ol></section></div>' +

      '<h2 class="quebra-antes">Todos os municípios</h2><table class="rel-tab" id="rm-tabela"></table>' +

      '<h2>Municípios sem nenhum voto (' + sem.length + ')</h2>' +
      (sem.length ? '<p class="relm-sem">' + sem.map(function (m) { return h(m.nome); }).join(' · ') + '</p>' : '<p class="relm-sem">Ele teve voto em todos os municípios.</p>') +

      '<footer class="rel-rodape"><p>Fonte: boletins de urna oficiais do TSE (resultados.tse.jus.br), seção por seção, somados por município' +
      (cfg.municipio_principal ? '; em ' + h(String(cfg.municipio_principal).toUpperCase()) + ', a apuração da campanha conferida com os boletins' : '') +
      '. "% dos válidos" = votos do candidato ÷ votos válidos para deputado estadual no município (votos em candidatos e legendas; brancos e nulos não entram). "% dos eleitores" = votos do candidato ÷ eleitores aptos do município. Cores do mapa em 5 faixas (do mais claro, menos votos, ao mais escuro, mais votos); hachurado = nenhum voto.</p>' +
      '<p class="rel-credito">Sistema de apuração desenvolvido por <b>DERYCK NOGUEIRA</b></p></footer>';

    mapa = MapaES.criar($('#rm-mapa'), {
      semClique: true,
      aoPintar: function (lg) {
        $('#rm-legenda').innerHTML = '<b>' + ({ votos: 'Votos', validos: '% dos votos válidos', pct: '% dos eleitores' }[metrica]) + '</b>' + lg.itens.map(function (i) { return '<span><i style="background:' + i.cor + '"></i>' + i.texto + '</span>'; }).join('') + '<span><i class="zero"></i>sem votos</span>';
      }
    });
    mapa.metrica(metrica);
    mapa.atualizar(resp);
    desenharTabela();
  }

  function desenharTabela() {
    if (!dados || !$('#rm-tabela')) return;
    var lista = todos();
    var rank = lista.filter(function (m) { return m.votos > 0; }).sort(function (a, b) { return b.votos - a.votos; });
    var pos = {}; rank.forEach(function (m, i) { pos[m.chave] = i + 1; });
    var f = { votos: function (a, b) { return b.votos - a.votos || a.nome.localeCompare(b.nome, 'pt-BR'); },
      pct: function (a, b) { return (b.aptos ? b.votos / b.aptos : -1) - (a.aptos ? a.votos / a.aptos : -1) || a.nome.localeCompare(b.nome, 'pt-BR'); },
      validos: function (a, b) { return (b.validos ? b.votos / b.validos : -1) - (a.validos ? a.votos / a.validos : -1) || a.nome.localeCompare(b.nome, 'pt-BR'); },
      nome: function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); } }[ordem];
    lista.sort(f);
    var t = { votos: 0, aptos: 0, secoes: 0, apuradas: 0, validos: 0 };
    $('#rm-tabela').innerHTML = '<thead><tr><th class="r">Pos.</th><th>Município</th><th class="r">Votos</th><th class="r">% do total</th><th class="r">Votos válidos</th><th class="r">% dos válidos</th><th class="r">Eleitores</th><th class="r">% dos eleitores</th><th class="r">Seções</th></tr></thead><tbody>' +
      lista.map(function (m) {
        t.votos += m.votos; t.aptos += m.aptos; t.secoes += m.secoes; t.apuradas += m.apuradas; t.validos += m.validos || 0;
        return '<tr' + (m.votos ? '' : ' class="zero"') + '><td class="r">' + (pos[m.chave] ? pos[m.chave] + 'º' : '—') + '</td><td>' + h(m.nome) + '</td><td class="r"><b>' + n(m.votos) + '</b></td><td class="r">' + pct(m.votos, dados.total) + '</td>' +
          '<td class="r">' + (m.validos ? n(m.validos) : '—') + '</td><td class="r">' + (m.validos ? pct(m.votos, m.validos, 2) : '—') + '</td>' +
          '<td class="r">' + (m.aptos ? n(m.aptos) : '—') + '</td><td class="r">' + (m.aptos ? pct(m.votos, m.aptos, 2) : '—') + '</td><td class="r">' + (m.secoes ? m.apuradas + '/' + m.secoes : '—') + '</td></tr>';
      }).join('') + '<tr class="total"><td></td><td>Total</td><td class="r">' + n(t.votos) + '</td><td class="r">100%</td><td class="r">' + (t.validos ? n(t.validos) : '—') + '</td><td class="r">' + (t.validos ? pct(t.votos, t.validos, 2) : '—') + '</td><td class="r">' + n(t.aptos) + '</td><td class="r">' + pct(t.votos, t.aptos, 2) + '</td><td class="r">' + t.apuradas + '/' + t.secoes + '</td></tr></tbody>';
  }

  if (sess) iniciar(); else telaLogin();
})();
