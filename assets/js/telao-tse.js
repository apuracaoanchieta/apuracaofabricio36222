/* TELÃO DA APURAÇÃO TSE: resultado oficial no estado, projeção de vagas e ranking do partido.
 * Mostra os dados já aplicados na tela Apuração TSE e atualiza sozinho. */
(function () {
  'use strict';
  var $ = App.$, h = App.h, n = App.n;
  var sess = App.sessao.get('apuracao');
  var ultimo = null, timer = null, ocupado = false, valorAtual = 0;

  App.bannerDemo('Senha: <b>apuracao</b>.');
  App.$$('[data-voltar]').forEach(function (e) { e.innerHTML = App.ICON.seta; });

  function telaLogin() {
    $('#telao').hidden = true; $('#tela-login').hidden = false;
    document.body.style.overflow = 'auto';
    if (App.DEMO) { var d = $('#l-demo'); d.hidden = false; d.innerHTML = App.ICON.info + '<div>Demonstração: senha <strong>apuracao</strong></div>'; }
    setTimeout(function () { $('#l-senha').focus({ preventScroll: true }); }, 50);
  }
  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#l-entrar'); App.carregando(b, true, 'Entrando…');
    App.api('login', { senha: $('#l-senha').value, perfil: 'APURACAO' }).then(function (r) {
      sess = { token: r.token, usuario: r.usuario, perfil: r.perfil }; App.sessao.set('apuracao', sess); $('#l-senha').value = ''; iniciar();
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
    App.api('tse.dados', { token: sess.token }).then(function (r) {
      ultimo = r; desenhar(r);
      $('#telao').classList.remove('off');
    }).catch(function (e) {
      $('#telao').classList.add('off');
      $('#t-atualizado').textContent = 'sem conexão — tentando de novo';
      if (/Sessão|acesso/.test(e.message)) { App.sessao.sair('apuracao'); sess = null; clearInterval(timer); telaLogin(); App.toast(e.message, 'erro'); }
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
    $('#t-proj-txt').innerHTML = st.kind === 'com-dados'
      ? 'O ' + h(partido) + ' faz <b>' + st.vagasDoPartido + ' vaga' + (st.vagasDoPartido === 1 ? '' : 's') + '</b> de ' + c.vagas +
        ' · cláusula: ' + n(Math.ceil(st.QE * 0.1)) + ' votos'
      : 'sem votos por partido';

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

    // rodapé
    $('#t-numeros').textContent = st.kind === 'com-dados'
      ? 'Votos válidos ' + n(c.votosValidos) + ' · Quociente eleitoral ' + n(st.QE) + ' · ' + c.vagas + ' vagas na Assembleia'
      : nome + ' · ' + (d.config.candidato_numero || '36.222') + ' · ' + (d.config.cargo || 'Deputado Estadual');
  }

  function alternarCheia() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); }
    else document.exitFullscreen();
  }
  $('#t-cheia').addEventListener('click', alternarCheia);
  $('#t-voltar').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    var veio = document.referrer && document.referrer.indexOf(location.origin) === 0 && !/telao-tse\.html/.test(document.referrer);
    if (veio && history.length > 1) history.back(); else location.href = 'tse.html';
  });
  document.addEventListener('keydown', function (e) { if ((e.key === 'f' || e.key === 'F') && !$('#telao').hidden) alternarCheia(); });
  document.addEventListener('fullscreenchange', function () { $('#telao').classList.toggle('cheia', !!document.fullscreenElement); });
  if (navigator.wakeLock) { var pedir = function () { navigator.wakeLock.request('screen').catch(function () {}); }; pedir(); document.addEventListener('visibilitychange', function () { if (!document.hidden) pedir(); }); }

  if (sess) iniciar(); else telaLogin();
})();
