/* Painel de resultados — usado pela Apuração e pelo Partido */
var Painel = (function () {
  'use strict';
  var $ = App.$, h = App.h, ICON = App.ICON;
  var COR_VAL = '#0072b0', COR_PEN = '#e86100', COR_SEM = '#dfe9ef', TINTA = '#4b6576', GRADE = '#e6eef2';

  function hachura(ctx) {
    var c = document.createElement('canvas'); c.width = 10; c.height = 10;
    var g = c.getContext('2d');
    g.fillStyle = '#ff9a4d'; g.fillRect(0, 0, 10, 10);
    g.strokeStyle = COR_PEN; g.lineWidth = 4; g.beginPath();
    g.moveTo(-2, 12); g.lineTo(12, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(8, 12); g.lineTo(12, 8); g.stroke();
    return ctx.createPattern(c, 'repeat');
  }

  /* Escreve o total na ponta de cada barra (rótulo direto) */
  var rotuloTotal = {
    id: 'rotuloTotal',
    afterDatasetsDraw: function (chart) {
      var g = chart.ctx, metas = chart.data.datasets.map(function (d, i) { return chart.getDatasetMeta(i); });
      var n = chart.data.labels.length;
      g.save(); g.font = '700 12px Montserrat, sans-serif'; g.fillStyle = '#0d2b3e'; g.textBaseline = 'middle';
      for (var i = 0; i < n; i++) {
        var total = 0, xMax = 0, y = 0;
        metas.forEach(function (m, di) {
          if (m.hidden) return;
          var v = chart.data.datasets[di].data[i] || 0; total += v;
          var el = m.data[i]; if (el) { xMax = Math.max(xMax, el.x); y = el.y; }
        });
        if (total > 0) g.fillText(App.n(total), xMax + 6, y);
      }
      g.restore();
    }
  };

  function calcular(dados, municipio) {
    var cfg = dados.config || {};
    var principal = Core.norm(cfg.municipio_principal || 'ANCHIETA');
    var todos = municipio === '__TODOS__';
    var alvo = todos ? null : Core.norm(municipio || principal);
    var locais = {}; dados.locais.forEach(function (l) { locais[l.id] = l; });
    var noFiltro = function (mun) { return todos || Core.norm(mun) === alvo; };

    var porLocal = {};
    function linhaLocal(id, nome, mun) {
      if (!porLocal[id]) porLocal[id] = { id: id, nome: nome, municipio: mun, total: 0, val: 0, pen: 0, votosVal: 0, votosPen: 0, secoes: [] };
      return porLocal[id];
    }
    var urnaPorSecao = {};
    dados.urnas.forEach(function (u) { urnaPorSecao[u.secao_id] = u; });

    var totalUrnas = 0;
    dados.secoes.forEach(function (s) {
      var l = locais[s.local_id];
      if (!l || !noFiltro(l.municipio)) return;
      var u = urnaPorSecao[s.id];
      if (!s.ativo && !u) return;
      var r = linhaLocal(l.id, l.nome, l.municipio);
      r.secoes.push({ id: s.id, numero: s.numero, ativo: s.ativo, urna: u || null });
      if (s.ativo) { r.total++; totalUrnas++; }
    });
    var st = { votosVal: 0, votosPen: 0, urnasVal: 0, urnasPen: 0, totalUrnas: totalUrnas, eventos: [] };
    dados.urnas.forEach(function (u) {
      if (!noFiltro(u.municipio)) return;
      var r = porLocal[u.local_id] || linhaLocal(u.local_id, u.local, u.municipio);
      if (!r.secoes.some(function (s) { return s.id === u.secao_id; })) r.secoes.push({ id: u.secao_id, numero: u.secao, ativo: true, urna: u });
      if (u.status === 'VALIDADO') { r.val++; r.votosVal += u.votos; st.urnasVal++; st.votosVal += u.votos; }
      else { r.pen++; r.votosPen += u.votos; st.urnasPen++; st.votosPen += u.votos; }
      st.eventos.push(u);
    });
    // seções lançadas fora do cadastro contam no total
    Object.keys(porLocal).forEach(function (k) {
      var r = porLocal[k];
      var lancadas = r.val + r.pen;
      if (lancadas > r.total) { st.totalUrnas += lancadas - r.total; r.total = lancadas; }
      r.secoes.sort(function (a, b) { return Number(a.numero) - Number(b.numero); });
    });
    st.locais = Object.keys(porLocal).map(function (k) { return porLocal[k]; });
    st.apuradas = st.urnasVal + st.urnasPen;
    st.media = st.apuradas ? (st.votosVal + st.votosPen) / st.apuradas : 0;
    st.projecao = st.apuradas >= 5 ? Math.round(st.media * st.totalUrnas) : null;

    // outros municípios (fora do filtro atual)
    var outros = {};
    dados.urnas.forEach(function (u) {
      if (noFiltro(u.municipio)) return;
      var m = u.municipio || '—';
      outros[m] = outros[m] || { municipio: m, votos: 0, urnas: 0 };
      outros[m].votos += u.votos; outros[m].urnas++;
    });
    st.outros = Object.keys(outros).map(function (k) { return outros[k]; });
    return st;
  }

  function criar(raiz, opcoes) {
    opcoes = opcoes || {};
    var partido = opcoes.modo === 'partido';
    var graficos = {};
    var municipio = null, ultimo = null;

    raiz.innerHTML =
      '<div class="barra-filtro"><label class="sr-only" for="p-mun">Município</label>' +
      '<select class="input" id="p-mun"></select><span class="esp"></span>' +
      '<div class="legenda" style="margin:0"><span><i class="l-val"></i>Confirmados</span><span><i class="l-pen"></i>Em conferência</span><span><i class="l-sem"></i>Sem envio</span></div></div>' +
      '<div id="p-outros"></div>' +
      '<div class="kpis" id="p-kpis"></div>' +
      (partido ? '<div class="explica">' +
        '<div><i style="background:' + COR_VAL + '"></i><div><b>Confirmados</b>Conferidos pela apuração com a foto do boletim de urna. São os números oficiais da campanha.</div></div>' +
        '<div><i class="l-pen" style="background:repeating-linear-gradient(135deg,#e86100 0 3px,#ff9a4d 3px 6px)"></i><div><b>Em conferência</b>Já enviados pelos fiscais, mas ainda não conferidos. Podem mudar.</div></div></div>' : '') +
      '<div class="grade-painel">' +
      '<section class="card"><div class="card-titulo"><h3>Votos ao longo do tempo</h3><span class="muted tiny">acumulado</span></div><div class="grafico" style="height:260px"><canvas id="g-ritmo" aria-label="Gráfico de votos acumulados ao longo do tempo" role="img"></canvas></div></section>' +
      '<section class="card"><div class="card-titulo"><h3>Urnas</h3><span class="muted tiny" id="p-urnas-txt"></span></div><div class="grafico" style="height:260px"><canvas id="g-urnas" aria-label="Gráfico de urnas apuradas" role="img"></canvas></div></section>' +
      '</div>' +
      '<section class="card" style="margin-top:16px"><div class="card-titulo"><h3>Votos por local de votação</h3><span class="muted tiny">ordenado pelo total</span></div><div class="grafico" id="g-locais-box"><canvas id="g-locais" aria-label="Gráfico de votos por local de votação" role="img"></canvas></div></section>' +
      '<section class="card"><div class="card-titulo"><h3>Mapa das urnas</h3><span class="muted tiny">número da seção e votos</span></div><div class="mapa" id="p-mapa"></div></section>' +
      '<section class="card"><div class="card-titulo"><h3>Resumo por local</h3></div><div class="tabela-wrap"><table class="tabela responsiva" id="p-tabela"></table></div></section>';

    $('#p-mun', raiz).addEventListener('change', function () { municipio = this.value; if (ultimo) atualizar(ultimo); });

    function opcoesMunicipio(dados) {
      var cfg = dados.config || {};
      var principal = String(cfg.municipio_principal || 'ANCHIETA').toUpperCase();
      var muns = {}; muns[principal] = true;
      dados.urnas.forEach(function (u) { if (u.municipio) muns[u.municipio.toUpperCase()] = true; });
      dados.locais.forEach(function (l) { if (l.municipio && dados.secoes.some(function (s) { return s.local_id === l.id && s.ativo; })) muns[l.municipio.toUpperCase()] = true; });
      var lista = Object.keys(muns).sort(function (a, b) { return a === principal ? -1 : b === principal ? 1 : a.localeCompare(b, 'pt-BR'); });
      if (!municipio) municipio = principal;
      var sel = $('#p-mun', raiz);
      var html = lista.map(function (m) { return '<option value="' + h(m) + '">' + h(m) + '</option>'; }).join('') +
        (lista.length > 1 ? '<option value="__TODOS__">Todos os municípios</option>' : '');
      if (sel.innerHTML !== html) sel.innerHTML = html;
      sel.value = municipio;
      if (sel.value !== municipio) { municipio = principal; sel.value = principal; }
      sel.hidden = lista.length < 2;
    }

    function atualizar(dados) {
      ultimo = dados;
      opcoesMunicipio(dados);
      var st = calcular(dados, municipio);
      var nomeCand = (dados.config && dados.config.candidato_nome) || 'Fabricio Petri';

      // Outros municípios
      var outros = $('#p-outros', raiz);
      if (st.outros.length && municipio !== '__TODOS__') {
        var tot = st.outros.reduce(function (a, o) { return a + o.votos; }, 0);
        outros.innerHTML = '<div class="aviso aviso-info">' + ICON.info + '<div><b>Outros municípios: ' + App.n(tot) + ' votos</b>' +
          st.outros.map(function (o) { return h(o.municipio) + ' ' + App.n(o.votos) + ' (' + o.urnas + ' urna' + (o.urnas > 1 ? 's' : '') + ')'; }).join(' · ') +
          '. Escolha "Todos os municípios" para somar.</div></div>';
      } else outros.innerHTML = '';

      // KPIs
      var pctApur = st.totalUrnas ? st.apuradas / st.totalUrnas : 0;
      var k = '';
      k += '<div class="kpi destaque"><div class="rot">Votos confirmados</div><div class="val num">' + App.n(st.votosVal) + '</div>' +
        '<div class="det">' + (st.votosPen ? '+ ' + App.n(st.votosPen) + ' em conferência = ' + App.n(st.votosVal + st.votosPen) + ' no total' : 'nenhum voto em conferência') + '</div></div>';
      k += '<div class="kpi"><div class="rot">Urnas apuradas</div><div class="val num">' + st.apuradas + ' <span style="font-size:18px;color:var(--texto-3)">/ ' + st.totalUrnas + '</span></div>' +
        '<div class="progresso" style="margin-top:8px" title="' + st.urnasVal + ' confirmadas, ' + st.urnasPen + ' em conferência"><i class="p-val" style="width:' + (st.totalUrnas ? st.urnasVal / st.totalUrnas * 100 : 0) + '%"></i><i class="p-pen" style="width:' + (st.totalUrnas ? st.urnasPen / st.totalUrnas * 100 : 0) + '%"></i></div>' +
        '<div class="det">' + App.pct(st.apuradas, st.totalUrnas) + ' · ' + st.urnasVal + ' confirmadas · ' + st.urnasPen + ' em conferência</div></div>';
      if (partido) {
        k += '<div class="kpi"><div class="rot"><i style="background:repeating-linear-gradient(135deg,#e86100 0 3px,#ff9a4d 3px 6px);width:12px;height:12px;border-radius:3px;display:inline-block;vertical-align:-1px;margin-right:5px"></i>Em conferência</div><div class="val num" style="color:#b34700">' + App.n(st.votosPen) + '</div><div class="det">' + st.urnasPen + ' urna' + (st.urnasPen === 1 ? '' : 's') + ' aguardando conferência</div></div>';
      } else {
        var aguard = opcoes.contarPendentes ? opcoes.contarPendentes() : st.urnasPen;
        k += '<div class="kpi clicavel" id="kpi-pend" title="Abrir conferência"><div class="rot">Aguardando conferência</div><div class="val num" style="color:' + (aguard ? '#b34700' : 'var(--ok)') + '">' + aguard + '</div><div class="det">' + (aguard ? 'envios para conferir ' + '→' : 'tudo conferido') + '</div></div>';
      }
      k += '<div class="kpi"><div class="rot">Média por urna</div><div class="val num">' + (st.apuradas ? App.n(Math.round(st.media)) : '—') + '</div><div class="det">' +
        (st.projecao !== null ? 'Se a média se mantiver: ~' + App.n(st.projecao) + ' votos em ' + st.totalUrnas + ' urnas' : 'projeção após 5 urnas') + '</div></div>';
      $('#p-kpis', raiz).innerHTML = k;
      var kp = $('#kpi-pend', raiz); if (kp && opcoes.aoClicarPendentes) kp.onclick = opcoes.aoClicarPendentes;
      $('#p-urnas-txt', raiz).textContent = App.pct(st.apuradas, st.totalUrnas) + ' apuradas';

      desenharGraficos(st, nomeCand, pctApur);
      desenharMapa(st);
      desenharTabela(st);
    }

    function desenharGraficos(st, nomeCand, pctApur) {
      if (!window.Chart) return;
      Chart.defaults.font.family = 'Montserrat, system-ui, sans-serif';
      Chart.defaults.color = TINTA;

      // 1) Ritmo: acumulado ao longo do tempo
      var ev = st.eventos.slice().sort(function (a, b) { return a.recebido_em < b.recebido_em ? -1 : 1; });
      var pontosTotal = [], pontosVal = [], acT = 0;
      ev.forEach(function (u) { acT += u.votos; pontosTotal.push({ x: u.recebido_em.substr(11, 5), y: acT }); });
      var val = st.eventos.filter(function (u) { return u.status === 'VALIDADO'; })
        .map(function (u) { return { t: (u.validado_em || u.recebido_em), v: u.votos }; })
        .sort(function (a, b) { return a.t < b.t ? -1 : 1; });
      var acV = 0; val.forEach(function (u) { acV += u.v; pontosVal.push({ x: u.t.substr(11, 5), y: acV }); });
      var labels = {}; pontosTotal.concat(pontosVal).forEach(function (p) { labels[p.x] = true; });
      var eixo = Object.keys(labels).sort();
      function serie(pts) {
        var mapa = {}; pts.forEach(function (p) { mapa[p.x] = p.y; });
        var ult = null; return eixo.map(function (x) { if (x in mapa) ult = mapa[x]; return ult; });
      }
      var dRitmo = {
        labels: eixo,
        datasets: [
          { label: 'Total recebido', data: serie(pontosTotal), borderColor: COR_PEN, backgroundColor: COR_PEN, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, stepped: true, borderDash: [6, 4] },
          { label: 'Confirmados', data: serie(pontosVal), borderColor: COR_VAL, backgroundColor: 'rgba(0,114,176,.10)', fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, stepped: true }
        ]
      };
      if (!graficos.ritmo) {
        graficos.ritmo = new Chart($('#g-ritmo', raiz), {
          type: 'line', data: dRitmo,
          options: {
            maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 24 } },
              tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + App.n(c.parsed.y) + ' votos'; } } } },
            scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: GRADE }, border: { display: false }, ticks: { callback: function (v) { return App.n(v); } } } }
          }
        });
      } else { graficos.ritmo.data = dRitmo; graficos.ritmo.update('none'); }

      // 2) Urnas: rosca
      var semEnvio = Math.max(0, st.totalUrnas - st.apuradas);
      var ctxU = $('#g-urnas', raiz).getContext('2d');
      var dUrnas = {
        labels: ['Confirmadas', 'Em conferência', 'Sem envio'],
        datasets: [{ data: [st.urnasVal, st.urnasPen, semEnvio], backgroundColor: [COR_VAL, hachura(ctxU), COR_SEM], borderColor: '#fff', borderWidth: 2, hoverOffset: 4 }]
      };
      var centro = {
        id: 'centro',
        afterDraw: function (chart) {
          var a = chart.chartArea; if (!a) return;
          var g = chart.ctx, cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
          var p = chart.$pct || 0;
          g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#0d2b3e';
          g.font = '800 26px Montserrat, sans-serif'; g.fillText(chart.$pctTxt || '0%', cx, cy - 6);
          g.font = '600 11px Montserrat, sans-serif'; g.fillStyle = TINTA; g.fillText('apuradas', cx, cy + 16); g.restore();
        }
      };
      if (!graficos.urnas) {
        graficos.urnas = new Chart(ctxU, {
          type: 'doughnut', data: dUrnas, plugins: [centro],
          options: {
            maintainAspectRatio: false, animation: false, cutout: '68%',
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded' } },
              tooltip: { callbacks: { label: function (c) { return ' ' + c.label + ': ' + c.parsed + ' urna' + (c.parsed === 1 ? '' : 's'); } } } }
          }
        });
      } else { graficos.urnas.data = dUrnas; graficos.urnas.update('none'); }
      graficos.urnas.$pctTxt = App.pct(st.apuradas, st.totalUrnas); graficos.urnas.draw();

      // 3) Votos por local (barras horizontais empilhadas)
      var ls = st.locais.filter(function (l) { return l.val + l.pen > 0 || l.total > 0; })
        .sort(function (a, b) { return (b.votosVal + b.votosPen) - (a.votosVal + a.votosPen) || a.nome.localeCompare(b.nome, 'pt-BR'); });
      var altura = Math.max(160, ls.length * 30 + 50);
      $('#g-locais-box', raiz).style.height = altura + 'px';
      var ctxL = $('#g-locais', raiz).getContext('2d');
      var curto = window.innerWidth < 640;
      var dLocais = {
        labels: ls.map(function (l) { var n = l.nome; return curto && n.length > 22 ? n.slice(0, 21) + '…' : n; }),
        datasets: [
          { label: 'Confirmados', data: ls.map(function (l) { return l.votosVal; }), backgroundColor: COR_VAL, borderRadius: 4, borderSkipped: false, barPercentage: .78, categoryPercentage: .9 },
          { label: 'Em conferência', data: ls.map(function (l) { return l.votosPen; }), backgroundColor: hachura(ctxL), borderRadius: 4, borderSkipped: false, barPercentage: .78, categoryPercentage: .9 }
        ]
      };
      var nomesCompletos = ls.map(function (l) { return l.nome + ' — ' + (l.val + l.pen) + '/' + l.total + ' urnas'; });
      if (!graficos.locais) {
        graficos.locais = new Chart(ctxL, {
          type: 'bar', data: dLocais, plugins: [rotuloTotal],
          options: {
            indexAxis: 'y', maintainAspectRatio: false, animation: false,
            layout: { padding: { right: 44 } },
            interaction: { mode: 'index', intersect: false, axis: 'y' },
            plugins: {
              legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rectRounded' } },
              tooltip: { callbacks: {
                title: function (it) { return graficos.locais.$nomes[it[0].dataIndex]; },
                label: function (c) { return ' ' + c.dataset.label + ': ' + App.n(c.parsed.x) + ' votos'; }
              } }
            },
            scales: {
              x: { stacked: true, beginAtZero: true, grid: { color: GRADE }, border: { display: false }, ticks: { callback: function (v) { return App.n(v); } } },
              y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, font: { size: 11.5, weight: '600' }, color: '#0d2b3e' } }
            }
          }
        });
      } else { graficos.locais.data = dLocais; graficos.locais.resize(); graficos.locais.update('none'); }
      graficos.locais.$nomes = nomesCompletos;
    }

    function desenharMapa(st) {
      var ls = st.locais.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
      var dups = opcoes.duplicadas ? opcoes.duplicadas() : {};
      $('#p-mapa', raiz).innerHTML = ls.length ? ls.map(function (l) {
        return '<div class="mapa-local"><div class="cab"><b>' + h(l.nome) + '</b><span>' + (l.val + l.pen) + '/' + l.total + '</span></div><div class="chips">' +
          l.secoes.map(function (s) {
            var u = s.urna, cls = u ? u.status : '', tit = 'Seção ' + s.numero;
            if (u) tit += ' · ' + App.n(u.votos) + ' votos · ' + (u.status === 'VALIDADO' ? 'confirmado' : 'em conferência') + ' · ' + App.hora(u.recebido_em);
            else tit += ' · sem envio';
            var tag = opcoes.aoClicarSecao && u ? 'button' : 'span';
            return '<' + tag + ' class="chip ' + cls + (dups[s.id] ? ' dup' : '') + (s.ativo ? '' : ' inativa') + '" title="' + h(tit) + '"' + (tag === 'button' ? ' data-secao="' + h(s.id) + '"' : '') + '>' + h(s.numero) +
              (u ? '<small class="num">' + App.n(u.votos) + '</small>' : '<small>—</small>') + '</' + tag + '>';
          }).join('') + '</div></div>';
      }).join('') : '<div class="vazio">Nenhuma seção cadastrada para este município.</div>';
      if (opcoes.aoClicarSecao) App.$$('[data-secao]', raiz).forEach(function (b) { b.onclick = function () { opcoes.aoClicarSecao(b.dataset.secao); }; });
    }

    function desenharTabela(st) {
      var ls = st.locais.slice().sort(function (a, b) { return (b.votosVal + b.votosPen) - (a.votosVal + a.votosPen) || a.nome.localeCompare(b.nome, 'pt-BR'); });
      var t = { total: 0, val: 0, pen: 0, vv: 0, vp: 0 };
      var corpo = ls.map(function (l) {
        t.total += l.total; t.val += l.val; t.pen += l.pen; t.vv += l.votosVal; t.vp += l.votosPen;
        var ap = l.val + l.pen;
        return '<tr><td data-l="Local"><b>' + h(l.nome) + '</b></td>' +
          '<td data-l="Urnas" class="r">' + ap + '/' + l.total + '</td>' +
          '<td data-l="Progresso"><div class="mini-barra" title="' + App.pct(ap, l.total) + '"><i style="width:' + (l.total ? l.val / l.total * 100 : 0) + '%;background:' + COR_VAL + '"></i><i class="p-pen" style="width:' + (l.total ? l.pen / l.total * 100 : 0) + '%;background:repeating-linear-gradient(135deg,#e86100 0 3px,#ff9a4d 3px 6px)"></i></div></td>' +
          '<td data-l="Confirmados" class="r"><b>' + App.n(l.votosVal) + '</b></td>' +
          '<td data-l="Em conferência" class="r" style="color:#b34700">' + (l.votosPen ? App.n(l.votosPen) : '—') + '</td>' +
          '<td data-l="Média/urna" class="r">' + (ap ? App.n(Math.round((l.votosVal + l.votosPen) / ap)) : '—') + '</td></tr>';
      }).join('');
      $('#p-tabela', raiz).innerHTML = '<thead><tr><th>Local</th><th class="r">Urnas</th><th>Progresso</th><th class="r">Confirmados</th><th class="r">Em conferência</th><th class="r">Média/urna</th></tr></thead><tbody>' + corpo + '</tbody>' +
        '<tfoot><tr><td data-l="Total">Total</td><td data-l="Urnas" class="r">' + (t.val + t.pen) + '/' + t.total + '</td><td class="oculto-mobile"></td><td data-l="Confirmados" class="r">' + App.n(t.vv) + '</td><td data-l="Em conferência" class="r">' + App.n(t.vp) + '</td><td data-l="Média/urna" class="r">' + ((t.val + t.pen) ? App.n(Math.round((t.vv + t.vp) / (t.val + t.pen))) : '—') + '</td></tr></tfoot>';
    }

    return { atualizar: atualizar };
  }

  return { criar: criar, calcular: calcular };
})();
