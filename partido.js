/* Área do PARTIDO / CANDIDATO: somente leitura */
(function () {
  'use strict';
  var $ = App.$, ICON = App.ICON;
  var AREA = 'partido';
  var sess = App.sessao.get(AREA), painel = null, timer = null, ocupado = false;

  App.bannerDemo('Senha: <b>partido</b>.');
  $('#btn-sair').innerHTML = ICON.sair;
  $('#btn-telao').innerHTML = ICON.tv + 'Abrir modo telão (TV)';
  $('#btn-tse').innerHTML = ICON.grafico + 'Resultado oficial do TSE (estado)';
  var tseLiberado = false;
  function ajustarBotaoTse(liberado) {
    tseLiberado = liberado;
    var b = $('#btn-tse');
    b.classList.toggle('desabilitado', !liberado);
    b.setAttribute('aria-disabled', liberado ? 'false' : 'true');
    b.title = liberado ? 'Abrir o resultado oficial do TSE' : 'Aguardando liberação da equipe de apuração';
    b.innerHTML = ICON.grafico + 'Resultado oficial do TSE (estado)' + (liberado ? '' : '<small class="btn-sub">aguardando liberação</small>');
  }
  ajustarBotaoTse(false);
  $('#btn-tse').addEventListener('click', function (e) {
    if (!tseLiberado) { e.preventDefault(); App.toast('O Resultado oficial do TSE ainda não foi liberado pela equipe de apuração.', 'erro', 4000); }
  });
  $('#l-ver').innerHTML = ICON.olho;

  function telaLogin() {
    $('#tela-app').hidden = true; $('#tela-login').hidden = false;
    if (App.DEMO) { var d = $('#l-demo'); d.hidden = false; d.innerHTML = ICON.info + '<div>Demonstração: senha <strong>partido</strong></div>'; }
    setTimeout(function () { $('#l-senha').focus({ preventScroll: true }); }, 50);
  }
  $('#l-ver').addEventListener('click', function () { var i = $('#l-senha'); i.type = i.type === 'password' ? 'text' : 'password'; });
  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#l-entrar'); App.carregando(b, true, 'Entrando…');
    App.api('login', { senha: $('#l-senha').value, perfil: 'PARTIDO' }).then(function (r) {
      sess = { token: r.token, usuario: r.usuario }; App.sessao.set(AREA, sess); $('#l-senha').value = ''; iniciar();
    }).catch(function (err) { App.toast(err.message, 'erro'); }).then(function () { App.carregando(b, false); });
  });
  $('#btn-sair').addEventListener('click', function () {
    App.sessao.sair(AREA); sess = null; clearInterval(timer); location.href = './';
  });

  var cfgAtual = null;
  // aviso discreto quando a situação no Resultado TSE muda (só se a apuração ligou os avisos e liberou o TSE)
  TseAviso.monitorar(function () {
    return sess && cfgAtual && String(cfgAtual.tse_avisos).toUpperCase() === 'TRUE' && String(cfgAtual.tse_partido_visivel).toUpperCase() === 'TRUE';
  }, function () { return App.api('tse.consulta', { token: sess.token }); }, 60);

  function iniciar() {
    $('#tela-login').hidden = true; $('#tela-app').hidden = false; window.scrollTo(0, 0);
    if (!painel) painel = Painel.criar($('#sec-painel'), { modo: 'partido' });
    carregar(true);
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) carregar(false); }, (App.CFG.ATUALIZAR_A_CADA_SEGUNDOS || 30) * 1000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && sess) carregar(false); });

  function carregar(mostrarErro) {
    if (ocupado || !sess) return;
    ocupado = true;
    App.api('partido.dados', { token: sess.token }).then(function (r) {
      painel.atualizar(r);
      cfgAtual = r.config;
      ajustarBotaoTse(String(r.config.tse_partido_visivel).toUpperCase() === 'TRUE');
      $('#t-titulo').textContent = (r.config.candidato_nome || 'Fabricio Petri') + ' ' + (r.config.candidato_numero || '');
      var at = $('#t-atualizado'); at.classList.remove('off'); at.lastChild.textContent = App.hora(r.agora) + r.agora.substr(16, 3);
    }).catch(function (e) {
      $('#t-atualizado').classList.add('off'); $('#t-atualizado').lastChild.textContent = 'Sem conexão';
      if (/Sessão|acesso/.test(e.message)) { App.sessao.sair(AREA); sess = null; clearInterval(timer); telaLogin(); App.toast(e.message, 'erro'); }
      else if (mostrarErro) App.toast(e.message, 'erro');
    }).then(function () { ocupado = false; });
  }

  if (sess) iniciar(); else telaLogin();
})();
