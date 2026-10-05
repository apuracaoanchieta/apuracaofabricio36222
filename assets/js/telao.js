/* MODO TELÃO: tela cheia para a TV do comitê, atualiza sozinho */
(function () {
  'use strict';
  var $ = App.$, h = App.h;
  var sess = App.sessao.get('apuracao') || App.sessao.get('partido') || App.sessao.get('telao');
  var params = new URLSearchParams(location.search);
  var municipio = (params.get('mun') || '').toUpperCase();
  var ultimo = null, timer = null, ocupado = false, valorAtual = 0;

  App.bannerDemo('Senha: <b>apuracao</b> ou <b>partido</b>.');
  App.$$('[data-voltar]').forEach(function (e) { e.innerHTML = App.ICON.seta; });

  function telaLogin() {
    $('#telao').hidden = true; $('#tela-login').hidden = false;
    document.body.style.overflow = 'auto';
    if (App.DEMO) { var d = $('#l-demo'); d.hidden = false; d.innerHTML = App.ICON.info + '<div>Demonstração: senha <strong>partido</strong></div>'; }
    setTimeout(function () { $('#l-senha').focus({ preventScroll: true }); }, 50);
  }
  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#l-entrar'); App.carregando(b, true, 'Entrando…');
    App.api('login', { senha: $('#l-senha').value, perfil: 'PARTIDO' }).then(function (r) {
      sess = { token: r.token, usuario: r.usuario }; App.sessao.set('telao', sess); $('#l-senha').value = ''; iniciar();
    }).catch(function (err) { App.toast(err.message, 'erro'); }).then(function () { App.carregando(b, false); });
  });

  function iniciar() {
    $('#tela-login').hidden = true; $('#telao').hidden = false;
    document.body.style.overflow = '';
    relogio(); setInterval(relogio, 1000);
    carregar();
    clearInterval(timer);
    timer = setInterval(carregar, (App.CFG.ATUALIZAR_A_CADA_SEGUNDOS || 30) * 1000);
    // mostra os controles por alguns segundos
    $('#telao').classList.add('mostrar-controles');
    setTimeout(function () { $('#telao').classList.remove('mostrar-controles'); }, 5000);
  }
  function relogio() {
    $('#t-hora').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date());
  }

  function carregar() {
    if (ocupado || !sess) return;
    ocupado = true;
    App.api('partido.dados', { token: sess.token }).then(function (r) {
      ultimo = r; desenhar(r);
      $('#telao').classList.remove('off');
      $('#t-atualizado').textContent = 'atualizado às ' + App.hora(r.agora) + r.agora.substr(16, 3);
    }).catch(function (e) {
      $('#telao').classList.add('off');
      $('#t-atualizado').textContent = 'sem conexão — tentando de novo';
      if (/Sessão|acesso/.test(e.message)) {
        ['apuracao', 'partido', 'telao'].forEach(function (a) { var s = App.sessao.get(a); if (s && s.token === sess.token) App.sessao.sair(a); });
        sess = null; clearInterval(timer); telaLogin(); App.toast(e.message, 'erro');
      }
    }).then(function () { ocupado = false; });
  }

  function opcoesMunicipio(d) {
    var principal = String(d.config.municipio_principal || 'ANCHIETA').toUpperCase();
    var muns = {}; muns[principal] = true;
    d.urnas.forEach(function (u) { if (u.municipio) muns[u.municipio.toUpperCase()] = true; });
    var lista = Object.keys(muns).sort(function (a, b) { return a === principal ? -1 : b === principal ? 1 : a.localeCompare(b, 'pt-BR'); });
    if (!municipio || (municipio !== '__TODOS__' && lista.indexOf(municipio) < 0)) municipio = principal;
    var sel = $('#t-sel-mun');
    var html = lista.map(function (m) { return '<option value="' + h(m) + '">' + h(m) + '</option>'; }).join('') +
      (lista.length > 1 ? '<option value="__TODOS__">Todos os municípios</option>' : '');
    if (sel.innerHTML !== html) sel.innerHTML = html;
    sel.value = municipio;
    sel.hidden = lista.length < 2;
    return principal;
  }
  $('#t-sel-mun').addEventListener('change', function () {
    municipio = this.value;
    var u = new URL(location.href); u.searchParams.set('mun', municipio); history.replaceState(null, '', u);
    if (ultimo) desenhar(ultimo);
  });

  function contar(el, de, ate) {
    var ini = performance.now(), dur = 900;
    function passo(t) {
      var k = Math.min(1, (t - ini) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = App.n(Math.round(de + (ate - de) * e));
      if (k < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }

  function desenhar(dPlanilha) {
    var d = window.EstadoTSE ? EstadoTSE.mesclar(dPlanilha) : dPlanilha;
    if (window.EstadoTSE && !d.estadoTse) EstadoTSE.carregar().then(function (j) { if (j && ultimo === dPlanilha) desenhar(ultimo); });
    var principal = opcoesMunicipio(d);
    var st = Painel.calcular(d, municipio);
    $('#t-mun').textContent = municipio === '__TODOS__' ? 'TODOS OS MUNICÍPIOS' : municipio;
    document.title = 'Telão: ' + App.n(st.votosVal) + ' votos — Fabricio Petri 36.222';

    // votos
    if (st.votosVal !== valorAtual) { contar($('#t-votos'), valorAtual, st.votosVal); valorAtual = st.votosVal; }
    else $('#t-votos').textContent = App.n(st.votosVal);
    $('#t-sub').innerHTML = st.votosPen
      ? '+ <b>' + App.n(st.votosPen) + '</b> em conferência · total <b>' + App.n(st.votosVal + st.votosPen) + '</b>'
      : 'todos os votos recebidos já foram conferidos';
    if (st.pctEleitores !== null) $('#t-sub').innerHTML += '<br><b>' + App.pct(st.votosSecComAptos, st.aptosApur) + '</b> dos eleitores das seções apuradas';

    // urnas
    var pctNum = st.totalUrnas ? st.apuradas / st.totalUrnas * 100 : 0;
    $('#t-pct').textContent = st.totalUrnas ? App.pct(st.apuradas, st.totalUrnas) : '—';
    $('#t-bar-v').style.width = (st.totalUrnas ? st.urnasVal / st.totalUrnas * 100 : 0) + '%';
    $('#t-bar-p').style.width = (st.totalUrnas ? st.urnasPen / st.totalUrnas * 100 : 0) + '%';
    $('#t-urnas-txt').textContent = st.totalUrnas
      ? st.apuradas + ' de ' + st.totalUrnas + ' urnas' + (st.urnasPen ? ' · ' + st.urnasPen + ' em conferência' : '') + (pctNum >= 100 ? ' · apuração completa' : '') +
        (st.aptosTotal ? ' · ' + App.pct(st.aptosApur, st.aptosTotal) + ' do eleitorado' : '')
      : (st.votosTotais ? 'total informado, sem urnas detalhadas' : 'nenhuma urna cadastrada');

    // ranking
    var top = st.locais.filter(function (l) { return l.votosVal + l.votosPen > 0; })
      .sort(function (a, b) { return (b.votosVal + b.votosPen) - (a.votosVal + a.votosPen); }).slice(0, 5);
    var max = top.length ? top[0].votosVal + top[0].votosPen : 1;
    $('#t-ranking').innerHTML = top.length ? top.map(function (l, i) {
      var tot = l.votosVal + l.votosPen;
      return '<li><div class="pos">' + (i + 1) + 'º</div><div class="nome" title="' + h(l.nome) + '">' + h(l.nome) + '</div>' +
        '<div class="val num">' + App.n(tot) + '</div>' +
        '<div class="mini"><i class="v" style="width:' + (l.votosVal / max * 100) + '%"></i><i class="p" style="width:' + (l.votosPen / max * 100) + '%"></i></div>' +
        '<div class="urn">' + (l.total ? (l.val + l.pen) + '/' + l.total + ' urnas' : 'total informado') + (l.aptosApur ? ' · ' + App.pct(l.votosSec, l.aptosApur) + ' dos aptos' : '') + '</div></li>';
    }).join('') : '<li class="t-vazio">Aguardando os primeiros boletins…</li>';

    // outros municípios
    var txt = '';
    if (municipio !== '__TODOS__' && st.outros.length) {
      var tot = st.outros.reduce(function (a, o) { return a + o.votos; }, 0);
      txt = 'Outros municípios: ' + App.n(tot) + ' votos (' + st.outros.map(function (o) { return o.municipio + ' ' + App.n(o.votos); }).join(' · ') + ')';
    } else txt = (d.config.candidato_nome || 'Fabricio Petri') + ' · ' + (d.config.candidato_numero || '36.222') + ' · ' + (d.config.cargo || 'Deputado Estadual');
    $('#t-outros').textContent = txt;
  }

  // tela cheia
  function alternarCheia() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); }
    else document.exitFullscreen();
  }
  $('#t-cheia').addEventListener('click', alternarCheia);
  // Voltar: retorna à tela de onde veio (Apuração/Partido); se abriu direto, vai para o início
  $('#t-voltar').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    var veio = document.referrer && document.referrer.indexOf(location.origin) === 0 && !/telao\.html/.test(document.referrer);
    if (veio && history.length > 1) history.back(); else location.href = './';
  });
  document.addEventListener('keydown', function (e) { if ((e.key === 'f' || e.key === 'F') && !$('#telao').hidden) alternarCheia(); });
  document.addEventListener('fullscreenchange', function () { $('#telao').classList.toggle('cheia', !!document.fullscreenElement); });
  // mantém a tela da TV acesa
  if (navigator.wakeLock) { var pedir = function () { navigator.wakeLock.request('screen').catch(function () {}); }; pedir(); document.addEventListener('visibilitychange', function () { if (!document.hidden) pedir(); }); }
  window.addEventListener('resize', function () { if (ultimo) desenhar(ultimo); });

  if (sess) iniciar(); else telaLogin();
})();
