/* AVISOS DISCRETOS (canto inferior direito) quando a situação do candidato muda no Resultado TSE.
 * Liga/desliga em Apuração (chave "Avisos de mudança"). Sem som. Usado em: Apuração TSE, Painel da
 * Apuração, Telão TSE e telas do candidato. Depende de Core, Tse (tse-logica.js) e App. */
var TseAviso = (function () {
  'use strict';
  var CHAVE = 'fp_tse_aviso_' + location.pathname.replace(/[^a-z0-9]/gi, '_');
  var timer = null;

  function caixa() {
    var c = document.getElementById('tse-avisos');
    if (!c) { c = document.createElement('div'); c.id = 'tse-avisos'; c.className = 'tse-avisos'; c.setAttribute('aria-live', 'polite'); document.body.appendChild(c); }
    return c;
  }
  function mostrar(tipo, titulo, detalhe) {
    var c = caixa(), el = document.createElement('div');
    el.className = 'tse-aviso ' + (tipo === 'bom' ? 'bom' : 'ruim');
    el.innerHTML = '<span class="ta-seta">' + (tipo === 'bom' ? '▲' : '▼') + '</span><div><b>' + App.h(titulo) + '</b><span>' + App.h(detalhe) + '</span></div>' +
      '<button type="button" aria-label="Fechar">×</button>';
    el.querySelector('button').onclick = function () { fechar(el); };
    c.appendChild(el);
    while (c.children.length > 3) c.removeChild(c.firstChild);
    setTimeout(function () { fechar(el); }, document.body.classList.contains('pg-telao') ? 25000 : 15000);
  }
  function fechar(el) { if (!el.parentNode) return; el.classList.add('saindo'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 350); }

  function estadoDe(dados) {
    var c = Tse.calcular(dados), st = c.st;
    if (st.kind !== 'com-dados' || !st.nosso) return null;
    return { eleito: !!st.nosso.eleito, vagas: st.vagasDoPartido, clausula: !!st.nosso.passaClausula, posicao: st.candidatos.indexOf(st.nosso) + 1,
      nome: dados.config.candidato_nome || 'Fabricio Petri', partido: c.grupoNosso.nome };
  }
  function ler() { try { return JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { return null; } }
  function gravar(x) { try { localStorage.setItem(CHAVE, JSON.stringify(x)); } catch (e) { /* ok */ } }

  /* compara com a última situação vista nesta tela e avisa o que mudou */
  function verificar(dados) {
    if (!dados || !dados.config || !dados.partidos) return;
    var novo = estadoDe(dados);
    if (!novo) return;
    var ant = ler();
    gravar(novo);
    if (!ant || String(dados.config.tse_avisos).toUpperCase() !== 'TRUE') return;
    var p = dados.tse_pct_secoes, quando = (p !== null && p !== undefined && !isNaN(p) ? Number(p).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% das seções · ' : '') +
      new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date());
    if (ant.eleito !== novo.eleito) mostrar(novo.eleito ? 'bom' : 'ruim', novo.eleito ? novo.nome + ' entrou na projeção de eleitos' : novo.nome + ' saiu da projeção de eleitos', quando);
    if (ant.vagas !== novo.vagas) mostrar(novo.vagas > ant.vagas ? 'bom' : 'ruim', novo.partido + (novo.vagas > ant.vagas ? ' ganhou vaga: ' : ' perdeu vaga: ') + ant.vagas + ' → ' + novo.vagas, quando);
    if (ant.clausula !== novo.clausula) mostrar(novo.clausula ? 'bom' : 'ruim', novo.clausula ? novo.nome + ' passou da cláusula (10% do quociente)' : novo.nome + ' ficou abaixo da cláusula', quando);
    if (ant.posicao !== novo.posicao) mostrar(novo.posicao < ant.posicao ? 'bom' : 'ruim', novo.nome + (novo.posicao < ant.posicao ? ' subiu para ' : ' caiu para ') + novo.posicao + 'º no ' + novo.partido, quando);
  }

  /* para telas que não carregam o TSE sozinhas: busca de tempos em tempos só se os avisos estiverem ligados */
  function monitorar(ligado, buscar, segundos) {
    clearInterval(timer);
    function rodar() {
      if (document.hidden || !ligado()) return;
      buscar().then(verificar).catch(function () { /* silencioso: aviso é opcional */ });
    }
    timer = setInterval(rodar, (segundos || 60) * 1000);
    setTimeout(rodar, 3000);
  }

  return { verificar: verificar, monitorar: monitorar, mostrar: mostrar };
})();

/* CONTADOR da atualização automática: "Próxima atualização do TSE em 4:32".
 * Conta a partir da última execução do agendamento de 5 minutos do Apps Script (tse_auto_agendado),
 * usando o relógio do servidor (r.agora) para não depender do relógio do computador.
 * Uso: TseContador.atualizar(dados) a cada carga; os elementos com [data-tse-contador] são preenchidos. */
var TseContador = (function () {
  'use strict';
  var CICLO = 5 * 60000, TOLERANCIA = 3 * 60000;
  var base = 0, ligado = false, ajuste = 0, timer = null;
  function ms(st) { var m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(String(st || '')); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0; }
  function mmss(t) { var s = Math.max(0, Math.ceil(t / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function atualizar(dados) {
    if (!dados || !dados.config) return;
    ligado = String(dados.config.tse_auto).toUpperCase() === 'TRUE';
    base = ms(dados.tse_auto_agendado) || ms(dados.tse_auto_ultima);
    var srv = ms(dados.agora); ajuste = srv ? srv - Date.now() : 0;
    pintar();
    if (!timer) timer = setInterval(pintar, 1000);
  }
  function estado() {
    if (!ligado) return null;
    if (!base) return { texto: 'Atualização automática: aguardando a primeira verificação', classe: 'espera', frac: 0 };
    var agora = Date.now() + ajuste, falta = base + CICLO - agora;
    // a página pode ter ficado aberta vários ciclos: pula para o próximo horário provável
    if (falta < -TOLERANCIA) {
      var ciclos = Math.ceil(-falta / CICLO);
      if (ciclos > 3) return { texto: 'Atualização automática sem resposta do agendamento', classe: 'erro', frac: 0 };
      falta += ciclos * CICLO;
    }
    if (falta <= 0) return { texto: 'Verificando o TSE agora…', classe: 'agora', frac: 1 };
    return { texto: 'Próxima atualização do TSE em ', tempo: mmss(falta), classe: '', frac: 1 - falta / CICLO };
  }
  function pintar() {
    var els = document.querySelectorAll('[data-tse-contador]');
    if (!els.length) return;
    var e = estado();
    Array.prototype.forEach.call(els, function (el) {
      el.hidden = !e;
      if (!e) return;
      el.className = 'tse-contador' + (e.classe ? ' ' + e.classe : '') + (el.dataset.tseContador ? ' ' + el.dataset.tseContador : '');
      el.title = 'O sistema busca o resultado do TSE sozinho a cada 5 minutos. O horário é aproximado: o Google pode atrasar alguns segundos.';
      el.innerHTML = '<span class="tc-txt">' + e.texto + (e.tempo ? '<b>' + e.tempo + '</b>' : '') + '</span><i style="width:' + Math.round(e.frac * 100) + '%"></i>';
    });
  }
  return { atualizar: atualizar };
})();
