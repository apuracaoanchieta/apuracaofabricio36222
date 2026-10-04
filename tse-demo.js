/* MODO DEMONSTRAÇÃO da Apuração TSE: simula o arquivo do TSE (mesmo formato carg → agr → par → cand)
 * a partir da lista de candidatos aptos. Cada busca avança um pouco a totalização. Só é usado sem planilha. */
window.TseDemo = (function () {
  'use strict';
  var PREFIXO = { 13: 'PT', 65: 'PC do B', 43: 'PV', 45: 'PSDB', 23: 'CIDADANIA', 44: 'UNIÃO', 11: 'PP', 50: 'PSOL', 18: 'REDE', 25: 'PRD', 77: 'SOLIDARIEDADE' };
  function semente(str) { var h = 7; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 1000003; return h / 1000003; }
  function gerar(url) {
    var k = 'fp_tse_demo_progresso', p = 0.25, municipio = /es56073/.test(url || '');
    try {
      if (municipio) p = parseFloat(localStorage.getItem(k)) || 0.25;   // Anchieta: mesmo andamento, sem avançar
      else { p = Math.min(1, (parseFloat(localStorage.getItem(k)) || 0.1) + 0.15); localStorage.setItem(k, String(p)); }
    } catch (e) { /* ok */ }
    var lista = (typeof CANDIDATOS_TSE_ES2026 !== 'undefined' ? CANDIDATOS_TSE_ES2026 : []);
    var agrs = {}, ordem = [];
    lista.forEach(function (c) {
      var fed = /^\s*FEDERA/i.test(c[1]);
      var sigla = fed ? (PREFIXO[c[2].substr(0, 2)] || c[1]) : c[1];
      var ka = fed ? c[1] : sigla;
      if (!agrs[ka]) { agrs[ka] = { nm: fed ? c[1] : sigla, par: {}, ordem: [] }; ordem.push(ka); }
      var a = agrs[ka];
      if (!a.par[sigla]) { a.par[sigla] = { sg: sigla, cand: [] }; a.ordem.push(sigla); }
      var base = Math.pow(semente(c[2] + c[0]), 3) * 42000 + 300;
      if (c[2] === '36222') base = 31000;
      if (municipio) base = c[2] === '36222' ? 9200 : base * 0.012;
      a.par[sigla].cand.push({ n: Number(c[2]), nm: c[0], st: 'Apto', vap: Math.round(base * p) });
    });
    return {
      dg: new Date().toLocaleDateString('pt-BR'), hg: new Date().toLocaleTimeString('pt-BR'),
      snt: Math.round((1 - p) * 9300), pst: (p * 100).toFixed(2).replace('.', ','), ts: 9300,
      carg: [{ agr: ordem.map(function (ka) {
        var a = agrs[ka];
        return { nm: a.nm, par: a.ordem.map(function (sg) {
          var par = a.par[sg], nominais = par.cand.reduce(function (s, x) { return s + x.vap; }, 0);
          return { sg: sg, tvan: nominais, tval: Math.round(nominais * 0.06), cand: par.cand };
        }) };
      }) }]
    };
  }
  return { gerar: gerar };
})();
