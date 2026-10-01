/* Área do FISCAL: preenche e envia o BU (funciona mesmo sem internet) */
(function () {
  'use strict';
  var $ = App.$, h = App.h, ICON = App.ICON;
  var K_IDENT = 'fp_fiscal_ident', K_PARAMS = 'fp_params', K_FILA = 'fp_fila', K_HIST = 'fp_historico', K_ULT_LOCAL = 'fp_ultimo_local';

  var params = App.lsGet(K_PARAMS, null);
  var foto = null;
  var enviando = false;

  App.bannerDemo('Para usar de verdade, configure a planilha (veja o guia).');
  $('#foto-vazia .icone').innerHTML = ICON.camera;
  $('.ic-cam').outerHTML = ICON.camera;
  $('.ic-gal').outerHTML = ICON.galeria;
  $('#fechado .sucesso-icone').innerHTML = ICON.relogio;

  /* ---------------- Identificação do fiscal ---------------- */
  function mascaraTel(v) {
    var d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length > 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length > 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    if (d.length > 2) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return d.length ? '(' + d : '';
  }
  $('#f-tel').addEventListener('input', function () { this.value = mascaraTel(this.value); this.classList.remove('erro'); });
  $('#f-nome').addEventListener('input', function () { this.classList.remove('erro'); });

  function mostrarIdent() {
    var id = App.lsGet(K_IDENT, null);
    if (id && id.nome && id.telefone) {
      $('#f-nome').value = id.nome; $('#f-tel').value = mascaraTel(id.telefone);
      $('#ident-nome').textContent = id.nome;
      $('#ident-tel').textContent = App.tel(id.telefone);
      $('#ident-avatar').textContent = App.iniciais(id.nome);
      $('#ident-resumo').hidden = false; $('#ident-campos').hidden = true;
    } else {
      $('#ident-resumo').hidden = true; $('#ident-campos').hidden = false;
    }
  }
  $('#btn-alterar-ident').addEventListener('click', function () {
    $('#ident-resumo').hidden = true; $('#ident-campos').hidden = false; $('#f-nome').focus();
  });

  /* ---------------- Locais e seções ---------------- */
  function carregarParams(silencioso) {
    return App.api('public.params').then(function (r) {
      params = { config: r.config, locais: r.locais, secoes: r.secoes, recebidas: r.recebidas, em: Date.now() };
      App.lsSet(K_PARAMS, params);
      montarParams();
    }).catch(function (e) {
      if (params) { montarParams(); if (!silencioso) avisoConexao(); }
      else {
        $('#f-local').innerHTML = '<option value="">Sem conexão — não foi possível carregar</option>';
        avisoConexao(true);
      }
      if (e.servidor) App.toast(e.message, 'erro');
    });
  }
  function avisoConexao(semDados) {
    var el = $('#aviso-conexao');
    el.hidden = false;
    el.innerHTML = ICON.offline + '<div><b>' + (semDados ? 'Sem conexão' : 'Você está sem internet') + '</b>' +
      (semDados ? 'Conecte-se uma vez para carregar a lista de locais.' : 'Pode preencher normalmente: o envio fica guardado e sai sozinho quando a internet voltar.') +
      '</div><button class="btn btn-sec btn-sm acao" type="button" id="btn-tentar-params">Tentar</button>';
    $('#btn-tentar-params').onclick = function () { el.hidden = true; carregarParams(); };
  }

  function montarParams() {
    var cfg = params.config || {};
    $('#cand-nome').textContent = cfg.candidato_nome || 'Fabricio Petri';
    $('#cand-num').textContent = (cfg.candidato_numero || '36.222') + ' · ' + (cfg.cargo || 'Deputado Estadual');
    var fechado = String(cfg.recebimento_aberto).toUpperCase() === 'FALSE';
    $('#fechado').hidden = !fechado;
    $('#form-bu').hidden = fechado;
    var sel = $('#f-local'), atual = sel.value || App.lsGet(K_ULT_LOCAL, '');
    sel.innerHTML = '<option value="">Escolha o local de votação</option>' + params.locais.map(function (l) {
      return '<option value="' + h(l.id) + '">' + h(l.nome) + '</option>';
    }).join('');
    if (atual && params.locais.some(function (l) { return l.id === atual; })) sel.value = atual;
    montarSecoes();
  }

  function recebidasSet() {
    var s = {};
    (params && params.recebidas || []).forEach(function (id) { s[id] = true; });
    App.lsGet(K_HIST, []).forEach(function (x) { if (x.status !== 'ERRO') s[x.secao_id] = true; });
    return s;
  }
  function montarSecoes() {
    var lid = $('#f-local').value, sel = $('#f-secao'), atual = sel.value;
    if (!lid || !params) { sel.disabled = true; sel.innerHTML = '<option value="">Escolha primeiro o local</option>'; return; }
    var rec = recebidasSet();
    var lista = params.secoes.filter(function (s) { return s.local_id === lid; });
    sel.disabled = false;
    sel.innerHTML = '<option value="">Escolha a seção</option>' + lista.map(function (s) {
      return '<option value="' + h(s.id) + '">Seção ' + h(s.numero) + (rec[s.id] ? ' — já enviada' : '') + '</option>';
    }).join('');
    if (atual && lista.some(function (s) { return s.id === atual; })) sel.value = atual;
    else if (lista.length === 1) sel.value = lista[0].id;
    ajudaSecao();
  }
  function ajudaSecao() {
    var id = $('#f-secao').value, aj = $('#ajuda-secao');
    if (id && recebidasSet()[id]) {
      aj.hidden = false;
      aj.innerHTML = '<span style="color:#b35c00;font-weight:700">Esta seção já foi enviada.</span> Só envie de novo se precisar corrigir — a apuração vai conferir.';
    } else aj.hidden = true;
  }
  $('#f-local').addEventListener('change', function () {
    this.classList.remove('erro'); App.lsSet(K_ULT_LOCAL, this.value); $('#f-secao').value = ''; montarSecoes();
  });
  $('#f-secao').addEventListener('change', function () { this.classList.remove('erro'); ajudaSecao(); });
  $('#f-votos').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 4); this.closest('.votos-box').style.borderColor = ''; });

  /* ---------------- Foto ---------------- */
  function aoEscolherFoto(e) {
    var arq = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!arq) return;
    var area = $('#foto-area');
    area.classList.remove('erro');
    $('#foto-vazia').hidden = true; $('#foto-cheia').hidden = false;
    $('#foto-preview').removeAttribute('src');
    $('#foto-preview').alt = 'Processando foto…';
    App.comprimirFoto(arq).then(function (d) {
      foto = d; $('#foto-preview').src = d; $('#foto-preview').alt = 'Prévia da foto do boletim';
      area.classList.add('tem-foto');
    }).catch(function (err) {
      foto = null; $('#foto-vazia').hidden = false; $('#foto-cheia').hidden = true; App.toast(err.message, 'erro');
    });
  }
  $('#f-foto-camera').addEventListener('change', aoEscolherFoto);
  $('#f-foto-galeria').addEventListener('change', aoEscolherFoto);
  function limparFoto() {
    foto = null; $('#foto-vazia').hidden = false; $('#foto-cheia').hidden = true;
    $('#foto-area').classList.remove('tem-foto', 'erro');
  }

  /* ---------------- Revisão ---------------- */
  $('#form-bu').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!params) return App.toast('Aguarde carregar a lista de locais.', 'erro');
    var nome = $('#f-nome').value.trim().replace(/\s+/g, ' ');
    var telefone = $('#f-tel').value.replace(/\D/g, '');
    var localId = $('#f-local').value, secaoId = $('#f-secao').value, votos = $('#f-votos').value;
    var cfg = params.config || {};
    var erros = [];
    if (nome.length < 3) { erros.push('Informe seu nome.'); $('#f-nome').classList.add('erro'); }
    if (telefone.length < 10) { erros.push('Informe o telefone com DDD.'); $('#f-tel').classList.add('erro'); }
    if (erros.length && $('#ident-campos').hidden) { $('#ident-resumo').hidden = true; $('#ident-campos').hidden = false; }
    if (!localId) { erros.push('Escolha o local de votação.'); $('#f-local').classList.add('erro'); }
    if (!secaoId) { erros.push('Escolha a seção.'); $('#f-secao').classList.add('erro'); }
    if (votos === '') { erros.push('Digite a quantidade de votos.'); $('.votos-box').style.borderColor = 'var(--perigo)'; }
    if (!foto && String(cfg.foto_obrigatoria).toUpperCase() !== 'FALSE') { erros.push('Tire a foto do boletim de urna.'); $('#foto-area').classList.add('erro'); }
    if (erros.length) {
      App.toast(erros[0], 'erro');
      var primeiro = $('.erro', this) || $('#foto-area.erro');
      if (primeiro) primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    App.lsSet(K_IDENT, { nome: nome, telefone: telefone });
    var local = params.locais.filter(function (l) { return l.id === localId; })[0];
    var secao = params.secoes.filter(function (s) { return s.id === secaoId; })[0];
    var v = parseInt(votos, 10);
    var limite = parseInt(cfg.alerta_votos_max, 10) || 400;
    var jaEnviada = recebidasSet()[secaoId];

    var m = App.modal(App.cabecalhoModal('Confira antes de enviar', 'Compare cada dado com o boletim impresso.') +
      (v > limite ? '<div class="aviso aviso-alerta">' + ICON.alerta + '<div><b>Valor alto</b>' + v + ' votos é acima do esperado para uma seção (' + limite + '). Confira se digitou certo.</div></div>' : '') +
      (jaEnviada ? '<div class="aviso aviso-alerta">' + ICON.alerta + '<div><b>Seção já enviada</b>Este envio vai para conferência junto com o anterior.</div></div>' : '') +
      '<div class="resumo-envio">' +
      '<div class="linha"><span>Local</span><b>' + h(local.nome) + '</b></div>' +
      '<div class="linha"><span>Seção</span><b>' + h(secao.numero) + '</b></div>' +
      '<div class="linha destaque"><span>Votos de ' + h(cfg.candidato_nome || 'Fabricio Petri') + '</span><b class="num">' + App.n(v) + '</b></div>' +
      (foto ? '<img src="' + foto + '" alt="Foto do BU">' : '') +
      '</div>' +
      '<div class="acoes"><button class="btn btn-sec" data-fechar>Corrigir</button>' +
      '<button class="btn btn-primario" id="btn-confirmar">' + ICON.upload + 'Confirmar envio</button></div>');
    $('#btn-confirmar', m.el).addEventListener('click', function () {
      m.fechar();
      registrarEnvio({ nome: nome, telefone: telefone, local: local, secao: secao, votos: v });
    });
  });

  /* ---------------- Fila de envio (offline) ---------------- */
  function registrarEnvio(d) {
    var clientId = App.uuid();
    var item = {
      client_id: clientId, criado: Date.now(),
      payload: { client_id: clientId, nome: d.nome, telefone: d.telefone, local_id: d.local.id, secao_id: d.secao.id, votos: d.votos, foto: foto }
    };
    var fila = App.lsGet(K_FILA, []);
    fila.push(item);
    var guardou = App.lsSet(K_FILA, fila);
    var hist = App.lsGet(K_HIST, []);
    hist.unshift({ client_id: clientId, local: d.local.nome, secao: d.secao.numero, secao_id: d.secao.id, votos: d.votos, quando: App.carimbo(), status: 'AGUARDANDO' });
    App.lsSet(K_HIST, hist.slice(0, 60));
    if (!guardou) App.toast('Memória do celular cheia: mantenha esta tela aberta até enviar.', 'erro', 6000);

    // limpa o formulário para a próxima seção (mantém o local)
    $('#f-secao').value = ''; $('#f-votos').value = ''; limparFoto();
    montarSecoes(); renderHistorico();

    var m = App.modal('<div class="centro" id="res-envio"><div class="sucesso-icone espera">' + '<span class="spin" style="width:34px;height:34px;border-width:4px;border-color:rgba(160,115,0,.25);border-top-color:#a07300"></span>' +
      '</div><h2>Enviando…</h2><p class="muted">Seção ' + h(d.secao.numero) + ' · ' + App.n(d.votos) + ' votos</p></div>', { fecharFora: false });
    processarFila().then(function (res) {
      var r = res[clientId];
      var box = $('#res-envio', m.el);
      if (!box) return;
      if (r && r.ok) {
        box.innerHTML = '<div class="sucesso-icone">' + ICON.check + '</div><h2>Boletim enviado!</h2>' +
          '<p class="muted">Seção ' + h(d.secao.numero) + ' · <b>' + App.n(d.votos) + ' votos</b> recebidos pela apuração.' +
          (r.duplicada ? '<br><span style="color:#b35c00;font-weight:700">Esta seção já tinha um envio; a apuração vai conferir.</span>' : '') + '</p>';
      } else if (r && r.erro) {
        box.innerHTML = '<div class="sucesso-icone" style="background:var(--perigo-bg);color:var(--perigo)">' + ICON.x + '</div><h2>Envio recusado</h2>' +
          '<p class="muted">' + h(r.erro) + '</p>';
      } else {
        box.innerHTML = '<div class="sucesso-icone espera">' + ICON.nuvem + '</div><h2>Guardado no celular</h2>' +
          '<p class="muted">Sem internet agora. O boletim fica salvo e será enviado <b>automaticamente</b> quando a conexão voltar. Não apague os dados do navegador.</p>';
      }
      box.insertAdjacentHTML('beforeend', '<div class="acoes"><button class="btn btn-primario btn-xl" data-fechar>Enviar outra seção</button></div>');
      App.$$('[data-fechar]', box).forEach(function (b) { b.onclick = function () { m.fechar(); window.scrollTo({ top: 0, behavior: 'smooth' }); }; });
    });
  }

  function processarFila() {
    var resultados = {};
    if (enviando) return Promise.resolve(resultados);
    enviando = true;
    var fila = App.lsGet(K_FILA, []);
    var i = 0;
    function proximo() {
      if (i >= fila.length) return Promise.resolve();
      var item = fila[i++];
      return App.api('fiscal.enviar', item.payload, { timeout: 60000, simularOffline: true }).then(function (r) {
        resultados[item.client_id] = { ok: true, duplicada: r.duplicada };
        tirarDaFila(item.client_id);
        marcarHist(item.client_id, { status: 'ENVIADO', id: r.id, duplicada: r.duplicada });
        return proximo();
      }, function (e) {
        if (e.rede || e.temporario) { resultados[item.client_id] = { rede: true }; return; } // para e tenta depois
        resultados[item.client_id] = { erro: e.message };
        tirarDaFila(item.client_id);
        marcarHist(item.client_id, { status: 'ERRO', erro: e.message });
        return proximo();
      });
    }
    return proximo().then(function () {
      enviando = false; renderHistorico(); avisoFila();
      if (Object.keys(resultados).some(function (k) { return resultados[k].ok; })) carregarParams(true);
      return resultados;
    });
  }
  function tirarDaFila(id) { App.lsSet(K_FILA, App.lsGet(K_FILA, []).filter(function (x) { return x.client_id !== id; })); }
  function marcarHist(id, dados) {
    var hist = App.lsGet(K_HIST, []);
    hist.forEach(function (x) { if (x.client_id === id) Object.assign(x, dados); });
    App.lsSet(K_HIST, hist);
  }
  function avisoFila() {
    var n = App.lsGet(K_FILA, []).length, el = $('#aviso-fila');
    el.hidden = !n;
    if (n) {
      el.innerHTML = ICON.nuvem + '<div><b>' + n + (n > 1 ? ' boletins aguardando' : ' boletim aguardando') + ' internet</b>Serão enviados automaticamente. Mantenha esta página aberta quando possível.</div>' +
        '<button class="btn btn-sec btn-sm acao" type="button" id="btn-reenviar">Enviar agora</button>';
      $('#btn-reenviar').onclick = function () {
        var b = this; App.carregando(b, true);
        processarFila().then(function (r) {
          var ok = Object.keys(r).filter(function (k) { return r[k].ok; }).length;
          App.toast(ok ? ok + ' enviado(s) com sucesso!' : 'Ainda sem conexão. Tentaremos de novo.', ok ? 'ok' : 'erro');
        });
      };
    }
  }

  function renderHistorico() {
    var hist = App.lsGet(K_HIST, []), ul = $('#lista-envios');
    if (!hist.length) { ul.innerHTML = '<li class="vazio" style="display:block">Nenhum boletim enviado ainda.</li>'; return; }
    var rot = { AGUARDANDO: 'Aguardando internet', ENVIADO: 'Enviado', ERRO: 'Recusado' };
    ul.innerHTML = hist.map(function (x) {
      return '<li><div class="sec-num"><div><small>SEÇÃO</small>' + h(x.secao) + '</div></div>' +
        '<div class="meio"><b>' + h(x.local) + '</b><span>' + App.hora(x.quando) + ' · <span class="selo selo-' + x.status + '">' + rot[x.status] + '</span></span>' +
        (x.erro ? '<div class="tiny" style="color:var(--perigo);margin-top:3px">' + h(x.erro) + '</div>' : '') + '</div>' +
        '<div class="dir"><div class="v num">' + App.n(x.votos) + '</div><span class="tiny muted">votos</span></div></li>';
    }).join('');
  }

  $('#btn-recarregar').addEventListener('click', function () { carregarParams(); });
  window.addEventListener('online', function () { $('#aviso-conexao').hidden = true; processarFila(); carregarParams(true); });
  window.addEventListener('offline', function () { avisoConexao(); });
  setInterval(function () { if (App.lsGet(K_FILA, []).length) processarFila(); }, 20000);

  /* ---------------- Início ---------------- */
  mostrarIdent();
  renderHistorico();
  avisoFila();
  if (params) montarParams();
  carregarParams(!!params).then(function () { if (App.lsGet(K_FILA, []).length) processarFila(); });
  if (!navigator.onLine && params) avisoConexao();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* opcional */ });
  }
})();
