/* Exportação para Excel e dados do relatório (usados pela área da Apuração) */
var Relat = (function () {
  'use strict';
  var SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var ROT = { VALIDADO: 'Confirmado', PENDENTE: 'Em conferência', REJEITADO: 'Rejeitado', DESCARTADO: 'Substituído' };

  /* Converte os dados da apuração no formato usado pelo painel */
  function visao(d) {
    var urnas = Core.resolverUrnas(d.lancamentos);
    var v = { config: d.config, locais: d.locais, secoes: d.secoes, urnas: Object.keys(urnas).map(function (k) { return urnas[k]; }) };
    // resultado oficial do TSE dos outros municípios (arquivo fixo do site)
    if (window.EstadoTSE) v = EstadoTSE.mesclar(v);
    var porSecao = {}; v.urnas.forEach(function (u) { porSecao[u.secao_id] = u; });
    v._urnasPorSecao = porSecao;
    return v;
  }
  function municipios(v) {
    var principal = String(v.config.municipio_principal || 'ANCHIETA').toUpperCase();
    var m = {}; m[principal] = true;
    v.urnas.forEach(function (u) { if (u.municipio) m[u.municipio.toUpperCase()] = true; });
    v.locais.forEach(function (l) { if (l.municipio && v.secoes.some(function (s) { return s.local_id === l.id && s.ativo; })) m[l.municipio.toUpperCase()] = true; });
    return Object.keys(m).sort(function (a, b) { return a === principal ? -1 : b === principal ? 1 : a.localeCompare(b, 'pt-BR'); });
  }
  /* Resumo completo: por município, por local e por seção */
  function consolidar(d) {
    var v = visao(d);
    var lista = municipios(v).map(function (mun) {
      var st = Painel.calcular(v, mun);
      st.municipio = mun;
      st.locais.sort(function (a, b) { return (b.votosVal + b.votosPen) - (a.votosVal + a.votosPen) || a.nome.localeCompare(b.nome, 'pt-BR'); });
      return st;
    }).filter(function (st) { return st.totalUrnas || st.votosVal || st.votosPen; });
    var tot = { votosVal: 0, votosPen: 0, apuradas: 0, totalUrnas: 0, urnasVal: 0, urnasPen: 0, aptosTotal: 0, aptosApur: 0, votosSecComAptos: 0 };
    lista.forEach(function (st) { Object.keys(tot).forEach(function (k) { tot[k] += st[k] || 0; }); });
    return { config: d.config, municipios: lista, total: tot, agora: d.agora, urnasPorSecao: v._urnasPorSecao };
  }

  function carregarScript(src) {
    return new Promise(function (ok, falha) {
      if (window.XLSX) return ok();
      var s = document.createElement('script'); s.src = src; s.onload = ok;
      s.onerror = function () { falha(new Error('Não foi possível carregar o gerador de Excel. Verifique a internet.')); };
      document.head.appendChild(s);
    });
  }
  function dataBr(stamp) { if (!stamp) return ''; var s = String(stamp); return s.substr(8, 2) + '/' + s.substr(5, 2) + '/' + s.substr(0, 4) + ' ' + s.substr(11, 8); }
  function linkFoto(id) { return id && !/^DEMO-|^F[0-9a-f]{8}$/.test(id) ? 'https://drive.google.com/file/d/' + id + '/view' : ''; }
  function p1(a, b) { return b ? Math.round(a / b * 1000) / 10 : ''; }
  function folha(linhas, larguras) {
    var ws = XLSX.utils.aoa_to_sheet(linhas);
    ws['!cols'] = larguras.map(function (w) { return { wch: w }; });
    return ws;
  }

  function exportarExcel(d) {
    return carregarScript(SHEETJS).then(function () {
      var r = consolidar(d), cfg = d.config;
      var wb = XLSX.utils.book_new();
      var cab = [
        ['Apuração — ' + (cfg.candidato_nome || 'Fabricio Petri') + ' ' + (cfg.candidato_numero || '') + ' · ' + (cfg.cargo || '')],
        ['Gerado em ' + dataBr(d.agora) + '. "Confirmado" = conferido pela apuração; "Em conferência" = enviado e ainda não conferido.'],
        []
      ];

      // 1. Resumo por município
      var res = cab.concat([['Município', 'Urnas apuradas', 'Total de urnas', '% apurado', 'Votos confirmados', 'Votos em conferência', 'Total de votos', 'Inclui totais informados', 'Eleitores aptos', '% do eleitorado apurado', '% dos aptos (seções apuradas)']]);
      r.municipios.forEach(function (st) {
        res.push([st.municipio, st.apuradas, st.totalUrnas, p1(st.apuradas, st.totalUrnas), st.votosVal, st.votosPen, st.votosVal + st.votosPen, st.votosTotais || '',
          st.aptosTotal || '', p1(st.aptosApur, st.aptosTotal), p1(st.votosSecComAptos, st.aptosApur)]);
      });
      res.push(['TOTAL', r.total.apuradas, r.total.totalUrnas, p1(r.total.apuradas, r.total.totalUrnas), r.total.votosVal, r.total.votosPen, r.total.votosVal + r.total.votosPen, '',
        r.total.aptosTotal || '', p1(r.total.aptosApur, r.total.aptosTotal), p1(r.total.votosSecComAptos, r.total.aptosApur)]);
      XLSX.utils.book_append_sheet(wb, folha(res, [26, 15, 15, 11, 18, 20, 15, 22, 15, 22, 26]), 'Resumo');

      // 2. Por local
      var pl = cab.concat([['Município', 'Local de votação', 'Urnas apuradas', 'Total de urnas', 'Votos confirmados', 'Votos em conferência', 'Total de votos', 'Total informado (sem seção)', 'Média por urna', 'Eleitores aptos', '% dos aptos (seções apuradas)']]);
      r.municipios.forEach(function (st) {
        st.locais.forEach(function (l) {
          var ap = l.val + l.pen;
          pl.push([st.municipio, l.nome, ap, l.total, l.votosVal, l.votosPen, l.votosVal + l.votosPen, l.totalInformado || '', ap ? Math.round((l.votosVal + l.votosPen - (l.totalInformado || 0)) / ap) : '',
            l.aptos || '', p1(l.votosSec, l.aptosApur)]);
        });
      });
      XLSX.utils.book_append_sheet(wb, folha(pl, [18, 36, 14, 14, 18, 20, 14, 24, 14, 14, 26]), 'Por local');

      // 3. Por seção (inclui seções sem envio)
      var ps = cab.concat([['Município', 'Local de votação', 'Seção', 'Situação', 'Votos', 'Eleitores aptos', '% dos aptos', 'Fiscal / quem informou', 'Telefone', 'Recebido em', 'Conferido por', 'Conferido em', 'Foto do BU']]);
      r.municipios.forEach(function (st) {
        st.locais.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }).forEach(function (l) {
          l.secoes.forEach(function (s) {
            var u = s.urna;
            if (s.agregada_a && !u) {
              ps.push([st.municipio, l.nome, Number(s.numero) || s.numero, 'Agregada à seção ' + s.agregada_a, '', s.aptos || '', '', 'Votos somados no BU da seção ' + s.agregada_a, '', '', '', '', '']);
              return;
            }
            var apEf = s.aptosEf || s.aptos;
            ps.push([st.municipio, l.nome, Number(s.numero) || s.numero, (u ? ROT[u.status] : (s.ativo ? 'Sem envio' : 'Seção inativa')) + (s.agregada_a ? ' · agregada à ' + s.agregada_a : '') + (s.agregadas ? ' · inclui agregada ' + s.agregadas.join(', ') : ''), u ? u.votos : '', s.aptos || '', u && apEf ? p1(u.votos, apEf) : '',
              u ? u.nome : '', u ? App.tel(u.telefone) : '', u ? dataBr(u.recebido_em) : '', u ? u.validado_por : '', u ? dataBr(u.validado_em) : '', u ? linkFoto(u.foto_id) : '']);
          });
          if (l.totalInformado) ps.push([st.municipio, l.nome, 'TOTAL', 'Total informado (' + (ROT[l.totalStatus] || '').toLowerCase() + ')', l.totalInformado, '', '', '', '', '', '', '', '']);
        });
      });
      XLSX.utils.book_append_sheet(wb, folha(ps, [18, 36, 8, 18, 9, 14, 11, 26, 17, 20, 14, 20, 48]), 'Por seção');

      // 4. Todos os envios (histórico completo)
      var te = cab.concat([['ID', 'Recebido em', 'Origem', 'Fiscal / quem informou', 'Telefone', 'Município', 'Local de votação', 'Seção', 'Votos', 'Votos informados pelo fiscal', 'Status', 'Conferido por', 'Conferido em', 'Observação', 'Foto do BU']]);
      d.lancamentos.slice().sort(function (a, b) { return a.recebido_em < b.recebido_em ? -1 : 1; }).forEach(function (l) {
        te.push([l.id, dataBr(l.recebido_em), l.origem === 'APURACAO' ? 'Lançado pela apuração' : l.origem === 'TSE' ? 'Boletim de urna (TSE)' : 'Fiscal', l.nome, App.tel(l.telefone), l.municipio,
          l.local || (Core.ehTotal(l) ? 'TOTAL DO MUNICÍPIO' : ''), Core.ehTotal(l) ? 'TOTAL' : (Number(l.secao) || l.secao),
          typeof l.votos === 'number' ? l.votos : '', typeof l.votos_informados === 'number' ? l.votos_informados : '', ROT[l.status] || l.status,
          l.validado_por, dataBr(l.validado_em), l.obs, linkFoto(l.foto_id)]);
      });
      XLSX.utils.book_append_sheet(wb, folha(te, [13, 20, 20, 26, 17, 16, 34, 8, 9, 14, 15, 14, 20, 32, 48]), 'Todos os envios');

      var nome = 'Apuracao_' + String(cfg.candidato_nome || 'Fabricio_Petri').replace(/\s+/g, '_') + '_' + String(d.agora).replace(/[-: ]/g, '').substr(0, 12) + '.xlsx';
      XLSX.writeFile(wb, nome);
      return nome;
    });
  }

  return { visao: visao, consolidar: consolidar, exportarExcel: exportarExcel, ROT: ROT };
})();
