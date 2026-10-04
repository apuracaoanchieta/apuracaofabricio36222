/* APURAÇÃO TSE — tela dedicada (somente com a senha da Apuração).
 * Resultado oficial do TSE, projeção de vagas, candidatos aptos, gráficos e histórico. */
(function () {
  'use strict';
  var $ = App.$, $$ = App.$$, h = App.h, n = App.n, ICON = App.ICON;
  /* LEITURA = acesso do Partido/candidato: só visualização, com explicações (partido-tse.html) */
  var LEITURA = !!window.TSE_LEITURA;
  var AREA = LEITURA ? 'partido' : 'apuracao';
  var sess = App.sessao.get(AREA) || (LEITURA ? App.sessao.get('apuracao') : null);
  var dados = null, calc = null, aba = LEITURA ? 'projecao' : 'resultado', timer = null, ocupado = false;
  var tseState = { carregando: false, erro: null, preview: null };
  var buscaAptos = '', graficos = {};
  var COR_NOSSO = '#fb6c03', COR_OUTRO = '#9fb6c3', AZUIS = ['#0072b0', '#019fc6', '#6fc0dc', '#b6dcea'], COR_RESTO = '#dfe9ef';
  var CLASSE_SELO = { ok: 'ENVIADO', warn: 'PENDENTE', danger: 'REJEITADO', neutral: 'DESCARTADO' };

  App.bannerDemo(LEITURA ? 'Senha: <b>partido</b>. Os números do TSE aqui são simulados.' : 'Senha: <b>apuracao</b>. O "TSE" aqui é simulado: cada busca avança a totalização.');
  App.$$('[data-voltar]').forEach(function (e) { e.innerHTML = ICON.seta; });
  $('#btn-voltar').innerHTML = LEITURA ? '← <span class="oculto-mobile">Voltar aos </span>Resultados' : '← <span class="oculto-mobile">Voltar à </span>Apuração';
  $('#btn-telao-tse').innerHTML = ICON.tv + 'Modo telão';
  if ($('#btn-rel-final')) $('#btn-rel-final').innerHTML = ICON.impressora + 'Relatório final';

  /* ================= LOGIN ================= */
  function telaLogin() {
    $('#tela-app').hidden = true; $('#tela-login').hidden = false;
    if (App.DEMO) { var d = $('#l-demo'); d.hidden = false; d.innerHTML = ICON.info + '<div>Demonstração: senha <strong>' + (LEITURA ? 'partido' : 'apuracao') + '</strong></div>'; }
    setTimeout(function () { $('#l-senha').focus({ preventScroll: true }); }, 50);
  }
  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#l-entrar'); App.carregando(b, true, 'Entrando…');
    App.api('login', { senha: $('#l-senha').value, perfil: LEITURA ? 'PARTIDO' : 'APURACAO' }).then(function (r) {
      sess = { token: r.token, usuario: r.usuario, perfil: r.perfil }; App.sessao.set(AREA, sess); $('#l-senha').value = ''; iniciar();
    }).catch(function (err) { App.toast(err.message, 'erro'); }).then(function () { App.carregando(b, false); });
  });
  function sessaoExpirou(err) {
    if (/Sessão|acesso/.test(err && err.message)) { App.sessao.sair(AREA); sess = null; clearInterval(timer); telaLogin(); }
  }
  function chamar(acao, d) { return App.api(acao, Object.assign({ token: sess.token }, d || {})).catch(function (e) { sessaoExpirou(e); throw e; }); }

  function iniciar() {
    $('#tela-login').hidden = true; $('#tela-app').hidden = false; window.scrollTo(0, 0);
    carregar(true);
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) carregar(false); }, (App.CFG.ATUALIZAR_A_CADA_SEGUNDOS || 30) * 1000);
    // demonstração: sem Apps Script, a própria tela faz o papel do agendamento de 5 minutos
    if (App.DEMO && !LEITURA) setInterval(function () {
      if (dados && String(dados.config.tse_auto).toUpperCase() === 'TRUE') chamar('tse.autoAgora').then(function () { carregar(false); }).catch(function () {});
    }, 5 * 60000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && sess && dados) carregar(false); });

  function carregar(mostrarErro) {
    if (ocupado) return Promise.resolve();
    ocupado = true;
    return chamar(LEITURA ? 'tse.consulta' : 'tse.dados').then(function (r) {
      if (LEITURA) mostrarBloqueio(false);
      dados = r; calc = Tse.calcular(r);
      TseAviso.verificar(r);
      if (LEITURA) $('#aviso-parcial').innerHTML = htmlAvisoParcial();
      $('#t-atualizado').lastChild.textContent = 'Atualizado às ' + App.hora(r.agora) + r.agora.substr(16, 3);
      renderTudo();
    }).catch(function (e) {
      if (LEITURA && /não foi liberado/.test(e.message)) { dados = null; mostrarBloqueio(true); return; }
      if (mostrarErro) App.toast(e.message, 'erro');
    }).then(function () { ocupado = false; });
  }
  /* acesso do candidato bloqueado pela apuração: some tudo e fica só o aviso (volta sozinho quando liberar) */
  function mostrarBloqueio(sim) {
    var b = $('#tse-bloqueio');
    if (!b) { b = document.createElement('section'); b.id = 'tse-bloqueio'; b.className = 'card centro tse-bloqueio'; $('main.wrap-l').prepend(b); }
    b.hidden = !sim;
    b.innerHTML = '<div class="sucesso-icone">' + ICON.relogio + '</div><h2>Resultado oficial do TSE ainda não liberado</h2><p class="muted">A equipe de apuração vai liberar esta tela quando decidir. Assim que for liberada, ela aparece aqui sozinha — não precisa sair nem atualizar a página.</p><a class="btn btn-sec" href="partido.html">← Voltar aos resultados</a>';
    $$('main.wrap-l > :not(#tse-bloqueio)').forEach(function (x) { x.style.display = sim ? 'none' : ''; });
    var abas = $('.abas'); if (abas) abas.style.display = sim ? 'none' : '';
  }

  /* ================= ABAS ================= */
  function irAba(nova) {
    aba = nova;
    $$('.aba').forEach(function (b) { b.classList.toggle('ativa', b.dataset.aba === nova); b.setAttribute('aria-selected', b.dataset.aba === nova); });
    $$('[data-painel]').forEach(function (s) { s.hidden = s.dataset.painel !== nova; });
    renderAba();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('.aba').forEach(function (b) { b.addEventListener('click', function () { irAba(b.dataset.aba); }); });
  function renderTudo() { renderAba(); }
  function renderAba() {
    if (!dados) return;
    if (aba === 'resultado') renderResultado();
    else if (aba === 'projecao') renderProjecao();
    else if (aba === 'eleitos') renderEleitos();
    else if (aba === 'aptos') renderAptos();
    else if (aba === 'graficos') renderGraficos();
    else if (aba === 'guia') renderGuia();
    else if (aba === 'conferencia') renderConferencia();
    else renderHistorico();
  }

  /* ---------- utilidades ---------- */
  function pctFrac(x, casas) { return x === null || x === undefined || isNaN(x) ? '—' : (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas || 1, maximumFractionDigits: casas || 1 }) + '%'; }
  function seloStatus(s, grande) { return '<span class="selo selo-' + CLASSE_SELO[s.classe] + (grande ? ' selo-grande' : '') + '">' + h(s.label) + '</span>'; }
  function nomeCand() { return (dados.config.candidato_nome || 'Fabricio Petri'); }
  function campoNumero(inp) {
    inp.addEventListener('input', function () {
      var d = this.value.replace(/\D/g, '').slice(0, 8);
      this.value = d ? Number(d).toLocaleString('pt-BR') : '';
    });
  }
  function dataHoraCompleta(st) { var x = String(st || ''); return x.length >= 19 ? x.substr(8, 2) + '/' + x.substr(5, 2) + '/' + x.substr(0, 4) + ' ' + x.substr(11, 8) : x; }
  function valorNumero(v) { return String(v || '').replace(/\D/g, ''); }

  /* ---------- explicações (só no acesso do Partido) ---------- */
  function dica(html, compacta) { return LEITURA ? '<div class="dica-tse' + (compacta ? ' compacta' : '') + '">' + ICON.info + '<div>' + html + '</div></div>' : ''; }
  function pctTxt(p) { return Number(p).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
  function htmlAvisoParcial() {
    var p = dados.tse_pct_secoes, st = calc.st, quando = dados.tse_atualizado_em ? 'Dados do TSE de ' + h(dados.tse_atualizado_em) + '. ' : '';
    var rodape = '<span class="small">' + quando + 'Esta tela se atualiza sozinha a cada 30 segundos.</span>';
    if (st.kind !== 'com-dados') return '<div class="aviso aviso-info aviso-parcial">' + ICON.info + '<div><b>Aguardando os primeiros votos do TSE</b>A votação termina às 17h. Depois disso o TSE começa a divulgar os votos e esta tela passa a mostrar a projeção. Até lá, os números aparecem zerados — é normal.<br>' + rodape + '</div></div>';
    if (p === null || p === undefined || isNaN(p)) return '<div class="aviso aviso-alerta aviso-parcial">' + ICON.alerta + '<div><b>PROJEÇÃO PARCIAL — PODE MUDAR</b>Os números abaixo são uma estimativa com os votos contados até agora.<br>' + rodape + '</div></div>';
    if (p >= 100) return '<div class="aviso aviso-info aviso-parcial">' + ICON.check + '<div><b>Totalização concluída (100% das seções)</b>A projeção usa a mesma regra da Justiça Eleitoral, mas o resultado oficial é sempre o divulgado pelo TSE.<br>' + rodape + '</div></div>';
    var tit, txt, cls = 'aviso-alerta';
    if (p < 30) { tit = 'INÍCIO DA APURAÇÃO — ' + pctTxt(p) + ' das seções contadas'; txt = 'Ainda falta contar a maior parte dos votos. <strong>Os números vão mudar bastante</strong> — não tire conclusões ainda.'; cls = 'aviso-perigo'; }
    else if (p < 80) { tit = 'APURAÇÃO EM ANDAMENTO — ' + pctTxt(p) + ' das seções contadas'; txt = 'Os números <strong>ainda podem mudar</strong>, principalmente se a diferença for pequena.'; }
    else { tit = 'RETA FINAL — ' + pctTxt(p) + ' das seções contadas'; txt = 'Mudanças ainda são possíveis, mas tendem a ser menores. Diferenças apertadas ainda podem virar.'; cls = 'aviso-info'; }
    return '<div class="aviso ' + cls + ' aviso-parcial">' + ICON.alerta + '<div><b>' + tit + '</b>' + txt + '<div class="barra-parcial"><i style="width:' + Math.max(1, p) + '%"></i></div>' + rodape + '</div></div>';
  }
  function fraseSimples() {
    var st = calc.st, s = calc.status, nome = '<b>' + h(nomeCand()) + '</b>', partido = h(calc.grupoNosso.nome);
    if (s.chave === 'sem-dados') return st.zerado ? 'o TSE ainda não divulgou votos. Volte a partir das 17h, quando a contagem começar.' : 'ainda não há votos para calcular.';
    if (s.chave === 'sem-candidato') return 'o número do candidato ainda não aparece nos dados do TSE.';
    var pos = st.candidatos.indexOf(st.nosso) + 1, qf = Tse.quantoFalta(calc, dados.tse_pct_secoes);
    if (s.chave === 'eleito') return 'com os votos contados até agora, ' + nome + ' <b>estaria eleito</b>. O ' + partido + ' conquista ' + st.vagasDoPartido + ' vaga(s) e ele é o ' + pos + 'º mais votado do partido. <i>Ainda pode mudar até o fim da apuração.</i>';
    if (s.chave === 'fora-faixa') return 'com os votos contados até agora, o ' + partido + ' conquista ' + st.vagasDoPartido + ' vaga(s) e ' + nome + ' é o ' + pos + 'º mais votado do partido. Por isso, <b>neste momento ficaria de fora</b> (seria o ' + (pos - st.vagasDoPartido) + 'º suplente).' +
      (qf && qf.paraEleger !== null ? ' Faltam cerca de <b>' + n(qf.paraEleger) + ' votos</b> para ele entrar.' : '') + ' <i>Ainda pode mudar até o fim da apuração.</i>';
    return nome + ' ainda <b>não alcançou o mínimo exigido por lei</b>: 10% do quociente eleitoral (' + n(Math.ceil(st.QE * 0.1)) + ' votos). Sem esse mínimo ninguém é eleito, mesmo que o partido tenha vaga. Faltam ' + n(Math.max(1, Math.ceil(st.QE * 0.1) - st.nosso.votos)) + ' votos para chegar lá.';
  }
  function renderGuia() {
    var st = calc.st, ok = st.kind === 'com-dados', p = h(calc.grupoNosso.nome), nome = h(nomeCand());
    var ex = function (t) { return ok ? '<div class="guia-ex"><b>Agora:</b> ' + t + '</div>' : ''; };
    var lp = ok && st.linhaPartido ? st.linhaPartido : null;
    var itens = [
      ['O que é esta tela?', 'Aqui aparecem os números <b>oficiais do TSE</b> para Deputado Estadual em todo o Espírito Santo, e uma <b>projeção</b> de quem seria eleito com os votos contados até agora. A equipe de apuração busca os dados no TSE ao longo da noite; esta tela se atualiza sozinha.'],
      ['Votos válidos', 'São os votos dados a um candidato ou a um partido (voto de legenda). <b>Brancos e nulos não contam.</b>' + ex(n(calc.votosValidos) + ' votos válidos.')],
      ['Quociente eleitoral — o "preço" de uma vaga', 'É o total de votos válidos dividido pelas ' + calc.vagas + ' vagas da Assembleia. Cada vez que um partido junta esse número de votos, ganha uma vaga.' + ex(n(calc.votosValidos) + ' ÷ ' + calc.vagas + ' = <b>' + n(ok ? st.QE : 0) + ' votos por vaga</b>.')],
      ['Quantas vagas cada partido ganha', 'Primeiro, cada partido ganha uma vaga a cada quociente completo (são as vagas "pelo quociente"). As vagas que ainda sobram são distribuídas pelas <b>maiores médias</b> (as "sobras"). Só disputam as sobras os partidos com pelo menos 80% do quociente.' + (lp ? ex('o ' + p + ' tem ' + n(lp.votos) + ' votos → ' + lp.vagasQP + ' vaga(s) pelo quociente + ' + lp.vagasSobra + ' nas sobras = <b>' + lp.vagasTotal + ' vaga(s)</b>.') : '')],
      ['Federações', 'Partidos que formam uma federação (ex.: PT/PCdoB/PV) contam <b>como um partido só</b> na divisão das vagas.'],
      ['Quem fica com as vagas do partido', 'As vagas do partido vão para os seus candidatos <b>mais votados</b>. Mas existe um mínimo: o candidato precisa ter pelo menos <b>10% do quociente eleitoral</b> (cláusula de desempenho).' + ex('o mínimo é de <b>' + n(ok ? Math.ceil(st.QE * 0.1) : 0) + ' votos</b>.')],
      ['O que significa cada situação', '<b>Eleito:</b> está dentro das vagas do partido e passou do mínimo.<br><b>Fora da faixa de vagas:</b> passou do mínimo, mas há colegas de partido mais votados ocupando as vagas — fica como suplente.<br><b>Abaixo da cláusula:</b> ainda não chegou aos 10% do quociente.'],
      ['"Quanto falta para eleger"', 'É uma simulação: quantos votos a mais ' + nome + ' precisaria para entrar, <b>se os outros candidatos ficassem parados</b>. Os votos dele também somam para o ' + p + ', então o cálculo refaz toda a divisão de vagas.'],
      ['"Estimativa para o fim da apuração"', 'Uma regra de três: se todos continuarem no mesmo ritmo até 100% das seções, com quantos votos ' + nome + ' terminaria e de quantos precisaria. Serve como referência, não como certeza.'],
      ['Por que os números mudam durante a noite?', 'As urnas não chegam todas juntas. Cidades e regiões diferentes são contadas em horários diferentes — e cada candidato tem votos mais concentrados em algumas regiões. Por isso alguém pode "entrar" e "sair" da projeção várias vezes até o fim. <b>Quanto maior o percentual de seções contadas, mais confiável fica.</b>'],
      ['Projeção não é resultado oficial', 'A projeção usa a mesma regra da Justiça Eleitoral, mas é feita por este sistema. <b>O resultado que vale é o divulgado pelo TSE</b> ao fim da totalização.']
    ];
    $('#sec-guia').innerHTML = '<section class="card"><div class="card-titulo"><h2>Entenda os números</h2></div><ol class="guia-tse">' +
      itens.map(function (x) { return '<li><h3>' + x[0] + '</h3><p>' + x[1] + '</p></li>'; }).join('') + '</ol></section>';
  }

  /* ================= 1. RESULTADO TSE (integração) ================= */
  function renderResultado() {
    var el = $('#sec-resultado'), cfg = dados.config;
    var html = '';
    html += '<section class="card"><div class="card-titulo"><h2>Integração com o TSE</h2>' +
      '<button class="btn btn-ghost btn-sm" id="rs-config">' + ICON.lapis + 'Configurar</button></div>' +
      '<div class="resumo-envio" style="margin-bottom:16px">' +
      '<div class="linha"><span>Arquivo do TSE gerado em</span><b>' + (dados.tse_atualizado_em ? h(dados.tse_atualizado_em) : 'nenhum aplicado ainda') + '</b></div>' +
      '<div class="linha"><span>Aplicado por você às</span><b>' + (dados.tse_aplicado_em ? dataHoraCompleta(dados.tse_aplicado_em) : '—') + '</b></div>' +
      '<div class="linha"><span>Totalização</span><b>' + (dados.tse_situacao ? h(dados.tse_situacao) : '—') + '</b></div>' +
      '<div class="linha"><span>Vagas em disputa</span><b>' + calc.vagas + '</b></div>' +
      '<div class="linha"><span>Candidato · partido</span><b>' + h(nomeCand()) + ' · ' + h(cfg.candidato_numero || '') + ' · ' + h(calc.grupoNosso.nome) + '</b></div></div>' +
      '<p class="tiny muted" style="word-break:break-all;margin:-4px 0 14px">Fonte: ' + h(cfg.tse_url || '(não configurada)') + '</p>' +
      '<div class="chave-linha chave-tse-partido' + (String(cfg.tse_partido_visivel).toUpperCase() === 'TRUE' ? ' on' : '') + '"><div><b>Candidato pode ver o Resultado TSE</b><span>' +
        (String(cfg.tse_partido_visivel).toUpperCase() === 'TRUE' ? '<strong>Liberado:</strong> o acesso do Partido/candidato está vendo a projeção, os eleitos, os gráficos e o telão do TSE.' : '<strong>Bloqueado:</strong> o candidato não vê nada do TSE. Ligue quando a equipe decidir liberar.') +
        '</span></div><label class="switch"><input type="checkbox" id="rs-partido"' + (String(cfg.tse_partido_visivel).toUpperCase() === 'TRUE' ? ' checked' : '') + '><span class="trilho"></span></label></div>' +
      htmlAutomatico(cfg) +
      chaveLinha('rs-avisos', 'Avisos de mudança de situação', String(cfg.tse_avisos).toUpperCase() === 'TRUE',
        '<strong>Ligado:</strong> aparece um aviso discreto no canto da tela (apuração, telão e candidato) quando a situação de ' + h(nomeCand()) + ' muda.',
        '<strong>Desligado:</strong> nenhum aviso aparece.') +
      '<button class="btn btn-azul btn-xl" id="rs-buscar"' + (tseState.carregando ? ' disabled' : '') + '>' + ICON.atualizar + (tseState.carregando ? 'Buscando no TSE…' : 'Atualizar do TSE') + '</button>' +
      '<p class="ajuda" style="margin-top:8px">A busca manual mostra uma prévia. Nada é gravado até você clicar em <strong>Aplicar</strong>.</p></section>';

    if (tseState.erro) html += '<div class="aviso aviso-perigo">' + ICON.alerta + '<div><b>Não foi possível buscar no TSE</b>' + h(tseState.erro) + '</div></div>';
    if (tseState.preview) html += htmlPrevia(tseState.preview);

    // votos por partido gravados
    var ps = dados.partidos.slice().sort(function (a, b) { return b.votos - a.votos || a.sigla.localeCompare(b.sigla, 'pt-BR'); });
    html += '<section class="card"><div class="card-titulo"><h2>Votos por partido</h2><button class="btn btn-sec btn-sm" id="rs-novo-partido">' + ICON.mais + 'Partido</button></div>' +
      (ps.length ? '<p class="muted small" style="margin:-6px 0 12px">Votos válidos (nominais + legenda). Partidos de uma federação somam juntos no cálculo de vagas.</p>' +
        '<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th>Partido</th><th>Conta como</th><th class="r">Votos</th><th class="r">% dos válidos</th><th>Origem</th><th></th></tr></thead><tbody>' +
        ps.map(function (p) {
          var g = Tse.grupoDe(p.sigla, p.agremiacao), nosso = g.chave === calc.grupoNosso.chave;
          return '<tr' + (nosso ? ' class="linha-nosso"' : '') + '><td data-l="Partido"><b>' + h(p.sigla) + '</b></td><td data-l="Conta como">' + (g.nome !== p.sigla ? h(g.nome) : '<span class="muted">—</span>') + '</td>' +
            '<td data-l="Votos" class="r"><b>' + n(p.votos) + '</b></td><td data-l="% dos válidos" class="r">' + (calc.votosValidos ? App.pct(p.votos, calc.votosValidos) : '—') + '</td>' +
            '<td data-l="Origem"><span class="tiny muted">' + (p.origem === 'TSE' ? 'TSE' : 'manual') + '</span></td>' +
            '<td class="r"><button class="btn btn-ghost btn-sm" data-edpartido="' + h(p.id) + '">' + ICON.lapis + 'Editar</button></td></tr>';
        }).join('') + '</tbody><tfoot><tr><td data-l="Total">Votos válidos</td><td class="oculto-mobile"></td><td data-l="Votos" class="r">' + n(calc.votosValidos) + '</td><td class="r oculto-mobile">100%</td><td class="oculto-mobile"></td><td class="oculto-mobile"></td></tr></tfoot></table></div>'
        : '<div class="vazio">Nenhum voto por partido ainda. Clique em <b>Atualizar do TSE</b> ou cadastre manualmente.</div>') + '</section>';
    el.innerHTML = html;

    $('#rs-buscar', el).onclick = atualizarDoTSE;
    ligarChave($('#rs-auto', el), 'tse_auto', 'Ligar a atualização automática?', 'O sistema passa a buscar o TSE a cada 5 minutos e aplica sozinho quando houver arquivo novo. O botão manual continua funcionando.', 'Desligar a atualização automática?', 'O sistema para de buscar sozinho. Você pode continuar usando o botão "Atualizar do TSE".');
    ligarChave($('#rs-avisos', el), 'tse_avisos', 'Ligar os avisos?', 'Um aviso discreto aparece no canto da tela quando a situação do candidato muda (apuração, telão e candidato).', 'Desligar os avisos?', 'Os avisos deixam de aparecer em todas as telas.');
    var va = $('#rs-verificar', el);
    if (va) va.onclick = function () {
      var b = this; App.carregando(b, true, 'Verificando…');
      chamar('tse.autoAgora').then(function (r) {
        App.toast(r.mudou ? 'Arquivo novo do TSE aplicado.' : 'Verificado: ' + r.status, r.mudou ? 'ok' : '', 6000);
        return carregar(true);
      }).catch(function (e) { App.toast(e.message, 'erro'); App.carregando(b, false); });
    };
    $('#rs-partido', el).onchange = function () {
      var chk = this, liberar = chk.checked;
      App.confirmar(liberar ? 'Liberar para o candidato?' : 'Bloquear para o candidato?',
        liberar ? 'O acesso do Partido/candidato passa a ver a projeção, os eleitos, os gráficos e o telão do TSE (somente visualização).' : 'O candidato deixa de ver o Resultado oficial do TSE. Se estiver com a tela aberta, ela é bloqueada em até 30 segundos.',
        liberar ? 'Liberar' : 'Bloquear', !liberar).then(function (ok) {
        if (!ok) { chk.checked = !liberar; return; }
        chk.disabled = true;
        chamar('apuracao.salvarConfig', { valores: { tse_partido_visivel: liberar ? 'TRUE' : 'FALSE' } }).then(function () {
          App.toast(liberar ? 'Liberado para o candidato.' : 'Bloqueado para o candidato.', 'ok'); return carregar(true);
        }).catch(function (e) { chk.checked = !liberar; chk.disabled = false; App.toast(e.message, 'erro'); });
      });
    };
    $('#rs-config', el).onclick = modalConfig;
    $('#rs-novo-partido', el).onclick = function () { modalPartido(null); };
    $$('[data-edpartido]', el).forEach(function (b) { b.onclick = function () { modalPartido(b.dataset.edpartido); }; });
    var ap = $('#rs-aplicar', el); if (ap) ap.onclick = aplicarPreviaTSE;
    var ds = $('#rs-descartar', el); if (ds) ds.onclick = descartarPreviaTSE;
  }

  function htmlPrevia(pv) {
    var grupos = Tse.agruparPartidos(pv.partidos).sort(function (a, b) { return b.votos - a.votos; });
    var validos = grupos.reduce(function (s, g) { return s + g.votos; }, 0);
    var meu = null; pv.candidatos.forEach(function (c) { if (String(c.numero).replace(/\D/g, '') === calc.meuNumero) meu = c; });
    return '<section class="card previa-tse"><div class="card-titulo"><h2>Prévia do TSE</h2><span class="selo selo-AGUARDANDO">não aplicada</span></div>' +
      '<p class="muted small" style="margin:-6px 0 14px">Arquivo de ' + h(pv.atualizadoEm || 'data não informada') + (pv.secoesTotalizadas ? ' · ' + h(pv.secoesTotalizadas) : '') + '</p>' +
      '<div class="kpis">' +
      '<div class="kpi"><div class="rot">Votos válidos</div><div class="val num">' + n(validos) + '</div><div class="det">nominais + legenda</div></div>' +
      '<div class="kpi"><div class="rot">Partidos</div><div class="val num">' + pv.partidos.length + '</div><div class="det">' + grupos.length + ' no cálculo (federações juntas)</div></div>' +
      '<div class="kpi"><div class="rot">Candidatos</div><div class="val num">' + n(pv.candidatos.length) + '</div><div class="det">com votos por candidato</div></div>' +
      '<div class="kpi destaque"><div class="rot">' + h(nomeCand()) + '</div><div class="val num">' + (meu ? n(meu.votos) : '—') + '</div><div class="det">' + (meu ? 'votos no estado' : 'número ' + h(calc.meuNumero) + ' não encontrado') + '</div></div></div>' +
      '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Partido / federação</th><th class="r">Votos</th><th class="r">%</th></tr></thead><tbody>' +
      grupos.map(function (g) {
        return '<tr' + (g.chave === calc.grupoNosso.chave ? ' class="linha-nosso"' : '') + '><td><b>' + h(g.nome) + '</b>' + (g.membros.length > 1 ? ' <span class="tiny muted">' + h(g.membros.join(' + ')) + '</span>' : '') + '</td><td class="r">' + n(g.votos) + '</td><td class="r">' + App.pct(g.votos, validos) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="acoes" style="margin-top:16px"><button class="btn btn-sec" id="rs-descartar">Descartar</button><button class="btn btn-ok" id="rs-aplicar">' + ICON.check + 'Aplicar</button></div></section>';
  }

  function atualizarDoTSE() {
    tseState = { carregando: true, erro: null, preview: null };
    renderResultado();
    chamar('tse.buscar').then(function (res) {
      tseState = { carregando: false, erro: null, preview: res.preview };
    }).catch(function (e) {
      tseState = { carregando: false, erro: String(e && e.message || e), preview: null };
    }).then(function () { if (aba === 'resultado') renderResultado(); });
  }
  function aplicarPreviaTSE() {
    var pv = tseState.preview; if (!pv) return;
    var b = $('#rs-aplicar'); App.carregando(b, true, 'Aplicando…');
    chamar('tse.aplicar', { partidos: pv.partidos, candidatos: pv.candidatos, atualizadoEm: pv.atualizadoEm, secoesTotalizadas: pv.secoesTotalizadas, pctSecoes: pv.pctSecoes }).then(function (r) {
      tseState = { carregando: false, erro: null, preview: null };
      App.toast('Resultado aplicado: ' + r.partidos + ' partidos e ' + n(r.candidatos) + ' candidatos.', 'ok', 5000);
      return carregar(true).then(function () { return registrarSnapshot(false); });
    }).catch(function (e) { App.toast(e.message, 'erro'); App.carregando(b, false); });
  }
  function descartarPreviaTSE() { tseState = { carregando: false, erro: null, preview: null }; renderResultado(); }

  function chaveLinha(id, titulo, on, txtOn, txtOff) {
    return '<div class="chave-linha chave-tse-op' + (on ? ' on' : '') + '"><div><b>' + titulo + '</b><span>' + (on ? txtOn : txtOff) + '</span></div>' +
      '<label class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="trilho"></span></label></div>';
  }
  function ligarChave(inp, chave, tituloOn, txtOn, tituloOff, txtOff) {
    if (!inp) return;
    inp.onchange = function () {
      var ligar = inp.checked;
      App.confirmar(ligar ? tituloOn : tituloOff, ligar ? txtOn : txtOff, ligar ? 'Ligar' : 'Desligar', !ligar).then(function (ok) {
        if (!ok) { inp.checked = !ligar; return; }
        inp.disabled = true;
        var v = {}; v[chave] = ligar ? 'TRUE' : 'FALSE';
        chamar('apuracao.salvarConfig', { valores: v }).then(function () { App.toast(ligar ? 'Ligado.' : 'Desligado.', 'ok'); return carregar(true); })
          .catch(function (e) { inp.checked = !ligar; inp.disabled = false; App.toast(e.message, 'erro'); });
      });
    };
  }
  function htmlAutomatico(cfg) {
    var on = String(cfg.tse_auto).toUpperCase() === 'TRUE', ult = dados.tse_auto_ultima, st = dados.tse_auto_status || '';
    var atrasado = on && !App.DEMO && (!ult || (Date.now() - msData(ult)) > 12 * 60000);
    return chaveLinha('rs-auto', 'Atualização automática (a cada 5 minutos)', on,
      '<strong>Ligada:</strong> o sistema busca o TSE sozinho e aplica quando o arquivo for <strong>mais novo</strong> que o último aplicado. Arquivo igual ou mais antigo é ignorado.',
      '<strong>Desligada:</strong> os dados só mudam quando alguém clicar em "Atualizar do TSE" e "Aplicar".') +
      (on || ult ? '<div class="auto-status' + (/^erro/.test(st) ? ' erro' : '') + '"><span>Última verificação: <b>' + (ult ? dataHoraCompleta(ult) : 'nenhuma ainda') + '</b>' + (st ? ' — ' + h(st) : '') + '</span>' +
        '<button class="btn btn-ghost btn-sm" id="rs-verificar">' + ICON.atualizar + 'Verificar agora</button></div>' : '') +
      (atrasado ? '<div class="aviso aviso-alerta small" style="margin:-4px 0 14px">' + ICON.alerta + '<div><strong>O agendamento não está rodando.</strong> No Apps Script, escolha a função <strong>instalarAutomatico</strong> e clique em Executar (uma única vez).</div></div>' : '');
  }
  function msData(st) { var m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(String(st || '')); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0; }

  function modalConfig() {
    var cfg = dados.config;
    var m = App.modal(App.cabecalhoModal('Configurar a Apuração TSE', 'Nome, número e partido do candidato ficam em Apuração → Parâmetros → Geral.') +
      '<form id="mc-form"><div class="campo"><label for="mc-url">Endereço do resultado do TSE — estado (JSON)</label><input class="input" id="mc-url" value="' + h(cfg.tse_url || '') + '"></div>' +
      '<div class="campo"><label for="mc-url-mun">Endereço do resultado do TSE — Anchieta (JSON)</label><input class="input" id="mc-url-mun" value="' + h(cfg.tse_url_municipio || '') + '"><div class="ajuda">Usado na aba Conferência. Código TSE de Anchieta: 56073.</div></div>' +
      '<div class="campo"><label for="mc-vagas">Vagas em disputa</label><input class="input" id="mc-vagas" inputmode="numeric" maxlength="3" value="' + calc.vagas + '"><div class="ajuda">Assembleia Legislativa do ES: 30 vagas.</div></div>' +
      '<div class="acoes"><button type="button" class="btn btn-sec" data-fechar>Cancelar</button><button class="btn btn-azul" type="submit" id="mc-salvar">Salvar</button></div></form>');
    $('#mc-form', m.el).onsubmit = function (e) {
      e.preventDefault();
      var vagas = valorNumero($('#mc-vagas', m.el).value);
      if (!vagas || Number(vagas) < 1) return App.toast('Informe o número de vagas.', 'erro');
      var b = $('#mc-salvar', m.el); App.carregando(b, true);
      chamar('apuracao.salvarConfig', { valores: { tse_url: $('#mc-url', m.el).value.trim(), tse_url_municipio: $('#mc-url-mun', m.el).value.trim(), vagas_total: vagas } }).then(function () {
        App.toast('Configuração salva.', 'ok'); m.fechar(); carregar(true);
      }).catch(function (e2) { App.toast(e2.message, 'erro'); App.carregando(b, false); });
    };
  }

  function modalPartido(id) {
    var p = id ? dados.partidos.filter(function (x) { return x.id === id; })[0] : { sigla: '', votos: 0, agremiacao: '' };
    var m = App.modal(App.cabecalhoModal(id ? 'Editar partido' : 'Novo partido', 'Use a sigla (ex.: PT, PSDB). Partidos de federação são somados sozinhos.') +
      '<form id="mp-form"><div class="campo"><label for="mp-sigla">Sigla do partido</label><input class="input" id="mp-sigla" value="' + h(p.sigla) + '" autocomplete="off"></div>' +
      '<div class="campo"><label for="mp-votos">Votos (nominais + legenda)</label><input class="input" id="mp-votos" inputmode="numeric" value="' + (p.votos ? n(p.votos) : '') + '" autocomplete="off"></div>' +
      '<div class="acoes">' + (id ? '<button type="button" class="btn btn-perigo-sec" id="mp-excluir">' + ICON.lixo + 'Excluir</button>' : '') +
      '<button type="button" class="btn btn-sec" data-fechar>Cancelar</button><button class="btn btn-azul" type="submit" id="mp-salvar">Salvar</button></div></form>');
    campoNumero($('#mp-votos', m.el));
    $('#mp-form', m.el).onsubmit = function (e) {
      e.preventDefault();
      var b = $('#mp-salvar', m.el); App.carregando(b, true);
      chamar('tse.salvarPartido', { id: id || '', sigla: $('#mp-sigla', m.el).value, votos: valorNumero($('#mp-votos', m.el).value) || '0', agremiacao: p.agremiacao || '' }).then(function () {
        App.toast('Partido salvo.', 'ok'); m.fechar(); return carregar(true).then(function () { return registrarSnapshot(false); });
      }).catch(function (e2) { App.toast(e2.message, 'erro'); App.carregando(b, false); });
    };
    var ex = $('#mp-excluir', m.el);
    if (ex) ex.onclick = function () {
      App.confirmar('Excluir ' + h(p.sigla) + '?', 'Os votos deste partido saem do cálculo de vagas.', 'Excluir', true).then(function (ok) {
        if (!ok) return;
        chamar('tse.excluirPartido', { id: id }).then(function () { App.toast('Partido excluído.'); m.fechar(); carregar(true); }).catch(function (e) { App.toast(e.message, 'erro'); });
      });
    };
  }

  /* ================= 2. PROJEÇÃO DE VAGAS ================= */
  function renderProjecao() {
    var el = $('#sec-projecao'), st = calc.st, s = calc.status, html = '';
    html += '<section class="card status-tse"><div class="status-tse-in">' +
      '<div><div class="rot-mini">' + h(nomeCand()) + ' · ' + h(dados.config.candidato_numero || '') + ' · ' + h(calc.grupoNosso.nome) + '</div>' + seloStatus(s, true) + '</div>' +
      '<p class="muted small" style="margin:0">' + textoStatus(st, s) + '</p></div>' +
      (LEITURA ? '<div class="resumo-simples"><b>Em palavras simples:</b> ' + fraseSimples() + '</div>' : '') + '</section>';
    if (st.kind === 'sem-dados') {
      html += LEITURA ? '' : st.zerado
        ? '<div class="aviso aviso-info">' + ICON.info + '<div><b>O TSE ainda não divulgou votos</b>O arquivo aplicado tem os partidos e candidatos, mas todos com 0 votos (é assim antes do fim da votação). A projeção de vagas e o <strong>Quanto falta para eleger</strong> aparecem aqui assim que você aplicar um resultado com votos.</div></div>'
        : '<div class="aviso aviso-info">' + ICON.info + '<div><b>Sem votos por partido</b>Busque o resultado em <strong>Resultado TSE</strong> ou cadastre os votos dos partidos manualmente para calcular a projeção.</div></div>';
      html += htmlCandidatosPartido(st);
      el.innerHTML = html; ligarCandidatos(el); return;
    }
    var nosso = st.nosso, votosNosso = nosso ? nosso.votos : 0;
    html += '<div class="kpis">' +
      '<div class="kpi"><div class="rot">Votos válidos</div><div class="val num">' + n(st.dist.votosValidos) + '</div><div class="det">' + calc.vagas + ' vagas em disputa</div></div>' +
      '<div class="kpi"><div class="rot">Quociente eleitoral</div><div class="val num">' + n(st.QE) + '</div><div class="det">votos válidos ÷ vagas</div></div>' +
      '<div class="kpi"><div class="rot">Vagas do ' + h(calc.grupoNosso.nome) + '</div><div class="val num">' + st.vagasDoPartido + '</div><div class="det">' +
        (st.linhaPartido ? st.linhaPartido.vagasQP + ' pelo quociente + ' + st.linhaPartido.vagasSobra + ' nas sobras' : 'partido sem votos cadastrados') + '</div></div>' +
      '<div class="kpi destaque"><div class="rot">' + h(nomeCand()) + '</div><div class="val num">' + (nosso ? n(votosNosso) : '—') + '</div><div class="det">' +
        (nosso ? pctFrac(st.QE ? votosNosso / st.QE : 0) + ' do quociente eleitoral' : 'candidato não cadastrado') + '</div></div></div>';
    html += dica('<b>Como ler:</b> os <b>votos válidos</b> são os votos em candidatos e partidos (brancos e nulos não contam). Dividindo por ' + calc.vagas + ' vagas, chega-se ao <b>quociente eleitoral</b> — o "preço" de uma vaga: hoje, cada vaga custa ' + n(st.QE) + ' votos. O ' + h(calc.grupoNosso.nome) + ' fez ' + n(st.linhaPartido ? st.linhaPartido.votos : 0) + ' votos, o que dá ' + st.vagasDoPartido + ' vaga(s).');

    html += htmlQuantoFalta();

    // medidor % do QE com a marca da cláusula (10%)
    var pctQE = st.QE > 0 ? votosNosso / st.QE : 0, fill = Math.max(0, Math.min(100, pctQE * 100));
    var corMedidor = s.classe === 'ok' ? 'var(--ok)' : s.classe === 'warn' ? 'var(--laranja)' : s.classe === 'danger' ? 'var(--perigo)' : 'var(--texto-3)';
    html += '<section class="card"><div class="card-titulo"><h3>' + h(nomeCand()) + ' × quociente eleitoral</h3><span class="muted tiny">' + pctFrac(pctQE) + ' do QE</span></div>' +
      '<div class="medidor"><i style="width:' + fill + '%;background:' + corMedidor + '"></i><span class="medidor-marca" style="left:10%" title="Cláusula de desempenho: 10% do QE"></span></div>' +
      '<div class="medidor-legenda"><span>0</span><span style="left:10%">10% · cláusula (' + n(Math.ceil(st.QE * 0.1)) + ')</span><span style="right:0">100% · QE (' + n(st.QE) + ')</span></div>' +
      '<p class="muted small" style="margin:12px 0 0">Para poder ser eleito, o candidato precisa de pelo menos <strong>' + n(Math.ceil(st.QE * 0.1)) + ' votos</strong> (10% do quociente eleitoral) e ficar entre os ' + st.vagasDoPartido + ' mais votados do partido.</p>' +
      dica('A barra mostra quanto ' + h(nomeCand()) + ' já tem em relação ao "preço" de uma vaga. O tracinho é o <b>mínimo exigido por lei</b> (10%). Passar do tracinho é obrigatório, mas não basta: ele também precisa estar entre os mais votados do partido.') + '</section>';

    // distribuição das vagas
    var tot = { votos: 0, qp: 0, sb: 0 };
    html += '<section class="card"><div class="card-titulo"><h3>Distribuição das vagas</h3><span class="muted tiny">quociente partidário + sobras pelas maiores médias</span></div>' +
      dica('Cada partido ganha uma vaga a cada ' + n(st.QE) + ' votos (coluna <b>Quociente</b>). As vagas que sobram são divididas depois, pelas maiores médias (coluna <b>Sobras</b>). Partidos de uma federação contam juntos, como se fossem um só.', true) +
      '<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th>Partido / federação</th><th class="r">Votos</th><th class="r">% do QE</th><th class="r">Quociente</th><th class="r">Sobras</th><th class="r">Vagas</th></tr></thead><tbody>' +
      st.dist.resultado.map(function (r) {
        tot.votos += r.votos; tot.qp += r.vagasQP; tot.sb += r.vagasSobra;
        var nossoP = r.chave === calc.grupoNosso.chave;
        return '<tr' + (nossoP ? ' class="linha-nosso"' : '') + '><td data-l="Partido"><b>' + h(r.nome) + '</b>' + (r.membros.length > 1 ? '<div class="tiny muted">' + h(r.membros.join(' + ')) + '</div>' : '') + '</td>' +
          '<td data-l="Votos" class="r">' + n(r.votos) + '</td><td data-l="% do QE" class="r"' + (st.QE && r.votos < 0.8 * st.QE ? ' title="Abaixo de 80% do QE: só disputa sobras se nenhum partido alcançar"' : '') + '>' + pctFrac(st.QE ? r.votos / st.QE : 0, 0) + '</td>' +
          '<td data-l="Quociente" class="r">' + r.vagasQP + '</td><td data-l="Sobras" class="r">' + (r.vagasSobra || '—') + '</td><td data-l="Vagas" class="r"><b>' + r.vagasTotal + '</b></td></tr>';
      }).join('') + '</tbody><tfoot><tr><td data-l="Total">Total</td><td data-l="Votos" class="r">' + n(tot.votos) + '</td><td class="oculto-mobile"></td><td data-l="Quociente" class="r">' + tot.qp + '</td><td data-l="Sobras" class="r">' + tot.sb + '</td><td data-l="Vagas" class="r">' + (tot.qp + tot.sb) + '</td></tr></tfoot></table></div>' +
      (st.dist.historico.length ? '<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">Como as ' + st.dist.historico.length + ' sobras foram distribuídas</summary><ol class="lista-sobras">' +
        st.dist.historico.map(function (x) { return '<li><b>' + h(x.partido) + '</b> · média ' + n(Math.round(x.media)) + (x.excecaoStf ? ' <span class="selo selo-AGUARDANDO">exceção STF</span>' : '') + '</li>'; }).join('') + '</ol>' +
        '<p class="tiny muted">Disputam as sobras os partidos com pelo menos 80% do QE. Se nenhum alcançar, todos com votos disputam (regra do STF, 2024).</p></details>' : '') + '</section>';

    html += htmlCandidatosPartido(st);
    el.innerHTML = html;
    ligarCandidatos(el);
  }
  function htmlQuantoFalta() {
    var r = Tse.quantoFalta(calc, dados.tse_pct_secoes), nome = nomeCand(), partido = calc.grupoNosso.nome;
    if (!r) return '';
    var linha = function (rot, val, det) { return '<div class="linha"><span>' + rot + (det ? '<small class="tiny muted" style="display:block;font-weight:500">' + det + '</small>' : '') + '</span><b>' + val + '</b></div>'; };
    var votos = function (x) { return x === null || x === undefined ? 'fora de alcance' : n(x) + ' voto' + (x === 1 ? '' : 's'); };
    var html = '<section class="card quanto-falta' + (r.eleito ? ' ok' : '') + '"><div class="card-titulo"><h3>Quanto falta para eleger</h3><span class="muted tiny">simulação com o resultado atual do TSE</span></div>';
    if (!r.eleito) {
      html += '<div class="qf-destaque"><span>Faltam</span><b class="num">' + (r.paraEleger === null ? '—' : n(r.paraEleger)) + '</b><span>votos para ' + h(nome) + ' entrar na projeção de eleitos</span></div>' +
        '<p class="muted small" style="margin:0 0 14px">Conta que os votos dele também somam para o ' + h(partido) + ' (mudam o quociente e as sobras). Os adversários ficam como estão.</p>' +
        dica('<b>Como ler:</b> é uma simulação. O sistema pergunta: "se ' + h(nome) + ' tivesse mais votos, a partir de quantos ele entraria?". A resposta considera os votos que <b>já foram contados</b>. Como ainda chegam votos de todos os candidatos, esse número muda durante a noite — por isso olhe também a <b>estimativa para o fim da apuração</b>, logo abaixo.');
      html += '<div class="resumo-envio">' +
        (r.ultimoEleito ? linha('Para passar ' + h(r.ultimoEleito.nome), votos(r.ultimoEleito.falta), 'último eleito do ' + h(partido) + ' · ' + n(r.ultimoEleito.votos) + ' votos') : '') +
        linha('Para o ' + h(partido) + ' ganhar mais uma vaga', votos(r.paraMaisVaga), r.vagaSairiaDe ? 'a vaga sairia do ' + h(r.vagaSairiaDe) + ' · votos de legenda ou de qualquer candidato do partido' : 'votos de legenda ou de qualquer candidato do partido') +
        linha('Para alcançar a cláusula (10% do QE)', r.paraClausula ? votos(r.paraClausula) : 'já alcançou', 'mínimo de ' + n(Math.ceil(r.QE * 0.1)) + ' votos') +
        '</div>';
    } else {
      var margens = [];
      if (r.proximoColega) margens.push(r.proximoColega.margem);
      if (r.ameacaPartido) margens.push(r.ameacaPartido.falta);
      var margem = margens.length ? Math.min.apply(null, margens) : null;
      html += '<div class="qf-destaque"><span>Eleito na projeção' + (margem !== null ? ' · margem de' : '') + '</span><b class="num">' + (margem !== null ? n(margem) : '✓') + '</b><span>' + (margem !== null ? 'votos de vantagem no ponto mais apertado' : '') + '</span></div>' +
        dica('<b>Como ler:</b> a margem é a "folga" de ' + h(nome) + ' neste momento. Quanto maior, mais segura a vaga. Ela pode diminuir se chegarem muitos votos de um colega de partido ou de um partido adversário.');
      html += '<div class="resumo-envio">' +
        (r.proximoColega ? linha('Vantagem sobre ' + h(r.proximoColega.nome), votos(r.proximoColega.margem), 'primeiro do ' + h(partido) + ' fora das vagas · ' + n(r.proximoColega.votos) + ' votos') : '') +
        linha('Para tirar a vaga dele', r.ameacaPartido ? votos(r.ameacaPartido.falta) + ' do ' + h(r.ameacaPartido.nome) : 'vaga segura', 'partido adversário que chegaria mais perto') +
        linha('Para o ' + h(partido) + ' ganhar mais uma vaga', votos(r.paraMaisVaga), r.vagaSairiaDe ? 'a vaga sairia do ' + h(r.vagaSairiaDe) : '') +
        '</div>';
    }
    if (r.final) {
      html += '<div class="aviso aviso-info" style="margin:14px 0 0">' + ICON.info + '<div><b>Estimativa para o fim da apuração</b>Com ' + r.final.pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% das seções totalizadas e todos mantendo o ritmo, ' + h(nome) + ' terminaria com cerca de <strong>' + n(r.final.votosProjetados) + ' votos</strong>' +
        (r.final.precisaTerminarCom ? ' e precisaria terminar com cerca de <strong>' + n(r.final.precisaTerminarCom) + '</strong> para ser eleito.' : '.') +
        (LEITURA ? '<br><span class="small">É uma conta de "regra de três": supõe que os votos que faltam chegam na mesma proporção dos já contados. Na prática, regiões diferentes chegam em horários diferentes, então use como referência, não como certeza.</span>' : '') + '</div></div>';
    }
    return html + '</section>';
  }
  function textoStatus(st, s) {
    if (s.chave === 'sem-dados') return st.zerado ? 'O TSE ainda não divulgou votos. A projeção começa com o primeiro resultado com votos.' : 'Sem votos por partido para projetar as vagas.';
    if (s.chave === 'sem-candidato') return 'O número ' + h(calc.meuNumero) + ' não está na lista de candidatos do ' + h(calc.grupoNosso.nome) + '. Carregue os candidatos abaixo ou busque no TSE.';
    if (s.chave === 'eleito') return 'Com os números atuais, o ' + h(calc.grupoNosso.nome) + ' faz ' + st.vagasDoPartido + ' vaga(s) e ' + h(nomeCand()) + ' está entre os eleitos do partido.';
    if (s.chave === 'fora-faixa') return 'Passa da cláusula de desempenho, mas não está entre os ' + st.vagasDoPartido + ' mais votados do ' + h(calc.grupoNosso.nome) + '.';
    return 'Está abaixo de 10% do quociente eleitoral (' + n(Math.ceil(st.QE * 0.1)) + ' votos).';
  }

  function htmlCandidatosPartido(st) {
    var lista = st.kind === 'com-dados' ? st.candidatos : calc.doPartido.slice().sort(function (a, b) { return b.votos - a.votos; });
    return '<section class="card"><div class="card-titulo"><h3>Candidatos do ' + h(calc.grupoNosso.nome) + '</h3>' + (LEITURA ? '<span class="muted tiny">do mais votado ao menos votado</span>' : '<div class="botoes-linha">' +
      '<button class="btn btn-sec btn-sm" id="pc-carregar">' + ICON.upload + 'Carregar candidatos do ' + h(calc.grupoNosso.nome) + '</button>' +
      '<button class="btn btn-sec btn-sm" id="pc-novo">' + ICON.mais + 'Candidato</button></div>') + '</div>' +
      (LEITURA && st.kind === 'com-dados' ? dica('O ' + h(calc.grupoNosso.nome) + ' tem ' + st.vagasDoPartido + ' vaga(s) nesta projeção. Elas ficam com os ' + st.vagasDoPartido + ' mais votados do partido que passaram da cláusula (selo <b>eleito</b>). Os seguintes são os suplentes.', true) : '') +
      (lista.length ? '<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th class="r">#</th><th class="r">Nº</th><th>Candidato</th><th class="r">Votos</th><th>Cláusula 10%</th><th>Projeção</th>' + (LEITURA ? '' : '<th></th>') + '</tr></thead><tbody>' +
        lista.map(function (c, i) {
          return '<tr' + (c.ehNosso ? ' class="linha-nosso"' : '') + '><td data-l="#" class="r">' + (i + 1) + 'º</td><td data-l="Nº" class="r">' + h(c.numero || '—') + '</td><td data-l="Candidato"><b>' + h(c.nome) + '</b></td>' +
            '<td data-l="Votos" class="r"><b>' + n(c.votos) + '</b></td>' +
            '<td data-l="Cláusula 10%">' + (st.kind !== 'com-dados' ? '—' : c.passaClausula ? '<span class="selo selo-ENVIADO">passa</span>' : '<span class="selo selo-REJEITADO">não passa</span>') + '</td>' +
            '<td data-l="Projeção">' + (st.kind !== 'com-dados' ? '—' : c.eleito ? '<span class="selo selo-VALIDADO">eleito</span>' : '<span class="muted small">—</span>') + '</td>' +
            (LEITURA ? '' : '<td class="r"><button class="btn btn-ghost btn-sm" data-edcand="' + h(c.id) + '">' + ICON.lapis + 'Editar</button></td>') + '</tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="vazio">' + (LEITURA ? 'Os candidatos aparecem com o primeiro resultado do TSE.' : 'Nenhum candidato do ' + h(calc.grupoNosso.nome) + ' cadastrado. Use <b>Carregar candidatos</b> (lista de aptos do TSE, com 0 votos) ou <b>Atualizar do TSE</b>.') + '</div>') + '</section>';
  }
  function ligarCandidatos(el) {
    var c = $('#pc-carregar', el);
    if (c) c.onclick = function () {
      var lista = Tse.candidatosTseDoPartido(dados.config.partido || 'AGIR');
      if (!lista.length) return App.toast('Nenhum candidato do partido na lista de aptos.', 'erro');
      var b = this; App.carregando(b, true, 'Carregando…');
      chamar('tse.carregarCandidatos', { lista: lista.map(function (x) { return { nome: x[0], partido: x[1], numero: x[2] }; }) }).then(function (r) {
        App.toast(r.adicionados + ' candidatos adicionados' + (r.existentes ? ', ' + r.existentes + ' já estavam na lista' : '') + '.', 'ok', 5000);
        return carregar(true);
      }).catch(function (e) { App.toast(e.message, 'erro'); App.carregando(b, false); });
    };
    var nv = $('#pc-novo', el); if (nv) nv.onclick = function () { modalCandidato(null); };
    $$('[data-edcand]', el).forEach(function (b) { b.onclick = function () { modalCandidato(b.dataset.edcand); }; });
  }
  function modalCandidato(id) {
    var c = id ? dados.candidatos.filter(function (x) { return x.id === id; })[0] : { nome: '', numero: '', partido: calc.grupoNosso.nome, votos: 0 };
    var m = App.modal(App.cabecalhoModal(id ? 'Editar candidato' : 'Novo candidato', id && c.origem === 'TSE' ? 'Veio do TSE: a próxima atualização do TSE substitui os votos.' : '') +
      '<form id="mcd-form"><div class="grid-2"><div class="campo"><label for="mcd-num">Número</label><input class="input" id="mcd-num" inputmode="numeric" maxlength="5" value="' + h(c.numero) + '"></div>' +
      '<div class="campo"><label for="mcd-votos">Votos</label><input class="input" id="mcd-votos" inputmode="numeric" value="' + (c.votos ? n(c.votos) : '') + '"></div></div>' +
      '<div class="campo"><label for="mcd-nome">Nome de urna</label><input class="input" id="mcd-nome" value="' + h(c.nome) + '"></div>' +
      '<div class="campo"><label for="mcd-partido">Partido</label><input class="input" id="mcd-partido" value="' + h(c.partido) + '"></div>' +
      '<div class="acoes">' + (id ? '<button type="button" class="btn btn-perigo-sec" id="mcd-excluir">' + ICON.lixo + 'Excluir</button>' : '') +
      '<button type="button" class="btn btn-sec" data-fechar>Cancelar</button><button class="btn btn-azul" type="submit" id="mcd-salvar">Salvar</button></div></form>');
    campoNumero($('#mcd-votos', m.el));
    $('#mcd-num', m.el).addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
    $('#mcd-form', m.el).onsubmit = function (e) {
      e.preventDefault();
      var b = $('#mcd-salvar', m.el); App.carregando(b, true);
      chamar('tse.salvarCandidato', { id: id || '', numero: $('#mcd-num', m.el).value, nome: $('#mcd-nome', m.el).value, partido: $('#mcd-partido', m.el).value, votos: valorNumero($('#mcd-votos', m.el).value) || '0' }).then(function () {
        App.toast('Candidato salvo.', 'ok'); m.fechar(); return carregar(true).then(function () { return registrarSnapshot(false); });
      }).catch(function (e2) { App.toast(e2.message, 'erro'); App.carregando(b, false); });
    };
    var ex = $('#mcd-excluir', m.el);
    if (ex) ex.onclick = function () {
      App.confirmar('Excluir ' + h(c.nome) + '?', 'O candidato sai da lista da projeção.', 'Excluir', true).then(function (ok) {
        if (!ok) return;
        chamar('tse.excluirCandidato', { id: id }).then(function () { App.toast('Candidato excluído.'); m.fechar(); carregar(true); }).catch(function (e) { App.toast(e.message, 'erro'); });
      });
    };
  }

  /* ================= ELEITOS PROJETADOS (todos os partidos) ================= */
  var eleitosVista = 'partido';
  function seloOficial(c) {
    var o = Tse.situacaoOficial(c.situacao);
    if (!o) return '<span class="muted small">—</span>';
    return '<span class="selo selo-' + (o.chave === 'eleito' ? 'VALIDADO' : o.chave === 'suplente' ? 'AGUARDANDO' : 'DESCARTADO') + '">' + h(o.label) + '</span>';
  }
  function renderEleitos() {
    var el = $('#sec-eleitos'), e = Tse.eleitosProjetados(calc), st = calc.st;
    if (st.kind !== 'com-dados') {
      el.innerHTML = '<div class="aviso aviso-info">' + ICON.info + '<div><b>' + (st.zerado ? 'O TSE ainda não divulgou votos' : 'Sem votos por partido') + '</b>' +
        (st.zerado ? 'Os eleitos projetados aparecem assim que você aplicar um resultado com votos.' : 'Busque e aplique o resultado em <strong>Resultado TSE</strong> para ver os eleitos projetados.') + '</div></div>';
      return;
    }
    var temOficial = calc.candidatos.some(function (c) { return Tse.situacaoOficial(c.situacao); });
    var nossoEleito = e.lista.some(function (c) { return c.ehNosso; });
    var html = '<div class="kpis">' +
      '<div class="kpi destaque"><div class="rot">Eleitos projetados</div><div class="val num">' + e.lista.length + ' <span style="font-size:18px;opacity:.8">/ ' + e.vagas + '</span></div><div class="det">' + (e.vagasSemCandidato ? e.vagasSemCandidato + ' vaga(s) sem candidato acima da cláusula' : 'todas as vagas preenchidas') + '</div></div>' +
      '<div class="kpi"><div class="rot">Partidos com vaga</div><div class="val num">' + e.partidos.length + '</div><div class="det">federações contam como um partido</div></div>' +
      '<div class="kpi"><div class="rot">Quociente eleitoral</div><div class="val num">' + n(st.QE) + '</div><div class="det">cláusula: ' + n(Math.ceil(st.QE * 0.1)) + ' votos</div></div>' +
      '<div class="kpi"><div class="rot">' + h(nomeCand()) + '</div><div class="val" style="font-size:22px;margin-top:10px">' + seloStatus(calc.status) + '</div><div class="det">' + (nossoEleito ? 'está na lista abaixo' : 'fora da lista de eleitos') + '</div></div></div>';
    html += '<div class="aviso aviso-info">' + ICON.info + '<div><b>Projeção do sistema</b>Calculada com os votos aplicados do TSE: vagas de cada partido (quociente + sobras) e, dentro do partido, os mais votados acima de 10% do QE. O resultado oficial é o do TSE' +
      (temOficial ? ': a coluna <strong>Situação TSE</strong> já mostra o que o TSE informou.' : '. Quando a totalização terminar, a coluna <strong>Situação TSE</strong> mostra a situação oficial.') + '</div></div>';
    html += '<div class="sub-abas" role="tablist"><button class="sub-aba' + (eleitosVista === 'partido' ? ' ativa' : '') + '" data-ev="partido">Por partido</button><button class="sub-aba' + (eleitosVista === 'votos' ? ' ativa' : '') + '" data-ev="votos">Por votos</button></div>';
    if (eleitosVista === 'votos') {
      html += '<section class="card"><div class="card-titulo"><h3>Os ' + e.lista.length + ' eleitos projetados, do mais votado ao menos votado</h3></div><div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th class="r">#</th><th class="r">Nº</th><th>Candidato</th><th>Partido</th><th class="r">Votos</th><th class="r">% do QE</th><th>Situação TSE</th></tr></thead><tbody>' +
        e.lista.map(function (c, i) {
          return '<tr' + (c.ehNosso ? ' class="linha-nosso"' : '') + '><td data-l="#" class="r">' + (i + 1) + 'º</td><td data-l="Nº" class="r">' + h(c.numero) + '</td><td data-l="Candidato"><b>' + h(c.nome) + '</b></td>' +
            '<td data-l="Partido">' + h(c.partidoCalculo) + '</td><td data-l="Votos" class="r"><b>' + n(c.votos) + '</b></td><td data-l="% do QE" class="r">' + pctFrac(c.votos / st.QE) + '</td><td data-l="Situação TSE">' + seloOficial(c) + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    } else {
      html += '<div class="eleitos-grade">' + e.partidos.map(function (p) {
        var nosso = p.chave === calc.grupoNosso.chave;
        return '<section class="card eleitos-partido' + (nosso ? ' nosso' : '') + '"><div class="card-titulo"><h3>' + h(p.nome) + '</h3><span class="selo selo-VALIDADO">' + p.vagas + ' vaga' + (p.vagas === 1 ? '' : 's') + '</span></div>' +
          '<p class="tiny muted" style="margin:-8px 0 10px">' + n(p.votos) + ' votos · ' + p.vagasQP + ' pelo quociente' + (p.vagasSobra ? ' + ' + p.vagasSobra + ' nas sobras' : '') + (p.membros.length > 1 ? ' · ' + h(p.membros.join(' + ')) : '') + '</p>' +
          '<ol class="lista-eleitos">' + p.eleitos.map(function (c) {
            return '<li' + (c.ehNosso ? ' class="nosso"' : '') + '><span class="num">' + h(c.numero) + '</span><b>' + h(c.nome) + '</b><span class="num v">' + n(c.votos) + '</span>' + (Tse.situacaoOficial(c.situacao) ? seloOficial(c) : '') + '</li>';
          }).join('') + (p.vagasSemCandidato ? '<li class="sem"><span></span><b>' + p.vagasSemCandidato + ' vaga(s) sem candidato acima da cláusula</b></li>' : '') + '</ol>' +
          (p.suplente ? '<p class="tiny muted" style="margin:10px 0 0">1º suplente: <b>' + h(p.suplente.nome) + '</b> · ' + n(p.suplente.votos) + ' votos' + (p.suplente.ehNosso ? ' · <b style="color:var(--laranja)">' + h(nomeCand()) + '</b>' : '') + '</p>' : '') + '</section>';
      }).join('') + '</div>';
    }
    if (e.vagasSemCandidato) html += '<p class="tiny muted">Vagas sem candidato acima da cláusula são redistribuídas pela Justiça Eleitoral entre os outros partidos; a projeção não faz essa redistribuição.</p>';
    el.innerHTML = html;
    $$('[data-ev]', el).forEach(function (b) { b.onclick = function () { eleitosVista = b.dataset.ev; renderEleitos(); }; });
  }

  /* ================= CONFERÊNCIA: nossa apuração × TSE ================= */
  var apDados = null, conferenciaSecoes = null;
  function nossaAnchieta() {
    var cfg = dados.config, mun = Core.norm(cfg.municipio_principal || 'ANCHIETA');
    var urnas = Core.resolverUrnas(apDados.lancamentos), r = { val: 0, total: 0, urnas: 0, porSecao: {} };
    Object.keys(urnas).forEach(function (k) {
      var u = urnas[k]; if (Core.norm(u.municipio) !== mun) return;
      var v = Number(u.votos) || 0;
      r.total += v; if (u.status === 'VALIDADO') r.val += v;
      if (!Core.ehTotal(u)) { r.urnas++; r.porSecao[String(Number(u.secao))] = u; }
    });
    var locais = {}; apDados.locais.forEach(function (l) { if (Core.norm(l.municipio) === mun) locais[l.id] = l; });
    r.secoes = apDados.secoes.filter(function (s) { return s.ativo && locais[s.local_id]; }).map(function (s) { return { numero: String(Number(s.numero)), local: locais[s.local_id].nome }; });
    return r;
  }
  function renderConferencia() {
    var el = $('#sec-conferencia');
    if (!apDados) {
      el.innerHTML = '<div class="card vazio">Carregando a nossa apuração…</div>';
      chamar('apuracao.dados').then(function (r) { apDados = r; renderConferencia(); }).catch(function (e) { el.innerHTML = '<div class="aviso aviso-perigo">' + ICON.alerta + '<div>' + h(e.message) + '</div></div>'; });
      return;
    }
    var nos = nossaAnchieta(), tm = dados.tse_municipio, nome = nomeCand(), html = '';
    var pctNos = nos.secoes.length ? nos.urnas / nos.secoes.length * 100 : 0;
    html += '<section class="card"><div class="card-titulo"><h2>Anchieta: nossa apuração × TSE</h2><div class="botoes-linha"><button class="btn btn-sec btn-sm" id="cf-recarregar">' + ICON.atualizar + 'Atualizar nossa apuração</button>' +
      '<button class="btn btn-azul btn-sm" id="cf-mun">' + ICON.atualizar + 'Buscar Anchieta no TSE</button></div></div>' +
      '<p class="muted small" style="margin:-6px 0 14px">Compara os votos de ' + h(nome) + ' em Anchieta: o que os fiscais enviaram (nossa apuração) e o que o TSE divulgou para o município.' +
      (String(dados.config.tse_auto).toUpperCase() === 'TRUE' ? ' Com a atualização automática ligada, o resultado de Anchieta também é buscado a cada 5 minutos.' : '') + '</p>';
    if (!tm) html += '<div class="aviso aviso-info">' + ICON.info + '<div>Ainda não buscamos o resultado de Anchieta no TSE. Clique em <strong>Buscar Anchieta no TSE</strong>.</div></div>';
    else if (!tm.encontrado) html += '<div class="aviso aviso-alerta">' + ICON.alerta + '<div>O arquivo de Anchieta não tem o número ' + h(calc.meuNumero) + '. Confira o endereço em <strong>Resultado TSE → Configurar</strong>.</div></div>';
    var tseV = tm && tm.encontrado ? tm.votos : null, pctT = tm ? tm.pctSecoes : null;
    var dif = tseV === null ? null : nos.total - tseV, difVal = tseV === null ? null : nos.val - tseV;
    var completo = pctT !== null && pctT >= 100 && pctNos >= 100;
    html += '<div class="kpis">' +
      '<div class="kpi"><div class="rot">Nossa apuração</div><div class="val num">' + n(nos.total) + '</div><div class="det">' + n(nos.val) + ' confirmados · ' + nos.urnas + ' de ' + nos.secoes.length + ' urnas (' + pctNos.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%)</div></div>' +
      '<div class="kpi destaque"><div class="rot">TSE · Anchieta</div><div class="val num">' + (tseV === null ? '—' : n(tseV)) + '</div><div class="det">' + (tm ? (pctT !== null ? pctT.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% das seções' : h(tm.situacao || '')) + (tm.atualizadoEm ? ' · arquivo de ' + h(tm.atualizadoEm) : '') : 'não buscado') + '</div></div>' +
      '<div class="kpi"><div class="rot">Diferença</div><div class="val num" style="color:' + (dif === null ? 'inherit' : dif === 0 ? 'var(--ok)' : '#b34700') + '">' + (dif === null ? '—' : (dif > 0 ? '+' : '') + n(dif)) + '</div><div class="det">nossa (com em conferência) − TSE</div></div>' +
      '<div class="kpi"><div class="rot">Só confirmados</div><div class="val num">' + (difVal === null ? '—' : (difVal > 0 ? '+' : '') + n(difVal)) + '</div><div class="det">confirmados − TSE</div></div></div>';
    if (tseV !== null) html += completo
      ? (dif === 0 ? '<div class="aviso aviso-info">' + ICON.check + '<div><b>Os números batem.</b>Com 100% das urnas nas duas apurações, o total de Anchieta é igual ao do TSE.</div></div>'
        : '<div class="aviso aviso-perigo">' + ICON.alerta + '<div><b>Diferença de ' + n(Math.abs(dif)) + ' votos com 100% apurado.</b>Use a conferência seção por seção (abaixo) para achar onde está a diferença.</div></div>')
      : '<div class="aviso aviso-alerta">' + ICON.info + '<div><b>Comparação parcial.</b>A diferença só é definitiva quando as duas apurações chegarem a 100% das urnas — até lá, cada lado pode ter urnas que o outro ainda não contou.</div></div>';
    html += '</section>';

    // seção por seção (dados abertos do TSE, depois da eleição)
    html += '<section class="card"><div class="card-titulo"><h2>Conferência seção por seção</h2><span class="muted tiny">depois da eleição</span></div>' +
      '<p class="muted small" style="margin:-6px 0 12px">Após a eleição, o TSE publica a votação de cada seção no Portal de Dados Abertos (<b>dadosabertos.tse.jus.br</b> → "Resultados 2026" → <b>Votação por seção eleitoral</b>, arquivo do ES). ' +
      'Baixe, descompacte e escolha o arquivo <b>.csv</b> abaixo. O sistema separa só Anchieta e o número ' + h(calc.meuNumero) + ' e compara com o que os fiscais enviaram. O arquivo é lido no seu computador — nada é enviado.</p>' +
      '<label class="btn btn-sec" style="cursor:pointer">' + ICON.upload + 'Escolher arquivo CSV do TSE<input type="file" id="cf-csv" accept=".csv,text/csv" hidden></label> <span class="small muted" id="cf-prog"></span>' +
      '<div id="cf-res">' + (conferenciaSecoes ? htmlConferenciaSecoes(nos) : '') + '</div></section>';
    el.innerHTML = html;
    $('#cf-recarregar', el).onclick = function () { apDados = null; renderConferencia(); };
    $('#cf-mun', el).onclick = function () {
      var b = this; App.carregando(b, true, 'Buscando…');
      chamar('tse.municipio').then(function () { return carregar(true); }).then(function () { App.toast('Resultado de Anchieta atualizado.', 'ok'); })
        .catch(function (e) { App.toast(e.message, 'erro', 7000); App.carregando(b, false); });
    };
    $('#cf-csv', el).onchange = function () { if (this.files[0]) lerCsvTse(this.files[0]); };
  }
  /* lê o CSV de "votação por seção" do TSE em pedaços (o arquivo do estado é grande) */
  function lerCsvTse(arq) {
    var prog = $('#cf-prog'), num = calc.meuNumero, achados = {}, idx = null, resto = '', lidos = 0, linhas = 0, total = arq.size;
    var dec = new TextDecoder('windows-1252'), reader = arq.stream().getReader();
    var munAlvo = Core.norm(dados.config.municipio_principal || 'ANCHIETA');
    function campos(l) { return l.split(';').map(function (x) { return x.replace(/^"|"$/g, '').trim(); }); }
    function linha(l) {
      if (!l) return;
      var c = campos(l);
      if (!idx) { idx = {}; c.forEach(function (k, i) { idx[k.toUpperCase()] = i; }); return; }
      linhas++;
      var mun = Core.norm(c[idx.NM_MUNICIPIO]), cod = c[idx.CD_MUNICIPIO];
      if (mun !== munAlvo && cod !== '56073') return;
      if (String(c[idx.NR_VOTAVEL]) !== num) return;
      if (idx.DS_CARGO !== undefined && !/ESTADUAL/.test(Core.norm(c[idx.DS_CARGO]))) return;
      var sec = String(Number(c[idx.NR_SECAO]));
      achados[sec] = (achados[sec] || 0) + (Number(c[idx.QT_VOTOS]) || 0);
    }
    function passo() {
      return reader.read().then(function (r) {
        if (r.done) { linha(resto); return fim(); }
        lidos += r.value.length;
        var txt = resto + dec.decode(r.value, { stream: true }), partes = txt.split(/\r?\n/);
        resto = partes.pop(); partes.forEach(linha);
        prog.textContent = 'Lendo… ' + Math.round(lidos / total * 100) + '%';
        return passo();
      });
    }
    function fim() {
      if (!idx || idx.NR_SECAO === undefined || idx.QT_VOTOS === undefined || idx.NR_VOTAVEL === undefined) { prog.textContent = ''; return App.toast('Esse arquivo não parece ser a "votação por seção" do TSE (faltam as colunas NR_SECAO, NR_VOTAVEL e QT_VOTOS).', 'erro', 8000); }
      conferenciaSecoes = achados;
      prog.textContent = n(linhas) + ' linhas lidas · ' + Object.keys(achados).length + ' seções de Anchieta com votos de ' + nomeCand() + '.';
      $('#cf-res').innerHTML = htmlConferenciaSecoes(nossaAnchieta());
    }
    prog.textContent = 'Lendo… 0%';
    passo().catch(function (e) { prog.textContent = ''; App.toast('Não foi possível ler o arquivo: ' + e.message, 'erro'); });
  }
  function htmlConferenciaSecoes(nos) {
    var tse = conferenciaSecoes, linhas = [], cont = { iguais: 0, dif: 0, semNosso: 0 };
    nos.secoes.slice().sort(function (a, b) { return a.numero - b.numero; }).forEach(function (s) {
      var u = nos.porSecao[s.numero], t = tse[s.numero] !== undefined ? tse[s.numero] : 0, v = u ? Number(u.votos) || 0 : null;
      var tipo = v === null ? 'sem' : v === t ? 'ok' : 'dif';
      if (tipo === 'ok') cont.iguais++; else if (tipo === 'dif') cont.dif++; else cont.semNosso++;
      linhas.push({ s: s, u: u, v: v, t: t, tipo: tipo });
    });
    linhas.sort(function (a, b) { var o = { dif: 0, sem: 1, ok: 2 }; return o[a.tipo] - o[b.tipo] || a.s.numero - b.s.numero; });
    return '<div class="kpis" style="margin-top:16px">' +
      '<div class="kpi"><div class="rot">Seções iguais</div><div class="val num" style="color:var(--ok)">' + cont.iguais + '</div><div class="det">nossa = TSE</div></div>' +
      '<div class="kpi"><div class="rot">Com diferença</div><div class="val num" style="color:' + (cont.dif ? 'var(--perigo)' : 'inherit') + '">' + cont.dif + '</div><div class="det">conferir a foto do BU</div></div>' +
      '<div class="kpi"><div class="rot">Sem envio nosso</div><div class="val num">' + cont.semNosso + '</div><div class="det">o fiscal não enviou</div></div>' +
      '<div class="kpi"><div class="rot">Total TSE (Anchieta)</div><div class="val num">' + n(Object.keys(tse).reduce(function (a, k) { return a + tse[k]; }, 0)) + '</div><div class="det">somando as seções do arquivo</div></div></div>' +
      '<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th class="r">Seção</th><th>Local</th><th class="r">Nossa</th><th class="r">TSE</th><th class="r">Diferença</th><th>Situação</th></tr></thead><tbody>' +
      linhas.map(function (x) {
        return '<tr' + (x.tipo === 'dif' ? ' class="linha-dif"' : '') + '><td data-l="Seção" class="r"><b>' + h(x.s.numero) + '</b></td><td data-l="Local">' + h(x.s.local) + '</td>' +
          '<td data-l="Nossa" class="r">' + (x.v === null ? '—' : n(x.v) + (x.u && x.u.status !== 'VALIDADO' ? ' <span class="tiny muted">(em conferência)</span>' : '')) + '</td><td data-l="TSE" class="r">' + n(x.t) + '</td>' +
          '<td data-l="Diferença" class="r">' + (x.v === null ? '—' : (x.v - x.t > 0 ? '+' : '') + n(x.v - x.t)) + '</td>' +
          '<td data-l="Situação">' + (x.tipo === 'ok' ? '<span class="selo selo-ENVIADO">igual</span>' : x.tipo === 'dif' ? '<span class="selo selo-REJEITADO">diferente</span>' : '<span class="selo selo-DESCARTADO">sem envio</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ================= 3. CANDIDATOS APTOS (busca) ================= */
  function renderAptos() {
    var el = $('#sec-aptos');
    if (!$('#ca-busca', el)) {
      el.innerHTML = '<div class="filtros card"><div class="filtro filtro-largo"><label for="ca-busca">Buscar</label><input class="input" id="ca-busca" type="search" placeholder="Nome, número ou partido" autocomplete="off"></div>' +
        '<button class="btn btn-ghost btn-sm filtro-limpar" id="ca-limpar" type="button" hidden>Limpar</button></div><div id="ca-res"></div>';
      $('#ca-busca', el).addEventListener('input', function () { buscaAptos = this.value; desenharAptos(); });
      $('#ca-limpar', el).addEventListener('click', function () { buscaAptos = ''; $('#ca-busca', el).value = ''; desenharAptos(); });
    }
    desenharAptos();
  }
  function desenharAptos() {
    var todos = window.CANDIDATOS_TSE_ES2026 || [];
    var lista = Tse.candidatosTseFiltrados(buscaAptos, todos).slice().sort(function (a, b) { return a[0].localeCompare(b[0], 'pt-BR'); });
    $('#ca-limpar').hidden = !buscaAptos;
    var mostrar = lista.slice(0, 400);
    $('#ca-res').innerHTML = '<section class="card"><div class="card-titulo"><h3>Candidatos aptos a Deputado Estadual — ES 2026</h3><span class="muted small">' +
      (buscaAptos ? n(lista.length) + ' de ' + n(todos.length) : n(todos.length) + ' candidatos') + '</span></div>' +
      '<p class="muted small" style="margin:-6px 0 12px">Lista de referência do TSE (divulgacandcontas.tse.jus.br), para conferir nomes e números. Não é editável.</p>' +
      (mostrar.length ? '<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th class="r">Número</th><th>Nome de urna</th><th>Partido / federação</th></tr></thead><tbody>' +
        mostrar.map(function (c) {
          var nosso = c[2] === calc.meuNumero;
          return '<tr' + (nosso ? ' class="linha-nosso"' : '') + '><td data-l="Número" class="r"><b class="num">' + h(c[2]) + '</b></td><td data-l="Nome"><b>' + h(c[0]) + '</b></td><td data-l="Partido">' + h(Tse.rotuloFederacao(c[1])) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhum candidato encontrado.</div>') + '</section>';
  }

  /* ================= 4. GRÁFICOS ================= */
  function renderGraficos() {
    var el = $('#sec-graficos'), st = calc.st;
    if (!$('#g-vagas', el)) {
      Object.keys(graficos).forEach(function (k) { graficos[k].destroy(); }); graficos = {};
      el.innerHTML = '<div class="grade-painel">' +
        '<section class="card"><div class="card-titulo"><h3>Vagas projetadas por partido</h3><span class="muted tiny" id="g-vagas-txt"></span></div>' + dica('Quantas das ' + calc.vagas + ' cadeiras cada partido conquistaria com os votos contados até agora. O ' + h(calc.grupoNosso.nome) + ' aparece em laranja.', true) + '<div class="grafico" id="g-vagas-box"><canvas id="g-vagas" role="img" aria-label="Vagas projetadas por partido"></canvas></div><div class="vazio" id="g-vagas-vazio" hidden>Sem votos por partido ainda.</div></section>' +
        '<section class="card"><div class="card-titulo"><h3>Votos válidos</h3><span class="muted tiny">distribuição</span></div>' + dica('Fatia de cada partido no total de votos válidos do estado (os 4 maiores e o ' + h(calc.grupoNosso.nome) + '; os demais em "Outros").', true) + '<div class="grafico" style="height:300px"><canvas id="g-rosca" role="img" aria-label="Distribuição dos votos válidos"></canvas></div><div class="vazio" id="g-rosca-vazio" hidden>Sem votos por partido ainda.</div></section></div>' +
        '<section class="card" style="margin-top:16px"><div class="card-titulo"><h3>Evolução de ' + h(nomeCand()) + '</h3><span class="muted tiny">% do quociente eleitoral a cada registro do histórico</span></div>' + dica('Mostra como ' + h(nomeCand()) + ' evoluiu ao longo da noite. A linha vermelha é o mínimo exigido por lei (10% do quociente); a verde é um quociente inteiro (100%).', true) + '<div class="grafico" style="height:280px"><canvas id="g-evol" role="img" aria-label="Evolução do candidato"></canvas></div><div class="vazio" id="g-evol-vazio" hidden>A evolução aparece a partir de 2 registros no histórico.</div></section>';
    }
    if (!window.Chart) return;
    Chart.defaults.font.family = 'Montserrat, system-ui, sans-serif'; Chart.defaults.color = '#4b6576';

    // 1) vagas por partido
    var linhas = st.kind === 'com-dados' ? Tse.dadosVagasPorPartido(st.dist) : [];
    $('#g-vagas-vazio').hidden = !!linhas.length; $('#g-vagas-box').hidden = !linhas.length;
    if (linhas.length) {
      $('#g-vagas-box').style.height = Math.max(180, linhas.length * 28 + 40) + 'px';
      $('#g-vagas-txt').textContent = calc.vagas + ' vagas · QE ' + n(st.QE);
      var curto = window.innerWidth < 640;
      var dV = { labels: linhas.map(function (r) { return curto && r.nome.length > 20 ? r.nome.slice(0, 19) + '…' : r.nome; }),
        datasets: [{ label: 'Vagas', data: linhas.map(function (r) { return r.vagasTotal; }), backgroundColor: linhas.map(function (r) { return r.chave === calc.grupoNosso.chave ? COR_NOSSO : COR_OUTRO; }), borderRadius: 4, barPercentage: .78 }] };
      if (!graficos.vagas) graficos.vagas = new Chart($('#g-vagas'), { type: 'bar', data: dV, plugins: [rotuloPonta], options: {
        indexAxis: 'y', maintainAspectRatio: false, animation: false, layout: { padding: { right: 28 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { var r = graficos.vagas.$linhas[c.dataIndex]; return ' ' + r.vagasTotal + ' vaga(s): ' + r.vagasQP + ' quociente + ' + r.vagasSobra + ' sobras · ' + n(r.votos) + ' votos'; } } } },
        scales: { x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: '#e6eef2' }, border: { display: false } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11.5, weight: '600' }, color: '#0d2b3e' } } } } });
      else { graficos.vagas.data = dV; graficos.vagas.resize(); graficos.vagas.update('none'); }
      graficos.vagas.$linhas = linhas;
    }

    // 2) rosca dos votos válidos
    var fatias = Tse.dadosDistribuicaoVotos(calc.oficial, calc.grupoNosso.chave);
    $('#g-rosca-vazio').hidden = !!fatias.length; $('#g-rosca').parentNode.hidden = !fatias.length;
    if (fatias.length) {
      var iAzul = 0;
      var cores = fatias.map(function (f) { return f.nosso ? COR_NOSSO : f.resto ? COR_RESTO : AZUIS[iAzul++] || COR_OUTRO; });
      var dR = { labels: fatias.map(function (f) { return f.nome; }), datasets: [{ data: fatias.map(function (f) { return f.votos; }), backgroundColor: cores, borderColor: '#fff', borderWidth: 2 }] };
      if (!graficos.rosca) graficos.rosca = new Chart($('#g-rosca'), { type: 'doughnut', data: dR, options: { maintainAspectRatio: false, animation: false, cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10 } },
          tooltip: { callbacks: { label: function (c) { return ' ' + c.label + ': ' + n(c.parsed) + ' votos (' + App.pct(c.parsed, calc.votosValidos) + ')'; } } } } } });
      else { graficos.rosca.data = dR; graficos.rosca.update('none'); }
    }

    // 3) evolução (% do QE) a partir do histórico
    var pontos = Tse.dadosEvolucao(dados.historico);
    $('#g-evol-vazio').hidden = !!pontos; $('#g-evol').parentNode.hidden = !pontos;
    if (pontos) {
      var dE = { labels: pontos.map(function (p) { return App.hora(p.t); }), datasets: [
        { label: h(nomeCand()), data: pontos.map(function (p) { return +(p.candidatoPctQE * 100).toFixed(1); }), borderColor: '#0072b0', backgroundColor: 'rgba(0,114,176,.10)', fill: true, borderWidth: 2, pointRadius: 3, tension: .2 },
        { label: 'Cláusula (10% do QE)', data: pontos.map(function () { return 10; }), borderColor: '#c62e2e', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 },
        { label: 'Quociente eleitoral (100%)', data: pontos.map(function () { return 100; }), borderColor: '#0f8a5f', borderDash: [2, 4], borderWidth: 1.5, pointRadius: 0 }] };
      var maxV = Math.max(110, Math.max.apply(null, pontos.map(function (p) { return p.candidatoPctQE * 100; })) * 1.12);
      if (!graficos.evol) graficos.evol = new Chart($('#g-evol'), { type: 'line', data: dE, options: { maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 24 } }, tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + c.parsed.y.toLocaleString('pt-BR') + '%'; } } } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { beginAtZero: true, max: Math.ceil(maxV / 10) * 10, grid: { color: '#e6eef2' }, border: { display: false }, ticks: { callback: function (v) { return v + '%'; } } } } } });
      else { graficos.evol.data = dE; graficos.evol.options.scales.y.max = Math.ceil(maxV / 10) * 10; graficos.evol.update('none'); }
    }
  }
  var rotuloPonta = {
    id: 'rotuloPonta',
    afterDatasetsDraw: function (chart) {
      var g = chart.ctx, meta = chart.getDatasetMeta(0);
      g.save(); g.font = '700 12px Montserrat, sans-serif'; g.fillStyle = '#0d2b3e'; g.textBaseline = 'middle';
      meta.data.forEach(function (el, i) { var v = chart.data.datasets[0].data[i]; g.fillText(String(v), el.x + 6, el.y); });
      g.restore();
    }
  };

  /* ================= 5. HISTÓRICO / LINHA DO TEMPO ================= */
  function registrarSnapshot(forcar) {
    var ponto = Tse.montarPontoHistorico(calc.st);
    if (!ponto) { if (forcar) App.toast('Sem dados oficiais para registrar.', 'erro'); return Promise.resolve(); }
    return chamar('tse.registrar', { ponto: ponto, forcar: !!forcar }).then(function () {
      if (forcar) App.toast('Registro feito.', 'ok');
      return carregar(false);
    }).catch(function (e) { if (forcar) App.toast(e.message, 'erro'); });
  }
  function renderHistorico() {
    var el = $('#sec-historico');
    var pontos = dados.historico || [], marcos = Tse.marcosDoHistorico(pontos);
    var html = '<section class="card"><div class="card-titulo"><h2>Histórico da apuração</h2><div class="botoes-linha">' +
      '<button class="btn btn-azul btn-sm" id="hs-registrar">' + ICON.mais + 'Registrar agora</button>' +
      (pontos.length ? '<button class="btn btn-ghost btn-sm" id="hs-limpar">' + ICON.lixo + 'Limpar</button>' : '') + '</div></div>' +
      '<p class="muted small" style="margin:-6px 0 0">Um registro é feito sozinho a cada resultado aplicado do TSE ou correção manual (no máximo um a cada 2 minutos). Use <strong>Registrar agora</strong> para marcar um momento. Guarda até 150 registros.</p></section>';
    html += '<div class="grade-painel"><section class="card"><div class="card-titulo"><h3>Pontos registrados</h3><span class="muted tiny">' + pontos.length + '</span></div>' +
      (pontos.length ? '<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th>Quando</th><th class="r">Votos válidos</th><th class="r">QE</th><th class="r">Vagas ' + h(calc.grupoNosso.nome) + '</th><th class="r">' + h(nomeCand()) + '</th><th class="r">% do QE</th><th>Situação</th></tr></thead><tbody>' +
        pontos.slice().reverse().map(function (p) {
          return '<tr><td data-l="Quando">' + App.dataHora(p.t) + '</td><td data-l="Votos válidos" class="r">' + n(p.votosValidos) + '</td><td data-l="QE" class="r">' + n(p.QE) + '</td>' +
            '<td data-l="Vagas" class="r">' + p.vagasDoPartido + '</td><td data-l="Votos" class="r"><b>' + (p.candidatoVotos === null ? '—' : n(p.candidatoVotos)) + '</b></td>' +
            '<td data-l="% do QE" class="r">' + pctFrac(p.candidatoPctQE) + '</td><td data-l="Situação">' + seloMarco(p.marco) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhum registro ainda.</div>') + '</section>' +
      '<section class="card"><div class="card-titulo"><h3>Marcos</h3><span class="muted tiny">quando a situação mudou</span></div>' +
      (marcos.length ? '<ol class="linha-tempo">' + marcos.map(function (m) {
        return '<li class="lt-' + m.marco + '"><b>' + h(Tse.LABEL_MARCO[m.marco] || m.marco) + '</b><span>' + App.dataHora(m.t) + '</span></li>';
      }).join('') + '</ol>' : '<div class="vazio">Os marcos aparecem quando houver registros.</div>') + '</section></div>';
    el.innerHTML = html;
    $('#hs-registrar', el).onclick = function () { var b = this; App.carregando(b, true); registrarSnapshot(true).then(function () { App.carregando(b, false); }); };
    var lp = $('#hs-limpar', el);
    if (lp) lp.onclick = function () {
      App.confirmar('Limpar o histórico?', 'Todos os registros e marcos serão apagados. Os votos não mudam.', 'Limpar', true).then(function (ok) {
        if (!ok) return;
        chamar('tse.limparHistorico').then(function () { App.toast('Histórico limpo.'); carregar(true); }).catch(function (e) { App.toast(e.message, 'erro'); });
      });
    };
  }
  function seloMarco(m) {
    var mapa = { 'eleito': ['ENVIADO', 'eleito'], 'fora-faixa': ['PENDENTE', 'fora da faixa'], 'abaixo-clausula': ['REJEITADO', 'abaixo da cláusula'], 'sem-candidato': ['DESCARTADO', 'sem candidato'], 'sem-dados': ['DESCARTADO', 'sem dados'] };
    var x = mapa[m] || ['DESCARTADO', m || '—'];
    return '<span class="selo selo-' + x[0] + '">' + h(x[1]) + '</span>';
  }

  window.addEventListener('resize', function () { if (dados && aba === 'graficos') renderGraficos(); });
  if (sess) iniciar(); else telaLogin();
})();
