/* TELÃO DA APURAÇÃO TSE: resultado oficial no estado, projeção de vagas e ranking do partido.
 * Mostra os dados já aplicados na tela Apuração TSE e atualiza sozinho. */
(function () {
  'use strict';
  var $ = App.$, h = App.h, n = App.n;
  var sess = App.sessao.get('apuracao') || App.sessao.get('partido');
  var ultimo = null, timer = null, ocupado = false, valorAtual = 0;
  var params = new URLSearchParams(location.search);
  var vista = params.get('vista') === 'eleitos' ? 'eleitos' : 'fab', alternar = params.get('alternar') === '1', timerAlt = null;

  App.bannerDemo('Senha: <b>apuracao</b>.');
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
      sess = { token: r.token, usuario: r.usuario, perfil: r.perfil }; App.sessao.set(r.perfil === 'APURACAO' ? 'apuracao' : 'partido', sess); $('#l-senha').value = ''; iniciar();
    }).catch(function (err) { App.toast(err.message, 'erro'); }).then(function () { App.carregando(b, false); });
  });

  function iniciar() {
    $('#tela-login').hidden = true; $('#telao').hidden = false;
    document.body.style.overflow = '';
    relogio(); setInterval(relogio, 1000);
    carregar();
    clearInterval(timer);
    timer = setInterval(carregar, (App.CFG.ATUALIZAR_A_CADA_SEGUNDOS || 30) * 1000);
    $('#telao').classList.add('mostrar-controles');
    setTimeout(function () { $('#telao').classList.remove('mostrar-controles'); }, 5000);
  }
  function relogio() {
    $('#t-hora').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date());
  }

  function carregar() {
    if (ocupado || !sess) return;
    ocupado = true;
    App.api('tse.consulta', { token: sess.token }).then(function (r) {
      $('#t-bloqueio').hidden = true;
      ultimo = r; desenhar(r);
      TseAviso.verificar(r);
      $('#telao').classList.remove('off');
    }).catch(function (e) {
      if (/não foi liberado/.test(e.message)) { $('#t-bloqueio').hidden = false; return; }
      $('#telao').classList.add('off');
      $('#t-atualizado').textContent = 'sem conexão — tentando de novo';
      if (/Sessão|acesso/.test(e.message)) { ['apuracao', 'partido'].forEach(function (a) { var x = App.sessao.get(a); if (x && x.token === sess.token) App.sessao.sair(a); }); sess = null; clearInterval(timer); telaLogin(); App.toast(e.message, 'erro'); }
    }).then(function () { ocupado = false; });
  }

  function contar(el, de, ate) {
    var ini = performance.now(), dur = 900;
    function passo(t) {
      var k = Math.min(1, (t - ini) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = n(Math.round(de + (ate - de) * e));
      if (k < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }
  function pctFrac(x) { return (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }

  var TEXTO_STATUS = { 'eleito': 'ELEITO', 'fora-faixa': 'FORA DA FAIXA', 'abaixo-clausula': 'ABAIXO DA CLÁUSULA', 'sem-candidato': 'SEM CANDIDATO', 'sem-dados': 'AGUARDANDO' };

  function desenhar(d) {
    var c = Tse.calcular(d), st = c.st, s = c.status;
    var nome = d.config.candidato_nome || 'Fabricio Petri', partido = c.grupoNosso.nome;
    var nosso = st.kind === 'com-dados' ? st.nosso : null;
    var votos = nosso ? nosso.votos : 0;
    $('#t-atualizado').textContent = d.tse_atualizado_em ? 'TSE: ' + d.tse_atualizado_em + (d.tse_situacao ? ' · ' + d.tse_situacao : '') : 'aguardando o primeiro resultado do TSE';
    document.title = 'Telão TSE: ' + n(votos) + ' votos — ' + nome + ' ' + (d.config.candidato_numero || '');

    // votos do candidato no estado
    $('#t-rot-votos').textContent = 'VOTOS DE ' + nome.toUpperCase() + ' NO ESTADO';
    if (votos !== valorAtual) { contar($('#t-votos'), valorAtual, votos); valorAtual = votos; }
    else $('#t-votos').textContent = n(votos);
    if (st.kind !== 'com-dados') $('#t-sub').innerHTML = 'Aguardando o resultado oficial do TSE';
    else if (!nosso) $('#t-sub').innerHTML = 'Candidato ainda não está na lista do ' + h(partido);
    else {
      var pos = st.candidatos.indexOf(nosso) + 1;
      $('#t-sub').innerHTML = '<b>' + pctFrac(st.QE ? votos / st.QE : 0) + '</b> do quociente eleitoral · <b>' + pos + 'º</b> no ' + h(partido) +
        '<br><b>' + App.pct(votos, c.votosValidos) + '</b> dos votos válidos do estado';
    }

    // projeção
    var tela = $('#telao');
    ['eleito', 'fora-faixa', 'abaixo-clausula', 'sem-candidato', 'sem-dados'].forEach(function (k) { tela.classList.toggle('st-' + k, s.chave === k); });
    $('#t-status').textContent = TEXTO_STATUS[s.chave] || s.label;
    var pctQE = st.QE ? votos / st.QE : 0;
    $('#t-med').style.width = Math.max(0, Math.min(100, pctQE * 100)) + '%';
    var pS = d.tse_pct_secoes;
    $('#t-rot-proj').textContent = st.kind !== 'com-dados' ? 'PROJEÇÃO' : (pS !== null && pS !== undefined && !isNaN(pS) ? (pS >= 100 ? 'PROJEÇÃO · 100% APURADO' : 'PROJEÇÃO · ' + Number(pS).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% APURADO') : 'PROJEÇÃO PARCIAL');
    $('#t-proj-txt').innerHTML = st.kind === 'com-dados'
      ? 'O ' + h(partido) + ' faz <b>' + st.vagasDoPartido + ' vaga' + (st.vagasDoPartido === 1 ? '' : 's') + '</b> de ' + c.vagas +
        ' · cláusula: ' + n(Math.ceil(st.QE * 0.1)) + ' votos'
      : 'sem votos por partido';
    var qf = Tse.quantoFalta(c, d.tse_pct_secoes);
    if (qf && !qf.eleito && qf.paraEleger !== null) $('#t-proj-txt').innerHTML += '<br>Faltam <b class="t-falta">' + n(qf.paraEleger) + '</b> votos para entrar';
    else if (qf && qf.eleito && qf.proximoColega) $('#t-proj-txt').innerHTML += '<br>Vantagem de <b class="t-falta">' + n(qf.proximoColega.margem) + '</b> votos no ' + h(partido);

    // ranking do partido (o candidato sempre aparece)
    $('#t-rot-ranking').textContent = 'CANDIDATOS DO ' + partido + ' · ' + (st.kind === 'com-dados' ? st.vagasDoPartido + ' VAGA' + (st.vagasDoPartido === 1 ? '' : 'S') : 'SEM PROJEÇÃO');
    var lista = st.kind === 'com-dados' ? st.candidatos : [];
    var top = lista.slice(0, 5);
    if (nosso && top.indexOf(nosso) < 0) top[4] = nosso;
    var max = top.length ? Math.max(1, top[0].votos) : 1;
    $('#t-ranking').innerHTML = top.length && lista[0].votos > 0 ? top.map(function (x) {
      var cls = x.eleito ? 'eleito' : x.passaClausula ? 'clausula' : 'abaixo';
      return '<li class="' + cls + (x.ehNosso ? ' nosso' : '') + '"><div class="pos">' + (lista.indexOf(x) + 1) + 'º · ' + h(x.numero) + '</div>' +
        '<div class="nome" title="' + h(x.nome) + '">' + h(x.nome) + '</div><div class="val num">' + n(x.votos) + '</div>' +
        '<div class="mini"><i class="' + cls + '" style="width:' + (x.votos / max * 100) + '%"></i></div>' +
        '<div class="urn">' + (x.eleito ? 'dentro das vagas' : x.passaClausula ? 'passa da cláusula' : 'abaixo da cláusula') + '</div></li>';
    }).join('') : '<li class="t-vazio">Aguardando o resultado oficial do TSE…</li>';

    desenharEleitos(c, nome);

    // rodapé
    $('#t-numeros').textContent = st.kind === 'com-dados'
      ? 'Votos válidos ' + n(c.votosValidos) + ' · Quociente eleitoral ' + n(st.QE) + ' · ' + c.vagas + ' vagas na Assembleia'
      : nome + ' · ' + (d.config.candidato_numero || '36.222') + ' · ' + (d.config.cargo || 'Deputado Estadual');
  }

  /* Tela de eleitos projetados (todos os partidos) */
  function desenharEleitos(c, nome) {
    var e = Tse.eleitosProjetados(c);
    $('#t-el-rot').textContent = 'ELEITOS PROJETADOS';
    $('#t-el-resumo').innerHTML = c.st.kind === 'com-dados'
      ? '<b>' + e.lista.length + '</b> de ' + e.vagas + ' vagas · ' + e.partidos.length + ' partidos' + (e.lista.some(function (x) { return x.ehNosso; }) ? ' · <b>' + h(nome) + ' entre os eleitos</b>' :
        e.partidos.some(function (p) { return p.suplente && p.suplente.ehNosso; }) ? ' · <b>' + h(nome) + ': 1º suplente do ' + h(c.grupoNosso.nome) + '</b>' : '')
      : '';
    $('#t-el-grade').innerHTML = e.partidos.length ? e.partidos.map(function (p) {
      var nosso = p.chave === c.grupoNosso.chave;
      return '<div class="t-el-partido' + (nosso ? ' nosso' : '') + '"><div class="t-el-pcab"><b>' + h(p.nome) + '</b><span>' + p.vagas + '</span></div><ol>' +
        p.eleitos.map(function (x) { return '<li' + (x.ehNosso ? ' class="nosso"' : '') + '><span class="nome">' + h(x.nome) + '</span><span class="v num">' + n(x.votos) + '</span></li>'; }).join('') +
        (p.vagasSemCandidato ? '<li class="sem"><span class="nome">' + p.vagasSemCandidato + ' vaga(s) sem candidato</span></li>' : '') + '</ol></div>';
    }).join('') : '<div class="t-vazio">Aguardando o resultado oficial do TSE…</div>';
    if (vista === 'eleitos') $('#t-vista').textContent = 'Ver ' + nome;
  }
  function mostrarVista(v) {
    vista = v;
    $('#v-fab').hidden = v !== 'fab'; $('#v-eleitos').hidden = v !== 'eleitos';
    $('#telao').classList.toggle('vista-eleitos', v === 'eleitos');
    $('#t-vista').textContent = v === 'fab' ? 'Ver eleitos' : 'Ver ' + ((ultimo && ultimo.config.candidato_nome) || 'candidato');
    var u = new URL(location.href); u.searchParams.set('vista', v === 'eleitos' ? 'eleitos' : 'candidato'); history.replaceState(null, '', u);
  }
  function ajustarAlternar() {
    clearInterval(timerAlt);
    $('#t-alternar').textContent = 'Alternar: ' + (alternar ? 'sim' : 'não');
    if (alternar) timerAlt = setInterval(function () { mostrarVista(vista === 'fab' ? 'eleitos' : 'fab'); }, 20000);
    var u = new URL(location.href); if (alternar) u.searchParams.set('alternar', '1'); else u.searchParams.delete('alternar'); history.replaceState(null, '', u);
  }
  $('#t-vista').addEventListener('click', function () { mostrarVista(vista === 'fab' ? 'eleitos' : 'fab'); if (alternar) ajustarAlternar(); });
  $('#t-alternar').addEventListener('click', function () { alternar = !alternar; ajustarAlternar(); });
  mostrarVista(vista); ajustarAlternar();

  function alternarCheia() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); }
    else document.exitFullscreen();
  }
  $('#t-cheia').addEventListener('click', alternarCheia);
  $('#t-voltar').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    var veio = document.referrer && document.referrer.indexOf(location.origin) === 0 && !/telao-tse\.html/.test(document.referrer);
    if (veio && history.length > 1) history.back(); else location.href = sess && sess.perfil === 'APURACAO' ? 'tse.html' : 'partido-tse.html';
  });
  document.addEventListener('keydown', function (e) { if ((e.key === 'f' || e.key === 'F') && !$('#telao').hidden) alternarCheia(); });
  document.addEventListener('fullscreenchange', function () { $('#telao').classList.toggle('cheia', !!document.fullscreenElement); });
  if (navigator.wakeLock) { var pedir = function () { navigator.wakeLock.request('screen').catch(function () {}); }; pedir(); document.addEventListener('visibilitychange', function () { if (!document.hidden) pedir(); }); }

  if (sess) iniciar(); else telaLogin();
})();
