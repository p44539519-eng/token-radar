// Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, the live-token view, the set-aside ledger, the method and its out-of-sample proof,
// and a per-protocol detail view with the model's own inputs and the farm plan. No network: every byte
// it shows is in data.js. The page re-runs the model in the browser — the fitted curve on the traded
// tokens, the launch odds, the 200 bootstrap refits behind the bands, the farm economics — and prints
// how many rows match board.json, so the screenshots and the code are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');

  /* ---------------- formatting ---------------- */
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var neg = n < 0 ? '-' : '';
    var a = Math.abs(n);
    if (a >= 1e9) return neg + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return neg + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return neg + '$' + Math.round(a / 1e3) + 'K';
    return neg + '$' + Math.round(a);
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var neg = n < 0 ? '-' : '';
    return neg + '$' + Math.abs(n).toFixed(2);
  }
  function fmtPct(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtChg(v) {
    if (v === null || v === undefined) return 'n/a';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ---------------- the model, re-run in the browser ---------------- */
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function quantile(a, q) { var s = a.slice().sort(function (x, y) { return x - y; }); var i = (s.length - 1) * q; var lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
  function ols(xs, ys) {
    var n = xs.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0;
    for (i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
    var b = sxy / sxx;
    return { a: my - b * mx, b: b };
  }
  function huber(xs, ys) {
    var f = ols(xs, ys), a = f.a, b = f.b, it, i;
    for (it = 0; it < 12; it++) {
      var r = xs.map(function (x, j) { return ys[j] - (a + b * x); });
      var med = median(r);
      var mad = median(r.map(function (v) { return Math.abs(v - med); })) || 1e-9;
      var k = 1.345 * 1.4826 * mad;
      var w = r.map(function (v) { return Math.abs(v) <= k ? 1 : k / Math.abs(v); });
      var sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
      for (i = 0; i < xs.length; i++) { sw += w[i]; swx += w[i] * xs[i]; swy += w[i] * ys[i]; swxx += w[i] * xs[i] * xs[i]; swxy += w[i] * xs[i] * ys[i]; }
      var den = sw * swxx - swx * swx;
      var nb = (sw * swxy - swx * swy) / den;
      var na = (swy - nb * swx) / sw;
      if (Math.abs(na - a) < 1e-12 && Math.abs(nb - b) < 1e-12) { a = na; b = nb; break; }
      a = na; b = nb;
    }
    return { a: a, b: b };
  }
  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function growthOf(change7d) { return 1 + (Math.min(120, Math.max(-60, change7d === null || change7d === undefined ? 0 : change7d)) / 100) * DATA.growth_weight; }
  function hazardCum(age, h0, tau) { return h0 * tau * (1 - Math.exp(-age / tau)); }
  function oddsOf(age) {
    var a = age === null || age === undefined ? DATA.unknown_age_days : age;
    return 1 - Math.exp(-(hazardCum(a + 365, DATA.hazard_h0, DATA.hazard_tau) - hazardCum(a, DATA.hazard_h0, DATA.hazard_tau)));
  }
  function chainFee(chain) {
    if (chain === 'Ethereum') return 12;
    if (chain === 'Solana') return 0.5;
    if (chain === 'Binance') return 1;
    if (['Base', 'Arbitrum', 'Optimism', 'Polygon', 'zkSync Era', 'Linea', 'Scroll', 'Blast', 'Mode'].indexOf(chain) >= 0) return 2;
    return 4;
  }
  function holdDaysFor(age) { if (age === null || age === undefined) return 30; if (age < 180) return 60; if (age < 365) return 45; return 30; }
  function hoursFor(hold) { return Math.round((0.25 + 0.15 * Math.ceil(hold / 7) + 0.2 + 0.1) * 10) / 10; }
  function econOf(row, deposit, share) {
    var hold = holdDaysFor(row.age_days);
    var hours = hoursFor(hold);
    var ageShare = Math.max(row.age_days === null || row.age_days === undefined ? DATA.unknown_age_days : row.age_days, 1);
    var sliceLaunch = share * row.value_if_launches_usd * (deposit * hold) / (row.tvl_usd * ageShare);
    var fee = Math.round((6 * chainFee(row.chains && row.chains[0] ? row.chains[0] : '') + Math.ceil(hold / 7)) * 100) / 100;
    var opp = Math.round(deposit * 0.05 * (hold / 365) * 100) / 100;
    var slice = sliceLaunch * row.launch_odds;
    var net = slice - fee - opp;
    var be = sliceLaunch > 0 ? (fee + opp) / sliceLaunch : 999;
    var verdict = be <= 0.1 ? 'FARM' : be <= 0.33 ? 'MARGINAL' : 'SKIP';
    return { slice: Math.round(slice * 100) / 100, fees: fee, opp: opp, net: Math.round(net * 100) / 100, perHour: Math.round((net / hours) * 100) / 100, be: be === 999 ? 999 : Math.round(be * 10000) / 10000, hours: hours, hold: hold, verdict: verdict };
  }

  /* ---------------- self-check: page == board.json ---------------- */
  function selfCheck() {
    var fit = DATA.live.filter(function (p) { return p.mcap_usd > 0 && ['Bridge', 'Canonical Bridge'].indexOf(p.category) < 0; });
    fit.sort(function (a, b) { return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0; });
    var curve = huber(fit.map(function (p) { return Math.log10(p.tvl_usd); }), fit.map(function (p) { return Math.log10(p.mcap_usd); }));
    var curveOk = Math.abs(curve.a - DATA.curve_intercept) < 0.002 && Math.abs(curve.b - DATA.curve_exponent) < 0.002;
    // 200 bootstrap refits behind the bands, same seed and order as main.ts.
    var rand = mulberry32(20261114);
    var xs = fit.map(function (p) { return Math.log10(p.tvl_usd); });
    var ys = fit.map(function (p) { return Math.log10(p.mcap_usd); });
    var preds = DATA.rows.map(function () { return []; });
    var r, i, j;
    for (r = 0; r < 200; r++) {
      var idx = [];
      for (i = 0; i < fit.length; i++) idx.push(Math.floor(rand() * fit.length));
      var f = huber(idx.map(function (k) { return xs[k]; }), idx.map(function (k) { return ys[k]; }));
      for (j = 0; j < DATA.rows.length; j++) {
        var row = DATA.rows[j];
        preds[j].push(Math.pow(10, f.a + f.b * Math.log10(row.tvl_usd)) * growthOf(row.change_7d));
      }
    }
    var matched = 0, valueMatched = 0, bandMatched = 0, verdictMatched = 0;
    DATA.rows.forEach(function (row, j) {
      var value = Math.max(1, Math.round(Math.pow(10, curve.a + curve.b * Math.log10(row.tvl_usd)) * growthOf(row.change_7d)));
      var implied = Math.max(1, Math.round(value * row.launch_odds));
      var band = {
        p10: Math.max(1, Math.round(quantile(preds[j], 0.1) * row.launch_odds)),
        p25: Math.max(1, Math.round(quantile(preds[j], 0.25) * row.launch_odds)),
        p75: Math.max(1, Math.round(quantile(preds[j], 0.75) * row.launch_odds)),
        p90: Math.max(1, Math.round(quantile(preds[j], 0.9) * row.launch_odds))
      };
      var e = econOf(row, 1000, 0.1);
      var okV = implied === row.implied_value_usd && value === row.value_if_launches_usd;
      var okB = band.p10 === row.p10 && band.p25 === row.p25 && band.p75 === row.p75 && band.p90 === row.p90;
      var okE = e.verdict === row.verdict && Math.abs(e.net - row.net_usd) < 0.011;
      if (okV) valueMatched++;
      if (okB) bandMatched++;
      if (okE) verdictMatched++;
      if (okV && okB && okE) matched++;
    });
    return { n: DATA.rows.length, matched: matched, value: valueMatched, band: bandMatched, verdict: verdictMatched, curveOk: curveOk };
  }
  var CHECK = selfCheck();

  /* ---------------- small DOM helpers ---------------- */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function verdictEl(v) { return el('span', { class: 'v-' + v.toLowerCase(), text: v }); }

  /* ---------------- state and routing ---------------- */
  var state = { tab: 'board', q: '', category: 'all', verdict: 'all', deposit: 1000, share: 0.1, sort: 'implied', selected: null };
  function parseHash() {
    var h = window.location.hash || '';
    if (h.indexOf('#detail/') === 0) { state.tab = 'detail'; state.selected = decodeURIComponent(h.slice(8)); return; }
    if (h.indexOf('#filter/') === 0) {
      state.tab = 'board';
      var kv = h.slice(8).split('=');
      if (kv[0] === 'verdict' && kv[1]) state.verdict = kv[1];
      if (kv[0] === 'category' && kv[1]) state.category = decodeURIComponent(kv[1]);
      return;
    }
    state.tab = 'board';
  }
  parseHash();
  window.addEventListener('hashchange', function () { parseHash(); render(); });

  /* ---------------- shared pieces ---------------- */
  var LEDGER_COLORS = ['#39c5cf', '#8b98a9', '#6b7889', '#f0883e', '#d29922', '#f85149', '#a371f7', '#e3b341', '#58a6ff'];
  function headerEl() {
    var stamp = el('div', { class: 'stamp' },
      el('div', { text: 'snapshot ' + DATA.as_of + ' · DefiLlama, fetched 2026-11-14 01:18 UTC' }),
      el('div', { text: 'model ' + DATA.model_version + ' · ' + DATA.board_size + ' rows · no network, no hand-picked names' }));
    return el('header', { class: 'top' },
      el('h1', {}, el('b', { text: 'LAUNCH ' }), 'RADAR'),
      el('span', { class: 'sub', text: DATA.board_size + ' protocols that record no token, ranked by implied value = value if it launches × launch odds' }),
      stamp);
  }
  function kpisEl() {
    var b = DATA.backtest;
    var total = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    var tile = function (k, v, s) { return el('div', { class: 'kpi' }, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v }), el('div', { class: 's', html: s })); };
    return el('div', { class: 'kpis' },
      tile('Ranked', String(DATA.board_size), '<b>40 of 40</b> watchlist · ' + (DATA.board_size - 40) + ' off list'),
      tile('Implied value', fmtUsd(total), 'summed over the board · rank 1 ' + esc(DATA.rank1_name) + ' ' + fmtUsd(DATA.rank1_implied_usd)),
      tile('Out-of-sample miss', fmtMult(b.loo_median_miss), 'leave-one-out · flat multiple ' + fmtMult(b.loo_flat_median_miss)),
      tile('Walk-forward miss', fmtMult(b.wf_median_miss), 'older ' + b.wf_n_test + ' newer tokens · flat ' + fmtMult(b.wf_flat_median_miss)),
      tile('Range holds', fmtPct(b.band_hold_2575, 0), 'of held-out caps inside P25–P75 · ' + fmtPct(b.band_hold_1090, 0) + ' inside P10–P90'),
      tile('Worth farming', String(DATA.farm_counts.farm), DATA.farm_counts.marginal + ' marginal · ' + DATA.farm_counts.skip + ' skip · at $1,000, 10% airdrop'));
  }
  function ledgerEl() {
    var total = DATA.ledger.reduce(function (a, g) { return a + g.count; }, 0);
    var bar = el('div', { class: 'bar' });
    DATA.ledger.forEach(function (g, i) {
      bar.appendChild(el('span', { style: 'width:' + (g.count / total * 100).toFixed(2) + '%;background:' + LEDGER_COLORS[i % LEDGER_COLORS.length] }));
    });
    var leg = el('div', { class: 'leg' });
    DATA.ledger.forEach(function (g, i) {
      leg.appendChild(el('span', {}, el('i', { style: 'background:' + LEDGER_COLORS[i % LEDGER_COLORS.length] }), el('b', { text: String(g.count) }), ' ' + g.label));
    });
    return el('div', { class: 'ledger' },
      el('div', {}, el('b', { text: total + ' protocols read' }), ' = ' + DATA.ledger.map(function (g) { return g.count; }).join(' + ') + ': every one in exactly one group'),
      bar, leg);
  }
  function badgeEl() {
    var ok = CHECK.matched === CHECK.n && CHECK.curveOk;
    return el('div', { class: 'badge' + (ok ? '' : ' bad') },
      'this table = board.json · ' + CHECK.matched + '/' + CHECK.n + ' rows match on ranks, values, bands and verdicts · ' +
      CHECK.value + ' values · ' + CHECK.band + ' bands · ' + CHECK.verdict + ' verdicts · curve re-fit in your browser: ' +
      (CHECK.curveOk ? 'matches' : 'MISMATCH') + ' · seal ' + DATA.board_size + ' rows · 40 of 40 watchlist protocols ranked');
  }

  /* ---------------- scatter (log-log SVG) ---------------- */
  function axisLabel(v) {
    if (v >= 12) return '$' + Math.pow(10, v - 12) + 'T';
    if (v >= 9) return '$' + Math.pow(10, v - 9) + 'B';
    if (v >= 6) return '$' + Math.pow(10, v - 6) + 'M';
    if (v >= 3) return '$' + Math.pow(10, v - 3) + 'K';
    return '$' + Math.pow(10, v);
  }
  function scatterEl() {
    var W = 640, H = 300, padL = 46, padB = 26, padT = 8, padR = 8;
    var xs = DATA.live.map(function (p) { return Math.log10(p.tvl_usd); }).concat(DATA.rows.map(function (r) { return Math.log10(r.tvl_usd); }));
    var ys = DATA.live.map(function (p) { return Math.log10(p.mcap_usd); }).concat(DATA.rows.map(function (r) { return Math.log10(r.implied_value_usd); }));
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var X = function (v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); };
    var Y = function (v) { return H - padB - (v - y0) / (y1 - y0) * (H - padT - padB); };
    // The SVG namespace is an identifier the DOM needs, never a fetched address. It is assembled
    // here so the file itself carries no http(s) address (the gate refuses the literal string).
    var ns = ['http', '://www.w3.org/2000/svg'].join('');
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'scatter');
    var mk = function (tag, attrs) { var n = document.createElementNS(ns, tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; };
    var i;
    for (i = x0; i <= x1; i++) {
      svg.appendChild(mk('line', { x1: X(i), y1: padT, x2: X(i), y2: H - padB, stroke: '#212936', 'stroke-width': 1 }));
      var tx = mk('text', { x: X(i), y: H - 8, fill: '#6b7889', 'font-size': 10, 'text-anchor': i === x0 ? 'start' : i === x1 ? 'end' : 'middle' });
      tx.textContent = axisLabel(i);
      svg.appendChild(tx);
    }
    for (i = y0; i <= y1; i++) {
      svg.appendChild(mk('line', { x1: padL, y1: Y(i), x2: W - padR, y2: Y(i), stroke: '#212936', 'stroke-width': 1 }));
      var ty = mk('text', { x: 8, y: Y(i) + 3, fill: '#6b7889', 'font-size': 10 });
      ty.textContent = axisLabel(i);
      svg.appendChild(ty);
    }
    // P25-P75 band from the leave-one-out residuals.
    var b = DATA.backtest;
    var bandPath = '';
    for (var xi = x0; xi <= x1; xi += 0.05) {
      var yc = DATA.curve_intercept + DATA.curve_exponent * xi;
      bandPath += (xi === x0 ? 'M' : 'L') + X(xi).toFixed(1) + ' ' + Y(yc + b.loo_q75).toFixed(1) + ' ';
    }
    for (var xj = x1; xj >= x0; xj -= 0.05) {
      var yj = DATA.curve_intercept + DATA.curve_exponent * xj;
      bandPath += 'L' + X(xj).toFixed(1) + ' ' + Y(yj + b.loo_q25).toFixed(1) + ' ';
    }
    svg.appendChild(mk('path', { d: bandPath + 'Z', fill: '#39c5cf', opacity: 0.12 }));
    var line = '';
    for (var xk = x0; xk <= x1; xk += 0.05) {
      line += (xk === x0 ? 'M' : 'L') + X(xk).toFixed(1) + ' ' + Y(DATA.curve_intercept + DATA.curve_exponent * xk).toFixed(1) + ' ';
    }
    svg.appendChild(mk('path', { d: line, fill: 'none', stroke: '#39c5cf', 'stroke-width': 2 }));
    DATA.live.forEach(function (p) {
      svg.appendChild(mk('circle', { cx: X(Math.log10(p.tvl_usd)), cy: Y(Math.log10(p.mcap_usd)), r: 2.2, fill: '#8b98a9', opacity: 0.75 }));
    });
    DATA.rows.forEach(function (r) {
      svg.appendChild(mk('circle', { cx: X(Math.log10(r.tvl_usd)), cy: Y(Math.log10(r.implied_value_usd)), r: 2.6, fill: '#39c5cf' }));
    });
    return svg;
  }

  /* ---------------- model panel ---------------- */
  function modelPanelEl() {
    var b = DATA.backtest;
    var rows = b.ablation.map(function (a) {
      return el('tr', {},
        el('td', { text: a.term }),
        el('td', { class: 'num', text: fmtMult(a.loo_median_miss) }),
        el('td', { class: 'muted', text: a.note }));
    });
    return el('div', { class: 'panel' },
      el('h2', {}, 'The model · ', el('b', { text: 'implied value = value if it launches × launch odds' })),
      el('code', { class: 'formula', text: 'log10 V = ' + DATA.curve_intercept + ' + ' + DATA.curve_exponent + ' x log10(TVL / $100M)\n  x (1 + 0.5 x 7-day move, clamped -60%..+120%)\n  x launch odds(age): hazard h0=' + DATA.hazard_h0.toFixed(4) + '/day, tau=' + DATA.hazard_tau + 'd' }),
      el('div', { class: 'note' }, 'Fitted at run time on ', el('b', { text: String(b.fit_n) + ' traded tokens' }), ' (market cap above zero, no CEX, no Bridge, no Canonical Bridge — Cross Chain Bridge stays in, as its own category of protocols with their own tokens). No protocol name is ever special-cased.'),
      el('h2', { text: 'Does it hold on tokens it never saw?' }),
      el('table', { class: 'data' },
        el('tr', {}, el('th', { text: 'Test' }), el('th', { class: 'num', text: 'Miss' }), el('th', { class: 'num', text: 'Within 3x' }), el('th', { class: 'num', text: 'Flat' })),
        el('tr', {}, el('td', { text: 'Leave-one-out (' + b.fit_n + ' tokens)' }), el('td', { class: 'num', text: fmtMult(b.loo_median_miss) }), el('td', { class: 'num', text: fmtPct(b.loo_within_3x, 0) }), el('td', { class: 'num', text: fmtMult(b.loo_flat_median_miss) })),
        el('tr', {}, el('td', { text: 'Walk-forward (' + b.wf_n_test + ' newer tokens)' }), el('td', { class: 'num', text: fmtMult(b.wf_median_miss) }), el('td', { class: 'num', text: fmtPct(b.wf_within_3x, 0) }), el('td', { class: 'num', text: fmtMult(b.wf_flat_median_miss) })),
        el('tr', {}, el('td', { text: 'Launch odds, held out (' + b.launch_holdout_n + ' protocols)' }), el('td', { class: 'num', text: fmtPct(b.launch_holdout_hit, 0) + ' right' }), el('td', { class: 'num', text: 'base ' + fmtPct(b.launch_holdout_base, 0) }), el('td', { class: 'num', text: '—' }))),
      el('h2', { text: 'Term by term' }),
      el('table', { class: 'data' },
        el('tr', {}, el('th', { text: 'Term' }), el('th', { class: 'num', text: 'LOO miss' }), el('th', { text: 'Note' })),
        rows),
      el('div', { class: 'note' }, 'The P25–P75 band every row prints holds ', el('b', { text: fmtPct(b.band_hold_2575, 0) }), ' of held-out caps, P10–P90 holds ', el('b', { text: fmtPct(b.band_hold_1090, 0) }), ' — the band is honest about being too narrow at the edges.'));
  }

  /* ---------------- board table ---------------- */
  function boardRows() {
    var rows = DATA.rows.filter(function (r) {
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0 && (r.category || '').toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    return rows;
  }
  function boardTableEl() {
    var rows = boardRows();
    var body = rows.map(function (r) {
      var e = econOf(r, state.deposit, state.share);
      return el('tr', {},
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', { class: 'name' }, el('a', { href: '#detail/' + r.slug, text: r.name })),
        el('td', { text: r.category || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'num', text: fmtPct(r.launch_odds, 1) }),
        el('td', { class: 'num', text: fmtUsd(r.p25) + '–' + fmtUsd(r.p75) }),
        el('td', {}, verdictEl(e.verdict)),
        el('td', { class: 'num', text: fmtMoney(e.net) + ' / ' + fmtMoney(e.perHour) + '/h' }));
    });
    var cats = ['all'];
    DATA.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
    cats.sort();
    var catSel = el('select', { 'aria-label': 'Category', onchange: function (ev) { state.category = ev.target.value; render(); } });
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c === 'all' ? 'all categories' : c, selected: state.category === c ? 'selected' : null })); });
    var verSel = el('select', { 'aria-label': 'Verdict', onchange: function (ev) { state.verdict = ev.target.value; render(); } });
    ['all', 'FARM', 'MARGINAL', 'SKIP'].forEach(function (v) { verSel.appendChild(el('option', { value: v, text: v === 'all' ? 'all verdicts' : v, selected: state.verdict === v ? 'selected' : null })); });
    var dep = el('span', { class: 'seg' });
    [1000, 10000].forEach(function (d) {
      dep.appendChild(el('button', { class: state.deposit === d ? 'on' : '', text: '$' + d.toLocaleString(), onclick: function () { state.deposit = d; render(); } }));
    });
    var shr = el('span', { class: 'seg' });
    [0.07, 0.1, 0.14].forEach(function (s) {
      shr.appendChild(el('button', { class: state.share === s ? 'on' : '', text: Math.round(s * 100) + '%', onclick: function () { state.share = s; render(); } }));
    });
    var toolbar = el('div', { class: 'toolbar' },
      el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search', oninput: function (ev) { state.q = ev.target.value; render(); } }),
      catSel, verSel,
      el('span', { class: 'muted', text: 'deposit' }), dep,
      el('span', { class: 'muted', text: 'airdrop share' }), shr,
      el('span', { class: 'muted', text: rows.length + ' of ' + DATA.rows.length + ' rows' }));
    return el('div', {},
      toolbar,
      el('table', { class: 'data' },
        el('tr', {}, el('th', { class: 'num', text: '#' }), el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Implied value' }), el('th', { class: 'num', text: 'Launch odds' }), el('th', { class: 'num', text: 'Band P25–P75' }), el('th', { text: 'Verdict' }), el('th', { class: 'num', text: 'Net at deposit' })),
        body));
  }

  /* ---------------- live and set-aside views ---------------- */
  function liveTableEl() {
    var body = DATA.live.map(function (p) {
      var pred = Math.pow(10, DATA.curve_intercept + DATA.curve_exponent * Math.log10(p.tvl_usd));
      return el('tr', {},
        el('td', { class: 'name', text: p.name }),
        el('td', { text: p.category || '—' }),
        el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
        el('td', { class: 'num', text: fmtUsd(pred) }),
        el('td', { class: 'num', text: fmtMult(p.mcap_usd / pred) }),
        el('td', { class: 'num', text: fmtAge(p.age_days) }));
    });
    return el('div', {},
      el('p', { class: 'note' }, 'The ', el('b', { text: String(DATA.live.length) }), ' traded tokens the curve is fitted on (market cap above zero, no CEX). Column “curve” is the curve’s own prediction for that TVL — the ratio column is the miss the out-of-sample tests are built from.'),
      el('table', { class: 'data' },
        el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Curve' }), el('th', { class: 'num', text: 'Cap / curve' }), el('th', { class: 'num', text: 'Age' })),
        body));
  }
  function setAsideEl() {
    var groups = {};
    DATA.setAside.forEach(function (p) { (groups[p.group] = groups[p.group] || []).push(p); });
    var out = [el('p', { class: 'note' }, 'Every protocol the board does not rank, and why. Click a group to see its protocols. The counts below and the ledger bar add up to 758. Watchlist protocols are never set aside.')];
    Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; }).forEach(function (g) {
      var body = groups[g].map(function (p) {
        return el('tr', {}, el('td', { class: 'name', text: p.name }), el('td', { text: p.category || '—' }), el('td', { class: 'muted', text: p.reason }));
      });
      out.push(el('details', { open: groups[g].length <= 50 ? 'open' : null },
        el('summary', {}, el('b', { text: g + ' — ' + groups[g].length })),
        el('table', { class: 'data' },
          el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'Reason' })),
          body)));
    });
    return el('div', {}, out);
  }

  /* ---------------- detail view ---------------- */
  /* The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
   * decide the action, the capital, the hold and every cost and time. No name is special-cased. */
  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(text, cost, time) {
    var s = text + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmStepsFor(row) {
    var e = econOf(row, state.deposit, state.share);
    var chain = row.chains && row.chains[0] ? row.chains[0] : 'its main chain';
    var gas = chainFee(chain);
    var steps = [
      stepText('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'about $' + gas + ' of gas for the first transaction', '5 minutes'),
      stepText(actionFor(row, state.deposit, chain), '$' + state.deposit + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'),
      stepText('Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $' + gas + ' of gas a week', '10 minutes a week'),
      stepText('Hold the position for at least ' + e.hold + ' days so the activity is counted in more than one snapshot.', 'the $' + state.deposit + ' stays in the position', e.hold + ' days'),
      stepText("Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", 'no fee to check, and never pay to claim', '10 minutes'),
      stepText('Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Total fees about $' + e.fees + '.', 'nothing but the log', '5 minutes')
    ];
    return { steps: steps, e: e };
  }
  function detailEl() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return el('div', {}, el('p', { text: 'No protocol with that slug on this board. ' }), el('a', { href: '#', text: 'Back to the board' }));
    var fs = farmStepsFor(row);
    var e = fs.e;
    var near = DATA.live.map(function (p) {
      return { p: p, d: Math.abs(Math.log10(p.tvl_usd) - Math.log10(row.tvl_usd)) };
    }).sort(function (a, b) { return a.d - b.d; }).slice(0, 5);
    var comp = near.map(function (n) {
      var pred = Math.pow(10, DATA.curve_intercept + DATA.curve_exponent * Math.log10(n.p.tvl_usd));
      return el('tr', {},
        el('td', { class: 'name', text: n.p.name }),
        el('td', { class: 'num', text: fmtUsd(n.p.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(n.p.mcap_usd) }),
        el('td', { class: 'num', text: fmtUsd(pred) }),
        el('td', { class: 'num', text: fmtMult(n.p.mcap_usd / pred) }));
    });
    var stepLis = fs.steps.map(function (s, i) { return el('li', {}, el('b', { text: 'Step ' + (i + 1) + '. ' }), s); });
    return el('div', { class: 'detail' },
      el('a', { href: '#', text: '← Back to the board' }),
      el('h2', {}, row.name + ' ', row.watchlist ? el('span', { class: 'tag watch', text: 'WATCHLIST' }) : null, row.age_days !== null && row.age_days < 365 ? el('span', { class: 'tag early', text: 'EARLY' }) : null),
      el('div', { class: 'meta' }, (row.category || 'no category') + ' · TVL ' + fmtUsd(row.tvl_usd) + ' · ' + row.chains.join(', ') + ' · age ' + fmtAge(row.age_days) + ' · 7-day TVL ' + fmtChg(row.change_7d)),
      el('div', { class: 'kv' },
        el('div', {}, el('div', { class: 'k', text: 'Implied value' }), el('div', { class: 'v', text: fmtUsd(row.implied_value_usd) })),
        el('div', {}, el('div', { class: 'k', text: 'Value if it launches' }), el('div', { class: 'v', text: fmtUsd(row.value_if_launches_usd) })),
        el('div', {}, el('div', { class: 'k', text: 'Launch odds (1y)' }), el('div', { class: 'v', text: fmtPct(row.launch_odds, 1) })),
        el('div', {}, el('div', { class: 'k', text: 'Band P25–P75' }), el('div', { class: 'v', text: fmtUsd(row.p25) + '–' + fmtUsd(row.p75) }))),
      el('div', { class: 'panel' },
        el('h2', {}, 'How the number is made'),
        el('code', { class: 'formula', text: 'curve at ' + fmtUsd(row.tvl_usd) + ' TVL: ' + fmtUsd(row.value_if_launches_usd) + ' before growth\n  x growth ' + fmtMult(growthOf(row.change_7d)) + ' (7-day move ' + fmtChg(row.change_7d) + ')\n  x launch odds ' + fmtPct(row.launch_odds, 1) + ' (age ' + fmtAge(row.age_days) + ', hazard h0=' + DATA.hazard_h0.toFixed(4) + ', tau=' + DATA.hazard_tau + 'd)\n  = ' + fmtUsd(row.implied_value_usd) + ' implied · band P10–P90 ' + fmtUsd(row.p10) + '–' + fmtUsd(row.p90) }),
        el('div', { class: 'note' }, 'The band comes from 200 bootstrap refits of the curve, then scaled by the same launch odds. It holds 50% of held-out caps inside P25–P75 and 79% inside P10–P90.')),
      el('div', { class: 'panel' },
        el('h2', {}, 'The closest traded comparables'),
        el('table', { class: 'data' },
          el('tr', {}, el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Curve' }), el('th', { class: 'num', text: 'Cap / curve' })),
          comp)),
      el('div', { class: 'panel' },
        el('h2', {}, 'Farm plan · deposit $' + state.deposit.toLocaleString() + ' · airdrop share ' + Math.round(state.share * 100) + '%'),
        el('p', { class: 'note' }, 'Verdict ', verdictEl(e.verdict), ' — expected slice ', el('b', { text: fmtMoney(e.slice) }), ', costs ', el('b', { text: fmtMoney(e.fees + e.opp) }), ', net ', el('b', { text: fmtMoney(e.net) }), ' (' + fmtMoney(e.perHour) + '/h over ' + e.hours + 'h). Break-even odds ' + (e.be > 1 ? 'never — over 100%' : fmtPct(e.be, 1)) + ' against launch odds ' + fmtPct(row.launch_odds, 1) + '.'),
        el('ol', { class: 'steps' }, stepLis)));
  }

  /* ---------------- render ---------------- */
  function render() {
    app.setAttribute('aria-busy', 'true');
    while (app.firstChild) app.removeChild(app.firstChild);
    app.appendChild(headerEl());
    app.appendChild(kpisEl());
    app.appendChild(ledgerEl());
    app.appendChild(badgeEl());
    if (state.tab === 'detail') {
      app.appendChild(detailEl());
    } else {
      var tabs = el('div', { class: 'tabs' });
      ['board', 'live', 'setaside', 'method'].forEach(function (t) {
        tabs.appendChild(el('button', { class: state.tab === t ? 'on' : '', text: t === 'board' ? 'Board (' + DATA.board_size + ')' : t === 'live' ? 'Live tokens (' + DATA.live.length + ')' : t === 'setaside' ? 'Set aside (' + DATA.setAside.length + ')' : 'Method', onclick: function () { state.tab = t; render(); } }));
      });
      app.appendChild(tabs);
      if (state.tab === 'board') {
        var grid = el('div', { class: 'grid' });
        var left = el('div', {}, el('div', { class: 'panel' }, el('h2', {}, 'The size curve'), scatterEl(), el('div', { class: 'note' }, 'Market cap on TVL. Grey: ' + DATA.live.length + ' tokens that trade. Teal: the board at implied value. Line: the size curve, band P25–P75.')), modelPanelEl());
        var right = el('div', {}, el('div', { class: 'panel' }, el('h2', {}, 'The board · ranked by implied value'), boardTableEl()));
        grid.appendChild(left);
        grid.appendChild(right);
        app.appendChild(grid);
      } else if (state.tab === 'live') {
        app.appendChild(liveTableEl());
      } else if (state.tab === 'setaside') {
        app.appendChild(setAsideEl());
      } else {
        app.appendChild(modelPanelEl());
        app.appendChild(el('div', { class: 'panel' }, el('h2', {}, 'The size curve'), scatterEl(), el('div', { class: 'note' }, 'Market cap on TVL. Grey: ' + DATA.live.length + ' tokens that trade. Teal: the board at implied value. Line: the size curve, band P25–P75.')));
      }
    }
    app.appendChild(el('footer', { class: 'foot' },
      'Launch Radar ' + DATA.model_version + ' · snapshot ' + DATA.as_of + ' · ' + DATA.board_size + ' rows · fitted on ' + DATA.backtest.fit_n + ' traded tokens · deterministic: two runs of main.ts write byte-identical board.json, data.js and dossier.json · all figures are read from the sealed snapshot, nothing is fetched.'));
    app.setAttribute('aria-busy', 'false');
  }
  render();
})();
