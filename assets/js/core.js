/* =====================================================================
 * NÚCLEO DO SISTEMA DE APURAÇÃO — Fabricio Petri 36.222
 * ---------------------------------------------------------------------
 * Este arquivo contém TODAS as regras do sistema (envio do fiscal,
 * validação, login, parâmetros...). Ele é usado:
 *   - no Google Apps Script (copiado dentro do Code.gs), gravando no Sheets;
 *   - no navegador, no MODO DEMONSTRAÇÃO (sem planilha, para testes).
 * Não depende de nenhuma biblioteca. Não edite sem necessidade.
 * ===================================================================== */
var Core = (function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Estrutura das abas da planilha                                      */
  /* ------------------------------------------------------------------ */
  var SCHEMA = {
    CONFIG: ['chave', 'valor', 'descricao'],
    LOCAIS: ['id', 'municipio', 'nome', 'ativo'],
    SECOES: ['id', 'local_id', 'numero', 'ativo', 'aptos'],
    LANCAMENTOS: ['id', 'client_id', 'recebido_em', 'origem', 'nome', 'telefone', 'municipio',
      'local_id', 'local', 'secao_id', 'secao', 'votos', 'votos_informados', 'foto_id',
      'status', 'validado_por', 'validado_em', 'obs'],
    USUARIOS: ['usuario', 'perfil', 'salt', 'hash', 'ativo', 'criado_em'],
    LOG: ['data', 'usuario', 'acao', 'detalhe'],
    /* Apuração TSE (resultado oficial estadual) */
    TSE_PARTIDOS: ['id', 'sigla', 'agremiacao', 'votos', 'origem', 'atualizado_em'],
    TSE_CANDIDATOS: ['id', 'numero', 'nome', 'partido', 'situacao', 'votos', 'origem', 'atualizado_em'],
    TSE_HISTORICO: ['t', 'votos_validos', 'qe', 'vagas_partido', 'candidato_votos', 'candidato_pct_qe', 'marco']
  };

  var STATUS = { PENDENTE: 'PENDENTE', VALIDADO: 'VALIDADO', REJEITADO: 'REJEITADO', DESCARTADO: 'DESCARTADO' };
  var PERFIS = { APURACAO: 'APURACAO', PARTIDO: 'PARTIDO' };

  var CONFIG_PADRAO = [
    ['candidato_nome', 'Fabricio Petri', 'Nome do candidato exibido no sistema'],
    ['candidato_numero', '36.222', 'Número do candidato'],
    ['partido', 'AGIR', 'Partido'],
    ['cargo', 'Deputado Estadual', 'Cargo em disputa'],
    ['titulo', 'Apuração Eleições 2026', 'Título exibido no topo'],
    ['municipio_principal', 'ANCHIETA', 'Município onde atuam os fiscais'],
    ['recebimento_aberto', 'TRUE', 'TRUE = fiscais podem enviar; FALSE = envio bloqueado'],
    ['foto_obrigatoria', 'TRUE', 'Exigir foto do BU no envio do fiscal'],
    ['alerta_votos_ativo', 'FALSE', 'TRUE = avisa o fiscal quando digitar votos acima do limite; FALSE = sem aviso'],
    ['alerta_votos_max', '400', 'Avisa o fiscal se digitar mais votos que isto em uma seção'],
    ['pasta_fotos_id', '', 'ID da pasta do Google Drive com as fotos (preenchido automaticamente)'],
    ['tse_url', 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/es/es-c0007-e006259-u.json', 'Endereço do arquivo de resultado do TSE (Deputado Estadual/ES)'],
    ['vagas_total', '30', 'Vagas em disputa na Assembleia Legislativa'],
    ['tse_atualizado_em', '', 'Data/hora do último resultado aplicado do TSE (automático)'],
    ['tse_situacao', '', 'Situação da totalização no último resultado do TSE (automático)'],
    ['tse_aplicado_em', '', 'Quando o último resultado do TSE foi aplicado no sistema (automático)'],
    ['tse_aplicado_por', '', 'Quem aplicou o último resultado do TSE (automático)']
  ];
  var CONFIG_INTERNA = { pasta_fotos_id: true, tse_atualizado_em: true, tse_situacao: true, tse_aplicado_em: true, tse_aplicado_por: true };

  /* Locais e seções de Anchieta — Zona 17 (relação 2026) */
  var SEED = [
    ['CEMEI ENIDE CORREA GUAITOLINI', [13, 41, 53, 71]],
    ['CEMEI TIA IRENI AMARAL', [67, 77]],
    ['EE CORONEL GOMES OLIVEIRA', [3, 4, 7, 8, 69, 83, 138, 170]],
    ['EM AMARILIS FERNANDES GARCIA', [6, 10, 33, 35, 40, 57, 60, 140, 173]],
    ['EM DE ALTO JOEBA', [31]],
    ['EM DE ALTO PONGAL', [28, 29, 73]],
    ['EM DE BAIXO PONGAL', [23, 50]],
    ['EM DE BELO HORIZONTE', [14]],
    ['EM DE CHAPADA DO Á', [16, 75]],
    ['EM DE CÓRREGO DA PRATA', [27]],
    ['EM DE DOIS IRMÃOS', [30]],
    ['EM DE GOEMBÊ', [15, 78]],
    ['EM DE ITAJOBAIA', [144]],
    ['EM DE ITAPEROROMA BAIXA', [22, 72]],
    ['EM DE ITAPEÚNA', [24, 76]],
    ['EM DE LIMEIRA', [43, 62]],
    ['EM DE NOVO HORIZONTE', [132, 168]],
    ['EM DE PARATI', [64, 146]],
    ['EM DE RECANTO DO SOL', [52, 59, 81]],
    ['EM DE SIMPATIA', [21, 37, 130]],
    ['EM DE UBÚ', [11, 12, 45]],
    ['EM INFANTIL TIO LILIO', [70, 128]],
    ['EM JOCELINA NOGUEIRA', [44, 46, 48, 51, 54, 63, 133]],
    ['EM PROF. DULCINEA SILVA LYRIO RUPF', [58, 61, 82]],
    ['EM TEREZINHA GODOY DE ALMEIDA', [1, 2, 5, 9, 32, 34, 39, 47, 56, 139]],
    ['EMEB ALCIDES CECCON', [68, 137, 171]],
    ['EMEB DUAS BARRAS', [19]],
    ['EMEF MANOEL DE PAULA SERRÃO', [25, 26, 36, 42, 49, 55, 141]],
    ['EMEI BELMIRO ALBERTO ALPOIM', [66, 79]],
    ['EMEIEF PLANALTO', [65, 80, 142, 147, 169]],
    ['ESCOLA AGRÍCOLA DE OLIVÂNIA', [20, 74]],
    ['ESF JABAQUARA (UNIDADE DE SAÚDE)', [17, 18, 38]]
  ];

  /* Eleitores aptos por seção — Anchieta, Zona 17 (2026). Usado só para completar seções sem esse dado. */
  var APTOS_SEED = {
    1: 189, 2: 187, 3: 327, 4: 328, 5: 183, 6: 345, 7: 329, 8: 327, 9: 189, 10: 341,
    11: 237, 12: 238, 13: 296, 14: 239, 15: 181, 16: 151, 17: 223, 18: 229, 19: 260, 20: 201,
    21: 212, 22: 171, 23: 217, 24: 180, 25: 285, 26: 278, 27: 229, 28: 211, 29: 218, 30: 199,
    31: 205, 32: 188, 33: 346, 34: 188, 35: 346, 36: 282, 37: 212, 38: 228, 39: 189, 40: 341,
    41: 293, 42: 282, 43: 239, 44: 227, 45: 236, 46: 225, 47: 191, 48: 227, 49: 282, 50: 216,
    51: 221, 52: 245, 53: 291, 54: 224, 55: 279, 56: 189, 57: 345, 58: 247, 59: 243, 60: 341,
    61: 246, 62: 236, 63: 225, 64: 278, 65: 318, 66: 332, 67: 273, 68: 344, 69: 319, 70: 266,
    71: 288, 72: 148, 73: 210, 74: 150, 75: 105, 76: 160, 77: 276, 78: 133, 79: 332, 80: 323,
    81: 245, 82: 250, 83: 332, 128: 260, 130: 208, 132: 295, 133: 225, 137: 347, 138: 332, 139: 193,
    140: 344, 141: 282, 142: 322, 144: 44, 146: 280, 147: 318, 168: 149, 169: 322, 170: 331, 171: 10,
    173: 18
  };

  /* ------------------------------------------------------------------ */
  /* SHA-256 / HMAC em JavaScript puro (funciona no Apps Script e browser) */
  /* ------------------------------------------------------------------ */
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

  function utf8Bytes(str) {
    var s = unescape(encodeURIComponent(String(str)));
    var out = new Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length;
    var msg = bytes.slice();
    msg.push(0x80);
    while ((msg.length % 64) !== 56) msg.push(0);
    var bitLenHi = Math.floor((l * 8) / 0x100000000), bitLenLo = (l * 8) >>> 0;
    msg.push((bitLenHi >>> 24) & 255, (bitLenHi >>> 16) & 255, (bitLenHi >>> 8) & 255, bitLenHi & 255,
      (bitLenLo >>> 24) & 255, (bitLenLo >>> 16) & 255, (bitLenLo >>> 8) & 255, bitLenLo & 255);
    var W = new Array(64);
    for (var off = 0; off < msg.length; off += 64) {
      for (var t = 0; t < 16; t++) {
        W[t] = (msg[off + t * 4] << 24) | (msg[off + t * 4 + 1] << 16) | (msg[off + t * 4 + 2] << 8) | msg[off + t * 4 + 3];
      }
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + W[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = [];
    for (var i = 0; i < 8; i++) out.push((H[i] >>> 24) & 255, (H[i] >>> 16) & 255, (H[i] >>> 8) & 255, H[i] & 255);
    return out;
  }

  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }
  function sha256(str) { return toHex(sha256Bytes(utf8Bytes(str))); }
  function hmac(key, msg) {
    var k = utf8Bytes(key);
    if (k.length > 64) k = sha256Bytes(k);
    while (k.length < 64) k.push(0);
    var ipad = [], opad = [];
    for (var i = 0; i < 64; i++) { ipad.push(k[i] ^ 0x36); opad.push(k[i] ^ 0x5c); }
    var inner = sha256Bytes(ipad.concat(utf8Bytes(msg)));
    return toHex(sha256Bytes(opad.concat(inner)));
  }
  function hashSenha(salt, senha) {
    var h = salt + ':' + senha;
    for (var i = 0; i < 300; i++) h = sha256(salt + h);
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* Utilitários                                                         */
  /* ------------------------------------------------------------------ */
  function bool(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }
  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function norm(v) {
    return str(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  }
  function int(v) {
    if (v === '' || v === null || v === undefined) return NaN;
    var n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Math.floor(n) === n ? n : NaN;
  }
  function digits(v) { return str(v).replace(/\D/g, ''); }
  function erro(msg) { var e = new Error(msg); e.publico = true; return e; }
  function find(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i]; return null; }
  function strip(o) { var r = {}; for (var k in o) if (k.charAt(0) !== '_') r[k] = o[k]; return r; }

  function lerConfig(db) {
    var rows = db.read('CONFIG'), cfg = {};
    CONFIG_PADRAO.forEach(function (c) { cfg[c[0]] = c[1]; });
    rows.forEach(function (r) { if (r.chave) cfg[str(r.chave)] = str(r.valor); });
    return cfg;
  }
  function configPublica(cfg) {
    var r = {};
    for (var k in cfg) if (!CONFIG_INTERNA[k]) r[k] = cfg[k];
    return r;
  }
  function log(db, usuario, acao, detalhe) {
    try { db.append('LOG', { data: db.stamp(), usuario: usuario || '', acao: acao, detalhe: detalhe || '' }); } catch (e) { /* ignora */ }
  }

  function mapLocais(db) {
    return db.read('LOCAIS').map(function (r) {
      return { id: str(r.id), municipio: str(r.municipio).toUpperCase(), nome: str(r.nome), ativo: bool(r.ativo), _row: r._row };
    });
  }
  function mapSecoes(db) {
    return db.read('SECOES').map(function (r) {
      var ap = int(r.aptos);
      return { id: str(r.id), local_id: str(r.local_id), numero: str(r.numero), ativo: bool(r.ativo), aptos: isNaN(ap) || ap < 0 ? 0 : ap, _row: r._row };
    });
  }
  function rowSec(s) { return { id: s.id, local_id: s.local_id, numero: s.numero, ativo: s.ativo ? 'TRUE' : 'FALSE', aptos: s.aptos ? String(s.aptos) : '' }; }
  /* Preenche os eleitores aptos das seções de Anchieta que ainda estão sem esse dado */
  function completarAptos(db) {
    var anch = {};
    mapLocais(db).forEach(function (l) { if (norm(l.municipio) === 'ANCHIETA') anch[l.id] = true; });
    var n = 0;
    mapSecoes(db).forEach(function (s) {
      if (anch[s.local_id] && !s.aptos && APTOS_SEED[s.numero]) { s.aptos = APTOS_SEED[s.numero]; db.update('SECOES', s._row, rowSec(s)); n++; }
    });
    return n;
  }
  function mapLancamentos(db) {
    return db.read('LANCAMENTOS').map(function (r) {
      return {
        id: str(r.id), client_id: str(r.client_id), recebido_em: str(r.recebido_em), origem: str(r.origem),
        nome: str(r.nome), telefone: str(r.telefone), municipio: str(r.municipio), local_id: str(r.local_id),
        local: str(r.local), secao_id: str(r.secao_id), secao: str(r.secao),
        votos: int(r.votos), votos_informados: int(r.votos_informados), foto_id: str(r.foto_id),
        status: str(r.status) || STATUS.PENDENTE, validado_por: str(r.validado_por),
        validado_em: str(r.validado_em), obs: str(r.obs), _row: r._row
      };
    });
  }
  function rowLanc(l) {
    var o = {};
    SCHEMA.LANCAMENTOS.forEach(function (k) { o[k] = l[k]; });
    if (isNaN(o.votos)) o.votos = '';
    if (isNaN(o.votos_informados)) o.votos_informados = '';
    return o;
  }

  /* Para cada seção, decide qual lançamento "vale":
   * VALIDADO tem prioridade; senão, o PENDENTE mais recente. */
  function resolverUrnas(lancamentos) {
    var porSecao = {};
    lancamentos.forEach(function (l) {
      if (l.status !== STATUS.VALIDADO && l.status !== STATUS.PENDENTE) return;
      var atual = porSecao[l.secao_id];
      if (!atual) { porSecao[l.secao_id] = l; return; }
      if (atual.status === STATUS.VALIDADO) return;
      if (l.status === STATUS.VALIDADO || l.recebido_em > atual.recebido_em) porSecao[l.secao_id] = l;
    });
    return porSecao;
  }

  /* ------------------------------------------------------------------ */
  /* Autenticação                                                        */
  /* ------------------------------------------------------------------ */
  function segredo(db) {
    var s = db.prop('SEGREDO');
    if (!s) { s = sha256(db.uuid() + db.uuid() + Date.now()); db.setProp('SEGREDO', s); }
    return s;
  }
  function gerarToken(db, user) {
    var exp = Date.now() + 48 * 3600 * 1000;
    var payload = [user.usuario, user.perfil, exp, str(user.hash).substr(0, 10)].join('|');
    return payload + '|' + hmac(segredo(db), payload);
  }
  function autenticar(db, token, perfis) {
    var p = str(token).split('|');
    if (p.length !== 5) throw erro('Sessão inválida. Faça login novamente.');
    var payload = p.slice(0, 4).join('|');
    if (hmac(segredo(db), payload) !== p[4]) throw erro('Sessão inválida. Faça login novamente.');
    if (Number(p[2]) < Date.now()) throw erro('Sessão expirada. Faça login novamente.');
    var user = find(db.read('USUARIOS'), function (u) { return str(u.usuario).toLowerCase() === p[0]; });
    if (!user || !bool(user.ativo) || str(user.hash).substr(0, 10) !== p[3]) throw erro('Sessão inválida. Faça login novamente.');
    if (perfis.indexOf(str(user.perfil)) < 0) throw erro('Seu usuário não tem acesso a esta área.');
    return { usuario: str(user.usuario).toLowerCase(), perfil: str(user.perfil) };
  }

  /* ------------------------------------------------------------------ */
  /* Ações                                                               */
  /* ------------------------------------------------------------------ */
  var ACOES = {};

  /* ---------- Público (fiscal) ---------- */
  ACOES['public.params'] = function (db) {
    var cfg = lerConfig(db);
    var mun = norm(cfg.municipio_principal);
    var locais = mapLocais(db).filter(function (l) { return l.ativo && norm(l.municipio) === mun; });
    var ids = {};
    locais.forEach(function (l) { ids[l.id] = true; });
    var secoes = mapSecoes(db).filter(function (s) { return s.ativo && ids[s.local_id]; });
    var recebidas = Object.keys(resolverUrnas(mapLancamentos(db)));
    return {
      config: configPublica(cfg),
      locais: locais.map(strip).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }),
      secoes: secoes.map(strip).sort(function (a, b) { return Number(a.numero) - Number(b.numero); }),
      recebidas: recebidas
    };
  };

  ACOES['fiscal.enviar'] = function (db, req) {
    var cfg = lerConfig(db);
    if (!bool(cfg.recebimento_aberto)) throw erro('O recebimento de boletins está fechado no momento.');
    var clientId = str(req.client_id).substr(0, 60);
    if (!clientId) throw erro('Envio sem identificador.');
    var ja = find(mapLancamentos(db), function (l) { return l.client_id === clientId; });
    if (ja) return { id: ja.id, duplicada: false, repetido: true };

    var nome = str(req.nome).substr(0, 80);
    var tel = digits(req.telefone).substr(0, 13);
    if (nome.length < 3) throw erro('Informe seu nome completo.');
    if (tel.length < 10) throw erro('Informe o telefone com DDD.');
    var local = find(mapLocais(db), function (l) { return l.id === str(req.local_id) && l.ativo; });
    if (!local) throw erro('Local de votação inválido. Atualize a página.');
    var secao = find(mapSecoes(db), function (s) { return s.id === str(req.secao_id) && s.local_id === local.id && s.ativo; });
    if (!secao) throw erro('Seção inválida para este local. Atualize a página.');
    var votos = int(req.votos);
    if (isNaN(votos) || votos < 0 || votos > 999999) throw erro('Quantidade de votos inválida.');
    var foto = str(req.foto);
    if (bool(cfg.foto_obrigatoria) && !foto) throw erro('A foto do boletim de urna é obrigatória.');
    if (foto && !/^data:image\/(jpeg|png|webp);base64,/.test(foto)) throw erro('Formato de foto inválido.');
    if (foto.length > 12000000) throw erro('A foto é muito grande.');

    var fotoId = foto ? db.saveFoto(foto, 'BU_secao_' + secao.numero + '_' + db.stamp().replace(/\D/g, '') + '.jpg', cfg) : '';

    return db.lock(function () {
      var lancs = mapLancamentos(db);
      var dup = find(lancs, function (l) { return l.client_id === clientId; });
      if (dup) return { id: dup.id, duplicada: false, repetido: true };
      var duplicada = lancs.some(function (l) {
        return l.secao_id === secao.id && (l.status === STATUS.PENDENTE || l.status === STATUS.VALIDADO);
      });
      var novo = {
        id: 'B' + db.uuid().replace(/-/g, '').substr(0, 10).toUpperCase(), client_id: clientId, recebido_em: db.stamp(),
        origem: 'FISCAL', nome: nome, telefone: tel, municipio: local.municipio, local_id: local.id, local: local.nome,
        secao_id: secao.id, secao: secao.numero, votos: votos, votos_informados: votos, foto_id: fotoId,
        status: STATUS.PENDENTE, validado_por: '', validado_em: '', obs: duplicada ? 'Seção já possuía envio' : ''
      };
      db.append('LANCAMENTOS', rowLanc(novo));
      return { id: novo.id, duplicada: duplicada };
    });
  };

  /* Login só com senha: procura, entre os usuários ativos do perfil da área, aquele cuja senha confere.
   * Na área do Partido, a senha da Apuração também é aceita. */
  ACOES['login'] = function (db, req) {
    var senha = str(req.senha);
    var perfis = req.perfil === PERFIS.APURACAO ? [PERFIS.APURACAO] : [PERFIS.PARTIDO, PERFIS.APURACAO];
    if (!senha) throw erro('Digite a senha.');
    var users = db.read('USUARIOS').filter(function (u) { return bool(u.ativo); });
    var user = null;
    for (var i = 0; i < perfis.length && !user; i++) {
      user = find(users, function (u) { return str(u.perfil) === perfis[i] && hashSenha(str(u.salt), senha) === str(u.hash); });
    }
    if (!user) {
      log(db, '', 'LOGIN_FALHOU', req.perfil || '');
      throw erro('Senha incorreta.');
    }
    var usuario = str(user.usuario).toLowerCase();
    log(db, usuario, 'LOGIN', '');
    return { token: gerarToken(db, user), usuario: usuario, perfil: str(user.perfil) };
  };

  /* ---------- Partido (somente leitura) ---------- */
  ACOES['partido.dados'] = function (db, req) {
    autenticar(db, req.token, [PERFIS.PARTIDO, PERFIS.APURACAO]);
    var cfg = lerConfig(db);
    var urnas = resolverUrnas(mapLancamentos(db));
    var lista = Object.keys(urnas).map(function (k) {
      var l = urnas[k];
      return { secao_id: l.secao_id, local_id: l.local_id, municipio: l.municipio, local: l.local, secao: l.secao,
        votos: l.votos, status: l.status, recebido_em: l.recebido_em, validado_em: l.validado_em };
    });
    return {
      config: configPublica(cfg),
      locais: mapLocais(db).filter(function (l) { return l.ativo; }).map(strip),
      secoes: mapSecoes(db).filter(function (s) { return s.ativo; }).map(strip),
      urnas: lista,
      agora: db.stamp()
    };
  };

  /* ---------- Apuração ---------- */
  function exigeApuracao(db, req) { return autenticar(db, req.token, [PERFIS.APURACAO]); }

  ACOES['apuracao.dados'] = function (db, req) {
    exigeApuracao(db, req);
    var cfg = lerConfig(db);
    return {
      config: configPublica(cfg),
      locais: mapLocais(db).map(strip),
      secoes: mapSecoes(db).map(strip),
      lancamentos: mapLancamentos(db).map(strip),
      usuarios: db.read('USUARIOS').map(function (u) {
        return { usuario: str(u.usuario).toLowerCase(), perfil: str(u.perfil), ativo: bool(u.ativo) };
      }),
      agora: db.stamp()
    };
  };

  ACOES['apuracao.foto'] = function (db, req) {
    exigeApuracao(db, req);
    var l = find(mapLancamentos(db), function (x) { return x.id === str(req.id); });
    if (!l || !l.foto_id) throw erro('Este envio não possui foto.');
    return { foto: db.getFoto(l.foto_id), link: db.fotoLink ? db.fotoLink(l.foto_id) : '' };
  };

  function descartarOutros(db, lancs, manter, usuario) {
    lancs.forEach(function (o) {
      if (o.id !== manter.id && o.secao_id === manter.secao_id &&
        (o.status === STATUS.PENDENTE || o.status === STATUS.VALIDADO)) {
        o.status = STATUS.DESCARTADO;
        o.validado_por = usuario;
        o.validado_em = db.stamp();
        o.obs = 'Substituído pelo envio ' + manter.id;
        db.update('LANCAMENTOS', o._row, rowLanc(o));
      }
    });
  }

  ACOES['apuracao.validar'] = function (db, req) {
    var u = exigeApuracao(db, req);
    return db.lock(function () {
      var lancs = mapLancamentos(db);
      var l = find(lancs, function (x) { return x.id === str(req.id); });
      if (!l) throw erro('Envio não encontrado.');
      if (req.votos !== undefined && req.votos !== null && req.votos !== '') {
        var v = int(req.votos);
        if (isNaN(v) || v < 0 || v > 999999) throw erro('Quantidade de votos inválida.');
        l.votos = v;
      }
      l.status = STATUS.VALIDADO;
      l.validado_por = u.usuario;
      l.validado_em = db.stamp();
      if (l.votos !== l.votos_informados && !isNaN(l.votos_informados)) {
        l.obs = 'Votos corrigidos de ' + l.votos_informados + ' para ' + l.votos;
      } else if (/^Substituído|^Seção já/.test(l.obs)) {
        l.obs = '';
      }
      db.update('LANCAMENTOS', l._row, rowLanc(l));
      descartarOutros(db, lancs, l, u.usuario);
      log(db, u.usuario, 'VALIDAR', l.id + ' seção ' + l.secao + ' votos ' + l.votos);
      return { id: l.id };
    });
  };

  function mudarStatus(acao, status) {
    return function (db, req) {
      var u = exigeApuracao(db, req);
      return db.lock(function () {
        var l = find(mapLancamentos(db), function (x) { return x.id === str(req.id); });
        if (!l) throw erro('Envio não encontrado.');
        l.status = status;
        l.validado_por = status === STATUS.PENDENTE ? '' : u.usuario;
        l.validado_em = status === STATUS.PENDENTE ? '' : db.stamp();
        if (status === STATUS.PENDENTE && /^Substituído/.test(l.obs)) l.obs = '';
        db.update('LANCAMENTOS', l._row, rowLanc(l));
        log(db, u.usuario, acao, l.id + ' seção ' + l.secao);
        return { id: l.id };
      });
    };
  }
  ACOES['apuracao.rejeitar'] = mudarStatus('REJEITAR', STATUS.REJEITADO);
  ACOES['apuracao.reabrir'] = mudarStatus('REABRIR', STATUS.PENDENTE);

  function obterOuCriarLocal(db, municipio, nome) {
    var m = norm(municipio), n = norm(nome);
    if (!m) throw erro('Informe o município.');
    if (!n) throw erro('Informe o local de votação.');
    var loc = find(mapLocais(db), function (l) { return norm(l.municipio) === m && norm(l.nome) === n; });
    if (loc) return loc;
    loc = { id: 'L' + db.uuid().replace(/-/g, '').substr(0, 8).toUpperCase(), municipio: str(municipio).toUpperCase(), nome: str(nome).toUpperCase(), ativo: true };
    db.append('LOCAIS', { id: loc.id, municipio: loc.municipio, nome: loc.nome, ativo: 'TRUE' });
    return loc;
  }
  function obterOuCriarSecao(db, localId, numero) {
    var num = String(int(numero));
    if (num === 'NaN' || Number(num) <= 0) throw erro('Número de seção inválido.');
    var s = find(mapSecoes(db), function (x) { return x.local_id === localId && x.numero === num; });
    if (s) return s;
    s = { id: 'S' + db.uuid().replace(/-/g, '').substr(0, 8).toUpperCase(), local_id: localId, numero: num, ativo: true };
    s.aptos = 0;
    db.append('SECOES', rowSec(s));
    return s;
  }

  ACOES['apuracao.lancar'] = function (db, req) {
    var u = exigeApuracao(db, req);
    var votos = int(req.votos);
    if (isNaN(votos) || votos < 0 || votos > 999999) throw erro('Quantidade de votos inválida.');
    var foto = str(req.foto);
    if (foto && !/^data:image\/(jpeg|png|webp);base64,/.test(foto)) throw erro('Formato de foto inválido.');
    var cfg = lerConfig(db);
    var fotoId = foto ? db.saveFoto(foto, 'BU_manual_' + db.stamp().replace(/\D/g, '') + '.jpg', cfg) : '';
    return db.lock(function () {
      var municipio = str(req.municipio).toUpperCase();
      if (!norm(municipio)) throw erro('Informe o município.');
      var temLocal = !!norm(req.local), temSecao = str(req.secao) !== '';
      if (temSecao && !temLocal) throw erro('Para lançar uma seção, informe também o local de votação.');
      var local = temLocal ? obterOuCriarLocal(db, municipio, req.local) : null;
      var secao = temSecao ? obterOuCriarSecao(db, local.id, req.secao) : null;
      // Sem seção: é um TOTAL informado (do local ou do município inteiro).
      // Um novo total do mesmo local/município substitui o anterior.
      var secaoId = secao ? secao.id : (local ? 'TOT-' + local.id : 'TOT-M-' + norm(municipio).replace(/[^A-Z0-9]+/g, '_'));
      var novo = {
        id: 'M' + db.uuid().replace(/-/g, '').substr(0, 10).toUpperCase(), client_id: str(req.client_id).substr(0, 60),
        recebido_em: db.stamp(), origem: 'APURACAO', nome: str(req.nome).substr(0, 80) || ('Lançado por ' + u.usuario),
        telefone: digits(req.telefone).substr(0, 13), municipio: local ? local.municipio : municipio,
        local_id: local ? local.id : '', local: local ? local.nome : '',
        secao_id: secaoId, secao: secao ? secao.numero : '', votos: votos, votos_informados: votos, foto_id: fotoId,
        status: STATUS.VALIDADO, validado_por: u.usuario, validado_em: db.stamp(), obs: str(req.obs).substr(0, 200)
      };
      db.append('LANCAMENTOS', rowLanc(novo));
      var lancs = mapLancamentos(db);
      var gravado = find(lancs, function (x) { return x.id === novo.id; });
      descartarOutros(db, lancs, gravado, u.usuario);
      log(db, u.usuario, 'LANCAMENTO_MANUAL', novo.id + ' ' + novo.municipio + ' / ' + (novo.local || 'TOTAL DO MUNICÍPIO') +
        (secao ? ' seção ' + secao.numero : ' (total)') + ' votos ' + votos);
      return { id: novo.id };
    });
  };

  /* ---------- Parâmetros: locais e seções ---------- */
  ACOES['apuracao.salvarLocal'] = function (db, req) {
    var u = exigeApuracao(db, req);
    return db.lock(function () {
      var nome = str(req.nome).toUpperCase(), mun = str(req.municipio).toUpperCase();
      if (!nome) throw erro('Informe o nome do local.');
      if (!mun) throw erro('Informe o município.');
      var locais = mapLocais(db);
      var conflito = find(locais, function (l) { return norm(l.nome) === norm(nome) && norm(l.municipio) === norm(mun) && l.id !== str(req.id); });
      if (conflito) throw erro('Já existe um local com este nome neste município.');
      if (req.id) {
        var l = find(locais, function (x) { return x.id === str(req.id); });
        if (!l) throw erro('Local não encontrado.');
        db.update('LOCAIS', l._row, { id: l.id, municipio: mun, nome: nome, ativo: req.ativo === false ? 'FALSE' : 'TRUE' });
        log(db, u.usuario, 'EDITAR_LOCAL', l.id + ' ' + nome);
        return { id: l.id };
      }
      var id = 'L' + db.uuid().replace(/-/g, '').substr(0, 8).toUpperCase();
      db.append('LOCAIS', { id: id, municipio: mun, nome: nome, ativo: req.ativo === false ? 'FALSE' : 'TRUE' });
      log(db, u.usuario, 'CRIAR_LOCAL', id + ' ' + nome);
      return { id: id };
    });
  };

  ACOES['apuracao.excluirLocal'] = function (db, req) {
    var u = exigeApuracao(db, req);
    return db.lock(function () {
      var l = find(mapLocais(db), function (x) { return x.id === str(req.id); });
      if (!l) throw erro('Local não encontrado.');
      if (mapLancamentos(db).some(function (x) { return x.local_id === l.id; })) {
        throw erro('Este local já tem envios. Desative-o em vez de excluir.');
      }
      var secs = mapSecoes(db).filter(function (s) { return s.local_id === l.id; });
      secs.sort(function (a, b) { return b._row - a._row; }).forEach(function (s) { db.remove('SECOES', s._row); });
      db.remove('LOCAIS', l._row);
      log(db, u.usuario, 'EXCLUIR_LOCAL', l.id + ' ' + l.nome);
      return { id: l.id };
    });
  };

  ACOES['apuracao.salvarSecao'] = function (db, req) {
    var u = exigeApuracao(db, req);
    return db.lock(function () {
      var num = int(req.numero);
      if (isNaN(num) || num <= 0) throw erro('Número de seção inválido.');
      var local = find(mapLocais(db), function (l) { return l.id === str(req.local_id); });
      if (!local) throw erro('Escolha o local da seção.');
      var secoes = mapSecoes(db);
      var locaisMun = {};
      mapLocais(db).forEach(function (l) { if (norm(l.municipio) === norm(local.municipio)) locaisMun[l.id] = l; });
      var conflito = find(secoes, function (s) { return locaisMun[s.local_id] && s.numero === String(num) && s.id !== str(req.id); });
      if (conflito) throw erro('A seção ' + num + ' já está cadastrada em ' + locaisMun[conflito.local_id].nome + '.');
      var aptos = null;
      if (req.aptos !== undefined && req.aptos !== null) {
        aptos = str(req.aptos) === '' ? 0 : int(req.aptos);
        if (isNaN(aptos) || aptos < 0 || aptos > 99999) throw erro('Quantidade de eleitores aptos inválida.');
      }
      if (req.id) {
        var s = find(secoes, function (x) { return x.id === str(req.id); });
        if (!s) throw erro('Seção não encontrada.');
        db.update('SECOES', s._row, rowSec({ id: s.id, local_id: local.id, numero: String(num), ativo: req.ativo !== false, aptos: aptos === null ? s.aptos : aptos }));
        log(db, u.usuario, 'EDITAR_SECAO', s.id + ' nº ' + num);
        return { id: s.id };
      }
      var id = 'S' + db.uuid().replace(/-/g, '').substr(0, 8).toUpperCase();
      db.append('SECOES', rowSec({ id: id, local_id: local.id, numero: String(num), ativo: req.ativo !== false, aptos: aptos || 0 }));
      log(db, u.usuario, 'CRIAR_SECAO', id + ' nº ' + num + ' em ' + local.nome);
      return { id: id };
    });
  };

  ACOES['apuracao.excluirSecao'] = function (db, req) {
    var u = exigeApuracao(db, req);
    return db.lock(function () {
      var s = find(mapSecoes(db), function (x) { return x.id === str(req.id); });
      if (!s) throw erro('Seção não encontrada.');
      if (mapLancamentos(db).some(function (x) { return x.secao_id === s.id; })) {
        throw erro('Esta seção já tem envios. Desative-a em vez de excluir.');
      }
      db.remove('SECOES', s._row);
      log(db, u.usuario, 'EXCLUIR_SECAO', s.id + ' nº ' + s.numero);
      return { id: s.id };
    });
  };

  /* Importação em lote: uma linha por seção, "LOCAL;SEÇÃO" */
  /* Substitui a lista de locais/seções de um município.
   * Casa os locais pelo NÚMERO DAS SEÇÕES (únicos no município): um local antigo que tinha
   * as mesmas seções é RENOMEADO (mantém o id e os envios ligados a ele). Seções novas são criadas,
   * seções/locais que não estão na lista são DESATIVADOS (nunca excluídos). */
  function substituirLista(db, u, mun, texto, simular) {
    var novos = [], porNome = {}, erros = [], vistas = {};
    texto.split(/\r?\n/).forEach(function (linha, i) {
      if (!linha.trim()) return;
      var partes = linha.split(/[;\t]/);
      var num = int(partes[partes.length - 1]);
      var nome = str(partes.slice(0, partes.length - 1).join(' ')).replace(/\s+/g, ' ').toUpperCase();
      if (partes.length < 2 || !nome || isNaN(num) || num <= 0) { erros.push('Linha ' + (i + 1) + ': use LOCAL;SEÇÃO'); return; }
      if (vistas[num]) { erros.push('Linha ' + (i + 1) + ': seção ' + num + ' repetida (já está em ' + vistas[num] + ')'); return; }
      vistas[num] = nome;
      var k = norm(nome);
      if (!porNome[k]) { porNome[k] = { nome: nome, secoes: [] }; novos.push(porNome[k]); }
      porNome[k].secoes.push(String(num));
    });
    if (erros.length) return { simulado: true, erros: erros, plano: null };
    if (!novos.length) throw erro('A lista está vazia.');

    return db.lock(function () {
      var locais = mapLocais(db).filter(function (l) { return norm(l.municipio) === norm(mun); });
      var idsMun = {}; locais.forEach(function (l) { idsMun[l.id] = l; });
      var secoes = mapSecoes(db).filter(function (s) { return idsMun[s.local_id]; });
      var secPorNum = {}; secoes.forEach(function (s) { secPorNum[s.numero] = s; });
      var usados = {}, plano = { renomear: [], criarLocal: [], manter: [], criarSecao: [], moverSecao: [], reativar: [], desativarSecao: [], desativarLocal: [] };

      // 1) escolhe qual local antigo corresponde a cada local novo
      novos.forEach(function (nv) {
        var votos = {};
        nv.secoes.forEach(function (n) { var s = secPorNum[n]; if (s && !usados[s.local_id]) votos[s.local_id] = (votos[s.local_id] || 0) + 1; });
        var melhor = null;
        Object.keys(votos).forEach(function (id) { if (!melhor || votos[id] > votos[melhor]) melhor = id; });
        if (!melhor) { var mesmo = find(locais, function (l) { return !usados[l.id] && norm(l.nome) === norm(nv.nome); }); if (mesmo) melhor = mesmo.id; }
        if (melhor) {
          usados[melhor] = true; nv.id = melhor;
          var ant = idsMun[melhor];
          if (norm(ant.nome) !== norm(nv.nome)) plano.renomear.push({ id: melhor, de: ant.nome, para: nv.nome });
          else plano.manter.push(nv.nome);
          if (!ant.ativo) plano.reativar.push({ tipo: 'local', id: melhor, nome: nv.nome });
        } else { nv.id = null; plano.criarLocal.push(nv.nome); }
      });
      // 2) seções
      var naLista = {};
      novos.forEach(function (nv) {
        nv.secoes.forEach(function (n) {
          naLista[n] = true;
          var s = secPorNum[n];
          if (!s) plano.criarSecao.push({ numero: n, local: nv.nome });
          else {
            if (s.local_id !== nv.id) plano.moverSecao.push({ numero: n, de: idsMun[s.local_id].nome, para: nv.nome });
            if (!s.ativo) plano.reativar.push({ tipo: 'secao', numero: n });
          }
        });
      });
      secoes.forEach(function (s) { if (!naLista[s.numero] && s.ativo) plano.desativarSecao.push({ numero: s.numero, local: idsMun[s.local_id].nome }); });
      locais.forEach(function (l) { if (!usados[l.id] && l.ativo) plano.desativarLocal.push(l.nome); });
      plano.totalLocais = novos.length;
      plano.totalSecoes = Object.keys(naLista).length;

      if (simular) return { simulado: true, plano: plano, erros: [] };

      // 3) aplica
      novos.forEach(function (nv) {
        if (nv.id) {
          var l = idsMun[nv.id];
          db.update('LOCAIS', l._row, { id: l.id, municipio: l.municipio, nome: nv.nome, ativo: 'TRUE' });
        } else {
          nv.id = 'L' + db.uuid().replace(/-/g, '').substr(0, 8).toUpperCase();
          db.append('LOCAIS', { id: nv.id, municipio: mun, nome: nv.nome, ativo: 'TRUE' });
        }
      });
      var localNovoDaSecao = {};
      novos.forEach(function (nv) {
        nv.secoes.forEach(function (n) {
          var s = secPorNum[n];
          localNovoDaSecao[n] = nv;
          if (!s) db.append('SECOES', rowSec({ id: 'S' + db.uuid().replace(/-/g, '').substr(0, 8).toUpperCase(), local_id: nv.id, numero: n, ativo: true, aptos: 0 }));
          else if (s.local_id !== nv.id || !s.ativo) db.update('SECOES', s._row, rowSec({ id: s.id, local_id: nv.id, numero: s.numero, ativo: true, aptos: s.aptos }));
        });
      });
      secoes.forEach(function (s) { if (!naLista[s.numero] && s.ativo) db.update('SECOES', s._row, rowSec({ id: s.id, local_id: s.local_id, numero: s.numero, ativo: false, aptos: s.aptos })); });
      locais.forEach(function (l) { if (!usados[l.id] && l.ativo) db.update('LOCAIS', l._row, { id: l.id, municipio: l.municipio, nome: l.nome, ativo: 'FALSE' }); });
      // mantém os envios já registrados apontando para o local/nome certos
      var nomePorId = {}; novos.forEach(function (nv) { nomePorId[nv.id] = nv.nome; });
      mapLancamentos(db).forEach(function (lc) {
        var s = find(secoes, function (x) { return x.id === lc.secao_id; });
        var alvo = s && localNovoDaSecao[s.numero] ? localNovoDaSecao[s.numero] : null;
        var novoId = alvo ? alvo.id : lc.local_id, novoNome = nomePorId[novoId];
        if (novoNome && (lc.local_id !== novoId || lc.local !== novoNome)) {
          lc.local_id = novoId; lc.local = novoNome;
          db.update('LANCAMENTOS', lc._row, rowLanc(lc));
        }
      });
      completarAptos(db);
      log(db, u.usuario, 'SUBSTITUIR_LISTA', mun + ': ' + novos.length + ' locais, ' + plano.totalSecoes + ' seções; ' +
        plano.renomear.length + ' renomeados, ' + plano.criarSecao.length + ' seções novas, ' + plano.desativarSecao.length + ' seções desativadas');
      return { simulado: false, plano: plano, erros: [] };
    });
  }

  ACOES['apuracao.importar'] = function (db, req) {
    var u = exigeApuracao(db, req);
    var mun = str(req.municipio).toUpperCase();
    if (!mun) throw erro('Informe o município.');
    if (req.substituir) return substituirLista(db, u, mun, str(req.texto), !!req.simular);
    return db.lock(function () {
      var criadas = 0, existentes = 0, erros = [];
      str(req.texto).split(/\r?\n/).forEach(function (linha, i) {
        if (!linha.trim()) return;
        var partes = linha.split(/[;\t]/);
        if (partes.length < 2) { erros.push('Linha ' + (i + 1) + ': use LOCAL;SEÇÃO'); return; }
        var numero = partes[partes.length - 1];
        var nome = partes.slice(0, partes.length - 1).join(' ');
        try {
          var local = obterOuCriarLocal(db, mun, nome);
          var antes = mapSecoes(db).length;
          obterOuCriarSecao(db, local.id, numero);
          if (mapSecoes(db).length > antes) criadas++; else existentes++;
        } catch (e) { erros.push('Linha ' + (i + 1) + ': ' + e.message); }
      });
      log(db, u.usuario, 'IMPORTAR', mun + ': ' + criadas + ' seções criadas');
      return { criadas: criadas, existentes: existentes, erros: erros };
    });
  };

  /* Eleitores aptos em lote: uma linha por seção, "SEÇÃO;APTOS" (cabeçalhos são ignorados) */
  ACOES['apuracao.importarAptos'] = function (db, req) {
    var u = exigeApuracao(db, req);
    var mun = norm(req.municipio);
    if (!mun) throw erro('Informe o município.');
    var valores = {}, erros = [], lidas = 0;
    str(req.texto).split(/\r?\n/).forEach(function (linha, i) {
      var partes = linha.trim().split(/\s*[;\t,]\s*|\s+/).filter(function (x) { return x !== ''; });
      if (!partes.length) return;
      var num = int(partes[0]), ap = int(partes[partes.length - 1]);
      if (partes.length < 2 || isNaN(num) || isNaN(ap)) { if (lidas) erros.push('Linha ' + (i + 1) + ': use SEÇÃO;APTOS'); return; }
      if (num <= 0 || ap < 0 || ap > 99999) { erros.push('Linha ' + (i + 1) + ': valor inválido'); return; }
      lidas++; valores[String(num)] = ap;
    });
    if (!lidas) throw erro('Nenhuma linha válida. Use uma seção por linha: SEÇÃO;APTOS');
    return db.lock(function () {
      var ids = {};
      mapLocais(db).forEach(function (l) { if (norm(l.municipio) === mun) ids[l.id] = true; });
      var atualizadas = 0, iguais = 0, achadas = {};
      mapSecoes(db).forEach(function (s) {
        if (!ids[s.local_id] || !(s.numero in valores)) return;
        achadas[s.numero] = true;
        if (s.aptos === valores[s.numero]) { iguais++; return; }
        s.aptos = valores[s.numero]; db.update('SECOES', s._row, rowSec(s)); atualizadas++;
      });
      var naoEncontradas = Object.keys(valores).filter(function (n) { return !achadas[n]; }).sort(function (a, b) { return a - b; });
      log(db, u.usuario, 'IMPORTAR_APTOS', mun + ': ' + atualizadas + ' seções atualizadas');
      return { atualizadas: atualizadas, iguais: iguais, naoEncontradas: naoEncontradas, erros: erros };
    });
  };

  /* ---------- Parâmetros: configurações ---------- */
  ACOES['apuracao.salvarConfig'] = function (db, req) {
    var u = exigeApuracao(db, req);
    var valores = req.valores || {};
    return db.lock(function () {
      var rows = db.read('CONFIG');
      var permitidas = {};
      CONFIG_PADRAO.forEach(function (c) { if (!CONFIG_INTERNA[c[0]]) permitidas[c[0]] = c; });
      Object.keys(valores).forEach(function (k) {
        if (!permitidas[k]) return;
        var v = str(valores[k]).substr(0, 200);
        var r = find(rows, function (x) { return str(x.chave) === k; });
        if (r) db.update('CONFIG', r._row, { chave: k, valor: v, descricao: str(r.descricao) || permitidas[k][2] });
        else db.append('CONFIG', { chave: k, valor: v, descricao: permitidas[k][2] });
      });
      log(db, u.usuario, 'CONFIG', Object.keys(valores).join(', '));
      return { ok: true };
    });
  };

  /* ---------- Parâmetros: usuários ---------- */
  ACOES['apuracao.salvarUsuario'] = function (db, req) {
    var u = exigeApuracao(db, req);
    var usuario = str(req.usuario).toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) throw erro('Usuário deve ter de 3 a 30 letras minúsculas, números, ponto ou traço (sem espaço e sem acento).');
    var perfil = str(req.perfil);
    if (perfil !== PERFIS.APURACAO && perfil !== PERFIS.PARTIDO) throw erro('Perfil inválido.');
    var senha = str(req.senha);
    return db.lock(function () {
      var users = db.read('USUARIOS');
      var ex = find(users, function (x) { return str(x.usuario).toLowerCase() === usuario; });
      var ativo = req.ativo === false ? false : true;
      if (!ex && senha.length < 6) throw erro('A senha deve ter pelo menos 6 caracteres.');
      if (senha && senha.length < 6) throw erro('A senha deve ter pelo menos 6 caracteres.');
      var adminsAtivos = users.filter(function (x) {
        return str(x.perfil) === PERFIS.APURACAO && bool(x.ativo) && str(x.usuario).toLowerCase() !== usuario;
      }).length;
      if (adminsAtivos === 0 && (perfil !== PERFIS.APURACAO || !ativo)) throw erro('Deve existir pelo menos um usuário de Apuração ativo.');
      var salt = ex && !senha ? str(ex.salt) : sha256(db.uuid()).substr(0, 16);
      var hash = ex && !senha ? str(ex.hash) : hashSenha(salt, senha);
      var obj = { usuario: usuario, perfil: perfil, salt: salt, hash: hash, ativo: ativo ? 'TRUE' : 'FALSE', criado_em: ex ? str(ex.criado_em) : db.stamp() };
      if (ex) db.update('USUARIOS', ex._row, obj); else db.append('USUARIOS', obj);
      log(db, u.usuario, ex ? 'EDITAR_USUARIO' : 'CRIAR_USUARIO', usuario + (senha ? ' (senha alterada)' : ''));
      return { usuario: usuario };
    });
  };

  ACOES['apuracao.excluirUsuario'] = function (db, req) {
    var u = exigeApuracao(db, req);
    var usuario = str(req.usuario).toLowerCase();
    if (usuario === u.usuario) throw erro('Você não pode excluir o seu próprio usuário.');
    return db.lock(function () {
      var users = db.read('USUARIOS');
      var ex = find(users, function (x) { return str(x.usuario).toLowerCase() === usuario; });
      if (!ex) throw erro('Usuário não encontrado.');
      db.remove('USUARIOS', ex._row);
      log(db, u.usuario, 'EXCLUIR_USUARIO', usuario);
      return { usuario: usuario };
    });
  };

  /* ================================================================== */
  /* APURAÇÃO TSE — resultado oficial, partidos/candidatos e histórico   */
  /* ================================================================== */
  function slug(v) { return norm(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
  function idPartidoTse(sigla) { return 'p-' + (slug(sigla) || 'x'); }
  function idCandidatoTse(numero, nome) { var n = digits(numero); return n ? 'num-' + n : 'nome-' + (slug(nome) || 'x'); }
  function numOuZero(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  function mapTsePartidos(db) {
    return db.read('TSE_PARTIDOS').map(function (r) {
      return { id: str(r.id), sigla: str(r.sigla), agremiacao: str(r.agremiacao), votos: numOuZero(r.votos), origem: str(r.origem), atualizado_em: str(r.atualizado_em), _row: r._row };
    });
  }
  function mapTseCandidatos(db) {
    return db.read('TSE_CANDIDATOS').map(function (r) {
      return { id: str(r.id), numero: digits(r.numero), nome: str(r.nome), partido: str(r.partido), situacao: str(r.situacao), votos: numOuZero(r.votos), origem: str(r.origem), atualizado_em: str(r.atualizado_em), _row: r._row };
    });
  }
  function mapTseHistorico(db) {
    return db.read('TSE_HISTORICO').map(function (r) {
      var pct = r.candidato_pct_qe === '' || r.candidato_pct_qe === null ? null : Number(r.candidato_pct_qe);
      var cv = r.candidato_votos === '' || r.candidato_votos === null ? null : Number(r.candidato_votos);
      return { t: str(r.t), votosValidos: numOuZero(r.votos_validos), QE: numOuZero(r.qe), vagasDoPartido: numOuZero(r.vagas_partido),
        candidatoVotos: isFinite(cv) ? cv : null, candidatoPctQE: isFinite(pct) ? pct : null, marco: str(r.marco), _row: r._row };
    });
  }
  function gravarConfigInterna(db, chave, valor) {
    var rows = db.read('CONFIG');
    var r = find(rows, function (x) { return str(x.chave) === chave; });
    var desc = (find(CONFIG_PADRAO, function (c) { return c[0] === chave; }) || [0, 0, ''])[2];
    if (r) db.update('CONFIG', r._row, { chave: chave, valor: valor, descricao: str(r.descricao) || desc });
    else db.append('CONFIG', { chave: chave, valor: valor, descricao: desc });
  }

  /* Arquivo do TSE: carg → agr → par → cand (cargo → agremiação → partido → candidato).
   * Mantém a agremiação quando ela reúne mais de um partido (federação), para o cálculo de vagas. */
  function extrairCandidatoTse(c, siglaPartidoPai) {
    return {
      numero: String(c.n != null ? c.n : (c.numero != null ? c.numero : '')),
      nome: c.nm || c.nome || c.nmu || '',
      partido: c.sg || c.partido || siglaPartidoPai || '',
      situacao: c.st || c.situacao || '',
      votos: Number(c.vap != null ? c.vap : (c.votos != null ? c.votos : 0))
    };
  }
  function extrairPartidoTse(p, agremiacao) {
    var votosNominais = Number(p.tvan != null ? p.tvan : (p.tvtn != null ? p.tvtn : 0));
    var votosLegenda = Number(p.tval != null ? p.tval : (p.tvtl != null ? p.tvtl : 0));
    return { sigla: p.sg || p.sigla || p.nm || '', agremiacao: agremiacao || '', votos: votosNominais + votosLegenda };
  }
  function normalizarResultadoTse(raw) {
    var candidatos = [], partidos = [];
    (raw.carg || []).forEach(function (cg) {
      (cg.agr || []).forEach(function (agr) {
        var pars = agr.par || [];
        var nomeAgr = pars.length > 1 ? (agr.nm || agr.sg || pars.map(function (p) { return p.sg || p.sigla || ''; }).join('/')) : '';
        pars.forEach(function (p) {
          partidos.push(extrairPartidoTse(p, nomeAgr));
          (p.cand || []).forEach(function (c) { candidatos.push(extrairCandidatoTse(c, p.sg || p.sigla)); });
        });
      });
    });
    candidatos = candidatos.filter(function (c) { return c.numero; });
    partidos = partidos.filter(function (p) { return p.sigla; });
    if (!candidatos.length && !partidos.length) throw erro('Não consegui reconhecer nenhum candidato/partido no arquivo do TSE.');
    var secoesNaoTotalizadas = raw.snt != null ? raw.snt : (raw.perst != null ? raw.perst : null);
    return {
      atualizadoEm: raw.dg && raw.hg ? (raw.dg + ' ' + raw.hg) : '',
      secoesTotalizadas: raw.pst || (secoesNaoTotalizadas != null ? (Number(secoesNaoTotalizadas) === 0 ? 'totalização final' : secoesNaoTotalizadas + ' seção(ões) ainda não totalizada(s)') : ''),
      candidatos: candidatos,
      partidos: partidos
    };
  }

  function exigeApuracaoTse(db, req) { return autenticar(db, req.token, [PERFIS.APURACAO]); }

  ACOES['tse.dados'] = function (db, req) {
    exigeApuracaoTse(db, req);
    var cfg = lerConfig(db);
    return {
      config: configPublica(cfg), tse_atualizado_em: str(cfg.tse_atualizado_em), tse_situacao: str(cfg.tse_situacao),
      tse_aplicado_em: str(cfg.tse_aplicado_em), tse_aplicado_por: str(cfg.tse_aplicado_por),
      partidos: mapTsePartidos(db).map(strip), candidatos: mapTseCandidatos(db).map(strip),
      historico: mapTseHistorico(db).map(strip), agora: db.stamp()
    };
  };

  /* Busca no TSE e devolve só a PRÉVIA (nada é gravado aqui) */
  ACOES['tse.buscar'] = function (db, req) {
    exigeApuracaoTse(db, req);
    var url = str(lerConfig(db).tse_url);
    if (!url) throw erro('A URL do resultado do TSE ainda não foi configurada.');
    if (!db.fetchJson) throw erro('A busca no TSE não está disponível neste ambiente.');
    var resp = db.fetchJson(url);
    if (resp.status !== 200) throw erro('O TSE respondeu ' + resp.status + ' para essa URL — os dados podem ainda não estar publicados.');
    var raw;
    try { raw = JSON.parse(resp.text); } catch (e) { throw erro('A resposta do TSE não veio em JSON válido — o formato pode ter mudado.'); }
    return { preview: normalizarResultadoTse(raw) };
  };

  /* Aplica a prévia: grava partidos e candidatos sempre com id fixo (sem duplicar se repetir) */
  ACOES['tse.aplicar'] = function (db, req) {
    var u = exigeApuracaoTse(db, req);
    var partidos = Array.isArray(req.partidos) ? req.partidos : [], candidatos = Array.isArray(req.candidatos) ? req.candidatos : [];
    if (!partidos.length && !candidatos.length) throw erro('A prévia está vazia.');
    if (partidos.length > 200 || candidatos.length > 3000) throw erro('Prévia grande demais.');
    return db.lock(function () {
      var agora = db.stamp();
      var ps = {}, ordemP = [];
      mapTsePartidos(db).forEach(function (p) { ps[p.id] = p; ordemP.push(p.id); });
      partidos.forEach(function (p) {
        var sigla = str(p.sigla).toUpperCase().substr(0, 60); if (!sigla) return;
        var id = idPartidoTse(sigla);
        if (!ps[id]) ordemP.push(id);
        ps[id] = { id: id, sigla: sigla, agremiacao: str(p.agremiacao).substr(0, 120), votos: numOuZero(p.votos), origem: 'TSE', atualizado_em: agora };
      });
      var cs = {}, ordemC = [];
      mapTseCandidatos(db).forEach(function (c) { cs[c.id] = c; ordemC.push(c.id); });
      candidatos.forEach(function (c) {
        var numero = digits(c.numero).substr(0, 8); if (!numero) return;
        var id = idCandidatoTse(numero);
        if (!cs[id]) ordemC.push(id);
        cs[id] = { id: id, numero: numero, nome: str(c.nome).substr(0, 80) || ('Candidato ' + numero), partido: str(c.partido).toUpperCase().substr(0, 120),
          situacao: str(c.situacao).substr(0, 40), votos: numOuZero(c.votos), origem: 'TSE', atualizado_em: agora };
      });
      db.replaceAll('TSE_PARTIDOS', ordemP.map(function (id) { return strip(ps[id]); }));
      db.replaceAll('TSE_CANDIDATOS', ordemC.map(function (id) { return strip(cs[id]); }));
      gravarConfigInterna(db, 'tse_atualizado_em', str(req.atualizadoEm).substr(0, 40) || agora);
      gravarConfigInterna(db, 'tse_situacao', str(req.secoesTotalizadas).substr(0, 80));
      gravarConfigInterna(db, 'tse_aplicado_em', agora);
      gravarConfigInterna(db, 'tse_aplicado_por', u.usuario);
      log(db, u.usuario, 'TSE_APLICAR', partidos.length + ' partidos, ' + candidatos.length + ' candidatos');
      return { partidos: ordemP.length, candidatos: ordemC.length };
    });
  };

  ACOES['tse.salvarPartido'] = function (db, req) {
    var u = exigeApuracaoTse(db, req);
    var sigla = str(req.sigla).toUpperCase().substr(0, 60);
    if (!sigla) throw erro('Informe a sigla do partido.');
    var votos = int(req.votos);
    if (isNaN(votos) || votos < 0 || votos > 99999999) throw erro('Quantidade de votos inválida.');
    return db.lock(function () {
      var lista = mapTsePartidos(db), id = idPartidoTse(sigla);
      var antigo = req.id ? find(lista, function (p) { return p.id === str(req.id); }) : null;
      var conflito = find(lista, function (p) { return p.id === id && (!antigo || p.id !== antigo.id); });
      if (conflito) throw erro('Esse partido já está na lista.');
      var obj = { id: id, sigla: sigla, agremiacao: str(req.agremiacao).substr(0, 120), votos: votos, origem: 'MANUAL', atualizado_em: db.stamp() };
      if (antigo) db.update('TSE_PARTIDOS', antigo._row, obj); else db.append('TSE_PARTIDOS', obj);
      log(db, u.usuario, 'TSE_PARTIDO', sigla + ' ' + votos);
      return { id: id };
    });
  };
  ACOES['tse.excluirPartido'] = function (db, req) {
    var u = exigeApuracaoTse(db, req);
    return db.lock(function () {
      var p = find(mapTsePartidos(db), function (x) { return x.id === str(req.id); });
      if (!p) throw erro('Partido não encontrado.');
      db.remove('TSE_PARTIDOS', p._row);
      log(db, u.usuario, 'TSE_EXCLUIR_PARTIDO', p.sigla);
      return { id: p.id };
    });
  };
  ACOES['tse.salvarCandidato'] = function (db, req) {
    var u = exigeApuracaoTse(db, req);
    var nome = str(req.nome).toUpperCase().substr(0, 80), numero = digits(req.numero).substr(0, 8);
    if (!nome && !numero) throw erro('Informe o nome ou o número do candidato.');
    var votos = int(req.votos);
    if (isNaN(votos) || votos < 0 || votos > 9999999) throw erro('Quantidade de votos inválida.');
    return db.lock(function () {
      var lista = mapTseCandidatos(db), id = idCandidatoTse(numero, nome);
      var antigo = req.id ? find(lista, function (c) { return c.id === str(req.id); }) : null;
      var conflito = find(lista, function (c) { return c.id === id && (!antigo || c.id !== antigo.id); });
      if (conflito) throw erro('Esse candidato já está na lista.');
      var obj = { id: id, numero: numero, nome: nome || ('CANDIDATO ' + numero), partido: str(req.partido).toUpperCase().substr(0, 120),
        situacao: antigo ? antigo.situacao : '', votos: votos, origem: 'MANUAL', atualizado_em: db.stamp() };
      if (antigo) db.update('TSE_CANDIDATOS', antigo._row, obj); else db.append('TSE_CANDIDATOS', obj);
      log(db, u.usuario, 'TSE_CANDIDATO', (numero || nome) + ' ' + votos);
      return { id: id };
    });
  };
  ACOES['tse.excluirCandidato'] = function (db, req) {
    var u = exigeApuracaoTse(db, req);
    return db.lock(function () {
      var c = find(mapTseCandidatos(db), function (x) { return x.id === str(req.id); });
      if (!c) throw erro('Candidato não encontrado.');
      db.remove('TSE_CANDIDATOS', c._row);
      log(db, u.usuario, 'TSE_EXCLUIR_CANDIDATO', c.numero + ' ' + c.nome);
      return { id: c.id };
    });
  };
  /* Carrega candidatos da lista de aptos (votos = 0); quem já existe fica como está */
  ACOES['tse.carregarCandidatos'] = function (db, req) {
    var u = exigeApuracaoTse(db, req);
    var lista = Array.isArray(req.lista) ? req.lista.slice(0, 1000) : [];
    if (!lista.length) throw erro('Nenhum candidato para carregar.');
    return db.lock(function () {
      var atuais = mapTseCandidatos(db), ids = {}, novos = [];
      atuais.forEach(function (c) { ids[c.id] = true; });
      lista.forEach(function (c) {
        var numero = digits(c.numero).substr(0, 8), nome = str(c.nome).toUpperCase().substr(0, 80);
        if (!numero && !nome) return;
        var id = idCandidatoTse(numero, nome);
        if (ids[id]) return;
        ids[id] = true;
        novos.push({ id: id, numero: numero, nome: nome, partido: str(c.partido).toUpperCase().substr(0, 120), situacao: 'APTO', votos: 0, origem: 'LISTA', atualizado_em: db.stamp() });
      });
      if (novos.length) db.replaceAll('TSE_CANDIDATOS', atuais.map(strip).concat(novos));
      log(db, u.usuario, 'TSE_CARREGAR_CANDIDATOS', novos.length + ' novos');
      return { adicionados: novos.length, existentes: lista.length - novos.length };
    });
  };

  /* Histórico: no máx. 150 pontos; sem "forçar", um ponto a menos de 2 min do último o substitui */
  var MAX_PONTOS_HISTORICO = 150, INTERVALO_MIN_SNAPSHOT_MS = 2 * 60 * 1000;
  function msDe(stamp) { var m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(str(stamp)); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0; }
  ACOES['tse.registrar'] = function (db, req) {
    var u = exigeApuracaoTse(db, req);
    var p = req.ponto || {};
    var num = function (v) { var n = Number(v); return v === null || v === undefined || v === '' || !isFinite(n) ? '' : n; };
    var marcos = { 'eleito': 1, 'fora-faixa': 1, 'abaixo-clausula': 1, 'sem-candidato': 1, 'sem-dados': 1 };
    return db.lock(function () {
      var ponto = { t: db.stamp(), votos_validos: num(p.votosValidos), qe: num(p.QE), vagas_partido: num(p.vagasDoPartido),
        candidato_votos: num(p.candidatoVotos), candidato_pct_qe: num(p.candidatoPctQE), marco: marcos[str(p.marco)] ? str(p.marco) : '' };
      var pontos = mapTseHistorico(db), ultimo = pontos[pontos.length - 1], substituiu = false;
      if (!req.forcar && ultimo && (msDe(ponto.t) - msDe(ultimo.t)) < INTERVALO_MIN_SNAPSHOT_MS) { db.update('TSE_HISTORICO', ultimo._row, ponto); substituiu = true; }
      else db.append('TSE_HISTORICO', ponto);
      var todos = mapTseHistorico(db);
      if (todos.length > MAX_PONTOS_HISTORICO) {
        todos.slice(0, todos.length - MAX_PONTOS_HISTORICO).sort(function (a, b) { return b._row - a._row; })
          .forEach(function (x) { db.remove('TSE_HISTORICO', x._row); });
      }
      if (req.forcar) log(db, u.usuario, 'TSE_REGISTRAR', ponto.marco);
      return { substituiu: substituiu };
    });
  };
  ACOES['tse.limparHistorico'] = function (db, req) {
    var u = exigeApuracaoTse(db, req);
    return db.lock(function () { db.replaceAll('TSE_HISTORICO', []); log(db, u.usuario, 'TSE_LIMPAR_HISTORICO', ''); return {}; });
  };

  /* ------------------------------------------------------------------ */
  /* Instalação inicial                                                   */
  /* ------------------------------------------------------------------ */
  function instalar(db, senhas) {
    var cfgRows = db.read('CONFIG');
    CONFIG_PADRAO.forEach(function (c) {
      if (!find(cfgRows, function (r) { return str(r.chave) === c[0]; })) db.append('CONFIG', { chave: c[0], valor: c[1], descricao: c[2] });
    });
    if (db.read('LOCAIS').length === 0) {
      SEED.forEach(function (item, i) {
        var lid = 'L' + (i + 1 < 10 ? '0' : '') + (i + 1);
        db.append('LOCAIS', { id: lid, municipio: 'ANCHIETA', nome: item[0], ativo: 'TRUE' });
        item[1].forEach(function (n) { db.append('SECOES', rowSec({ id: 'S' + n, local_id: lid, numero: String(n), ativo: true, aptos: APTOS_SEED[n] || 0 })); });
      });
    }
    completarAptos(db);
    var users = db.read('USUARIOS');
    [['apuracao', PERFIS.APURACAO, senhas.apuracao], ['partido', PERFIS.PARTIDO, senhas.partido]].forEach(function (x) {
      var ex = find(users, function (u) { return str(u.usuario).toLowerCase() === x[0]; });
      var salt = sha256(db.uuid()).substr(0, 16);
      var obj = { usuario: x[0], perfil: x[1], salt: salt, hash: hashSenha(salt, x[2]), ativo: 'TRUE', criado_em: ex ? str(ex.criado_em) : db.stamp() };
      if (ex) db.update('USUARIOS', ex._row, obj); else db.append('USUARIOS', obj);
    });
    segredo(db);
  }

  /* ------------------------------------------------------------------ */
  /* Ponto de entrada                                                     */
  /* ------------------------------------------------------------------ */
  function handle(db, req) {
    try {
      req = req || {};
      var fn = ACOES[req.action];
      if (!fn) throw erro('Ação desconhecida: ' + req.action);
      var r = fn(db, req) || {};
      r.ok = true;
      return r;
    } catch (e) {
      return { ok: false, erro: e.publico ? e.message : ('Erro interno: ' + (e && e.message ? e.message : e)) };
    }
  }

  return {
    SCHEMA: SCHEMA, STATUS: STATUS, PERFIS: PERFIS, SEED: SEED, CONFIG_PADRAO: CONFIG_PADRAO,
    handle: handle, instalar: instalar, resolverUrnas: resolverUrnas, completarAptos: completarAptos, normalizarResultadoTse: normalizarResultadoTse,
    sha256: sha256, hmac: hmac, norm: norm, int: int,
    ehTotal: function (l) { return /^TOT-/.test(String(l && l.secao_id || '')); }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Core;
