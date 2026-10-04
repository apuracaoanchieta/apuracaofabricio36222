/* RELATÓRIO FINAL (impressão / PDF): resultado oficial do TSE no estado + nossa apuração em Anchieta.
 * Somente com a senha da Apuração. */
(function () {
  'use strict';
  var $ = App.$, h = App.h, n = App.n;
  var sess = App.sessao.get('apuracao');
  var tse = null, ap = null, conteudo = 'completo';

  App.bannerDemo('Senha: <b>apuracao</b>.');
  App.$$('[data-voltar]').forEach(function (e) { e.innerHTML = App.ICON.seta; });

  function telaLogin() {
    $('#tela-rel').hidden = true; $('#tela-login').hidden = false;
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
  function iniciar() { $('#tela-login').hidden = true; $('#tela-rel').hidden = false; carregar(); }
  function carregar() {
    var b = $('#r-atualizar'); App.carregando(b, true, 'Atualizando…');
    $('#rel').innerHTML = '<p class="rel-carregando">Carregando o resultado do TSE e a nossa apuração…</p>';
    return Promise.all([App.api('tse.dados', { token: sess.token }), App.api('apuracao.dados', { token: sess.token })]).then(function (r) {
      tse = r[0]; ap = r[1]; desenhar();
    }).catch(function (e) {
      if (/Sessão|acesso/.test(e.message)) { App.sessao.sair('apuracao'); sess = null; telaLogin(); }
      App.toast(e.message, 'erro');
      $('#rel').innerHTML = '<p class="rel-carregando">Não foi possível carregar: ' + h(e.message) + '</p>';
    }).then(function () { App.carregando(b, false); });
  }
  $('#r-conteudo').addEventListener('change', function () { conteudo = this.value; desenhar(); });
  $('#r-atualizar').addEventListener('click', carregar);
  $('#r-imprimir').addEventListener('click', function () { window.print(); });

  function dataBr(s) { s = String(s || ''); return s.length >= 16 ? s.substr(8, 2) + '/' + s.substr(5, 2) + '/' + s.substr(0, 4) + ' às ' + s.substr(11, 5) : s; }
  function pct(x, casas) { return (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas === undefined ? 1 : casas, maximumFractionDigits: casas === undefined ? 1 : casas }) + '%'; }
  function sitTse(c) { var o = Tse.situacaoOficial(c.situacao); return o ? o.label : '—'; }

  /* nossa apuração em Anchieta, por local */
  function anchieta() {
    var cfg = ap.config, mun = Core.norm(cfg.municipio_principal || 'ANCHIETA'), urnas = Core.resolverUrnas(ap.lancamentos);
    var locais = {}, secoesAtivas = 0, r = { val: 0, total: 0, urnas: 0, porLocal: {} };
    ap.locais.forEach(function (l) { if (Core.norm(l.municipio) === mun) locais[l.id] = l; });
    var secPorId = {};
    ap.secoes.forEach(function (s) {
      if (!s.ativo || !locais[s.local_id]) return;
      secoesAtivas++; secPorId[s.id] = s;
      var pl = r.porLocal[s.local_id] = r.porLocal[s.local_id] || { nome: locais[s.local_id].nome, secoes: 0, apuradas: 0, votos: 0, aptos: 0, aptosApur: 0, votosSec: 0 };
      pl.secoes++; pl.aptos += Number(s.aptos) || 0;
    });
    Object.keys(urnas).forEach(function (k) {
      var u = urnas[k]; if (Core.norm(u.municipio) !== mun) return;
      var v = Number(u.votos) || 0; r.total += v; if (u.status === 'VALIDADO') r.val += v;
      var pl = r.porLocal[u.local_id];
      if (Core.ehTotal(u)) { if (pl) pl.votos += v; return; }
      r.urnas++;
      if (pl) { pl.apuradas++; pl.votos += v; var s = secPorId[u.secao_id]; if (s && Number(s.aptos)) { pl.aptosApur += Number(s.aptos); pl.votosSec += v; } }
    });
    r.secoes = secoesAtivas;
    r.locais = Object.keys(r.porLocal).map(function (k) { return r.porLocal[k]; }).sort(function (a, b) { return b.votos - a.votos; });
    return r;
  }

  function desenhar() {
    if (!tse || !ap) return;
    var cfg = tse.config, calc = Tse.calcular(tse), st = calc.st, nome = cfg.candidato_nome || 'Fabricio Petri', partido = calc.grupoNosso.nome;
    var p = tse.tse_pct_secoes, final = p !== null && p !== undefined && p >= 100, com = st.kind === 'com-dados';
    var nosso = com ? st.nosso : null, pos = nosso ? st.candidatos.indexOf(nosso) + 1 : null, qf = com ? Tse.quantoFalta(calc, p) : null;
    var nos = anchieta(), tm = tse.tse_municipio;
    var html = '';

    html += '<header class="rel-cab"><img src="assets/img/logo-480.png" alt="" class="rel-logo"><div class="rel-cab-txt">' +
      '<h1>Relatório final da eleição</h1>' +
      '<p class="rel-cand">' + h(nome) + ' · ' + h(cfg.candidato_numero || '') + ' · ' + h(cfg.cargo || 'Deputado Estadual') + ' · ' + h(cfg.partido || partido) + '</p>' +
      '<p class="rel-meta">Eleições 2026 · Espírito Santo · Dados do TSE de ' + h(tse.tse_atualizado_em || '—') + ' · Gerado em ' + dataBr(tse.agora) + '</p></div>' +
      '<div class="rel-selo ' + (final ? 'final' : 'parcial') + '">' + (final ? 'TOTALIZAÇÃO CONCLUÍDA' : 'RESULTADO PARCIAL') +
      '<small>' + (p !== null && p !== undefined ? Number(p).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% das seções' : 'sem dados do TSE') + '</small></div></header>';

    if (!com) {
      html += '<p class="rel-alerta">Ainda não há votos do TSE aplicados no sistema. Aplique um resultado na tela Apuração TSE e atualize este relatório.</p>';
      $('#rel').innerHTML = html + rodape(); return;
    }
    if (!final) html += '<p class="rel-alerta">Atenção: a totalização do TSE ainda não terminou. Os números e a projeção podem mudar.</p>';

    // números principais
    var oficial = nosso ? Tse.situacaoOficial(nosso.situacao) : null;
    html += '<section class="rel-kpis rel-kpis-4">' +
      '<div class="rel-kpi destaque"><span>Votos no estado (TSE)</span><b>' + (nosso ? n(nosso.votos) : '—') + '</b><em>' + (nosso ? pct(nosso.votos / calc.votosValidos, 2) + ' dos votos válidos' : 'candidato não encontrado') + '</em></div>' +
      '<div class="rel-kpi"><span>Situação</span><b class="rel-kpi-txt">' + h(oficial ? oficial.label.toUpperCase() : calc.status.label.replace('Projeção: ', '').toUpperCase()) + '</b><em>' + (oficial ? 'informada pelo TSE' : 'projeção do sistema') + '</em></div>' +
      '<div class="rel-kpi"><span>Posição no ' + h(partido) + '</span><b>' + (pos ? pos + 'º' : '—') + '</b><em>' + st.vagasDoPartido + ' vaga(s) do partido</em></div>' +
      '<div class="rel-kpi"><span>Votos em Anchieta</span><b>' + n(tm && tm.encontrado ? tm.votos : nos.total) + '</b><em>' + (tm && tm.encontrado ? 'TSE · nossa apuração: ' + n(nos.total) : 'nossa apuração') + '</em></div></section>';

    // resumo em texto
    html += '<h2>Resumo</h2><p class="rel-texto">' + resumoTexto(calc, nosso, pos, qf, nome, partido) + '</p>';

    // quociente e vagas
    html += '<h2>Quociente eleitoral e vagas</h2><table class="rel-tab"><tbody>' +
      linha('Votos válidos no estado', n(calc.votosValidos)) + linha('Vagas na Assembleia Legislativa', calc.vagas) +
      linha('Quociente eleitoral (votos por vaga)', n(st.QE)) + linha('Cláusula de desempenho (10% do quociente)', n(Math.ceil(st.QE * 0.1)) + ' votos') +
      linha('Votos do ' + h(partido), n(st.linhaPartido ? st.linhaPartido.votos : 0)) +
      linha('Vagas do ' + h(partido), st.vagasDoPartido + (st.linhaPartido ? ' (' + st.linhaPartido.vagasQP + ' pelo quociente + ' + st.linhaPartido.vagasSobra + ' nas sobras)' : '')) +
      (qf && !qf.eleito && qf.paraEleger !== null ? linha('Votos que faltaram para ' + h(nome) + ' entrar', n(qf.paraEleger)) : '') +
      (qf && qf.eleito && qf.proximoColega ? linha('Vantagem sobre o primeiro fora das vagas do partido', n(qf.proximoColega.margem) + ' votos') : '') +
      '</tbody></table>';

    // candidatos do partido
    html += '<h2>Candidatos do ' + h(partido) + '</h2><table class="rel-tab"><thead><tr><th class="c">#</th><th class="r">Nº</th><th>Candidato</th><th class="r">Votos</th><th class="r">% do QE</th><th>Projeção</th><th>Situação TSE</th></tr></thead><tbody>' +
      st.candidatos.filter(function (c, i) { return i < 15 || c.ehNosso; }).map(function (c) {
        var i = st.candidatos.indexOf(c);
        return '<tr' + (c.ehNosso ? ' class="nosso"' : '') + '><td class="c">' + (i + 1) + 'º</td><td class="r">' + h(c.numero) + '</td><td>' + h(c.nome) + '</td><td class="r">' + n(c.votos) + '</td>' +
          '<td class="r">' + pct(st.QE ? c.votos / st.QE : 0) + '</td><td>' + (c.eleito ? 'eleito' : c.passaClausula ? (i - st.vagasDoPartido + 1) + 'º suplente' : 'abaixo da cláusula') + '</td><td>' + h(sitTse(c)) + '</td></tr>';
      }).join('') + '</tbody></table>' + (st.candidatos.length > 15 ? '<p class="rel-leg">Mostrando os 15 mais votados de ' + st.candidatos.length + ' candidatos do partido.</p>' : '');

    // distribuição das vagas e eleitos (completo)
    if (conteudo === 'completo') {
      html += '<h2 class="quebra">Distribuição das ' + calc.vagas + ' vagas</h2><table class="rel-tab"><thead><tr><th>Partido / federação</th><th class="r">Votos</th><th class="r">% válidos</th><th class="r">Quociente</th><th class="r">Sobras</th><th class="r">Vagas</th></tr></thead><tbody>' +
        st.dist.resultado.map(function (r) {
          return '<tr' + (r.chave === calc.grupoNosso.chave ? ' class="nosso"' : '') + '><td>' + h(r.nome) + '</td><td class="r">' + n(r.votos) + '</td><td class="r">' + pct(r.votos / calc.votosValidos) + '</td><td class="r">' + r.vagasQP + '</td><td class="r">' + (r.vagasSobra || '—') + '</td><td class="r"><b>' + r.vagasTotal + '</b></td></tr>';
        }).join('') + '</tbody></table>';
      var el = Tse.eleitosProjetados(calc);
      html += '<h2>Eleitos (' + (final ? 'totalização concluída' : 'projeção') + ')</h2><table class="rel-tab"><thead><tr><th class="c">#</th><th>Candidato</th><th>Partido / federação</th><th class="r">Votos</th><th>Situação TSE</th></tr></thead><tbody>' +
        el.lista.map(function (c, i) {
          return '<tr' + (c.ehNosso ? ' class="nosso"' : '') + '><td class="c">' + (i + 1) + '</td><td>' + h(c.nome) + ' <small>' + h(c.numero) + '</small></td><td>' + h(c.partidoCalculo) + '</td><td class="r">' + n(c.votos) + '</td><td>' + h(sitTse(c)) + '</td></tr>';
        }).join('') + '</tbody></table>' + (el.vagasSemCandidato ? '<p class="rel-leg">' + el.vagasSemCandidato + ' vaga(s) sem candidato acima da cláusula — redistribuídas pela Justiça Eleitoral.</p>' : '');
    }

    // Anchieta
    html += '<h2' + (conteudo === 'completo' ? ' class="quebra"' : '') + '>Anchieta: nossa apuração × TSE</h2><table class="rel-tab"><tbody>' +
      linha('Nossa apuração (todas as urnas recebidas)', n(nos.total) + ' votos · ' + nos.urnas + ' de ' + nos.secoes + ' urnas') +
      linha('Nossa apuração (só confirmados)', n(nos.val) + ' votos') +
      linha('TSE em Anchieta', tm && tm.encontrado ? n(tm.votos) + ' votos' + (tm.pctSecoes !== null && tm.pctSecoes !== undefined ? ' · ' + Number(tm.pctSecoes).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% das seções' : '') : 'não buscado') +
      (tm && tm.encontrado ? linha('Diferença (nossa − TSE)', (nos.total - tm.votos > 0 ? '+' : '') + n(nos.total - tm.votos) + ' votos') : '') +
      (nosso && tm && tm.encontrado ? linha('Peso de Anchieta na votação de ' + h(nome), pct(tm.votos / (nosso.votos || 1))) : '') +
      '</tbody></table>';
    if (conteudo === 'completo' && nos.locais.length) {
      html += '<h3>Votos por local de votação (nossa apuração)</h3><table class="rel-tab"><thead><tr><th>Local</th><th class="r">Urnas</th><th class="r">Votos</th><th class="r">Eleitores aptos</th><th class="r">% dos aptos</th></tr></thead><tbody>' +
        nos.locais.map(function (l) {
          return '<tr><td>' + h(l.nome) + '</td><td class="r">' + l.apuradas + '/' + l.secoes + '</td><td class="r">' + n(l.votos) + '</td><td class="r">' + (l.aptos ? n(l.aptos) : '—') + '</td><td class="r">' + (l.aptosApur ? pct(l.votosSec / l.aptosApur) : '—') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    $('#rel').innerHTML = html + rodape();
  }
  function linha(rot, val) { return '<tr><td>' + rot + '</td><td class="r"><b>' + val + '</b></td></tr>'; }
  function resumoTexto(calc, nosso, pos, qf, nome, partido) {
    var st = calc.st;
    if (!nosso) return 'O número do candidato não aparece no resultado do TSE aplicado.';
    var oficial = Tse.situacaoOficial(nosso.situacao);
    var t = '<b>' + h(nome) + '</b> recebeu <b>' + n(nosso.votos) + ' votos</b> no Espírito Santo (' + pct(nosso.votos / calc.votosValidos, 2) + ' dos votos válidos), ficando em <b>' + pos + 'º lugar no ' + h(partido) + '</b>. ' +
      'O ' + h(partido) + ' somou ' + n(st.linhaPartido ? st.linhaPartido.votos : 0) + ' votos e conquista ' + st.vagasDoPartido + ' vaga(s) na projeção. ';
    if (oficial) t += 'Situação informada pelo TSE: <b>' + h(oficial.label) + '</b>. ';
    else if (nosso.eleito) t += 'Pela projeção, <b>está eleito</b>' + (qf && qf.proximoColega ? ', com vantagem de ' + n(qf.proximoColega.margem) + ' votos sobre o primeiro fora das vagas do partido' : '') + '. ';
    else if (nosso.passaClausula) t += 'Pela projeção, <b>fica como ' + (pos - st.vagasDoPartido) + 'º suplente</b>' + (qf && qf.paraEleger !== null ? '; faltariam ' + n(qf.paraEleger) + ' votos para entrar' : '') + '. ';
    else t += 'Pela projeção, ficou abaixo da cláusula de desempenho (' + n(Math.ceil(st.QE * 0.1)) + ' votos). ';
    return t;
  }
  function rodape() {
    return '<footer class="rel-rodape"><p>Os números do estado são do TSE (resultados.tse.jus.br). "Projeção" é o cálculo deste sistema com a regra da Justiça Eleitoral (quociente eleitoral, sobras pelas maiores médias, federações e cláusula de 10%). ' +
      'Os números de Anchieta "nossa apuração" vêm dos boletins enviados pelos fiscais. O resultado oficial é sempre o divulgado pelo TSE.</p>' +
      '<div class="rel-assin"><div>Responsável pela apuração</div><div>Data e hora</div></div>' +
      '<p class="rel-credito">Sistema de apuração desenvolvido por <b>DERYCK NOGUEIRA</b></p></footer>';
  }

  if (sess) iniciar(); else telaLogin();
})();
