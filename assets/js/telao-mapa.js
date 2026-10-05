/* TELÃO DO MAPA DOS VOTOS: mapa do ES com os votos do candidato; pode passear sozinho pelos municípios. */
(function () {
  'use strict';
  var $ = App.$, h = App.h, n = App.n;
  var sess = App.sessao.get('apuracao') || App.sessao.get('partido');
  var params = new URLSearchParams(location.search);
  var mapa = null, dados = null, timer = null, ocupado = false, metrica = params.get('metrica') === 'pct' ? 'pct' : 'votos';
  var tour = params.get('passeio') === '1', timerTour = null, idxTour = -1, sel = null;

  App.bannerDemo('Senha: <b>partido</b>.');
  App.$$('[data-voltar]').forEach(function (e) { e.innerHTML = App.ICON.seta; });

  function telaLogin() {
    $('#telao').hidden = true; $('#tela-login').hidden = false; document.body.style.overflow = 'auto';
    if (App.DEMO) { var d = $('#l-demo'); d.hidden = false; d.innerHTML = App.ICON.info + '<div>Demonstração: senha <strong>partido</strong></div>'; }
    setTimeout(function () { $('#l-senha').focus({ preventScroll: true }); }, 50);
  }
  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#l-entrar'); App.carregando(b, true, 'Entrando…');
    App.api('login', { senha: $('#l-senha').value, perfil: 'PARTIDO' }).then(function (r) {
      sess = { token: r.token, usuario: r.usuario, perfil: r.perfil }; App.sessao.set(r.perfil === 'APURACAO' ? 'apuracao' : 'partido', sess); $('#l-senha').value = ''; iniciar();
    }).catch(function (err) { App.toast(err.message, 'erro'); }).then(function () { App.carregando(b, false); });
  });

  function iniciar() {
    $('#tela-login').hidden = true; $('#telao').hidden = false; document.body.style.overflow = '';
    relogio(); setInterval(relogio, 1000);
    mapa = MapaES.criar($('#tm-mapa'), {
      telao: true,
      aoSelecionar: function (m) { sel = m; desenharLado(); },
      aoPintar: function (lg) {
        $('#tm-legenda').innerHTML = lg.itens.map(function (i) { return '<span><i style="background:' + i.cor + '"></i>' + i.texto + '</span>'; }).join('') + '<span><i class="zero"></i>sem votos</span>';
      }
    });
    mapa.metrica(metrica); ajustarBotoes();
    carregar();
    timer = setInterval(carregar, Math.max(60, App.CFG.ATUALIZAR_A_CADA_SEGUNDOS || 30) * 1000);
    $('#telao').classList.add('mostrar-controles');
    setTimeout(function () { $('#telao').classList.remove('mostrar-controles'); }, 5000);
    ajustarTour();
  }
  function relogio() { $('#t-hora').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date()); }

  function carregar() {
    if (ocupado || !sess) return;
    ocupado = true;
    App.api('mapa.dados', { token: sess.token }).then(function (r) {
      $('#telao').classList.remove('off');
      $('#t-atualizado').textContent = 'atualizado às ' + App.hora(r.agora);
      return mapa.atualizar(r).then(function (d) { dados = d; desenharLado(); });
    }).catch(function (e) {
      $('#telao').classList.add('off');
      $('#t-atualizado').textContent = 'sem conexão — tentando de novo';
      if (/Sessão|acesso/.test(e.message)) { ['apuracao', 'partido'].forEach(function (a) { var x = App.sessao.get(a); if (x && sess && x.token === sess.token) App.sessao.sair(a); }); sess = null; clearInterval(timer); telaLogin(); App.toast(e.message, 'erro'); }
    }).then(function () { ocupado = false; });
  }

  function ranking() {
    return mapa.chaves().map(function (k) { return dados.muns[k] || { chave: k, nome: mapa.nomeDe(k), votos: 0, aptos: 0, locais: [] }; })
      .sort(function (a, b) { return b.votos - a.votos; });
  }
  function desenharLado() {
    if (!dados) return;
    var todos = ranking(), com = todos.filter(function (m) { return m.votos > 0; });
    if (!sel) {
      $('#tm-titulo').textContent = 'ESPÍRITO SANTO';
      $('#tm-rot-total').textContent = 'VOTOS NO ESTADO';
      $('#tm-votos').textContent = n(dados.total);
      $('#tm-sub').innerHTML = '<b>' + com.length + '</b> de ' + todos.length + ' municípios com voto';
      $('#tm-rot-rank').textContent = 'MUNICÍPIOS COM MAIS VOTOS';
      var max = com[0] ? com[0].votos : 1;
      $('#tm-ranking').innerHTML = com.slice(0, 7).map(function (m, i) {
        return '<li><span class="p">' + (i + 1) + 'º</span><span class="nm">' + h(m.nome) + '<i><b style="width:' + Math.max(2, m.votos / max * 100) + '%"></b></i></span><span class="v">' + n(m.votos) + '</span></li>';
      }).join('');
      $('#tm-rodape').textContent = (todos.length - com.length) + ' municípios sem nenhum voto aparecem hachurados no mapa.';
    } else {
      var m = sel, pos = todos.indexOf(todos.filter(function (x) { return x.chave === m.chave; })[0]) + 1;
      $('#tm-titulo').textContent = m.nome;
      $('#tm-rot-total').textContent = 'VOTOS EM ' + m.nome;
      $('#tm-votos').textContent = n(m.votos);
      $('#tm-sub').innerHTML = '<b>' + MapaES.pct(m.votos, dados.total) + '</b> dos votos dele no estado' + (m.aptos ? ' · <b>' + MapaES.pct(m.votos, m.aptos, 2) + '</b> dos eleitores' : '') + (pos && m.votos ? ' · <b>' + pos + 'º</b> município' : '');
      $('#tm-rot-rank').textContent = 'LOCAIS DE VOTAÇÃO COM MAIS VOTOS';
      var maxL = m.locais[0] ? m.locais[0].votos : 1;
      $('#tm-ranking').innerHTML = m.locais.filter(function (l) { return l.votos; }).slice(0, 7).map(function (l, i) {
        return '<li><span class="p">' + (i + 1) + 'º</span><span class="nm">' + h(l.nome) + '<i><b style="width:' + Math.max(2, l.votos / maxL * 100) + '%"></b></i></span><span class="v">' + n(l.votos) + '</span></li>';
      }).join('') || '<li><span></span><span class="nm">Nenhum voto neste município</span><span></span></li>';
      $('#tm-rodape').textContent = m.locais.length + ' locais de votação · ' + m.locais.filter(function (l) { return l.votos; }).length + ' com voto (círculos laranja no mapa)';
    }
  }

  /* passeio: estado → 1º município → estado → 2º … (12 s cada) */
  function passo() {
    if (!dados) return;
    var com = ranking().filter(function (m) { return m.votos > 0; }).slice(0, 12);
    if (!com.length) return;
    if (mapa.selecionado()) { mapa.selecionar(null); return; }
    idxTour = (idxTour + 1) % com.length;
    mapa.selecionar(com[idxTour].chave);
  }
  function ajustarTour() {
    clearInterval(timerTour);
    if (tour) timerTour = setInterval(passo, 12000); else if (mapa && mapa.selecionado()) mapa.selecionar(null);
    ajustarBotoes();
    var u = new URL(location.href); if (tour) u.searchParams.set('passeio', '1'); else u.searchParams.delete('passeio');
    if (metrica === 'pct') u.searchParams.set('metrica', 'pct'); else u.searchParams.delete('metrica'); history.replaceState(null, '', u);
  }
  function ajustarBotoes() {
    $('#tm-tour').textContent = 'Passear pelos municípios: ' + (tour ? 'sim' : 'não');
    $('#tm-metrica').textContent = 'Mostrar: ' + (metrica === 'pct' ? '% dos eleitores' : 'votos');
  }
  $('#tm-tour').addEventListener('click', function () { tour = !tour; ajustarTour(); });
  $('#tm-metrica').addEventListener('click', function () { metrica = metrica === 'pct' ? 'votos' : 'pct'; mapa.metrica(metrica); ajustarTour(); });

  function alternarCheia() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); }
    else document.exitFullscreen();
  }
  $('#t-cheia').addEventListener('click', alternarCheia);
  $('#t-voltar').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    var veio = document.referrer && document.referrer.indexOf(location.origin) === 0 && !/telao-mapa\.html/.test(document.referrer);
    if (veio && history.length > 1) history.back(); else location.href = 'mapa.html';
  });
  document.addEventListener('keydown', function (e) { if ((e.key === 'f' || e.key === 'F') && !$('#telao').hidden) alternarCheia(); });
  document.addEventListener('fullscreenchange', function () { $('#telao').classList.toggle('cheia', !!document.fullscreenElement); });
  if (navigator.wakeLock) { var pedir = function () { navigator.wakeLock.request('screen').catch(function () {}); }; pedir(); document.addEventListener('visibilitychange', function () { if (!document.hidden) pedir(); }); }

  if (sess) iniciar(); else telaLogin();
})();
