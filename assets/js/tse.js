/* APURAÇÃO TSE — tela dedicada (somente com a senha da Apuração).
 * Resultado oficial do TSE, projeção de vagas, candidatos aptos, gráficos e histórico. */
(function () {
  'use strict';
  var $ = App.$, $$ = App.$$, h = App.h, n = App.n, ICON = App.ICON;
  var AREA = 'apuracao';
  var sess = App.sessao.get(AREA);
  var dados = null, calc = null, aba = 'resultado', timer = null, ocupado = false;
  var tseState = { carregando: false, erro: null, preview: null };
  var buscaAptos = '', graficos = {};
  var COR_NOSSO = '#fb6c03', COR_OUTRO = '#9fb6c3', AZUIS = ['#0072b0', '#019fc6', '#6fc0dc', '#b6dcea'], COR_RESTO = '#dfe9ef';
  var CLASSE_SELO = { ok: 'ENVIADO', warn: 'PENDENTE', danger: 'REJEITADO', neutral: 'DESCARTADO' };

  App.bannerDemo('Senha: <b>apuracao</b>. O "TSE" aqui é simulado: cada busca avança a totalização.');
  App.$$('[data-voltar]').forEach(function (e) { e.innerHTML = ICON.seta; });
  $('#btn-voltar').innerHTML = '← <span class="oculto-mobile">Voltar à </span>Apuração';
  $('#btn-telao-tse').innerHTML = ICON.tv + 'Modo telão';

  /* ================= LOGIN ================= */
  function telaLogin() {
    $('#tela-app').hidden = true; $('#tela-login').hidden = false;
    if (App.DEMO) { var d = $('#l-demo'); d.hidden = false; d.innerHTML = ICON.info + '<div>Demonstração: senha <strong>apuracao</strong></div>'; }
    setTimeout(function () { $('#l-senha').focus({ preventScroll: true }); }, 50);
  }
  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#l-entrar'); App.carregando(b, true, 'Entrando…');
    App.api('login', { senha: $('#l-senha').value, perfil: 'APURACAO' }).then(function (r) {
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
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && sess && dados) carregar(false); });

  function carregar(mostrarErro) {
    if (ocupado) return Promise.resolve();
    ocupado = true;
    return chamar('tse.dados').then(function (r) {
      dados = r; calc = Tse.calcular(r);
      $('#t-atualizado').lastChild.textContent = 'Atualizado às ' + App.hora(r.agora) + r.agora.substr(16, 3);
      renderTudo();
    }).catch(function (e) { if (mostrarErro) App.toast(e.message, 'erro'); })
      .then(function () { ocupado = false; });
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
      '<button class="btn btn-azul btn-xl" id="rs-buscar"' + (tseState.carregando ? ' disabled' : '') + '>' + ICON.atualizar + (tseState.carregando ? 'Buscando no TSE…' : 'Atualizar do TSE') + '</button>' +
      '<p class="ajuda" style="margin-top:8px">A busca mostra uma prévia. Nada é gravado até você clicar em <strong>Aplicar</strong>.</p></section>';

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

  function modalConfig() {
    var cfg = dados.config;
    var m = App.modal(App.cabecalhoModal('Configurar a Apuração TSE', 'Nome, número e partido do candidato ficam em Apuração → Parâmetros → Geral.') +
      '<form id="mc-form"><div class="campo"><label for="mc-url">Endereço do resultado do TSE (JSON)</label><input class="input" id="mc-url" value="' + h(cfg.tse_url || '') + '"></div>' +
      '<div class="campo"><label for="mc-vagas">Vagas em disputa</label><input class="input" id="mc-vagas" inputmode="numeric" maxlength="3" value="' + calc.vagas + '"><div class="ajuda">Assembleia Legislativa do ES: 30 vagas.</div></div>' +
      '<div class="acoes"><button type="button" class="btn btn-sec" data-fechar>Cancelar</button><button class="btn btn-azul" type="submit" id="mc-salvar">Salvar</button></div></form>');
    $('#mc-form', m.el).onsubmit = function (e) {
      e.preventDefault();
      var vagas = valorNumero($('#mc-vagas', m.el).value);
      if (!vagas || Number(vagas) < 1) return App.toast('Informe o número de vagas.', 'erro');
      var b = $('#mc-salvar', m.el); App.carregando(b, true);
      chamar('apuracao.salvarConfig', { valores: { tse_url: $('#mc-url', m.el).value.trim(), vagas_total: vagas } }).then(function () {
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
      '<p class="muted small" style="margin:0">' + textoStatus(st, s) + '</p></div></section>';
    if (st.kind === 'sem-dados') {
      html += st.zerado
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

    html += htmlQuantoFalta();

    // medidor % do QE com a marca da cláusula (10%)
    var pctQE = st.QE > 0 ? votosNosso / st.QE : 0, fill = Math.max(0, Math.min(100, pctQE * 100));
    var corMedidor = s.classe === 'ok' ? 'var(--ok)' : s.classe === 'warn' ? 'var(--laranja)' : s.classe === 'danger' ? 'var(--perigo)' : 'var(--texto-3)';
    html += '<section class="card"><div class="card-titulo"><h3>' + h(nomeCand()) + ' × quociente eleitoral</h3><span class="muted tiny">' + pctFrac(pctQE) + ' do QE</span></div>' +
      '<div class="medidor"><i style="width:' + fill + '%;background:' + corMedidor + '"></i><span class="medidor-marca" style="left:10%" title="Cláusula de desempenho: 10% do QE"></span></div>' +
      '<div class="medidor-legenda"><span>0</span><span style="left:10%">10% · cláusula (' + n(Math.ceil(st.QE * 0.1)) + ')</span><span style="right:0">100% · QE (' + n(st.QE) + ')</span></div>' +
      '<p class="muted small" style="margin:12px 0 0">Para poder ser eleito, o candidato precisa de pelo menos <strong>' + n(Math.ceil(st.QE * 0.1)) + ' votos</strong> (10% do quociente eleitoral) e ficar entre os ' + st.vagasDoPartido + ' mais votados do partido.</p></section>';

    // distribuição das vagas
    var tot = { votos: 0, qp: 0, sb: 0 };
    html += '<section class="card"><div class="card-titulo"><h3>Distribuição das vagas</h3><span class="muted tiny">quociente partidário + sobras pelas maiores médias</span></div>' +
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
        '<p class="muted small" style="margin:0 0 14px">Conta que os votos dele também somam para o ' + h(partido) + ' (mudam o quociente e as sobras). Os adversários ficam como estão.</p>';
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
      html += '<div class="qf-destaque"><span>Eleito na projeção' + (margem !== null ? ' · margem de' : '') + '</span><b class="num">' + (margem !== null ? n(margem) : '✓') + '</b><span>' + (margem !== null ? 'votos de vantagem no ponto mais apertado' : '') + '</span></div>';
      html += '<div class="resumo-envio">' +
        (r.proximoColega ? linha('Vantagem sobre ' + h(r.proximoColega.nome), votos(r.proximoColega.margem), 'primeiro do ' + h(partido) + ' fora das vagas · ' + n(r.proximoColega.votos) + ' votos') : '') +
        linha('Para tirar a vaga dele', r.ameacaPartido ? votos(r.ameacaPartido.falta) + ' do ' + h(r.ameacaPartido.nome) : 'vaga segura', 'partido adversário que chegaria mais perto') +
        linha('Para o ' + h(partido) + ' ganhar mais uma vaga', votos(r.paraMaisVaga), r.vagaSairiaDe ? 'a vaga sairia do ' + h(r.vagaSairiaDe) : '') +
        '</div>';
    }
    if (r.final) {
      html += '<div class="aviso aviso-info" style="margin:14px 0 0">' + ICON.info + '<div><b>Estimativa para o fim da apuração</b>Com ' + r.final.pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% das seções totalizadas e todos mantendo o ritmo, ' + h(nome) + ' terminaria com cerca de <strong>' + n(r.final.votosProjetados) + ' votos</strong>' +
        (r.final.precisaTerminarCom ? ' e precisaria terminar com cerca de <strong>' + n(r.final.precisaTerminarCom) + '</strong> para ser eleito.' : '.') + '</div></div>';
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
    return '<section class="card"><div class="card-titulo"><h3>Candidatos do ' + h(calc.grupoNosso.nome) + '</h3><div class="botoes-linha">' +
      '<button class="btn btn-sec btn-sm" id="pc-carregar">' + ICON.upload + 'Carregar candidatos do ' + h(calc.grupoNosso.nome) + '</button>' +
      '<button class="btn btn-sec btn-sm" id="pc-novo">' + ICON.mais + 'Candidato</button></div></div>' +
      (lista.length ? '<div class="tabela-wrap"><table class="tabela responsiva"><thead><tr><th class="r">#</th><th class="r">Nº</th><th>Candidato</th><th class="r">Votos</th><th>Cláusula 10%</th><th>Projeção</th><th></th></tr></thead><tbody>' +
        lista.map(function (c, i) {
          return '<tr' + (c.ehNosso ? ' class="linha-nosso"' : '') + '><td data-l="#" class="r">' + (i + 1) + 'º</td><td data-l="Nº" class="r">' + h(c.numero || '—') + '</td><td data-l="Candidato"><b>' + h(c.nome) + '</b></td>' +
            '<td data-l="Votos" class="r"><b>' + n(c.votos) + '</b></td>' +
            '<td data-l="Cláusula 10%">' + (st.kind !== 'com-dados' ? '—' : c.passaClausula ? '<span class="selo selo-ENVIADO">passa</span>' : '<span class="selo selo-REJEITADO">não passa</span>') + '</td>' +
            '<td data-l="Projeção">' + (st.kind !== 'com-dados' ? '—' : c.eleito ? '<span class="selo selo-VALIDADO">eleito</span>' : '<span class="muted small">—</span>') + '</td>' +
            '<td class="r"><button class="btn btn-ghost btn-sm" data-edcand="' + h(c.id) + '">' + ICON.lapis + 'Editar</button></td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="vazio">Nenhum candidato do ' + h(calc.grupoNosso.nome) + ' cadastrado. Use <b>Carregar candidatos</b> (lista de aptos do TSE, com 0 votos) ou <b>Atualizar do TSE</b>.</div>') + '</section>';
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
        '<section class="card"><div class="card-titulo"><h3>Vagas projetadas por partido</h3><span class="muted tiny" id="g-vagas-txt"></span></div><div class="grafico" id="g-vagas-box"><canvas id="g-vagas" role="img" aria-label="Vagas projetadas por partido"></canvas></div><div class="vazio" id="g-vagas-vazio" hidden>Sem votos por partido ainda.</div></section>' +
        '<section class="card"><div class="card-titulo"><h3>Votos válidos</h3><span class="muted tiny">distribuição</span></div><div class="grafico" style="height:300px"><canvas id="g-rosca" role="img" aria-label="Distribuição dos votos válidos"></canvas></div><div class="vazio" id="g-rosca-vazio" hidden>Sem votos por partido ainda.</div></section></div>' +
        '<section class="card" style="margin-top:16px"><div class="card-titulo"><h3>Evolução de ' + h(nomeCand()) + '</h3><span class="muted tiny">% do quociente eleitoral a cada registro do histórico</span></div><div class="grafico" style="height:280px"><canvas id="g-evol" role="img" aria-label="Evolução do candidato"></canvas></div><div class="vazio" id="g-evol-vazio" hidden>A evolução aparece a partir de 2 registros no histórico.</div></section>';
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
