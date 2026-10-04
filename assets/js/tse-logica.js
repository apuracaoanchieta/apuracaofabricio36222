/* =====================================================================
 * APURAÇÃO TSE — lógica (sem visual)
 * Quociente eleitoral, sobras, cláusula de desempenho, federações,
 * busca na lista de candidatos aptos e histórico de marcos.
 * Depende de Core (core.js) e, opcionalmente, de CANDIDATOS_TSE_ES2026.
 * ===================================================================== */
var Tse = (function () {
  'use strict';

  function lista() { return typeof CANDIDATOS_TSE_ES2026 !== 'undefined' ? CANDIDATOS_TSE_ES2026 : []; }
  function chaveSigla(s) { return Core.norm(s).replace(/[^A-Z0-9]/g, ''); }
  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  /* ---------- Federações ----------
   * Na distribuição de vagas a federação conta como UM partido.
   * A composição vem da própria lista de aptos do TSE: "FEDERAÇÃO NOME(PT/PC do B/PV)". */
  var FED_POR_MEMBRO = {}, FED_POR_NOME = {};
  function rotuloFederacao(completo) {
    var m = /^\s*FEDERA[ÇC][ÃA]O\s+(.*?)\s*\(([^)]*)\)\s*$/i.exec(completo);
    if (!m) return completo;
    var nome = m[1].indexOf(' - ') >= 0 ? m[1].split(' - ').pop() : m[1];
    return nome.trim() + ' (' + m[2].split('/').map(function (x) { return x.trim().replace(/\s+/g, ''); }).join('/') + ')';
  }
  function registrarFederacao(completo) {
    var k = chaveSigla(completo);
    if (FED_POR_NOME[k]) return FED_POR_NOME[k];
    var m = /\(([^)]*)\)\s*$/.exec(completo);
    var membros = m ? m[1].split('/').map(function (x) { return x.trim(); }).filter(Boolean) : [];
    var fed = { chave: 'FED-' + k, nome: rotuloFederacao(completo), completo: completo, membros: membros };
    FED_POR_NOME[k] = fed;
    membros.forEach(function (sg) { FED_POR_MEMBRO[chaveSigla(sg)] = fed; });
    return fed;
  }
  lista().forEach(function (c) { if (/^\s*FEDERA[ÇC][ÃA]O/i.test(c[1])) registrarFederacao(c[1]); });

  /* A que "partido do cálculo" pertence uma sigla (ou nome de federação, ou agremiação do TSE) */
  function grupoDe(sigla, agremiacao) {
    var k = chaveSigla(sigla);
    if (FED_POR_NOME[k]) return FED_POR_NOME[k];
    if (FED_POR_MEMBRO[k]) return FED_POR_MEMBRO[k];
    if (/^\s*FEDERA[ÇC][ÃA]O/i.test(sigla || '')) return registrarFederacao(sigla);
    if (agremiacao) {
      var ka = chaveSigla(agremiacao);
      if (FED_POR_NOME[ka]) return FED_POR_NOME[ka];
      return { chave: 'AGR-' + ka, nome: String(agremiacao).toUpperCase(), membros: [] };
    }
    return { chave: k, nome: String(sigla || '').toUpperCase(), membros: [] };
  }

  /* partidos gravados ([{sigla, agremiacao, votos}]) -> lista do cálculo ([{nome, votos, chave, membros}]) */
  function agruparPartidos(partidos) {
    var porChave = {}, ordem = [];
    (partidos || []).forEach(function (p) {
      var g = grupoDe(p.sigla, p.agremiacao);
      if (!porChave[g.chave]) { porChave[g.chave] = { nome: g.nome, chave: g.chave, votos: 0, membros: [], federacao: g.chave.indexOf('FED-') === 0 || g.chave.indexOf('AGR-') === 0 }; ordem.push(g.chave); }
      porChave[g.chave].votos += Number(p.votos) || 0;
      porChave[g.chave].membros.push(String(p.sigla || '').toUpperCase());
    });
    return ordem.map(function (k) { return porChave[k]; });
  }

  /* ---------- Projeção de vagas (lógica do pacote; nomes de campos adaptados) ---------- */
  var VAGAS_PADRAO = 30;

  function calcularDistribuicao(votosValidos, vagas, partidos) {
    var QE = vagas > 0 ? Math.floor(votosValidos / vagas) : 0;
    var estado = partidos.map(function (p) {
      var vagasQP = QE > 0 ? Math.floor(p.votos / QE) : 0;
      return { nome: p.nome, chave: p.chave, membros: p.membros || [], votos: p.votos, vagasQP: vagasQP, vagasSobra: 0 };
    });
    var distribuidas = estado.reduce(function (s, p) { return s + p.vagasQP; }, 0);
    var sobras = Math.max(0, vagas - distribuidas);
    var historico = [];
    var guard = 0;
    while (sobras > 0 && guard < 500) {
      guard++;
      var elegiveis = estado.filter(function (p) { return QE > 0 && p.votos >= 0.8 * QE; });
      var excecao = false;
      if (elegiveis.length === 0) { elegiveis = estado.filter(function (p) { return p.votos > 0; }); excecao = true; }
      if (elegiveis.length === 0) break;
      var melhor = null;
      elegiveis.forEach(function (p) {
        var media = p.votos / (p.vagasQP + p.vagasSobra + 1);
        if (!melhor || media > melhor.media) melhor = { p: p, media: media };
      });
      if (!melhor) break;
      melhor.p.vagasSobra += 1;
      historico.push({ partido: melhor.p.nome, chave: melhor.p.chave, media: melhor.media, excecaoStf: excecao });
      sobras--;
    }
    var resultado = estado.map(function (p) {
      return { nome: p.nome, chave: p.chave, membros: p.membros, votos: p.votos, vagasQP: p.vagasQP, vagasSobra: p.vagasSobra, vagasTotal: p.vagasQP + p.vagasSobra };
    }).sort(function (a, b) { return b.vagasTotal - a.vagasTotal || b.votos - a.votos; });
    return { QE: QE, votosValidos: votosValidos, vagas: vagas, resultado: resultado, historico: historico };
  }

  function aplicarClausulaDesempenho(candidatosOrdenados, vagasDoPartido, QE) {
    var minimo = QE * 0.1;
    var vagasRestantes = vagasDoPartido;
    return candidatosOrdenados.map(function (c) {
      var passaClausula = QE > 0 ? c.votos >= minimo : false;
      var eleito = false;
      if (vagasRestantes > 0 && passaClausula) { eleito = true; vagasRestantes--; }
      return Object.assign({}, c, { passaClausula: passaClausula, eleito: eleito, minimoNecessario: minimo });
    });
  }

  /* chavePartido: grupo do partido do candidato (ex.: 'AGIR'); candidatos: só os desse grupo */
  function statusCandidato(votosValidos, vagas, chavePartido, oficial, candidatos) {
    if (!oficial.length) return { kind: 'sem-dados' };
    var dist = calcularDistribuicao(votosValidos, vagas, oficial.map(function (p) { return { nome: p.nome, chave: p.chave, membros: p.membros, votos: Number(p.votos) || 0 }; }));
    var linhaPartido = null;
    dist.resultado.forEach(function (r) { if (r.chave === chavePartido) linhaPartido = r; });
    var vagasDoPartido = linhaPartido ? linhaPartido.vagasTotal : 0;
    var ordenados = candidatos.slice().sort(function (a, b) { return (Number(b.votos) || 0) - (Number(a.votos) || 0); });
    var comClausula = aplicarClausulaDesempenho(ordenados, vagasDoPartido, dist.QE);
    var nosso = null;
    comClausula.forEach(function (c) { if (c.ehNosso) nosso = c; });
    return { kind: 'com-dados', dist: dist, linhaPartido: linhaPartido, vagasDoPartido: vagasDoPartido, candidatos: comClausula, nosso: nosso, QE: dist.QE };
  }

  function classificarStatus(st) {
    if (st.kind === 'sem-dados') return { chave: 'sem-dados', label: 'Aguardando dados oficiais', classe: 'neutral' };
    if (!st.nosso) return { chave: 'sem-candidato', label: 'Cadastre seu candidato', classe: 'neutral' };
    if (st.nosso.eleito) return { chave: 'eleito', label: 'Projeção: ELEITO', classe: 'ok' };
    if (st.nosso.passaClausula) return { chave: 'fora-faixa', label: 'Projeção: fora da faixa de vagas', classe: 'warn' };
    return { chave: 'abaixo-clausula', label: 'Projeção: abaixo da cláusula de desempenho', classe: 'danger' };
  }

  /* Junta tudo a partir dos dados gravados (tse.dados) */
  function calcular(dados) {
    var cfg = dados.config || {};
    var vagas = parseInt(String(cfg.vagas_total || '').replace(/\D/g, ''), 10) || VAGAS_PADRAO;
    var meuNumero = digits(cfg.candidato_numero);
    var grupoNosso = grupoDe(cfg.partido || 'AGIR');
    var oficial = agruparPartidos(dados.partidos);
    var votosValidos = oficial.reduce(function (s, p) { return s + p.votos; }, 0);
    var candidatos = (dados.candidatos || []).map(function (c) {
      return { id: c.id, nome: c.nome, numero: c.numero, partido: c.partido, situacao: c.situacao, origem: c.origem,
        votos: Number(c.votos) || 0, ehNosso: !!meuNumero && digits(c.numero) === meuNumero, chave: grupoDe(c.partido).chave };
    });
    var doPartido = candidatos.filter(function (c) { return c.chave === grupoNosso.chave; });
    var st = statusCandidato(votosValidos, vagas, grupoNosso.chave, oficial, doPartido);
    return { cfg: cfg, vagas: vagas, meuNumero: meuNumero, grupoNosso: grupoNosso, oficial: oficial, votosValidos: votosValidos,
      candidatos: candidatos, doPartido: doPartido, st: st, status: classificarStatus(st) };
  }

  /* ---------- Lista de candidatos aptos (busca) ---------- */
  function candidatosTseDoPartido(nomePartido, listaCandidatosTse) {
    var alvo = grupoDe(nomePartido).chave;
    if (!nomePartido) return [];
    return (listaCandidatosTse || lista()).filter(function (c) { return grupoDe(c[1]).chave === alvo; });
  }
  function candidatosTseFiltrados(termo, listaCandidatosTse) {
    var l = listaCandidatosTse || lista();
    var t = Core.norm(termo);
    if (!t) return l;
    return l.filter(function (c) {
      return Core.norm(c[0]).indexOf(t) !== -1 || Core.norm(c[1]).indexOf(t) !== -1 || c[2].indexOf(t) !== -1;
    });
  }

  /* ---------- Histórico / linha do tempo ---------- */
  function montarPontoHistorico(st) {
    if (st.kind !== 'com-dados') return null;
    return {
      votosValidos: st.dist.votosValidos,
      QE: st.dist.QE,
      vagasDoPartido: st.vagasDoPartido,
      candidatoVotos: st.nosso ? Number(st.nosso.votos) || 0 : null,
      candidatoPctQE: st.nosso && st.dist.QE > 0 ? (Number(st.nosso.votos) || 0) / st.dist.QE : null,
      marco: classificarStatus(st).chave
    };
  }
  var LABEL_MARCO = {
    'eleito': 'Entrou na projeção de eleito',
    'fora-faixa': 'Ficou fora da faixa de vagas',
    'abaixo-clausula': 'Ficou abaixo da cláusula de desempenho',
    'sem-candidato': 'Candidato removido da configuração',
    'sem-dados': 'Sem dados oficiais'
  };
  function marcosDoHistorico(pontosHistorico) {
    var marcos = [];
    var anterior = null;
    (pontosHistorico || []).forEach(function (p) {
      if (p.marco && p.marco !== anterior) { marcos.push({ t: p.t, marco: p.marco }); anterior = p.marco; }
    });
    return marcos.reverse();
  }

  /* ---------- Dados dos gráficos (o desenho usa o Chart.js do sistema) ---------- */
  function dadosVagasPorPartido(dist) {
    return dist.resultado.filter(function (r) { return r.votos > 0; });
  }
  function dadosDistribuicaoVotos(oficial, chaveNosso) {
    var ordenado = oficial.filter(function (p) { return Number(p.votos) > 0; }).sort(function (a, b) { return b.votos - a.votos; });
    var nosso = ordenado.filter(function (p) { return p.chave === chaveNosso; });
    var outros = ordenado.filter(function (p) { return p.chave !== chaveNosso; });
    var fatias = [];
    if (nosso.length) fatias.push({ nome: nosso[0].nome, votos: Number(nosso[0].votos), nosso: true });
    outros.slice(0, 4).forEach(function (p) { fatias.push({ nome: p.nome, votos: Number(p.votos) }); });
    var restoSoma = outros.slice(4).reduce(function (s, p) { return s + Number(p.votos); }, 0);
    if (restoSoma > 0) fatias.push({ nome: 'Outros', votos: restoSoma, resto: true });
    return fatias;
  }
  function dadosEvolucao(pontosHistorico) {
    var pontos = (pontosHistorico || []).filter(function (p) { return p.candidatoPctQE != null; });
    return pontos.length < 2 ? null : pontos;
  }

  return {
    VAGAS_PADRAO: VAGAS_PADRAO, LABEL_MARCO: LABEL_MARCO,
    grupoDe: grupoDe, agruparPartidos: agruparPartidos, rotuloFederacao: rotuloFederacao,
    calcularDistribuicao: calcularDistribuicao, aplicarClausulaDesempenho: aplicarClausulaDesempenho,
    statusCandidato: statusCandidato, classificarStatus: classificarStatus, calcular: calcular,
    candidatosTseDoPartido: candidatosTseDoPartido, candidatosTseFiltrados: candidatosTseFiltrados,
    montarPontoHistorico: montarPontoHistorico, marcosDoHistorico: marcosDoHistorico,
    dadosVagasPorPartido: dadosVagasPorPartido, dadosDistribuicaoVotos: dadosDistribuicaoVotos, dadosEvolucao: dadosEvolucao
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Tse;
