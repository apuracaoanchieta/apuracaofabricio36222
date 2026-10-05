/* RELATÓRIO PARA IMPRESSÃO / PDF (somente com a senha da Apuração) */
(function () {
  'use strict';
  var $ = App.$, h = App.h, n = App.n;
  var sess = App.sessao.get('apuracao');
  var dados = null;
  var opc = { mun: '__TODOS__', detalhe: 'completo', status: 'todos' };

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

  function iniciar() {
    $('#tela-login').hidden = true; $('#tela-rel').hidden = false;
    carregar();
  }
  function carregar() {
    var b = $('#r-atualizar'); App.carregando(b, true, 'Atualizando…');
    $('#rel').innerHTML = '<p class="rel-carregando">Carregando os dados da apuração…</p>';
    return Promise.all([App.api('apuracao.dados', { token: sess.token }), window.EstadoTSE ? EstadoTSE.carregar() : null]).then(function (x) { var r = x[0];
      var primeira = !dados;
      dados = r;
      // estado inteiro (milhares de seções): começa pelo resumo; o detalhe por seção fica para um município
      if (primeira && r.secoes.length > 1500) { opc.detalhe = 'resumo'; var sd = $('#r-detalhe'); if (sd && Array.prototype.some.call(sd.options, function (o) { return o.value === 'resumo'; })) sd.value = 'resumo'; }
      montarFiltros(); desenhar();
    }).catch(function (e) {
      if (/Sessão|acesso/.test(e.message)) { App.sessao.sair('apuracao'); sess = null; telaLogin(); }
      App.toast(e.message, 'erro');
      $('#rel').innerHTML = '<p class="rel-carregando">Não foi possível carregar: ' + h(e.message) + '</p>';
    }).then(function () { App.carregando(b, false); });
  }

  function dadosFiltrados() {
    if (opc.status !== 'confirmados') return dados;
    return Object.assign({}, dados, { lancamentos: dados.lancamentos.filter(function (l) { return l.status === 'VALIDADO'; }) });
  }
  function montarFiltros() {
    var r = Relat.consolidar(dados);
    var sel = $('#r-mun');
    sel.innerHTML = (r.municipios.length > 1 ? '<option value="__TODOS__">Todos os municípios</option>' : '') +
      r.municipios.map(function (st) { return '<option value="' + h(st.municipio) + '">' + h(st.municipio) + '</option>'; }).join('');
    if (!Array.prototype.some.call(sel.options, function (o) { return o.value === opc.mun; })) opc.mun = sel.options[0] ? sel.options[0].value : '';
    sel.value = opc.mun;
    sel.closest('.filtro').hidden = r.municipios.length < 2;
  }
  $('#r-mun').addEventListener('change', function () { opc.mun = this.value; desenhar(); });
  $('#r-detalhe').addEventListener('change', function () { opc.detalhe = this.value; desenhar(); });
  $('#r-status').addEventListener('change', function () { opc.status = this.value; desenhar(); });
  $('#r-atualizar').addEventListener('click', carregar);
  $('#r-imprimir').addEventListener('click', function () { window.print(); });

  function dataBr(stamp) { var s = String(stamp || ''); return s.substr(8, 2) + '/' + s.substr(5, 2) + '/' + s.substr(0, 4) + ' às ' + s.substr(11, 5); }

  function desenhar() {
    if (!dados) return;
    var cfg = dados.config;
    var r = Relat.consolidar(dadosFiltrados());
    var lista = opc.mun === '__TODOS__' ? r.municipios : r.municipios.filter(function (st) { return st.municipio === opc.mun; });
    var tot = { votosVal: 0, votosPen: 0, apuradas: 0, totalUrnas: 0, urnasVal: 0, urnasPen: 0, votosTotais: 0, aptosTotal: 0, aptosApur: 0, votosSecComAptos: 0 };
    lista.forEach(function (st) { Object.keys(tot).forEach(function (k) { tot[k] += st[k] || 0; }); });
    var soConf = opc.status === 'confirmados';
    var completo = tot.totalUrnas && tot.apuradas >= tot.totalUrnas && !tot.urnasPen;
    var pct = tot.totalUrnas ? App.pct(tot.apuradas, tot.totalUrnas) : '';
    var pendentes = dados.lancamentos.filter(function (l) { return l.status === 'PENDENTE'; }).length;

    var html = '';
    html += '<header class="rel-cab"><img src="assets/img/logo-480.png" alt="" class="rel-logo"><div class="rel-cab-txt">' +
      '<h1>Relatório de Apuração</h1>' +
      '<p class="rel-cand">' + h(cfg.candidato_nome || 'Fabricio Petri') + ' · ' + h(cfg.candidato_numero || '36.222') + ' · ' + h(cfg.cargo || 'Deputado Estadual') + (cfg.partido ? ' · ' + h(cfg.partido) : '') + '</p>' +
      '<p class="rel-meta">' + h(cfg.titulo || 'Eleições 2026') + ' · ' + (opc.mun === '__TODOS__' ? 'Todos os municípios' : 'Município: ' + h(opc.mun)) + ' · Gerado em ' + dataBr(dados.agora) + '</p></div>' +
      '<div class="rel-selo ' + (completo ? 'final' : 'parcial') + '">' + (completo ? 'RESULTADO FINAL' : 'RESULTADO PARCIAL') + (pct ? '<small>' + pct + ' das urnas</small>' : '') + '</div></header>';

    // números principais
    html += '<section class="rel-kpis">' +
      '<div class="rel-kpi destaque"><span>Votos ' + (soConf ? 'confirmados' : 'apurados') + '</span><b>' + n(soConf ? tot.votosVal : tot.votosVal + tot.votosPen) + '</b>' +
      (!soConf && tot.votosPen ? '<em>' + n(tot.votosVal) + ' confirmados + ' + n(tot.votosPen) + ' em conferência</em>' : '<em>conferidos com a foto do BU</em>') + '</div>' +
      '<div class="rel-kpi"><span>Urnas apuradas</span><b>' + (tot.totalUrnas ? tot.apuradas + ' / ' + tot.totalUrnas : '—') + '</b><em>' + (pct ? pct + ' do total' : 'sem urnas cadastradas') +
        (tot.aptosTotal ? ' · ' + App.pct(tot.aptosApur, tot.aptosTotal) + ' dos ' + n(tot.aptosTotal) + ' eleitores' : '') + '</em></div>' +
      (tot.aptosApur
        ? '<div class="rel-kpi"><span>Votos / eleitores aptos</span><b>' + App.pct(tot.votosSecComAptos, tot.aptosApur) + '</b><em>nas seções apuradas · média de ' + n(Math.round((tot.votosVal + tot.votosPen - tot.votosTotais) / tot.apuradas)) + ' por urna</em></div>'
        : '<div class="rel-kpi"><span>Média por urna</span><b>' + (tot.apuradas ? n(Math.round((tot.votosVal + tot.votosPen - tot.votosTotais) / tot.apuradas)) : '—') + '</b><em>' + (tot.votosTotais ? 'sem contar totais informados' : 'votos por seção') + '</em></div>') +
      '</section>';
    if (pendentes && !soConf) html += '<p class="rel-alerta">Atenção: ' + pendentes + ' envio(s) ainda em conferência. Os números podem mudar.</p>';

    // resumo por município
    if (lista.length > 1) {
      html += '<h2>Resumo por município</h2><table class="rel-tab"><thead><tr><th>Município</th><th class="r">Urnas</th><th class="r">%</th><th class="r">Confirmados</th>' + (soConf ? '' : '<th class="r">Em conferência</th>') + '<th class="r">Total</th></tr></thead><tbody>' +
        lista.map(function (st) {
          return '<tr><td>' + h(st.municipio) + (st.votosTotais && !st.totalUrnas ? ' <small>(total informado)</small>' : '') + '</td><td class="r">' + (st.totalUrnas ? st.apuradas + '/' + st.totalUrnas : '—') + '</td>' +
            '<td class="r">' + (st.totalUrnas ? App.pct(st.apuradas, st.totalUrnas) : '—') + '</td><td class="r">' + n(st.votosVal) + '</td>' + (soConf ? '' : '<td class="r">' + n(st.votosPen) + '</td>') +
            '<td class="r"><b>' + n(st.votosVal + st.votosPen) + '</b></td></tr>';
        }).join('') + '</tbody><tfoot><tr><td>Total</td><td class="r">' + (tot.totalUrnas ? tot.apuradas + '/' + tot.totalUrnas : '—') + '</td><td class="r">' + (pct || '—') + '</td><td class="r">' + n(tot.votosVal) + '</td>' +
        (soConf ? '' : '<td class="r">' + n(tot.votosPen) + '</td>') + '<td class="r">' + n(tot.votosVal + tot.votosPen) + '</td></tr></tfoot></table>';
    }

    // por local, para cada município
    lista.forEach(function (st) {
      if (!st.locais.length) return;
      var comAp = st.aptosTotal > 0;
      html += '<h2>' + h(st.municipio) + ' — votos por local de votação</h2>' +
        '<table class="rel-tab"><thead><tr><th class="c">#</th><th>Local de votação</th><th class="r">Urnas</th><th class="r">Confirmados</th>' + (soConf ? '' : '<th class="r">Em conferência</th>') + '<th class="r">Total</th><th class="r">% do município</th>' + (comAp ? '<th class="r">% dos aptos</th>' : '') + '</tr></thead><tbody>';
      var totMun = st.votosVal + st.votosPen;
      st.locais.forEach(function (l, i) {
        var tl = l.votosVal + l.votosPen;
        html += '<tr><td class="c">' + (i + 1) + '</td><td>' + h(l.nome) + (l.totalInformado ? ' <small>(inclui total informado: ' + n(l.totalInformado) + ')</small>' : '') + '</td>' +
          '<td class="r">' + (l.total ? (l.val + l.pen) + '/' + l.total : '—') + '</td><td class="r">' + n(l.votosVal) + '</td>' + (soConf ? '' : '<td class="r">' + (l.votosPen ? n(l.votosPen) : '—') + '</td>') +
          '<td class="r"><b>' + n(tl) + '</b></td><td class="r">' + (totMun ? App.pct(tl, totMun) : '—') + '</td>' + (comAp ? '<td class="r">' + (l.aptosApur ? App.pct(l.votosSec, l.aptosApur) : '—') + '</td>' : '') + '</tr>';
      });
      html += '</tbody><tfoot><tr><td></td><td>Total ' + h(st.municipio) + '</td><td class="r">' + (st.totalUrnas ? st.apuradas + '/' + st.totalUrnas : '—') + '</td><td class="r">' + n(st.votosVal) + '</td>' +
        (soConf ? '' : '<td class="r">' + n(st.votosPen) + '</td>') + '<td class="r">' + n(totMun) + '</td><td class="r">100%</td>' + (comAp ? '<td class="r">' + (st.aptosApur ? App.pct(st.votosSecComAptos, st.aptosApur) : '—') + '</td>' : '') + '</tr></tfoot></table>';
    });

    // detalhe por seção
    if (opc.detalhe === 'completo') {
      lista.forEach(function (st) {
        var locs = st.locais.filter(function (l) { return l.secoes.length; }).slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
        if (!locs.length) return;
        html += '<h2 class="quebra">' + h(st.municipio) + ' — votos por seção</h2><p class="rel-leg"><span class="mk VALIDADO">✓</span> confirmado &nbsp; <span class="mk PENDENTE">!</span> em conferência &nbsp; <span class="mk SEM">–</span> sem envio' + (st.agregadas ? ' &nbsp; <span class="mk AGR">↗</span> seção agregada (votos somados na seção principal)' : '') + '</p><div class="rel-secoes">';
        locs.forEach(function (l) {
          html += '<div class="rel-local"><h3>' + h(l.nome) + '<span>' + n(l.votosVal + l.votosPen) + ' votos</span></h3><table><tbody>' +
            l.secoes.map(function (s) {
              var u = s.urna, stt = u ? u.status : 'SEM';
              if (s.agregada_a) return '<tr class="agr"><td>Seção ' + h(s.numero) + ' <small>agregada à ' + h(s.agregada_a) + '</small>' + (s.aptos ? ' <small>' + n(s.aptos) + ' aptos</small>' : '') + '</td><td class="r"><small>na ' + h(s.agregada_a) + '</small></td><td class="c"><span class="mk AGR">↗</span></td></tr>';
              return '<tr><td>Seção ' + h(s.numero) + (s.ativo ? '' : ' <small>(inativa)</small>') + (s.aptos ? ' <small>' + n(s.aptos) + ' aptos</small>' : '') + (s.agregadas ? ' <small>+ agregada ' + s.agregadas.join(', ') + '</small>' : '') + '</td><td class="r">' + (u ? n(u.votos) : '—') + '</td><td class="c"><span class="mk ' + stt + '">' + (stt === 'VALIDADO' ? '✓' : stt === 'PENDENTE' ? '!' : '–') + '</span></td></tr>';
            }).join('') + (l.totalInformado ? '<tr><td>Total informado</td><td class="r">' + n(l.totalInformado) + '</td><td class="c"><span class="mk ' + (l.totalStatus || 'VALIDADO') + '">✓</span></td></tr>' : '') +
            '</tbody></table></div>';
        });
        html += '</div>';
      });
    }

    html += '<footer class="rel-rodape"><p>"Confirmado" = conferido pela equipe de apuração com a foto do boletim de urna. "Em conferência" = enviado pelo fiscal e ainda não conferido. ' +
      '"% dos aptos" = votos do candidato ÷ eleitores aptos das seções já apuradas. ' +
      '"Seção agregada" = seção que o TSE juntou a outra na mesma urna; seus votos estão somados no boletim de urna da seção principal. ' +
      'Totais informados são resultados recebidos sem o detalhe por seção. Este é um levantamento interno da campanha; o resultado oficial é o divulgado pelo TSE/TRE-ES.</p>' +
      '<div class="rel-assin"><div>Responsável pela apuração</div><div>Data e hora</div></div>' +
      '<p class="rel-credito">Sistema de apuração desenvolvido por <b>DERYCK NOGUEIRA</b></p></footer>';
    $('#rel').innerHTML = html;
  }

  if (sess) iniciar(); else telaLogin();
})();
