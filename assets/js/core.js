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
    SECOES: ['id', 'local_id', 'numero', 'ativo'],
    LANCAMENTOS: ['id', 'client_id', 'recebido_em', 'origem', 'nome', 'telefone', 'municipio',
      'local_id', 'local', 'secao_id', 'secao', 'votos', 'votos_informados', 'foto_id',
      'status', 'validado_por', 'validado_em', 'obs'],
    USUARIOS: ['usuario', 'perfil', 'salt', 'hash', 'ativo', 'criado_em'],
    LOG: ['data', 'usuario', 'acao', 'detalhe']
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
    ['alerta_votos_max', '400', 'Avisa o fiscal se digitar mais votos que isto em uma seção'],
    ['pasta_fotos_id', '', 'ID da pasta do Google Drive com as fotos (preenchido automaticamente)']
  ];
  var CONFIG_INTERNA = { pasta_fotos_id: true };

  /* Locais e seções de Anchieta (base: eleição 2024) */
  var SEED = [
    ['ALTO PONGAL', [28, 29, 73]],
    ['AMARILIS', [6, 10, 33, 35, 40, 57, 60, 140]],
    ['BAIXO PONGAL', [23, 50]],
    ['TOM E JERRY (BELMIRO) - IRIRI', [66, 79]],
    ['BELO HORIZONTE', [14]],
    ['CASTELHANOS', [68, 137]],
    ['CHAPADA DO Á', [16, 75]],
    ['CORONEL', [3, 4, 7, 8, 69, 83, 138, 170]],
    ['CÓRREGO DA PRATA', [27]],
    ['DOIS IRMÃOS DE PONGAL', [30]],
    ['DUAS BARRAS', [19]],
    ['FRANCISCO GIUSTI', [67, 77]],
    ['GOEMBÊ', [15, 78]],
    ['ITAPEROROMA BAIXA', [22, 72]],
    ['ITAPEÚNA', [24]],
    ['JABAQUARA', [17, 18, 38]],
    ['JABAQUARA (ITAJOBAIA)', [144]],
    ['JOCELINA NOGUEIRA', [44, 46, 48, 51, 54, 63, 133]],
    ['JOEBA', [31]],
    ['LIMEIRA', [43, 62]],
    ['MÃE-BÁ', [13, 41, 53, 71]],
    ['MANOEL DE PAULA SERRÃO - IRIRI', [25, 26, 36, 42, 49, 55, 141]],
    ['NOVO HORIZONTE', [132, 168]],
    ['NOVO HORIZONTE (TEREZINHA GODOY)', [1, 2, 5, 9, 32, 34, 39, 47, 56, 139]],
    ['OLIVÂNIA', [20, 74]],
    ['PARATI', [64, 146]],
    ['PLANALTO/NOVA ANCHIETA', [65, 80, 142, 147, 169]],
    ['PONTA DOS CASTELHANOS', [58, 61, 82]],
    ['RECANTO DO SOL', [52, 59, 81]],
    ['SIMPATIA', [21, 37, 130]],
    ['TIU LILIU', [70, 128]],
    ['UBU', [11, 12, 45]]
  ];

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
      return { id: str(r.id), local_id: str(r.local_id), numero: str(r.numero), ativo: bool(r.ativo), _row: r._row };
    });
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
    if (isNaN(votos) || votos < 0 || votos > 9999) throw erro('Quantidade de votos inválida.');
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

  ACOES['login'] = function (db, req) {
    var usuario = str(req.usuario).toLowerCase();
    var user = find(db.read('USUARIOS'), function (u) { return str(u.usuario).toLowerCase() === usuario; });
    if (!user || !bool(user.ativo) || hashSenha(str(user.salt), str(req.senha)) !== str(user.hash)) {
      log(db, usuario, 'LOGIN_FALHOU', '');
      throw erro('Usuário ou senha incorretos.');
    }
    if (req.perfil && str(user.perfil) !== req.perfil && !(req.perfil === PERFIS.PARTIDO && str(user.perfil) === PERFIS.APURACAO)) {
      throw erro('Este usuário não tem acesso a esta área.');
    }
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
        if (isNaN(v) || v < 0 || v > 9999) throw erro('Quantidade de votos inválida.');
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
    db.append('SECOES', { id: s.id, local_id: localId, numero: num, ativo: 'TRUE' });
    return s;
  }

  ACOES['apuracao.lancar'] = function (db, req) {
    var u = exigeApuracao(db, req);
    var votos = int(req.votos);
    if (isNaN(votos) || votos < 0 || votos > 9999) throw erro('Quantidade de votos inválida.');
    var foto = str(req.foto);
    if (foto && !/^data:image\/(jpeg|png|webp);base64,/.test(foto)) throw erro('Formato de foto inválido.');
    var cfg = lerConfig(db);
    var fotoId = foto ? db.saveFoto(foto, 'BU_manual_' + db.stamp().replace(/\D/g, '') + '.jpg', cfg) : '';
    return db.lock(function () {
      var local = obterOuCriarLocal(db, req.municipio, req.local);
      var secao = obterOuCriarSecao(db, local.id, req.secao);
      var novo = {
        id: 'M' + db.uuid().replace(/-/g, '').substr(0, 10).toUpperCase(), client_id: str(req.client_id).substr(0, 60),
        recebido_em: db.stamp(), origem: 'APURACAO', nome: str(req.nome).substr(0, 80) || ('Lançado por ' + u.usuario),
        telefone: digits(req.telefone).substr(0, 13), municipio: local.municipio, local_id: local.id, local: local.nome,
        secao_id: secao.id, secao: secao.numero, votos: votos, votos_informados: votos, foto_id: fotoId,
        status: STATUS.VALIDADO, validado_por: u.usuario, validado_em: db.stamp(), obs: str(req.obs).substr(0, 200)
      };
      db.append('LANCAMENTOS', rowLanc(novo));
      var lancs = mapLancamentos(db);
      var gravado = find(lancs, function (x) { return x.id === novo.id; });
      descartarOutros(db, lancs, gravado, u.usuario);
      log(db, u.usuario, 'LANCAMENTO_MANUAL', novo.id + ' ' + local.municipio + ' / ' + local.nome + ' seção ' + secao.numero + ' votos ' + votos);
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
      if (req.id) {
        var s = find(secoes, function (x) { return x.id === str(req.id); });
        if (!s) throw erro('Seção não encontrada.');
        db.update('SECOES', s._row, { id: s.id, local_id: local.id, numero: String(num), ativo: req.ativo === false ? 'FALSE' : 'TRUE' });
        log(db, u.usuario, 'EDITAR_SECAO', s.id + ' nº ' + num);
        return { id: s.id };
      }
      var id = 'S' + db.uuid().replace(/-/g, '').substr(0, 8).toUpperCase();
      db.append('SECOES', { id: id, local_id: local.id, numero: String(num), ativo: req.ativo === false ? 'FALSE' : 'TRUE' });
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
  ACOES['apuracao.importar'] = function (db, req) {
    var u = exigeApuracao(db, req);
    var mun = str(req.municipio).toUpperCase();
    if (!mun) throw erro('Informe o município.');
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
        item[1].forEach(function (n) { db.append('SECOES', { id: 'S' + n, local_id: lid, numero: String(n), ativo: 'TRUE' }); });
      });
    }
    var users = db.read('USUARIOS');
    [['apuracao', PERFIS.APURACAO, senhas.apuracao], ['partido', PERFIS.PARTIDO, senhas.partido]].forEach(function (x) {
      if (find(users, function (u) { return str(u.usuario).toLowerCase() === x[0]; })) return;
      var salt = sha256(db.uuid()).substr(0, 16);
      db.append('USUARIOS', { usuario: x[0], perfil: x[1], salt: salt, hash: hashSenha(salt, x[2]), ativo: 'TRUE', criado_em: db.stamp() });
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
    handle: handle, instalar: instalar, resolverUrnas: resolverUrnas,
    sha256: sha256, hmac: hmac, norm: norm, int: int
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Core;
