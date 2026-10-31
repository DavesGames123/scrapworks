/* Warp Wiki behaviour: search, hover previews, section spy, filters. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cache = {};
  function data(name) {
    if (!cache[name]) cache[name] = fetch('data/' + name + '.json').then(function (r) { return r.json(); });
    return cache[name];
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* Theme: auto, then the opposite of the current look, then auto again. */
  var themeBtn = $('.theme');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var root = document.documentElement;
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('warp-wiki-theme', root.dataset.theme); } catch (e) {}
  });

  var burger = $('.burger'), side = $('#side');
  if (burger) burger.addEventListener('click', function () {
    var open = side.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });

  /* Rank: exact name, then prefix, then word start, then substring. */
  function score(hay, q) {
    var h = hay.toLowerCase();
    if (h === q) return 0;
    if (h.indexOf(q) === 0) return 1;
    var tail = h.split('::').pop();
    if (tail === q) return 1;
    if (tail.indexOf(q) === 0) return 2;
    var i = h.indexOf(q);
    if (i < 0) return -1;
    return /[\s:_-]/.test(h[i - 1] || ' ') ? 3 : 4;
  }
  function find(list, q, key, n) {
    var hits = [];
    for (var i = 0; i < list.length; i++) {
      var s = score(key(list[i]), q);
      if (s >= 0) hits.push([s, key(list[i]).length, list[i]]);
    }
    hits.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return hits.slice(0, n).map(function (h) { return h[2]; });
  }

  var q = $('#q'), box = $('#results'), cursor = -1;
  function links() { return $$('a', box); }
  function paint() { links().forEach(function (a, i) { a.classList.toggle('on', i === cursor); if (i === cursor) a.scrollIntoView({ block: 'nearest' }); }); }
  function runSearch() {
    var v = q.value.trim().toLowerCase();
    if (!v) { box.hidden = true; return; }
    Promise.all([data('articles'), data('symbols')]).then(function (d) {
      if (q.value.trim().toLowerCase() !== v) return;
      var arts = find(d[0], v, function (a) { return a.t; }, 6);
      if (arts.length < 3) arts = arts.concat(d[0].filter(function (a) { return arts.indexOf(a) < 0 && a.d.toLowerCase().indexOf(v) >= 0; }).slice(0, 4 - arts.length));
      var syms = find(d[1], v, function (s) { return s[0]; }, 10);
      var html = '';
      if (arts.length) html += '<div class="grp">Articles</div>' + arts.map(function (a) {
        return '<a href="' + a.s + '.html"><b>' + esc(a.t) + '</b><small>' + esc(a.d) + '</small></a>';
      }).join('');
      if (syms.length) html += '<div class="grp">Symbols</div>' + syms.map(function (s) {
        return '<a href="' + s[3] + '.html#' + s[4] + '"><code>' + esc(s[0]) + '</code><small>' + esc(s[1]) + ' in ' + esc(s[2] === '(root)' ? 'warp_sdk' : 'warp_sdk::' + s[2]) + '</small></a>';
      }).join('');
      box.innerHTML = html || '<div class="grp">No matches</div>';
      box.hidden = false; cursor = -1;
    });
  }
  if (q) {
    q.addEventListener('input', runSearch);
    q.addEventListener('focus', runSearch);
    q.addEventListener('keydown', function (e) {
      var l = links();
      if (e.key === 'ArrowDown') { cursor = Math.min(cursor + 1, l.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cursor = Math.max(cursor - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { var t = l[Math.max(cursor, 0)]; if (t) location.href = t.href; }
      else if (e.key === 'Escape') { box.hidden = true; q.blur(); }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search')) box.hidden = true; });
    document.addEventListener('keydown', function (e) {
      var t = e.target.tagName;
      if (e.key === '/' && t !== 'INPUT' && t !== 'TEXTAREA' && t !== 'SELECT') { e.preventDefault(); q.focus(); q.select(); }
    });
  }

  /* Page previews: wait a moment, so that a passing pointer shows nothing. */
  var pop = null, timer = 0;
  function hide() { clearTimeout(timer); if (pop) { pop.remove(); pop = null; } }
  function show(a) {
    data('previews').then(function (p) {
      var e = p[a.dataset.slug];
      if (!e || !a.isConnected) return;
      hide();
      pop = document.createElement('div'); pop.className = 'pop'; pop.setAttribute('role', 'tooltip');
      pop.innerHTML = '<b>' + esc(e.t) + '</b><small>' + esc(e.d) + '</small>' + esc(e.x);
      document.body.appendChild(pop);
      var r = a.getBoundingClientRect();
      var left = Math.min(r.left + scrollX, scrollX + innerWidth - 356);
      var top = r.bottom + scrollY + 6;
      if (r.bottom + pop.offsetHeight + 12 > innerHeight) top = r.top + scrollY - pop.offsetHeight - 6;
      pop.style.left = Math.max(8, left) + 'px'; pop.style.top = top + 'px';
    });
  }
  document.addEventListener('mouseover', function (e) {
    var a = e.target.closest && e.target.closest('a[data-slug]');
    if (!a || !a.dataset.slug) return;
    clearTimeout(timer); timer = setTimeout(function () { show(a); }, 280);
  });
  document.addEventListener('mouseout', function (e) { if (e.target.closest && e.target.closest('a[data-slug]')) hide(); });
  addEventListener('scroll', hide, { passive: true });

  /* Contents rail: mark the section that the reader is in. */
  var tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          tocLinks.forEach(function (a) { a.classList.remove('on'); });
          map[en.target.id].classList.add('on');
        }
      });
    }, { rootMargin: '-70px 0px -70% 0px' });
    $$('main h2[id], main h3[id]').forEach(function (h) { io.observe(h); });
  }

  /* Reference filter. A match inside a closed method list opens the list. */
  $$('.reffilter input').forEach(function (inp) {
    if (inp.id) return;
    var note = inp.parentNode.querySelector('.refcount');
    var all = $$('.item');
    inp.addEventListener('input', function () {
      var v = inp.value.trim().toLowerCase(), shown = 0;
      all.forEach(function (it) {
        var hit = !v || it.dataset.name.indexOf(v) >= 0 || (it.textContent.toLowerCase().indexOf(v) >= 0);
        it.hidden = !hit; if (hit) shown++;
      });
      $$('.typeblock').forEach(function (tb) {
        var inner = $$('.members .item', tb).filter(function (i) { return !i.hidden; }).length;
        var head = tb.querySelector(':scope > .item');
        var det = tb.querySelector('details');
        if (det) det.open = !!v && inner > 0;
        if (v && inner > 0) head.hidden = false;
        tb.hidden = head.hidden && !inner;
      });
      note.textContent = v ? shown + ' shown' : '';
    });
  });
  /* A link to a method inside a closed list must open that list. */
  function openTarget() {
    var id = location.hash.slice(1); if (!id) return;
    var el = document.getElementById(id); if (!el) return;
    var d = el.closest('details');
    if (d && !d.open) { d.open = true; el.scrollIntoView(); }
  }
  addEventListener('hashchange', openTarget); openTarget();

  $$('.copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.parentNode.querySelector('code').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
        b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1200);
      }).catch(function () { b.textContent = 'Failed'; });
    });
  });

  /* Symbol index page. */
  var symq = $('#symq');
  if (symq) {
    var rows = $('#symrows'), note = symq.parentNode.querySelector('.refcount');
    var draw = function (list, total) {
      rows.innerHTML = list.map(function (s) {
        return '<tr><td><a href="' + s[3] + '.html#' + s[4] + '"><code>' + esc(s[0]) + '</code></a></td><td>' + esc(s[1]) + '</td><td><code>' + esc(s[2] === '(root)' ? 'warp_sdk' : s[2]) + '</code></td></tr>';
      }).join('');
      note.textContent = 'Showing ' + list.length + ' of ' + total;
    };
    data('symbols').then(function (all) {
      var params = new URLSearchParams(location.search);
      if (params.get('q')) symq.value = params.get('q');
      var run = function () {
        var v = symq.value.trim().toLowerCase();
        var hits = v ? all.filter(function (s) { return score(s[0], v) >= 0; }) : all;
        if (v) hits = find(hits, v, function (s) { return s[0]; }, 300); else hits = hits.slice(0, 300);
        draw(hits, v ? all.filter(function (s) { return score(s[0], v) >= 0; }).length : all.length);
      };
      symq.addEventListener('input', run); run();
    });
  }

  var catq = $('#catq');
  if (catq) {
    var lis = $$('#catalog li'), cnote = catq.parentNode.querySelector('.refcount');
    catq.addEventListener('input', function () {
      var v = catq.value.trim().toLowerCase(), n = 0;
      lis.forEach(function (li) { var h = !v || li.textContent.toLowerCase().indexOf(v) >= 0; li.hidden = !h; if (h) n++; });
      cnote.textContent = v ? n + ' files' : '';
    });
  }

  function pickRandom(a) {
    data('articles').then(function (list) {
      location.href = list[Math.floor(Math.random() * list.length)].s + '.html';
    });
    if (a) a.preventDefault();
  }
  var rnd = $('#rnd'); if (rnd) rnd.addEventListener('click', pickRandom);
  if (document.body.classList.contains('random')) pickRandom();
})();
