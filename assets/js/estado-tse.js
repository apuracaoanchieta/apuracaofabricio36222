/* RESULTADO OFICIAL DO TSE NO ESTADO (arquivo fixo assets/data/tse-es-2026.json)
 * Cada seção: [local, número, aptos, agregada_a, votos do candidato, votos válidos de dep. estadual].
 * Cada município: validos = votos válidos oficiais (nominais + legenda) do município.
 * Os votos do candidato em todas as seções do ES, lidos nos boletins de urna do TSE depois da eleição.
 * Como não mudam mais, ficam num arquivo do site (rápido) em vez da planilha (que fica só com
 * o município principal e o que a equipe lançou). Aqui eles são somados aos dados da planilha
 * no formato que o painel, o mapa, o telão e os relatórios já usam. */
var EstadoTSE = (function () {
  'use strict';
  var URL_DADOS = 'assets/data/tse-es-2026.json';
  var promessa = null, bruto = null, cacheVisao = null;

  function norm(v) { return String(v || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }

  function carregar() {
    if (!promessa) {
      promessa = fetch(URL_DADOS).then(function (r) { if (!r.ok) throw new Error('arquivo do TSE não encontrado'); return r.json(); })
        .then(function (j) { bruto = j; cacheVisao = null; idxValidos = null; return j; })
        .catch(function () { promessa = null; bruto = null; return null; });
    }
    return promessa;
  }

  /* monta locais / seções / urnas no mesmo formato da planilha (uma vez só) */
  function montar() {
    if (cacheVisao || !bruto) return cacheVisao;
    var locais = [], secoes = [], urnas = [], quando = bruto.gerado || '2026-10-04 20:57:00';
    bruto.municipios.forEach(function (m) {
      var ids = m.locais.map(function (l) {
        var id = 'E' + m.cd + '-' + l[0] + '-' + l[1];
        locais.push({ id: id, municipio: m.nome, nome: l[2], bairro: l[3] || '', ativo: true, zona: String(l[0]), nr_local: String(l[1]), lat: l[4], lng: l[5], tse: true });
        return id;
      });
      m.secoes.forEach(function (s) {
        var lid = ids[s[0]], loc = m.locais[s[0]], zona = String(loc[0]), sid = 'E' + m.cd + '-' + zona + '-S' + s[1];
        var vs = (s[5] === null || s[5] === undefined) ? null : s[5];
        secoes.push({ id: sid, local_id: lid, numero: String(s[1]), ativo: true, aptos: s[2] || 0, agregada_a: s[3] ? String(s[3]) : '', zona: zona, tse: true, validos: vs });
        if (s[4] === null || s[4] === undefined || s[3]) return;
        urnas.push({ id: 'T' + sid, secao_id: sid, local_id: lid, municipio: m.nome, local: loc[2], secao: String(s[1]), votos: s[4], votos_informados: s[4], validos: vs,
          status: 'VALIDADO', origem: 'TSE', nome: 'Boletim de urna (TSE)', recebido_em: quando, validado_em: quando, validado_por: 'tse', foto_id: '', telefone: '', obs: '' });
      });
    });
    cacheVisao = { locais: locais, secoes: secoes, urnas: urnas, municipios: bruto.municipios.map(function (m) { return norm(m.nome); }) };
    return cacheVisao;
  }

  /* Soma o estado aos dados da planilha. O município principal (Anchieta) continua vindo da planilha;
   * nos demais vale o resultado oficial do TSE (lançamentos da planilha desses municípios são ignorados). */
  /* votos válidos de uma seção (qualquer município, inclusive o principal): índice município#zona#seção */
  var idxValidos = null;
  function indexar() {
    if (idxValidos || !bruto) return idxValidos;
    var ix = { z: {}, n: {} };
    bruto.municipios.forEach(function (m) {
      var mn = norm(m.nome);
      m.secoes.forEach(function (s) {
        if (s[5] === null || s[5] === undefined) return;
        var zona = Number(m.locais[s[0]][0]), num = Number(s[1]);
        ix.z[mn + '#' + zona + '#' + num] = s[5];
        var kn = mn + '#' + num; ix.n[kn] = (kn in ix.n) ? -1 : s[5]; // -1 = número repetido em zonas diferentes
      });
    });
    idxValidos = ix; return ix;
  }
  function validosSecao(municipio, zona, numero) {
    var ix = indexar(); if (!ix) return null;
    var mn = norm(municipio), num = Number(numero);
    if (zona) { var v = ix.z[mn + '#' + Number(zona) + '#' + num]; if (v !== undefined) return v; }
    var w = ix.n[mn + '#' + num]; return (w === undefined || w < 0) ? null : w;
  }
  /* põe "validos" nas seções e urnas da planilha (município principal), para o painel e os relatórios */
  function completarValidos(r) {
    if (!indexar()) return r;
    var loc = {}; r.locais.forEach(function (l) { loc[l.id] = l; });
    var porSec = {};
    r.secoes = r.secoes.map(function (s) {
      if (s.validos !== undefined && s.validos !== null) { porSec[s.id] = s.validos; return s; }
      var l = loc[s.local_id]; if (!l) return s;
      var v = validosSecao(l.municipio, s.zona || l.zona, s.numero);
      porSec[s.id] = v;
      return v === null ? s : Object.assign({}, s, { validos: v });
    });
    r.urnas = (r.urnas || []).map(function (u) {
      if (u.validos !== undefined && u.validos !== null) return u;
      var v = porSec[u.secao_id];
      if ((v === null || v === undefined) && u.secao && u.municipio) { var l = loc[u.local_id]; v = validosSecao(u.municipio, l && l.zona, u.secao); }
      return (v === null || v === undefined) ? u : Object.assign({}, u, { validos: v });
    });
    return r;
  }

  function mesclar(v) {
    var e = montar();
    if (!e || !v) return v;
    var principal = norm((v.config && v.config.municipio_principal) || 'ANCHIETA');
    var doTse = {}; e.municipios.forEach(function (k) { if (k !== principal) doTse[k] = true; });
    var locId = {}; v.locais.forEach(function (l) { locId[l.id] = l; });
    function daPlanilha(mun) { return !doTse[norm(mun)]; }
    var r = Object.assign({}, v);
    r.locais = v.locais.filter(function (l) { return daPlanilha(l.municipio); }).concat(e.locais.filter(function (l) { return doTse[norm(l.municipio)]; }));
    // seções do arquivo: só dos municípios que não são o principal
    var locTse = {}; e.locais.forEach(function (l) { if (doTse[norm(l.municipio)]) locTse[l.id] = true; });
    r.secoes = v.secoes.filter(function (s) { var l = locId[s.local_id]; return !l || daPlanilha(l.municipio); }).concat(e.secoes.filter(function (s) { return locTse[s.local_id]; }));
    r.urnas = (v.urnas || []).filter(function (u) { return daPlanilha(u.municipio); }).concat(e.urnas.filter(function (u) { return locTse[u.local_id]; }));
    r.estadoTse = true;
    return completarValidos(r);
  }

  /* VOTOS VÁLIDOS de deputado estadual em cada município (nominais + legenda), do resultado oficial do TSE.
   * Busca uma vez por navegador (78 arquivos do TSE) e guarda: o resultado é final. */
  var CHAVE_VALIDOS = 'fp_validos_es_2026_v3', promValidos = null;
  var CS = 'https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/config/es/es-p003220-cs.json';
  function validos() {
    if (promValidos) return promValidos;
    promValidos = carregar().then(function (j) {
      // 1) do arquivo do site (já vem com os válidos de cada município)
      if (j && j.municipios && j.municipios.every(function (m) { return m.validos > 0; })) {
        var r = {}; j.municipios.forEach(function (m) { r[norm(m.nome)] = m.validos; }); return r;
      }
      // 2) guardado no navegador
      try { var c = JSON.parse(localStorage.getItem(CHAVE_VALIDOS) || 'null'); if (c && c.n >= 78) return c.m; } catch (e) { /* sem cache */ }
      // 3) direto do TSE (lista de municípios do próprio TSE: não depende do arquivo do site)
      if (!window.Core || !Core.normalizarResultadoTse) return {};
      return fetch(CS).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (cs) {
        var lista = cs.abr[0].mu.map(function (m) { return { cd: m.cd, nome: m.nm }; }), res = {}, ok = 0, i = 0;
        function um() {
          if (i >= lista.length) return Promise.resolve();
          var m = lista[i++];
          return fetch('https://resultados.tse.jus.br/oficial/ele2026/6259/dados/es/es' + m.cd + '-c0007-e006259-u.json')
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (raw) {
              // "vv" = votos válidos oficiais (nominais + legenda, sem anulados sub judice e nulos técnicos)
              var t = raw && raw.v && Number(raw.v.vv);
              if (!(t > 0)) { var pv = Core.normalizarResultadoTse(raw); t = 0; pv.partidos.forEach(function (p) { t += Number(p.votos) || 0; }); }
              if (t > 0) { res[norm(m.nome)] = t; ok++; }
            })
            .catch(function () { /* fica sem esse município */ })
            .then(um);
        }
        return Promise.all([um(), um(), um(), um(), um(), um(), um(), um()]).then(function () {
          if (ok >= lista.length) { try { localStorage.setItem(CHAVE_VALIDOS, JSON.stringify({ n: ok, m: res })); } catch (e) { /* ok */ } }
          else promValidos = null;
          return res;
        });
      }).catch(function () { promValidos = null; return {}; });
    });
    return promValidos;
  }

  function info() { return bruto ? { total: bruto.total, gerado: bruto.gerado, fonte: bruto.fonte } : null; }

  // já começa a baixar ao abrir a página (fica guardado no navegador)
  if (typeof window !== 'undefined' && !(window.APP_CONFIG && window.APP_CONFIG.API_URL === 'DEMO')) setTimeout(carregar, 0);
  return { carregar: carregar, mesclar: mesclar, validos: validos, validosSecao: validosSecao, info: info, norm: norm };
})();
