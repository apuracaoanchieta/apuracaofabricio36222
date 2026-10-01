/* Área da APURAÇÃO: conferência dos BUs, painel, lançamentos e parâmetros */
(function () {
  'use strict';
  var $ = App.$, $$ = App.$$, h = App.h, ICON = App.ICON;
  var AREA = 'apuracao';
  var sess = App.sessao.get(AREA);
  var dados = null, painel = null, aba = 'painel', subAba = 'geral';
  var dupMap = {}, urnasMap = {}, fotosCache = {};
  var filtros = { busca: '', status: 'TODOS', local: '', mun: '', origem: '', ordem: 'recentes' };
  var cfFiltro = { busca: '', local: '', ordem: 'antigos' };
  var paramMun = null, buscaLocal = '';
  var timer = null, carregandoDados = false;
  var ROT_STATUS = { PENDENTE: 'Em conferência', VALIDADO: 'Confirmado', REJEITADO: 'Rejeitado', DESCARTADO: 'Substituído' };

  App.bannerDemo('Senha: <b>apuracao</b>.');
  $('#btn-atualizar').innerHTML = ICON.atualizar;
  $('#btn-sair').innerHTML = ICON.sair;
  $('#ap-telao').innerHTML = ICON.tv + 'Modo telão';
  $('#ap-excel').innerHTML = ICON.excel + 'Exportar Excel';
  $('#ap-relatorio').innerHTML = ICON.impressora + 'Relatório para impressão';
  $('#ap-excel').addEventListener('click', function () {
    if (!dados) return App.toast('Aguarde os dados carregarem.', 'erro');
    var b = this; App.carregando(b, true, 'Gerando…');
    carregar(false).then(function () { return Relat.exportarExcel(dados); })
      .then(function (nome) { App.toast('Planilha gerada: ' + nome, 'ok', 5000); })
      .catch(function (e) { App.toast(e.message, 'erro', 6000); })
      .then(function () { App.carregando(b, false); });
  });
  $('#l-ver').innerHTML = ICON.olho;

  /* ================= LOGIN ================= */
  function telaLogin() {
    $('#tela-app').hidden = true; $('#tela-login').hidden = false;
    if (App.DEMO) { var d = $('#l-demo'); d.hidden = false; d.innerHTML = ICON.info + '<div>Demonstração: senha <strong>apuracao</strong></div>'; }
    setTimeout(function () { $('#l-senha').focus({ preventScroll: true }); }, 50);
  }
  $('#l-ver').addEventListener('click', function () { var i = $('#l-senha'); i.type = i.type === 'password' ? 'text' : 'password'; });
  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#l-entrar'); App.carregando(b, true, 'Entrando…');
    App.api('login', { senha: $('#l-senha').value, perfil: 'APURACAO' }).then(function (r) {
      sess = { token: r.token, usuario: r.usuario, perfil: r.perfil };
      App.sessao.set(AREA, sess);
      $('#l-senha').value = '';
      iniciarApp();
    }).catch(function (err) { App.toast(err.message, 'erro'); }).then(function () { App.carregando(b, false); });
  });
  $('#btn-sair').addEventListener('click', function () {
    App.confirmar('Sair do sistema?', 'Você precisará entrar novamente com usuário e senha.', 'Sair').then(function (ok) {
      if (!ok) return; App.sessao.sair(AREA); sess = null; clearInterval(timer); location.href = './';
    });
  });
  function sessaoExpirou(err) {
    if (/Sessão|acesso a esta área/.test(err.message)) {
      App.sessao.sair(AREA); sess = null; clearInterval(timer); telaLogin(); App.toast(err.message, 'erro', 5000); return true;
    }
    return false;
  }
  function chamar(acao, d) { return App.api(acao, Object.assign({ token: sess.token }, d || {})).catch(function (e) { sessaoExpirou(e); throw e; }); }

  /* ================= APP ================= */
  function iniciarApp() {
    $('#tela-login').hidden = true; $('#tela-app').hidden = false; window.scrollTo(0, 0);
    $('#t-usuario').textContent = 'Acesso da apuração';
    if (!painel) {
      painel = Painel.criar($('#sec-painel'), {
        modo: 'apuracao',
        contarPendentes: function () { return dados ? dados.lancamentos.filter(function (l) { return l.status === 'PENDENTE'; }).length : 0; },
        aoClicarPendentes: function () { irAba('conferencia'); },
        duplicadas: function () { return dupMap; },
        aoClicarSecao: function (sid) { var u = urnasMap[sid]; if (u) abrirConferencia(u.id); }
      });
    }
    carregar(true);
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) carregar(false); }, (App.CFG.ATUALIZAR_A_CADA_SEGUNDOS || 30) * 1000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && sess && dados) carregar(false); });
  $('#btn-atualizar').addEventListener('click', function () { carregar(true); });

  function carregar(mostrarErro) {
    if (carregandoDados || !sess) return Promise.resolve();
    carregandoDados = true;
    $('#btn-atualizar').classList.add('girando');
    return chamar('apuracao.dados').then(function (r) {
      dados = r;
      processar();
      renderTudo(false);
      var at = $('#t-atualizado'); at.classList.remove('off');
      at.lastChild.textContent = 'Atualizado às ' + App.hora(r.agora) + r.agora.substr(16, 3);
    }).catch(function (e) {
      $('#t-atualizado').classList.add('off'); $('#t-atualizado').lastChild.textContent = 'Sem conexão';
      if (mostrarErro && sess) App.toast(e.message, 'erro');
    }).then(function () { carregandoDados = false; $('#btn-atualizar').classList.remove('girando'); });
  }

  function processar() {
    var por = {};
    dados.lancamentos.forEach(function (l) {
      if (l.status !== 'PENDENTE' && l.status !== 'VALIDADO') return;
      (por[l.secao_id] = por[l.secao_id] || []).push(l);
    });
    dupMap = {};
    Object.keys(por).forEach(function (k) { if (por[k].length > 1) dupMap[k] = por[k]; });
    urnasMap = Core.resolverUrnas(dados.lancamentos);
    var n = dados.lancamentos.filter(function (l) { return l.status === 'PENDENTE'; }).length;
    var c = $('#cont-pend'); c.textContent = n; c.classList.toggle('zero', !n);
    $('#t-titulo').textContent = (dados.config.titulo || 'Apuração');
    document.title = 'Apuração' + (n ? ' (' + n + ')' : '') + ' — ' + (dados.config.candidato_nome || 'Fabricio Petri');
  }

  function renderTudo(forcarParametros) {
    if (!dados) return;
    painel.atualizar({ config: dados.config, locais: dados.locais, secoes: dados.secoes, urnas: Object.keys(urnasMap).map(function (k) { return urnasMap[k]; }) });
    if (aba === 'conferencia') renderConferencia();
    if (aba === 'lancamentos') renderLancamentos();
    if (aba === 'manual' && !$('#form-manual')) renderManual();
    if (aba === 'parametros' && (forcarParametros || !$('#par-conteudo'))) renderParametros();
  }

  /* abas */
  function irAba(nova) {
    aba = nova;
    $$('.aba').forEach(function (b) { b.classList.toggle('ativa', b.dataset.aba === nova); b.setAttribute('aria-selected', b.dataset.aba === nova); });
    $$('[data-painel]').forEach(function (s) { s.hidden = s.dataset.painel !== nova; });
    window.scrollTo({ top: 0 });
    if (nova === 'parametros') renderParametros();
    else if (nova === 'manual') renderManual();
    else renderTudo(false);
  }
  $$('.aba').forEach(function (b) { b.addEventListener('click', function () { irAba(b.dataset.aba); }); });

  function porId(id) { return dados.lancamentos.filter(function (l) { return l.id === id; })[0]; }
  function nomeLocal(l) {
    if (!l.local_id && Core.ehTotal(l)) return 'TOTAL DE ' + (l.municipio || '');
    var loc = dados.locais.filter(function (x) { return x.id === l.local_id; })[0];
    return loc ? loc.nome : l.local;
  }
  function rotuloSecao(l) { return Core.ehTotal(l) ? (l.local_id ? 'Total do local' : 'Total do município') : 'Seção ' + l.secao; }
  function opcoesLocaisLanc(lista, valor) {
    var vistos = {}, ops = [];
    lista.forEach(function (l) { if (!vistos[l.local_id]) { vistos[l.local_id] = true; ops.push({ id: l.local_id, nome: nomeLocal(l), mun: l.municipio }); } });
    var varios = ops.some(function (o) { return Core.norm(o.mun) !== Core.norm(dados.config.municipio_principal); });
    ops.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    return '<option value="">Todos os locais</option>' + ops.map(function (o) {
      return '<option value="' + h(o.id) + '"' + (o.id === valor ? ' selected' : '') + '>' + h(o.nome) + (varios ? ' — ' + h(o.mun) : '') + '</option>';
    }).join('');
  }
  function textoBusca(l) { return Core.norm([nomeLocal(l), 'secao ' + l.secao, l.secao, l.nome, l.telefone, l.municipio].join(' ')); }
  function corrigido(l) { return typeof l.votos_informados === 'number' && typeof l.votos === 'number' && l.votos !== l.votos_informados; }
  function selo(st) { return '<span class="selo selo-' + st + '">' + ROT_STATUS[st] + '</span>'; }

  /* ================= CONFERÊNCIA ================= */
  function cartaoConf(l, dentroDup) {
    var corr = corrigido(l);
    return '<div class="conf' + (dupMap[l.secao_id] && !dentroDup ? ' dup' : '') + '" style="' + (l.status === 'VALIDADO' ? 'border-left-color:var(--validado)' : '') + '">' +
      '<div class="l1"><div><div class="local">' + h(nomeLocal(l)) + '</div><div class="secao">' + h(rotuloSecao(l)) +
      (l.municipio && Core.norm(l.municipio) !== Core.norm(dados.config.municipio_principal) ? ' · ' + h(l.municipio) : '') + '</div></div>' +
      '<div class="votos num">' + App.n(l.votos) + '<small>VOTOS' + (corr ? ' (inf. ' + App.n(l.votos_informados) + ')' : '') + '</small></div></div>' +
      '<div class="fiscal"><span>' + h(l.nome || '—') + '</span>' +
      (l.telefone ? '<a href="' + App.whatsapp(l.telefone) + '" target="_blank" rel="noopener">' + App.tel(l.telefone) + '</a>' : '') +
      '<span>' + App.hora(l.recebido_em) + '</span>' + (dentroDup ? selo(l.status) : '') + '</div>' +
      '<div class="acoes">' +
      (dentroDup
        ? '<button class="btn btn-sec btn-sm" data-abrir="' + l.id + '">' + ICON.olho + 'Ver BU</button><button class="btn btn-ok btn-sm" data-usar="' + l.id + '">' + ICON.check + 'Usar este</button>'
        : '<button class="btn btn-azul btn-sm" data-abrir="' + l.id + '">' + ICON.olho + 'Conferir BU</button><button class="btn btn-sec btn-sm" data-validar="' + l.id + '">' + ICON.check + 'Validar</button>') +
      '</div></div>';
  }

  function renderConferencia() {
    var raiz = $('#sec-conferencia');
    if (!$('#cf-busca', raiz)) {
      raiz.innerHTML = '<div class="filtros card">' +
        '<div class="filtro filtro-largo"><label for="cf-busca">Buscar</label><input class="input" id="cf-busca" type="search" placeholder="Local, nº da seção ou fiscal"></div>' +
        '<div class="filtro filtro-largo"><label for="cf-local">Local de votação</label><select class="input" id="cf-local"></select></div>' +
        '<div class="filtro"><label for="cf-ordem">Ordenar</label><select class="input" id="cf-ordem">' +
        '<option value="antigos">Mais antigos primeiro</option><option value="recentes">Mais recentes primeiro</option>' +
        '<option value="maior">Mais votos primeiro</option><option value="menor">Menos votos primeiro</option><option value="secao">Nº da seção</option></select></div>' +
        '<button class="btn btn-ghost btn-sm filtro-limpar" id="cf-limpar" type="button" hidden>Limpar filtros</button></div><div id="cf-res"></div>';
      $('#cf-busca', raiz).addEventListener('input', function () { cfFiltro.busca = this.value; renderConferencia(); });
      $('#cf-local', raiz).addEventListener('change', function () { cfFiltro.local = this.value; renderConferencia(); });
      $('#cf-ordem', raiz).addEventListener('change', function () { cfFiltro.ordem = this.value; renderConferencia(); });
      $('#cf-limpar', raiz).addEventListener('click', function () { cfFiltro.busca = ''; cfFiltro.local = ''; $('#cf-busca', raiz).value = ''; renderConferencia(); });
    }
    var abertos = dados.lancamentos.filter(function (l) { return l.status === 'PENDENTE' || (l.status === 'VALIDADO' && dupMap[l.secao_id]); });
    $('#cf-local', raiz).innerHTML = opcoesLocaisLanc(abertos, cfFiltro.local);
    if (cfFiltro.local && $('#cf-local', raiz).value !== cfFiltro.local) cfFiltro.local = '';
    $('#cf-ordem', raiz).value = cfFiltro.ordem;
    var q = Core.norm(cfFiltro.busca);
    var filtrando = !!(q || cfFiltro.local);
    $('#cf-limpar', raiz).hidden = !filtrando;
    var passa = function (l) { return (!cfFiltro.local || l.local_id === cfFiltro.local) && (!q || textoBusca(l).indexOf(q) >= 0); };
    var ordens = {
      antigos: function (a, b) { return a.recebido_em < b.recebido_em ? -1 : 1; },
      recentes: function (a, b) { return a.recebido_em < b.recebido_em ? 1 : -1; },
      maior: function (a, b) { return (b.votos || 0) - (a.votos || 0); },
      menor: function (a, b) { return (a.votos || 0) - (b.votos || 0); },
      secao: function (a, b) { return Number(a.secao) - Number(b.secao); }
    };
    var rotOrdem = { antigos: 'mais antigos primeiro', recentes: 'mais recentes primeiro', maior: 'mais votos primeiro', menor: 'menos votos primeiro', secao: 'por nº da seção' };
    var totalPend = dados.lancamentos.filter(function (l) { return l.status === 'PENDENTE' && !dupMap[l.secao_id]; }).length;
    var pend = dados.lancamentos.filter(function (l) { return l.status === 'PENDENTE' && !dupMap[l.secao_id] && passa(l); })
      .sort(ordens[cfFiltro.ordem] || ordens.antigos);
    var grupos = Object.keys(dupMap).map(function (k) { return dupMap[k]; }).filter(function (g) { return g.some(passa); });
    var el = $('#cf-res', raiz);
    var html = '';
    if (grupos.length) {
      html += '<div class="card-titulo"><h2>' + grupos.length + (grupos.length > 1 ? ' seções com envios repetidos' : ' seção com envio repetido') + '</h2></div>';
      html += grupos.map(function (g) {
        var l0 = g[0];
        return '<div class="dup-grupo"><h3>' + ICON.alerta + h(nomeLocal(l0)) + ' — Seção ' + h(l0.secao) + ' · ' + g.length + ' envios</h3>' +
          '<p class="small" style="margin:-4px 0 12px;color:#8a1f1f">Escolha qual envio vale. Os outros serão marcados como substituídos.</p>' +
          '<div class="conf-lista">' + g.map(function (l) { return cartaoConf(l, true); }).join('') + '</div></div>';
      }).join('');
    }
    html += '<div class="card-titulo" style="margin-top:' + (grupos.length ? '24px' : '0') + '"><h2>Aguardando conferência</h2><span class="muted small">' +
      (filtrando ? pend.length + ' de ' + totalPend : pend.length) + ' envio' + ((filtrando ? totalPend : pend.length) === 1 ? '' : 's') + ' · ' + rotOrdem[cfFiltro.ordem] + '</span></div>';
    if (!pend.length && filtrando) {
      html += '<div class="card vazio">Nenhum envio aguardando conferência com esse filtro.</div>';
    } else if (!pend.length) {
      html += '<div class="card centro" style="padding:36px 20px"><div class="sucesso-icone">' + ICON.check + '</div><h2>Tudo conferido</h2><p class="muted" style="margin:6px 0 0">Novos envios dos fiscais aparecem aqui automaticamente (a cada 30 segundos).</p></div>';
    } else {
      html += '<div class="conf-lista">' + pend.map(function (l) { return cartaoConf(l, false); }).join('') + '</div>';
    }
    el.innerHTML = html;
    $$('[data-abrir]', el).forEach(function (b) { b.onclick = function () { abrirConferencia(b.dataset.abrir); }; });
    $$('[data-validar]', el).forEach(function (b) {
      b.onclick = function () {
        App.carregando(b, true);
        validar(b.dataset.validar).catch(function () { App.carregando(b, false); });
      };
    });
    $$('[data-usar]', el).forEach(function (b) {
      b.onclick = function () {
        var l = porId(b.dataset.usar);
        App.confirmar('Usar este envio?', h(rotuloSecao(l)) + ' ficará com <b>' + App.n(l.votos) + ' votos</b> (enviado por ' + h(l.nome) + ' às ' + App.hora(l.recebido_em) + '). Os outros envios desta seção serão marcados como substituídos.', 'Usar este').then(function (ok) {
          if (ok) validar(l.id);
        });
      };
    });
  }

  function validar(id, votos) {
    return chamar('apuracao.validar', { id: id, votos: votos }).then(function () {
      App.toast('Envio confirmado.', 'ok');
      return carregar(true);
    }).catch(function (e) { App.toast(e.message, 'erro'); throw e; });
  }

  function proximoPendente(atualId) {
    var q = Core.norm(cfFiltro.busca);
    var pend = dados.lancamentos.filter(function (l) {
      return l.status === 'PENDENTE' && l.id !== atualId && (!cfFiltro.local || l.local_id === cfFiltro.local) && (!q || textoBusca(l).indexOf(q) >= 0);
    }).sort(function (a, b) { return a.recebido_em < b.recebido_em ? -1 : 1; });
    return pend[0] || null;
  }

  function abrirConferencia(id) {
    var l = porId(id);
    if (!l) return;
    var outros = dados.lancamentos.filter(function (o) { return o.secao_id === l.secao_id && o.id !== l.id && (o.status === 'PENDENTE' || o.status === 'VALIDADO'); });
    var corr = corrigido(l);
    var temProx = !!proximoPendente(l.id);
    var html = App.cabecalhoModal(nomeLocal(l) + ' — ' + rotuloSecao(l), h(l.municipio) + ' · recebido ' + App.dataHora(l.recebido_em) + ' · ' + selo(l.status)) +
      '<div class="conf-modal">' +
      '<div><div class="foto-viewer" id="cf-viewer"><div class="carregando">' + (l.foto_id ? 'Carregando foto do BU…' : 'Este envio não tem foto.') + '</div></div>' +
      '<div class="foto-ferr">' + (l.foto_id ? '<button class="btn btn-sec btn-sm" id="cf-zoom">' + ICON.zoom + 'Ampliar</button><button class="btn btn-sec btn-sm" id="cf-girar">' + ICON.girar + 'Girar</button><a class="btn btn-ghost btn-sm" id="cf-drive" target="_blank" rel="noopener" hidden>Abrir no Drive</a>' : '') + '</div></div>' +
      '<div>' +
      (outros.length ? '<div class="aviso aviso-perigo">' + ICON.alerta + '<div><b>Esta seção tem outro' + (outros.length > 1 ? 's' : '') + ' envio' + (outros.length > 1 ? 's' : '') + '</b>' +
        outros.map(function (o) { return App.n(o.votos) + ' votos — ' + h(o.nome) + ' às ' + App.hora(o.recebido_em) + ' (' + ROT_STATUS[o.status].toLowerCase() + ')'; }).join('<br>') +
        '<br>Validar este marca os outros como substituídos.</div></div>' : '') +
      '<div class="resumo-envio" style="margin-bottom:16px">' +
      '<div class="linha"><span>Fiscal</span><b>' + h(l.nome || '—') + '</b></div>' +
      (l.telefone ? '<div class="linha"><span>Telefone</span><b><a href="' + App.whatsapp(l.telefone) + '" target="_blank" rel="noopener">' + App.tel(l.telefone) + '</a></b></div>' : '') +
      '<div class="linha"><span>Origem</span><b>' + (l.origem === 'APURACAO' ? 'Lançado pela apuração' : 'Fiscal') + '</b></div>' +
      (l.validado_por ? '<div class="linha"><span>' + (l.status === 'REJEITADO' ? 'Rejeitado' : 'Conferido') + ' por</span><b>' + h(l.validado_por) + ' · ' + App.hora(l.validado_em) + '</b></div>' : '') +
      (l.obs ? '<div class="linha"><span>Observação</span><b>' + h(l.obs) + '</b></div>' : '') +
      '</div>' +
      '<div class="campo"><label for="cf-votos">Votos de ' + h(dados.config.candidato_nome || 'Fabricio Petri') + ' (confira com a foto)</label>' +
      '<div class="votos-box"><div class="cand"><b>' + h(dados.config.candidato_numero || '36.222') + '</b><span>' + (corr ? 'fiscal informou ' + App.n(l.votos_informados) : 'informado pelo fiscal') + '</span></div>' +
      '<input class="votos-input" id="cf-votos" inputmode="numeric" maxlength="8" value="' + (typeof l.votos === 'number' ? App.formatarVotos(l.votos) : '') + '" autocomplete="off"></div>' +
      '<div class="ajuda">Se o número estiver diferente do BU, corrija antes de validar.</div></div>' +
      '<div class="acoes" style="flex-direction:column">' +
      (l.status !== 'VALIDADO' ? '<button class="btn btn-ok btn-xl" id="cf-validar">' + ICON.check + 'Validar' + (temProx ? ' e ir para o próximo' : '') + '</button>' : '<button class="btn btn-ok btn-xl" id="cf-validar">' + ICON.check + 'Salvar votos</button>') +
      '<div style="display:flex;gap:10px">' +
      (l.status !== 'REJEITADO' ? '<button class="btn btn-perigo-sec" id="cf-rejeitar" style="flex:1">' + ICON.x + 'Rejeitar</button>' : '') +
      (l.status !== 'PENDENTE' ? '<button class="btn btn-sec" id="cf-reabrir" style="flex:1">Voltar para conferência</button>' : '') +
      '</div></div></div></div>';
    var m = App.modal(html, { classe: 'largo' });
    var inp = $('#cf-votos', m.el);
    App.campoVotos(inp);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#cf-validar', m.el).click(); } });
    if (window.innerWidth > 760) setTimeout(function () { inp.focus(); inp.select(); }, 80);

    // foto
    if (l.foto_id) {
      var viewer = $('#cf-viewer', m.el), atual = null;
      var mostrar = function (src) { atual = src; viewer.innerHTML = '<img src="' + src + '" alt="Foto do boletim de urna">'; $('img', viewer).onclick = function () { viewer.classList.toggle('zoom'); }; };
      var c = fotosCache[l.id];
      if (c) { mostrar(c.foto); if (c.link) { $('#cf-drive', m.el).href = c.link; $('#cf-drive', m.el).hidden = false; } }
      else chamar('apuracao.foto', { id: l.id }).then(function (r) {
        fotosCache[l.id] = r; mostrar(r.foto);
        if (r.link && $('#cf-drive', m.el)) { $('#cf-drive', m.el).href = r.link; $('#cf-drive', m.el).hidden = false; }
      }).catch(function (e) { viewer.innerHTML = '<div class="carregando">Não foi possível carregar a foto.<br>' + h(e.message) + '</div>'; });
      $('#cf-zoom', m.el).onclick = function () { viewer.classList.toggle('zoom'); };
      $('#cf-girar', m.el).onclick = function () { if (atual) App.girarFoto(atual).then(mostrar); };
    }

    $('#cf-validar', m.el).onclick = function () {
      var b = this, v = inp.value;
      if (v === '') { App.toast('Informe a quantidade de votos.', 'erro'); inp.focus(); return; }
      App.carregando(b, true, 'Salvando…');
      var prox = l.status === 'PENDENTE' ? proximoPendente(l.id) : null;
      chamar('apuracao.validar', { id: l.id, votos: App.valorVotos(v) }).then(function () {
        App.toast('Seção ' + l.secao + ' confirmada com ' + App.n(App.valorVotos(v)) + ' votos.', 'ok');
        m.fechar();
        return carregar(true).then(function () {
          if (prox) { var p = porId(prox.id); if (p && p.status === 'PENDENTE') abrirConferencia(p.id); }
        });
      }).catch(function (e) { App.toast(e.message, 'erro'); App.carregando(b, false); });
    };
    var rej = $('#cf-rejeitar', m.el);
    if (rej) rej.onclick = function () {
      App.confirmar('Rejeitar este envio?', 'Os votos deste envio não serão contados. Você pode desfazer depois em "Todos os envios".', 'Rejeitar', true).then(function (ok) {
        if (!ok) return;
        chamar('apuracao.rejeitar', { id: l.id }).then(function () { App.toast('Envio rejeitado.'); m.fechar(); carregar(true); }).catch(function (e) { App.toast(e.message, 'erro'); });
      });
    };
    var reab = $('#cf-reabrir', m.el);
    if (reab) reab.onclick = function () {
      chamar('apuracao.reabrir', { id: l.id }).then(function () { App.toast('Envio voltou para conferência.'); m.fechar(); carregar(true); }).catch(function (e) { App.toast(e.message, 'erro'); });
    };
  }

  /* ================= TODOS OS ENVIOS ================= */
  function renderLancamentos() {
    var el = $('#sec-lancamentos');
    if (!$('#lf-busca', el)) {
      el.innerHTML = '<div class="filtros card">' +
        '<div class="filtro filtro-largo"><label for="lf-busca">Buscar</label><input class="input" id="lf-busca" type="search" placeholder="Local, nº da seção, fiscal ou telefone"></div>' +
        '<div class="filtro"><label for="lf-status">Status</label><select class="input" id="lf-status"><option value="TODOS">Todos</option><option value="PENDENTE">Em conferência</option><option value="VALIDADO">Confirmados</option><option value="REJEITADO">Rejeitados</option><option value="DESCARTADO">Substituídos</option></select></div>' +
        '<div class="filtro"><label for="lf-mun">Município</label><select class="input" id="lf-mun"></select></div>' +
        '<div class="filtro filtro-largo"><label for="lf-local">Local de votação</label><select class="input" id="lf-local"></select></div>' +
        '<div class="filtro"><label for="lf-origem">Origem</label><select class="input" id="lf-origem"><option value="">Todas</option><option value="FISCAL">Fiscais</option><option value="APURACAO">Lançados pela apuração</option></select></div>' +
        '<div class="filtro"><label for="lf-ordem">Ordenar</label><select class="input" id="lf-ordem"><option value="recentes">Mais recentes</option><option value="antigos">Mais antigos</option><option value="maior">Mais votos</option><option value="menor">Menos votos</option><option value="secao">Nº da seção</option></select></div>' +
        '<button class="btn btn-ghost btn-sm filtro-limpar" id="lf-limpar" type="button" hidden>Limpar filtros</button></div>' +
        '<div class="card" style="padding:12px 16px"><div class="muted small" id="lf-total" style="margin:4px 0 8px"></div><div class="tabela-wrap"><table class="tabela responsiva" id="lf-tabela"></table></div></div>';
      $('#lf-busca', el).addEventListener('input', function () { filtros.busca = this.value; desenharTabela(); });
      $('#lf-status', el).addEventListener('change', function () { filtros.status = this.value; desenharTabela(); });
      $('#lf-mun', el).addEventListener('change', function () { filtros.mun = this.value; filtros.local = ''; renderLancamentos(); });
      $('#lf-local', el).addEventListener('change', function () { filtros.local = this.value; desenharTabela(); });
      $('#lf-origem', el).addEventListener('change', function () { filtros.origem = this.value; desenharTabela(); });
      $('#lf-ordem', el).addEventListener('change', function () { filtros.ordem = this.value; desenharTabela(); });
      $('#lf-limpar', el).addEventListener('click', function () {
        filtros.busca = ''; filtros.status = 'TODOS'; filtros.mun = ''; filtros.local = ''; filtros.origem = '';
        $('#lf-busca', el).value = ''; $('#lf-origem', el).value = ''; renderLancamentos();
      });
    }
    var muns = {}; dados.lancamentos.forEach(function (l) { if (l.municipio) muns[l.municipio] = true; });
    var selM = $('#lf-mun', el);
    selM.innerHTML = '<option value="">Todos os municípios</option>' + Object.keys(muns).sort().map(function (m) { return '<option>' + h(m) + '</option>'; }).join('');
    selM.value = filtros.mun; selM.closest('.filtro').hidden = Object.keys(muns).length < 2;
    $('#lf-local', el).innerHTML = opcoesLocaisLanc(dados.lancamentos.filter(function (l) { return !filtros.mun || l.municipio === filtros.mun; }), filtros.local);
    if (filtros.local && $('#lf-local', el).value !== filtros.local) filtros.local = '';
    $('#lf-status', el).value = filtros.status;
    $('#lf-ordem', el).value = filtros.ordem;
    desenharTabela();
  }
  function desenharTabela() {
    var q = Core.norm(filtros.busca);
    var lista = dados.lancamentos.filter(function (l) {
      if (filtros.status !== 'TODOS' && l.status !== filtros.status) return false;
      if (filtros.mun && l.municipio !== filtros.mun) return false;
      if (filtros.local && l.local_id !== filtros.local) return false;
      if (filtros.origem && l.origem !== filtros.origem) return false;
      if (q && textoBusca(l).indexOf(q) < 0) return false;
      return true;
    }).sort({
      recentes: function (a, b) { return a.recebido_em < b.recebido_em ? 1 : -1; },
      antigos: function (a, b) { return a.recebido_em < b.recebido_em ? -1 : 1; },
      maior: function (a, b) { return (b.votos || 0) - (a.votos || 0); },
      menor: function (a, b) { return (a.votos || 0) - (b.votos || 0); },
      secao: function (a, b) { return Number(a.secao) - Number(b.secao); }
    }[filtros.ordem]);
    $('#lf-limpar').hidden = !(filtros.busca || filtros.status !== 'TODOS' || filtros.mun || filtros.local || filtros.origem);
    var soma = 0; lista.forEach(function (l) { if (typeof l.votos === 'number') soma += l.votos; });
    $('#lf-total').textContent = lista.length + ' envio' + (lista.length === 1 ? '' : 's') + (filtros.status !== 'TODOS' ? ' · ' + App.n(soma) + ' votos' : '');
    $('#lf-tabela').innerHTML = '<thead><tr><th>Hora</th><th>Local</th><th class="r">Seção</th><th class="r">Votos</th><th>Fiscal</th><th>Status</th><th></th></tr></thead><tbody>' +
      (lista.length ? lista.map(function (l) {
        var corr = corrigido(l);
        return '<tr' + (dupMap[l.secao_id] && (l.status === 'PENDENTE' || l.status === 'VALIDADO') ? ' style="background:#fff8f8"' : '') + '>' +
          '<td data-l="Hora" class="num">' + App.dataHora(l.recebido_em) + '</td>' +
          '<td data-l="Local"><b>' + h(nomeLocal(l)) + '</b>' + (l.municipio && Core.norm(l.municipio) !== Core.norm(dados.config.municipio_principal) ? '<div class="tiny muted">' + h(l.municipio) + '</div>' : '') + '</td>' +
          '<td data-l="Seção" class="r">' + (Core.ehTotal(l) ? '<span class="tiny muted">total</span>' : h(l.secao)) + '</td>' +
          '<td data-l="Votos" class="r"><b>' + App.n(l.votos) + '</b>' + (corr ? '<div class="tiny muted">inf. ' + App.n(l.votos_informados) + '</div>' : '') + '</td>' +
          '<td data-l="Fiscal">' + h(l.nome) + (l.origem === 'APURACAO' ? ' <span class="tiny muted">(manual)</span>' : '') + '</td>' +
          '<td data-l="Status">' + selo(l.status) + '</td>' +
          '<td data-l=""><button class="btn btn-sec btn-sm" data-abrir="' + l.id + '">Abrir</button></td></tr>';
      }).join('') : '<tr><td colspan="7" class="vazio">Nenhum envio encontrado.</td></tr>') + '</tbody>';
    $$('#lf-tabela [data-abrir]').forEach(function (b) { b.onclick = function () { abrirConferencia(b.dataset.abrir); }; });
  }

  /* ================= LANÇAMENTO MANUAL ================= */
  var fotoManual = null;
  var NOVO = '__novo__';
  function municipiosConhecidos() {
    var m = {}; m[String(dados.config.municipio_principal || 'ANCHIETA').toUpperCase()] = true;
    dados.locais.forEach(function (l) { if (l.municipio) m[l.municipio.toUpperCase()] = true; });
    dados.lancamentos.forEach(function (l) { if (l.municipio) m[l.municipio.toUpperCase()] = true; });
    return Object.keys(m).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }
  function renderManual() {
    if (!dados) return;
    var el = $('#sec-manual');
    if ($('#form-manual', el)) { atualizarListasManual(); return; }
    el.innerHTML = '<div style="max-width:760px;margin:0 auto"><form class="card" id="form-manual" novalidate>' +
      '<div class="card-titulo"><div><h2>Lançar resultado manualmente</h2><p class="muted small" style="margin:4px 0 0">Para resultados recebidos por outros meios (WhatsApp, ligação, outros municípios). Entra como <b>confirmado</b>.<br>' +
      'Só <b>município e votos</b> são obrigatórios. Sem local, vale como <b>total do município</b>; com local e sem seção, como <b>total do local</b>.</p></div></div>' +
      '<div class="grid-2">' +
      '<div class="campo"><label for="mn-mun">Município</label><select class="input" id="mn-mun"></select>' +
      '<input class="input" id="mn-mun-novo" placeholder="Nome do novo município" autocomplete="off" style="margin-top:8px" hidden></div>' +
      '<div class="campo"><label for="mn-local">Local de votação <span class="muted">(opcional)</span></label><select class="input" id="mn-local"></select>' +
      '<input class="input" id="mn-local-novo" placeholder="Nome do novo local" autocomplete="off" style="margin-top:8px" hidden></div></div>' +
      '<div class="grid-2"><div class="campo"><label for="mn-secao">Seção <span class="muted">(opcional)</span></label><input class="input" id="mn-secao" list="dl-secao" inputmode="numeric" autocomplete="off" placeholder="Deixe vazio para lançar o total"><datalist id="dl-secao"></datalist></div>' +
      '<div class="campo"><label for="mn-votos">Votos de ' + h(dados.config.candidato_nome || 'Fabricio Petri') + '</label><input class="input" id="mn-votos" inputmode="numeric" autocomplete="off" style="font-size:22px;font-weight:800;color:var(--laranja)"></div></div>' +
      '<div class="aviso aviso-info" id="mn-resumo"></div>' +
      '<div class="grid-2"><div class="campo"><label for="mn-nome">Quem informou <span class="muted">(opcional)</span></label><input class="input" id="mn-nome" autocomplete="off"></div>' +
      '<div class="campo"><label for="mn-tel">Telefone <span class="muted">(opcional)</span></label><input class="input" id="mn-tel" type="tel" inputmode="tel" autocomplete="off"></div></div>' +
      '<div class="campo"><label for="mn-obs">Observação <span class="muted">(opcional)</span></label><input class="input" id="mn-obs" maxlength="200" autocomplete="off" placeholder="Ex.: informado pelo coordenador regional"></div>' +
      '<div class="campo"><span class="rotulo">Foto do BU ou do comprovante <span class="muted">(opcional)</span></span><div class="foto-area" id="mn-foto-area">' +
      '<div id="mn-foto-vazia"><div class="foto-botoes"><label class="btn btn-sec" for="mn-foto">' + ICON.galeria + 'Anexar foto</label></div></div>' +
      '<div id="mn-foto-cheia" class="foto-prev" hidden><img id="mn-foto-prev" alt="Prévia"><button type="button" class="btn btn-sec btn-sm trocar" id="mn-foto-tirar">Remover</button></div>' +
      '<input class="foto-input" type="file" id="mn-foto" accept="image/*"></div></div>' +
      '<button class="btn btn-primario btn-xl" type="submit" id="mn-enviar" style="margin-top:8px">' + ICON.check + 'Lançar como confirmado</button></form></div>';
    $('#mn-mun').addEventListener('change', function () {
      $('#mn-mun-novo').hidden = this.value !== NOVO;
      if (this.value === NOVO) $('#mn-mun-novo').focus();
      $('#mn-local').value = ''; atualizarListasManual('', '');
    });
    $('#mn-mun-novo').addEventListener('input', atualizarResumoManual);
    $('#mn-local').addEventListener('change', function () {
      $('#mn-local-novo').hidden = this.value !== NOVO;
      if (this.value === NOVO) $('#mn-local-novo').focus();
      atualizarListasManual();
    });
    $('#mn-local-novo').addEventListener('input', atualizarResumoManual);
    $('#mn-secao').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); atualizarResumoManual(); });
    App.campoVotos($('#mn-votos'), atualizarResumoManual);
    $('#mn-foto').addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = ''; if (!f) return;
      App.comprimirFoto(f).then(function (d) { fotoManual = d; $('#mn-foto-prev').src = d; $('#mn-foto-vazia').hidden = true; $('#mn-foto-cheia').hidden = false; })
        .catch(function (err) { App.toast(err.message, 'erro'); });
    });
    $('#mn-foto-tirar').addEventListener('click', function () { fotoManual = null; $('#mn-foto-vazia').hidden = false; $('#mn-foto-cheia').hidden = true; });
    $('#form-manual').addEventListener('submit', enviarManual);
    atualizarListasManual();
  }
  /* lê o que está preenchido no formulário */
  function dadosManual() {
    var munSel = $('#mn-mun').value, locSel = $('#mn-local').value;
    var municipio = (munSel === NOVO ? $('#mn-mun-novo').value : munSel).trim().toUpperCase();
    var localObj = null, localNome = '';
    if (locSel === NOVO) localNome = $('#mn-local-novo').value.trim().toUpperCase();
    else if (locSel) { localObj = dados.locais.filter(function (l) { return l.id === locSel; })[0] || null; localNome = localObj ? localObj.nome : ''; }
    return { municipio: municipio, localObj: localObj, local: localNome, novoLocal: locSel === NOVO, secao: $('#mn-secao').value.trim(), votos: App.valorVotos($('#mn-votos').value) };
  }
  function atualizarListasManual(prefMun, prefLocal) {
    var selM = $('#mn-mun'), atualM = (typeof prefMun === 'string' && prefMun) || selM.value || String(dados.config.municipio_principal || 'ANCHIETA').toUpperCase();
    var muns = municipiosConhecidos();
    selM.innerHTML = muns.map(function (m) { return '<option value="' + h(m) + '">' + h(m) + '</option>'; }).join('') + '<option value="' + NOVO + '">＋ Outro município…</option>';
    selM.value = (atualM === NOVO || muns.indexOf(atualM) >= 0) ? atualM : muns[0];
    $('#mn-mun-novo').hidden = selM.value !== NOVO;
    var selL = $('#mn-local'), atualL = typeof prefLocal === 'string' ? prefLocal : selL.value;
    var locs = selM.value === NOVO ? [] : dados.locais.filter(function (l) { return l.municipio === selM.value; }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    selL.innerHTML = '<option value="">— Nenhum (total do município) —</option>' + locs.map(function (l) { return '<option value="' + h(l.id) + '">' + h(l.nome) + '</option>'; }).join('') +
      '<option value="' + NOVO + '">＋ Novo local…</option>';
    selL.value = (atualL === NOVO || locs.some(function (l) { return l.id === atualL; })) ? atualL : '';
    $('#mn-local-novo').hidden = selL.value !== NOVO;
    var loc = locs.filter(function (l) { return l.id === selL.value; })[0];
    $('#dl-secao').innerHTML = loc ? dados.secoes.filter(function (s) { return s.local_id === loc.id; }).map(function (s) { return '<option value="' + h(s.numero) + '">'; }).join('') : '';
    var semLocal = !selL.value || (selL.value === NOVO && !$('#mn-local-novo').value.trim());
    $('#mn-secao').disabled = !selL.value;
    if (!selL.value) $('#mn-secao').value = '';
    $('#mn-secao').placeholder = selL.value ? 'Deixe vazio para lançar o total do local' : 'Escolha um local para informar a seção';
    atualizarResumoManual();
  }
  function atualizarResumoManual() {
    var d = dadosManual(), el = $('#mn-resumo');
    if (!el) return;
    var oque;
    if (!d.municipio) oque = 'Escolha o município.';
    else if (!d.local) oque = 'Será lançado o <strong>TOTAL do município ' + h(d.municipio) + '</strong>' + (d.novoLocal ? ' (digite o nome do novo local)' : '') + '.';
    else if (!d.secao) oque = 'Será lançado o <strong>TOTAL do local ' + h(d.local) + '</strong> (' + h(d.municipio) + '), sem detalhar seções.';
    else oque = 'Será lançada a <strong>seção ' + h(d.secao) + '</strong> de <strong>' + h(d.local) + '</strong> (' + h(d.municipio) + ').';
    el.innerHTML = ICON.info + '<div>' + oque + (isNaN(d.votos) ? '' : ' Votos: <strong>' + App.n(d.votos) + '</strong>.') + '</div>';
  }
  function enviarManual(e) {
    e.preventDefault();
    var f = dadosManual();
    if (!f.municipio) return App.toast('Informe o município.', 'erro');
    if (f.novoLocal && !f.local) return App.toast('Digite o nome do novo local (ou escolha "Nenhum").', 'erro');
    if (isNaN(f.votos)) return App.toast('Informe a quantidade de votos.', 'erro');
    var d = { municipio: f.municipio, local: f.local, secao: f.secao, votos: String(f.votos),
      nome: $('#mn-nome').value.trim(), telefone: $('#mn-tel').value, obs: $('#mn-obs').value.trim(), foto: fotoManual, client_id: App.uuid() };
    var ativos = function (l) { return l.status === 'PENDENTE' || l.status === 'VALIDADO'; };
    var doMun = function (l) { return Core.norm(l.municipio) === Core.norm(f.municipio); };
    var soma = function (ls) { return ls.reduce(function (a, l) { return a + (l.votos || 0); }, 0); };
    var msgs = [], alvo;
    if (!f.local) {
      alvo = 'o <b>total do município ' + h(f.municipio) + '</b>';
      var totAnt = dados.lancamentos.filter(function (l) { return ativos(l) && doMun(l) && Core.ehTotal(l) && !l.local_id; });
      if (totAnt.length) msgs.push('Já existe um total informado para ' + h(f.municipio) + ' (' + App.n(soma(totAnt)) + ' votos). Ele será <b>substituído</b>.');
      var det = dados.lancamentos.filter(function (l) { return ativos(l) && doMun(l) && !(Core.ehTotal(l) && !l.local_id); });
      if (det.length) msgs.push('<span style="color:#b34700"><b>Atenção:</b> já existem ' + det.length + ' lançamento(s) por local/seção em ' + h(f.municipio) + ' somando ' + App.n(soma(det)) + ' votos. O total será <b>somado</b> a eles. Se o total já inclui esses votos, rejeite os outros em "Todos os envios".</span>');
    } else if (!f.secao) {
      alvo = 'o <b>total do local ' + h(f.local) + '</b> (' + h(f.municipio) + ')';
      if (f.localObj) {
        var totL = dados.lancamentos.filter(function (l) { return ativos(l) && l.secao_id === 'TOT-' + f.localObj.id; });
        if (totL.length) msgs.push('Já existe um total para este local (' + App.n(soma(totL)) + ' votos). Ele será <b>substituído</b>.');
        var secL = dados.lancamentos.filter(function (l) { return ativos(l) && l.local_id === f.localObj.id && !Core.ehTotal(l); });
        if (secL.length) msgs.push('<span style="color:#b34700"><b>Atenção:</b> este local já tem ' + secL.length + ' seção(ões) lançada(s) somando ' + App.n(soma(secL)) + ' votos. O total será <b>somado</b> a elas.</span>');
      } else msgs.push('O local <b>' + h(f.local) + '</b> será criado em ' + h(f.municipio) + '.');
      var totMun2 = dados.lancamentos.filter(function (l) { return ativos(l) && doMun(l) && Core.ehTotal(l) && !l.local_id; });
      if (totMun2.length) msgs.push('<span style="color:#b34700"><b>Atenção:</b> ' + h(f.municipio) + ' tem um total do município informado (' + App.n(soma(totMun2)) + ' votos). Este total do local será <b>somado</b> a ele.</span>');
    } else {
      alvo = 'a <b>seção ' + h(f.secao) + '</b> de ' + h(f.local) + ' (' + h(f.municipio) + ')';
      if (!f.localObj) msgs.push('O local <b>' + h(f.local) + '</b> será criado em ' + h(f.municipio) + '.');
      var sec = f.localObj ? dados.secoes.filter(function (s) { return s.local_id === f.localObj.id && s.numero === String(Number(f.secao)); })[0] : null;
      if (f.localObj && !sec) msgs.push('A seção ' + h(f.secao) + ' será criada neste local.');
      var exist = sec ? dados.lancamentos.filter(function (l) { return l.secao_id === sec.id && ativos(l); }) : [];
      var totLoc = f.localObj ? dados.lancamentos.filter(function (l) { return ativos(l) && l.secao_id === 'TOT-' + f.localObj.id; }) : [];
      if (totLoc.length) msgs.push('<span style="color:#b34700"><b>Atenção:</b> este local tem um total informado de ' + App.n(soma(totLoc)) + ' votos. A seção será <b>somada</b> a ele. Se o total já inclui esta seção, rejeite o total em "Todos os envios".</span>');
      var totMun = dados.lancamentos.filter(function (l) { return ativos(l) && doMun(l) && Core.ehTotal(l) && !l.local_id; });
      if (totMun.length) msgs.push('<span style="color:#b34700"><b>Atenção:</b> ' + h(f.municipio) + ' tem um total do município informado (' + App.n(soma(totMun)) + ' votos). A seção será <b>somada</b> a ele.</span>');
      if (exist.length) msgs.push('Esta seção já tem ' + exist.length + ' envio(s) (' + exist.map(function (l) { return App.n(l.votos) + ' votos'; }).join(', ') + '). Eles serão marcados como <b>substituídos</b>.');
    }
    App.confirmar('Confirmar lançamento', 'Lançar <b>' + App.n(f.votos) + ' votos</b> como ' + alvo + '?' + (msgs.length ? '<br><br>' + msgs.join('<br><br>') : ''), 'Lançar').then(function (ok) {
      if (!ok) return;
      var b = $('#mn-enviar'); App.carregando(b, true, 'Lançando…');
      chamar('apuracao.lancar', d).then(function () {
        App.toast('Lançado: ' + App.n(f.votos) + ' votos (' + (f.secao ? 'seção ' + f.secao : (f.local ? 'total do local' : 'total de ' + f.municipio)) + ').', 'ok');
        $('#mn-secao').value = ''; $('#mn-votos').value = ''; $('#mn-obs').value = ''; $('#mn-foto-tirar').click();
        return carregar(true).then(function () {
          // já deixa selecionados o município e o local usados (inclusive se foram criados agora)
          var nl = f.local ? dados.locais.filter(function (l) { return Core.norm(l.municipio) === Core.norm(f.municipio) && Core.norm(l.nome) === Core.norm(f.local); })[0] : null;
          $('#mn-mun-novo').value = ''; $('#mn-local-novo').value = '';
          atualizarListasManual(municipiosConhecidos().filter(function (m) { return Core.norm(m) === Core.norm(f.municipio); })[0] || f.municipio, nl ? nl.id : '');
        });
      }).catch(function (e2) { App.toast(e2.message, 'erro'); }).then(function () { App.carregando(b, false); });
    });
  }

  /* ================= PARÂMETROS ================= */
  function renderParametros() {
    if (!dados) return;
    var el = $('#sec-parametros');
    el.innerHTML = '<div class="sub-abas" role="tablist">' +
      [['geral', 'Geral'], ['locais', 'Locais e seções'], ['usuarios', 'Senhas']].map(function (s) {
        return '<button class="sub-aba' + (subAba === s[0] ? ' ativa' : '') + '" data-sub="' + s[0] + '">' + s[1] + '</button>';
      }).join('') + '</div><div id="par-conteudo"></div>';
    $$('.sub-aba', el).forEach(function (b) { b.onclick = function () { subAba = b.dataset.sub; renderParametros(); }; });
    if (subAba === 'geral') parGeral(); else if (subAba === 'locais') parLocais(); else parUsuarios();
  }
  function recarregarParametros() { return carregar(true).then(function () { renderParametros(); }); }

  /* --- Geral --- */
  function parGeral() {
    var c = dados.config, aberto = String(c.recebimento_aberto).toUpperCase() !== 'FALSE';
    var base = location.href.replace(/[^/]*([?#].*)?$/, '');
    $('#par-conteudo').innerHTML =
      '<div class="status-receb ' + (aberto ? 'aberto' : 'fechado') + '"><div class="txt"><b>Recebimento dos fiscais ' + (aberto ? 'ABERTO' : 'FECHADO') + '</b><span>' +
      (aberto ? 'Os fiscais conseguem enviar boletins agora.' : 'Os fiscais veem a mensagem "recebimento fechado" e não conseguem enviar.') + '</span></div>' +
      '<label class="switch" title="Abrir/fechar recebimento"><input type="checkbox" id="pg-receb"' + (aberto ? ' checked' : '') + '><span class="trilho"></span></label></div>' +
      '<div class="grade-painel">' +
      '<form class="card" id="form-config"><div class="card-titulo"><h3>Dados da campanha</h3></div>' +
      '<div class="campo"><label for="pg-titulo">Título do sistema</label><input class="input" id="pg-titulo" value="' + h(c.titulo) + '"></div>' +
      '<div class="grid-2"><div class="campo"><label for="pg-nome">Nome do candidato</label><input class="input" id="pg-nome" value="' + h(c.candidato_nome) + '"></div>' +
      '<div class="campo"><label for="pg-num">Número</label><input class="input" id="pg-num" value="' + h(c.candidato_numero) + '"></div></div>' +
      '<div class="grid-2"><div class="campo"><label for="pg-cargo">Cargo</label><input class="input" id="pg-cargo" value="' + h(c.cargo) + '"></div>' +
      '<div class="campo"><label for="pg-partido">Partido</label><input class="input" id="pg-partido" value="' + h(c.partido) + '"></div></div>' +
      '<div class="grid-2"><div class="campo"><label for="pg-mun">Município dos fiscais</label><input class="input" id="pg-mun" list="pg-dl-mun" value="' + h(c.municipio_principal) + '"><datalist id="pg-dl-mun">' + municipiosConhecidos().map(function (m) { return '<option value="' + h(m) + '">'; }).join('') + '</datalist><div class="ajuda">Os fiscais só veem os locais deste município.</div></div></div>' +
      '<div class="chave-linha" style="border-top:1px solid var(--linha);padding-top:14px;margin-top:4px"><div><b>Alerta de votos acima do esperado</b><span>Avisa o fiscal, na tela de conferência, quando ele digitar mais votos que o limite.</span></div><label class="switch"><input type="checkbox" id="pg-alerta"' + (String(c.alerta_votos_ativo).toUpperCase() === 'TRUE' ? ' checked' : '') + '><span class="trilho"></span></label></div>' +
      '<div class="campo" id="pg-max-campo" style="max-width:280px"><label for="pg-max">Limite de votos por seção</label><input class="input" id="pg-max" inputmode="numeric" value="' + h(App.formatarVotos(c.alerta_votos_max)) + '"><div class="ajuda">Acima deste número o fiscal recebe o aviso.</div></div>' +
      '<div class="chave-linha" style="border-top:1px solid var(--linha);padding-top:14px;margin-top:4px"><div><b>Foto do BU obrigatória</b><span>Exigir a foto no envio do fiscal.</span></div><label class="switch"><input type="checkbox" id="pg-foto"' + (String(c.foto_obrigatoria).toUpperCase() !== 'FALSE' ? ' checked' : '') + '><span class="trilho"></span></label></div>' +
      '<button class="btn btn-azul" type="submit" id="pg-salvar" style="margin-top:12px">Salvar alterações</button></form>' +
      '<div><section class="card"><div class="card-titulo"><h3>Links para compartilhar</h3></div>' +
      linkLinha('Link único (todos)', 'Um só link com as três opções: Fiscal, Apuração e Partido. É este que você divulga.', base) +
      linkLinha('Atalho direto do fiscal', 'Opcional: abre direto o formulário do BU, pulando a escolha.', base + 'fiscal.html') +
      linkLinha('Modo telão (TV do comitê)', 'Abre em tela cheia e atualiza sozinho. Pede a senha da Apuração ou do Partido.', base + 'telao.html') + '</section>' +
      (App.DEMO ? '<section class="card"><div class="card-titulo"><h3>Modo demonstração</h3></div><p class="muted small" style="margin-top:0">Os dados de teste ficam só neste navegador. Você pode recomeçar com os dados de exemplo.</p><button class="btn btn-perigo-sec" id="pg-reset">Restaurar dados de exemplo</button></section>' : '') +
      '</div></div>';
    $$('[data-copiar]').forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.copiar;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { App.toast('Link copiado!', 'ok'); }, function () { window.prompt('Copie o link:', t); });
      };
    });
    $('#pg-receb').onchange = function () {
      var chk = this, abrir = chk.checked;
      var p = abrir ? Promise.resolve(true) : App.confirmar('Fechar o recebimento?', 'Os fiscais não conseguirão mais enviar boletins até você abrir de novo.', 'Fechar recebimento', true);
      p.then(function (ok) {
        if (!ok) { chk.checked = !abrir; return; }
        chamar('apuracao.salvarConfig', { valores: { recebimento_aberto: abrir ? 'TRUE' : 'FALSE' } }).then(function () {
          App.toast(abrir ? 'Recebimento aberto.' : 'Recebimento fechado.', 'ok'); recarregarParametros();
        }).catch(function (e) { chk.checked = !abrir; App.toast(e.message, 'erro'); });
      });
    };
    App.campoVotos($('#pg-max'));
    var ajustarAlerta = function () {
      var on = $('#pg-alerta').checked;
      $('#pg-max').disabled = !on;
      $('#pg-max-campo').style.opacity = on ? '' : '.5';
    };
    $('#pg-alerta').onchange = ajustarAlerta; ajustarAlerta();
    $('#form-config').onsubmit = function (e) {
      e.preventDefault();
      var b = $('#pg-salvar'); App.carregando(b, true, 'Salvando…');
      chamar('apuracao.salvarConfig', { valores: {
        titulo: $('#pg-titulo').value, candidato_nome: $('#pg-nome').value, candidato_numero: $('#pg-num').value,
        cargo: $('#pg-cargo').value, partido: $('#pg-partido').value, municipio_principal: $('#pg-mun').value.trim().toUpperCase(),
        alerta_votos_ativo: $('#pg-alerta').checked ? 'TRUE' : 'FALSE',
        alerta_votos_max: $('#pg-max').value.replace(/\D/g, '') || '400', foto_obrigatoria: $('#pg-foto').checked ? 'TRUE' : 'FALSE'
      } }).then(function () { App.toast('Configurações salvas.', 'ok'); return recarregarParametros(); })
        .catch(function (e2) { App.toast(e2.message, 'erro'); App.carregando(b, false); });
    };
    var rs = $('#pg-reset');
    if (rs) rs.onclick = function () {
      App.confirmar('Restaurar dados de exemplo?', 'Todos os dados de teste deste navegador serão apagados e recriados.', 'Restaurar', true).then(function (ok) {
        if (!ok) return; App.resetDemo(); App.sessao.sair(AREA); location.reload();
      });
    };
  }
  function linkLinha(titulo, desc, url) {
    return '<div class="chave-linha"><div style="min-width:0"><b>' + titulo + '</b><span>' + desc + '</span><div class="tiny" style="word-break:break-all;margin-top:4px"><a href="' + h(url) + '" target="_blank" rel="noopener">' + h(url) + '</a></div></div>' +
      '<button class="btn btn-sec btn-sm" data-copiar="' + h(url) + '">Copiar</button></div>';
  }

  /* --- Locais e seções --- */
  function parLocais() {
    var muns = municipiosConhecidos();
    if (!paramMun || muns.indexOf(paramMun) < 0) paramMun = String(dados.config.municipio_principal || muns[0]).toUpperCase();
    var locs = dados.locais.filter(function (l) { return l.municipio === paramMun; }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    var q = Core.norm(buscaLocal);
    var visiveis = locs.filter(function (l) { return !q || Core.norm(l.nome).indexOf(q) >= 0 || dados.secoes.some(function (s) { return s.local_id === l.id && s.numero === buscaLocal.trim(); }); });
    var totSec = dados.secoes.filter(function (s) { return locs.some(function (l) { return l.id === s.local_id; }) && s.ativo; }).length;
    $('#par-conteudo').innerHTML =
      '<div class="barra-filtro"><select class="input" id="pl-mun">' + muns.map(function (m) { return '<option' + (m === paramMun ? ' selected' : '') + '>' + h(m) + '</option>'; }).join('') + '</select>' +
      '<input class="input" type="search" id="pl-busca" placeholder="Buscar local ou nº da seção" value="' + h(buscaLocal) + '" style="flex:1;min-width:180px">' +
      '<button class="btn btn-sec" id="pl-importar">' + ICON.upload + 'Importar lista</button>' +
      '<button class="btn btn-azul" id="pl-novo">' + ICON.mais + 'Novo local</button></div>' +
      '<p class="muted small" style="margin:-4px 0 14px">' + locs.length + ' locais · ' + totSec + ' seções ativas em ' + h(paramMun) + '. Toque em uma seção para editar.</p>' +
      (visiveis.length ? visiveis.map(function (l) {
        var secs = dados.secoes.filter(function (s) { return s.local_id === l.id; }).sort(function (a, b) { return Number(a.numero) - Number(b.numero); });
        return '<div class="local-item' + (l.ativo ? '' : ' inativo') + '"><div class="cab"><b>' + h(l.nome) + (l.ativo ? '' : ' <span class="selo selo-DESCARTADO">inativo</span>') + '</b>' +
          '<span class="muted small">' + secs.length + ' seç' + (secs.length === 1 ? 'ão' : 'ões') + '</span>' +
          '<button class="btn btn-ghost btn-sm" data-edlocal="' + l.id + '">' + ICON.lapis + 'Editar</button>' +
          '<button class="btn btn-sec btn-sm" data-novasec="' + l.id + '">' + ICON.mais + 'Seção</button></div>' +
          '<div class="chips">' + (secs.length ? secs.map(function (s) {
            return '<button class="chip' + (s.ativo ? '' : ' inativa') + '" data-edsec="' + s.id + '" title="Editar seção ' + h(s.numero) + '">' + h(s.numero) + '</button>';
          }).join('') : '<span class="muted small">Nenhuma seção. Toque em "+ Seção".</span>') + '</div></div>';
      }).join('') : '<div class="card vazio">Nenhum local encontrado.</div>');
    $('#pl-mun').onchange = function () { paramMun = this.value; parLocais(); };
    $('#pl-busca').oninput = function () { buscaLocal = this.value; var pos = this.selectionStart; parLocais(); var i = $('#pl-busca'); i.focus(); i.setSelectionRange(pos, pos); };
    $('#pl-novo').onclick = function () { modalLocal(null); };
    $('#pl-importar').onclick = modalImportar;
    $$('[data-edlocal]').forEach(function (b) { b.onclick = function () { modalLocal(b.dataset.edlocal); }; });
    $$('[data-novasec]').forEach(function (b) { b.onclick = function () { modalSecao(null, b.dataset.novasec); }; });
    $$('[data-edsec]').forEach(function (b) { b.onclick = function () { var s = dados.secoes.filter(function (x) { return x.id === b.dataset.edsec; })[0]; modalSecao(s, s.local_id); }; });
  }

  function modalLocal(id) {
    var l = id ? dados.locais.filter(function (x) { return x.id === id; })[0] : { municipio: paramMun, nome: '', ativo: true };
    var temEnvios = id && dados.lancamentos.some(function (x) { return x.local_id === id; });
    var m = App.modal(App.cabecalhoModal(id ? 'Editar local' : 'Novo local de votação') +
      '<form id="ml-form"><div class="campo"><label for="ml-nome">Nome do local</label><input class="input" id="ml-nome" value="' + h(l.nome) + '" autofocus></div>' +
      '<div class="campo"><label for="ml-mun">Município</label><input class="input" id="ml-mun" list="ml-dl" value="' + h(l.municipio) + '"><datalist id="ml-dl">' + municipiosConhecidos().map(function (x) { return '<option value="' + h(x) + '">'; }).join('') + '</datalist></div>' +
      '<div class="chave-linha" style="border-top:1px solid var(--linha);padding-top:14px"><div><b>Local ativo</b><span>Locais inativos não aparecem para os fiscais.</span></div><label class="switch"><input type="checkbox" id="ml-ativo"' + (l.ativo ? ' checked' : '') + '><span class="trilho"></span></label></div>' +
      '<div class="acoes">' + (id ? '<button type="button" class="btn btn-perigo-sec" id="ml-excluir"' + (temEnvios ? ' disabled title="Tem envios: desative em vez de excluir"' : '') + '>' + ICON.lixo + 'Excluir</button>' : '') +
      '<button type="button" class="btn btn-sec" data-fechar>Cancelar</button><button class="btn btn-azul" type="submit" id="ml-salvar">Salvar</button></div></form>');
    $('#ml-form', m.el).onsubmit = function (e) {
      e.preventDefault();
      var b = $('#ml-salvar', m.el); App.carregando(b, true);
      chamar('apuracao.salvarLocal', { id: id || '', nome: $('#ml-nome', m.el).value, municipio: $('#ml-mun', m.el).value, ativo: $('#ml-ativo', m.el).checked }).then(function (r) {
        App.toast('Local salvo.', 'ok'); m.fechar(); paramMun = $('#ml-mun', m.el).value.trim().toUpperCase();
        return recarregarParametros().then(function () { if (!id) modalSecao(null, r.id); });
      }).catch(function (e2) { App.toast(e2.message, 'erro'); App.carregando(b, false); });
    };
    var ex = $('#ml-excluir', m.el);
    if (ex) ex.onclick = function () {
      App.confirmar('Excluir local?', 'O local <b>' + h(l.nome) + '</b> e suas seções serão excluídos.', 'Excluir', true).then(function (ok) {
        if (!ok) return;
        chamar('apuracao.excluirLocal', { id: id }).then(function () { App.toast('Local excluído.'); m.fechar(); recarregarParametros(); }).catch(function (e) { App.toast(e.message, 'erro'); });
      });
    };
  }

  function modalSecao(s, localId) {
    var local = dados.locais.filter(function (x) { return x.id === localId; })[0];
    var temEnvios = s && dados.lancamentos.some(function (x) { return x.secao_id === s.id; });
    var locs = dados.locais.filter(function (x) { return x.municipio === local.municipio; }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    var m = App.modal(App.cabecalhoModal(s ? 'Editar seção ' + s.numero : 'Nova seção', h(local.municipio)) +
      '<form id="ms-form"><div class="campo"><label for="ms-num">Número da seção</label><input class="input" id="ms-num" inputmode="numeric" value="' + (s ? h(s.numero) : '') + '" autofocus></div>' +
      '<div class="campo"><label for="ms-local">Local de votação</label><select class="input" id="ms-local">' + locs.map(function (x) { return '<option value="' + x.id + '"' + (x.id === localId ? ' selected' : '') + '>' + h(x.nome) + '</option>'; }).join('') + '</select></div>' +
      '<div class="chave-linha" style="border-top:1px solid var(--linha);padding-top:14px"><div><b>Seção ativa</b><span>Seções inativas não aparecem para os fiscais e não contam no total de urnas.</span></div><label class="switch"><input type="checkbox" id="ms-ativo"' + (!s || s.ativo ? ' checked' : '') + '><span class="trilho"></span></label></div>' +
      '<div class="acoes">' + (s ? '<button type="button" class="btn btn-perigo-sec" id="ms-excluir"' + (temEnvios ? ' disabled title="Tem envios: desative em vez de excluir"' : '') + '>' + ICON.lixo + 'Excluir</button>' : '') +
      '<button type="button" class="btn btn-sec" data-fechar>Cancelar</button>' +
      (!s ? '<button type="button" class="btn btn-sec" id="ms-mais">Salvar e adicionar outra</button>' : '') +
      '<button class="btn btn-azul" type="submit" id="ms-salvar">Salvar</button></div></form>');
    function salvar(maisUma) {
      var b = $(maisUma ? '#ms-mais' : '#ms-salvar', m.el); App.carregando(b, true);
      var novoLocal = $('#ms-local', m.el).value;
      return chamar('apuracao.salvarSecao', { id: s ? s.id : '', numero: $('#ms-num', m.el).value, local_id: novoLocal, ativo: $('#ms-ativo', m.el).checked }).then(function () {
        App.toast('Seção ' + $('#ms-num', m.el).value + ' salva.', 'ok'); m.fechar();
        return recarregarParametros().then(function () { if (maisUma) modalSecao(null, novoLocal); });
      }).catch(function (e) { App.toast(e.message, 'erro'); App.carregando(b, false); });
    }
    $('#ms-form', m.el).onsubmit = function (e) { e.preventDefault(); salvar(false); };
    var mais = $('#ms-mais', m.el); if (mais) mais.onclick = function () { salvar(true); };
    var ex = $('#ms-excluir', m.el);
    if (ex) ex.onclick = function () {
      App.confirmar('Excluir seção ' + h(s.numero) + '?', 'A seção será removida do cadastro.', 'Excluir', true).then(function (ok) {
        if (!ok) return;
        chamar('apuracao.excluirSecao', { id: s.id }).then(function () { App.toast('Seção excluída.'); m.fechar(); recarregarParametros(); }).catch(function (e) { App.toast(e.message, 'erro'); });
      });
    };
  }

  function modalImportar() {
    var m = App.modal(App.cabecalhoModal('Importar locais e seções', 'Cadastre ou atualize várias seções de uma vez.') +
      '<div class="campo"><label for="mi-mun">Município</label><input class="input" id="mi-mun" value="' + h(paramMun) + '" list="mi-dl"><datalist id="mi-dl">' + municipiosConhecidos().map(function (x) { return '<option value="' + h(x) + '">'; }).join('') + '</datalist></div>' +
      '<div class="campo"><label for="mi-txt">Uma seção por linha: LOCAL;SEÇÃO</label><textarea class="input" id="mi-txt" rows="8" placeholder="ESCOLA SÃO JOSÉ;12&#10;ESCOLA SÃO JOSÉ;13&#10;GINÁSIO MUNICIPAL;40"></textarea>' +
      '<div class="ajuda">Dica: copie duas colunas do Excel/Sheets (local e seção) e cole aqui.</div></div>' +
      '<div class="chave-linha" style="border-top:1px solid var(--linha);padding-top:14px"><div><b>Substituir a lista inteira deste município</b>' +
      '<span>Locais com as mesmas seções são <strong>renomeados</strong>, seções novas são criadas e o que não estiver na lista é <strong>desativado</strong> (nada é excluído; envios já feitos são mantidos). Desligado: só acrescenta.</span></div>' +
      '<label class="switch"><input type="checkbox" id="mi-subst"><span class="trilho"></span></label></div>' +
      '<div id="mi-plano"></div>' +
      '<div class="acoes"><button class="btn btn-sec" data-fechar>Cancelar</button><button class="btn btn-azul" id="mi-ok">' + ICON.upload + 'Importar</button></div>', { classe: 'largo' });
    var confirmando = false;
    function resetar() { confirmando = false; $('#mi-plano', m.el).innerHTML = ''; $('#mi-ok', m.el).innerHTML = ICON.upload + ($('#mi-subst', m.el).checked ? 'Ver o que vai mudar' : 'Importar'); }
    $('#mi-subst', m.el).onchange = resetar; $('#mi-txt', m.el).oninput = function () { if (confirmando) resetar(); };
    $('#mi-mun', m.el).oninput = function () { if (confirmando) resetar(); };
    function lista(titulo, itens, fmt, cor) {
      if (!itens.length) return '';
      return '<details' + (itens.length <= 12 ? ' open' : '') + ' style="margin:6px 0"><summary style="cursor:pointer;font-weight:700;color:' + (cor || 'inherit') + '">' + titulo + ' (' + itens.length + ')</summary>' +
        '<ul style="margin:6px 0 0;padding-left:20px;font-size:13px;max-height:220px;overflow:auto">' + itens.map(function (x) { return '<li>' + fmt(x) + '</li>'; }).join('') + '</ul></details>';
    }
    function mostrarPlano(p) {
      var nada = !p.renomear.length && !p.criarLocal.length && !p.criarSecao.length && !p.moverSecao.length && !p.desativarSecao.length && !p.desativarLocal.length && !p.reativar.length;
      $('#mi-plano', m.el).innerHTML = '<div class="aviso ' + (p.desativarSecao.length || p.desativarLocal.length ? 'aviso-alerta' : 'aviso-info') + '" style="display:block">' +
        '<b style="margin-bottom:4px">Resultado: ' + p.totalLocais + ' locais e ' + p.totalSecoes + ' seções.' + (nada ? ' A lista já está igual — nada muda.' : '') + '</b>' +
        lista('Locais renomeados', p.renomear, function (x) { return h(x.de) + ' → <b>' + h(x.para) + '</b>'; }) +
        lista('Locais novos', p.criarLocal, function (x) { return '<b>' + h(x) + '</b>'; }) +
        lista('Seções novas', p.criarSecao, function (x) { return 'Seção <b>' + h(x.numero) + '</b> em ' + h(x.local); }, '#0b6b49') +
        lista('Seções que mudam de local', p.moverSecao, function (x) { return 'Seção ' + h(x.numero) + ': ' + h(x.de) + ' → ' + h(x.para); }) +
        lista('Reativados', p.reativar, function (x) { return x.tipo === 'local' ? 'Local ' + h(x.nome) : 'Seção ' + h(x.numero); }) +
        lista('Seções que serão desativadas', p.desativarSecao, function (x) { return 'Seção ' + h(x.numero) + ' (' + h(x.local) + ')'; }, '#b34700') +
        lista('Locais que serão desativados', p.desativarLocal, function (x) { return h(x); }, '#b34700') + '</div>';
    }
    $('#mi-ok', m.el).onclick = function () {
      var b = this, subst = $('#mi-subst', m.el).checked;
      var dados0 = { municipio: $('#mi-mun', m.el).value, texto: $('#mi-txt', m.el).value, substituir: subst, simular: subst && !confirmando };
      App.carregando(b, true, dados0.simular ? 'Analisando…' : 'Importando…');
      chamar('apuracao.importar', dados0).then(function (r) {
        if (r.erros && r.erros.length && subst) {
          App.carregando(b, false);
          $('#mi-plano', m.el).innerHTML = '<div class="aviso aviso-perigo" style="display:block"><b>Corrija a lista antes de continuar:</b><ul style="margin:6px 0 0;padding-left:20px;font-size:13px">' + r.erros.slice(0, 15).map(function (e) { return '<li>' + h(e) + '</li>'; }).join('') + '</ul></div>';
          return;
        }
        if (r.simulado) {
          mostrarPlano(r.plano); confirmando = true;
          App.carregando(b, false); b.innerHTML = ICON.check + 'Confirmar e aplicar';
          return;
        }
        if (subst) App.toast('Lista atualizada: ' + r.plano.totalLocais + ' locais, ' + r.plano.totalSecoes + ' seções.', 'ok', 6000);
        else {
          App.toast(r.criadas + ' seções criadas' + (r.existentes ? ', ' + r.existentes + ' já existiam' : '') + '.', 'ok', 5000);
          if (r.erros.length) App.toast(r.erros.slice(0, 3).join(' | '), 'erro', 8000);
        }
        paramMun = $('#mi-mun', m.el).value.trim().toUpperCase(); m.fechar(); recarregarParametros();
      }).catch(function (e) { App.toast(e.message, 'erro'); App.carregando(b, false); });
    };
  }

  /* --- Senhas de acesso --- */
  function parUsuarios() {
    var cartao = function (usuario, titulo, desc) {
      return '<form class="card" data-senha="' + usuario + '" autocomplete="off"><div class="card-titulo"><h3>' + titulo + '</h3></div>' +
        '<p class="muted small" style="margin-top:-6px">' + desc + '</p>' +
        '<div class="campo"><label for="ns-' + usuario + '">Nova senha</label><input class="input" id="ns-' + usuario + '" type="text" autocomplete="new-password" minlength="6" placeholder="mínimo 6 caracteres"></div>' +
        '<div class="campo"><label for="nc-' + usuario + '">Repita a nova senha</label><input class="input" id="nc-' + usuario + '" type="text" autocomplete="new-password"></div>' +
        '<button class="btn btn-azul" type="submit">Trocar senha</button></form>';
    };
    $('#par-conteudo').innerHTML = '<div class="grade-painel grade-senhas">' +
      cartao('apuracao', 'Senha da Apuração', 'Dá acesso completo: conferência, lançamentos e parâmetros.') +
      cartao('partido', 'Senha do Partido / Candidato', 'Só visualiza os resultados.') + '</div>' +
      '<p class="muted small" style="margin-top:14px">Ao trocar uma senha, quem estiver conectado com a senha antiga precisa entrar de novo.</p>';
    $$('[data-senha]').forEach(function (f) {
      f.onsubmit = function (e) {
        e.preventDefault();
        var usr = f.dataset.senha, nova = $('#ns-' + usr).value, conf = $('#nc-' + usr).value;
        if (nova.length < 6) return App.toast('A senha deve ter pelo menos 6 caracteres.', 'erro');
        if (nova !== conf) return App.toast('As duas senhas não são iguais.', 'erro');
        var b = $('button[type=submit]', f); App.carregando(b, true, 'Salvando…');
        chamar('apuracao.salvarUsuario', { usuario: usr, perfil: usr === 'apuracao' ? 'APURACAO' : 'PARTIDO', senha: nova, ativo: true }).then(function () {
          if (usr === 'apuracao') return App.api('login', { senha: nova, perfil: 'APURACAO' }).then(function (r) { sess.token = r.token; sess.usuario = r.usuario; App.sessao.set(AREA, sess); });
        }).then(function () {
          App.toast('Senha alterada.', 'ok'); recarregarParametros();
        }).catch(function (e2) { App.toast(e2.message, 'erro'); App.carregando(b, false); });
      };
    });
  }

  /* ================= INÍCIO ================= */
  if (sess) iniciarApp(); else telaLogin();
})();
