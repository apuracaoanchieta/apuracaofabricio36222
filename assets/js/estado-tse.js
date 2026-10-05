/* RESULTADO OFICIAL DO TSE NO ESTADO (arquivo fixo assets/data/tse-es-2026.json)
 * Os votos do candidato em todas as seções do ES, lidos nos boletins de urna do TSE depois da eleição.
 * Como não mudam mais, ficam num arquivo do site (rápido) em vez da planilha (que fica só com
 * o município principal e o que a equipe lançou). Aqui eles são somados aos dados da planilha
 * no formato que o painel, o mapa, o telão e os relatórios já usam. */
var EstadoTSE = (function () {
  'use strict';
  var URL_DADOS = 'assets/data/tse-es-2026-final.json';
  var promessa = null, bruto = null, cacheVisao = null;

  function norm(v) { return String(v || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }

  function carregar() {
    if (!promessa) {
      promessa = fetch(URL_DADOS).then(function (r) { if (!r.ok) throw new Error('arquivo do TSE não encontrado'); return r.json(); })
        .then(function (j) { bruto = j; cacheVisao = null; return j; })
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
        secoes.push({ id: sid, local_id: lid, numero: String(s[1]), ativo: true, aptos: s[2] || 0, agregada_a: s[3] ? String(s[3]) : '', zona: zona, tse: true });
        if (s[4] === null || s[4] === undefined || s[3]) return;
        urnas.push({ id: 'T' + sid, secao_id: sid, local_id: lid, municipio: m.nome, local: loc[2], secao: String(s[1]), votos: s[4], votos_informados: s[4],
          status: 'VALIDADO', origem: 'TSE', nome: 'Boletim de urna (TSE)', recebido_em: quando, validado_em: quando, validado_por: 'tse', foto_id: '', telefone: '', obs: '' });
      });
    });
    cacheVisao = { locais: locais, secoes: secoes, urnas: urnas, municipios: bruto.municipios.map(function (m) { return norm(m.nome); }) };
    return cacheVisao;
  }

  /* Soma o estado aos dados da planilha. O município principal (Anchieta) continua vindo da planilha;
   * nos demais vale o resultado oficial do TSE (lançamentos da planilha desses municípios são ignorados). */
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
    return r;
  }

  /* VOTOS VÁLIDOS de deputado estadual em cada município (nominais + legenda), do resultado oficial do TSE.
   * Busca uma vez por navegador (78 arquivos do TSE) e guarda: o resultado é final. */
  var CHAVE_VALIDOS = 'fp_validos_es_2026_v1', promValidos = null;
  function validos() {
    if (promValidos) return promValidos;
    promValidos = Promise.resolve().then(function () {
      try { var c = JSON.parse(localStorage.getItem(CHAVE_VALIDOS) || 'null'); if (c && c.n >= 78) return c.m; } catch (e) { /* sem cache */ }
      return carregar().then(function (j) {
        if (!j || !window.Core || !Core.normalizarResultadoTse) return {};
        var lista = j.municipios.slice(), res = {}, ok = 0, i = 0;
        function um() {
          if (i >= lista.length) return Promise.resolve();
          var m = lista[i++];
          return fetch('https://resultados.tse.jus.br/oficial/ele2026/6259/dados/es/es' + m.cd + '-c0007-e006259-u.json')
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (raw) { var pv = Core.normalizarResultadoTse(raw), t = 0; pv.partidos.forEach(function (p) { t += Number(p.votos) || 0; }); if (t > 0) { res[norm(m.nome)] = t; ok++; } })
            .catch(function () { /* fica sem esse município */ })
            .then(um);
        }
        return Promise.all([um(), um(), um(), um(), um(), um(), um(), um()]).then(function () {
          if (ok >= lista.length) { try { localStorage.setItem(CHAVE_VALIDOS, JSON.stringify({ n: ok, m: res })); } catch (e) { /* ok */ } }
          else promValidos = null; // tenta de novo na próxima vez
          return res;
        });
      });
    });
    return promValidos;
  }

  function info() { return bruto ? { total: bruto.total, gerado: bruto.gerado, fonte: bruto.fonte } : null; }

  // já começa a baixar ao abrir a página (fica guardado no navegador)
  if (typeof window !== 'undefined' && !(window.APP_CONFIG && window.APP_CONFIG.API_URL === 'DEMO')) setTimeout(carregar, 0);
  return { carregar: carregar, mesclar: mesclar, validos: validos, info: info, norm: norm };
})();
