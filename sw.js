/* Guarda as telas no celular para abrir mesmo sem internet */
var VERSAO = 'apuracao-v3';
var ARQUIVOS = [
  './', 'index.html', 'fiscal.html', 'apuracao.html', 'partido.html', 'manifest.webmanifest',
  'assets/css/app.css', 'assets/js/config.js', 'assets/js/core.js', 'assets/js/common.js',
  'assets/js/fiscal.js', 'assets/js/painel.js', 'assets/js/apuracao.js', 'assets/js/partido.js',
  'assets/img/logo-480.png', 'assets/img/favicon.png', 'assets/img/icon-192.png', 'assets/img/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
/* Rede primeiro (sempre a versão mais nova); sem internet, usa a cópia guardada */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var mesmoSite = url.origin === self.location.origin;
  var fonte = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!mesmoSite && !fonte) return;
  e.respondWith(fetch(req).then(function (resp) {
    if (resp && (resp.ok || resp.type === 'opaque')) {
      var copia = resp.clone();
      caches.open(VERSAO).then(function (c) { c.put(req, copia); });
    }
    return resp;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
  }));
});
