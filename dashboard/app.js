// Token Radar's dashboard, radar-2. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the row's full formula and farm plan, and a
// model sandbox that re-ranks the board under tweaked constants. No network:
// every byte it shows is in data.js. Farm steps come from data.js too, exactly
// as main.ts wrote them to board.json, so the page and the board cannot drift.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var M = DATA.model.constants;
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var sandbox = { b: M.tvl_exponent, gw: M.growth_weight, oddsFloor: M.odds_floor, mRange: M.maturity_range };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // The model in one function, with the sandbox's constants: the page recomputes
  // a row from the snapshot figures and checks the number board.json carries.
  function impliedOf(row, c) {
    var growth = 1 + (clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, M.growth_floor, M.growth_cap) / 100) * c.gw;
    var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days;
    var maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * c.mRange;
    var logV = M.intercept + c.b * Math.log10(row.tvl_usd) + row.category_adjustment
      + Math.log10(c.oddsFloor + row.token_odds) + Math.log10(growth) + Math.log10(maturity);
    return Math.max(1, Math.round(Math.pow(10, logV)));
  }
  function verdictClass(v) {
    if (v.indexOf('Worth farming') === 0) return 'worth';
    if (v.indexOf('Marginal') === 0) return 'marginal';
    return 'skip';
  }
  function verdictShort(v) {
    if (v.indexOf('Worth farming') === 0) return 'Worth farming';
    if (v.indexOf('Marginal') === 0) return 'Marginal';
    return 'Not worth it';
  }

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

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, ranked by implied value — not by TVL. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function strip() {
    var v = DATA.model.validation;
    return el('div', { class: 'strip' },
      el('span', null, 'Model fitted on ', el('b', { text: String(DATA.model.peers) + ' live-token peers' })),
      el('span', null, 'value grows as TVL^', el('b', { text: String(M.tvl_exponent.toFixed(2)) })),
      el('span', null, 'walk-forward Spearman ', el('b', { text: String(v.walk_forward.spearman) })),
      el('span', null, 'two runs of the program write ', el('b', { text: 'identical bytes' }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: (r.token_odds * 100).toFixed(0) + '%' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'verdict ' + verdictClass(r.farm_verdict), text: verdictShort(r.farm_verdict) }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its formula, farm plan and verdict.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('odds', 'Token odds'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Farm verdict' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the peers the model is fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var v = DATA.model.validation;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every protocol. Its slope is fitted, not chosen: log10(market cap) on log10(TVL) over the ' + DATA.model.peers + ' live-token peers gives an exponent of ' + M.tvl_exponent.toFixed(2) + ' — value grows with the square root of TVL, so the biggest TVL does not win by default. No protocol name is special-cased.' }),
      el('div', { class: 'formula' },
        'implied = 10^( ' + M.intercept.toFixed(2) + ' + ' + M.tvl_exponent.toFixed(2) + ' x log10(TVL) + category adjustment + log10(0.6 + token odds) + log10(growth x) + log10(maturity x) )'
      ),
      el('p', { class: 'sub', text: 'Category adjustment is log10(category median mcap/TVL / global median ' + M.global_multiple.toFixed(3) + '), shrunk by n/(n+5). Token odds is the share of the category that already has a token. Growth is clamped to ' + M.growth_floor + '%..+' + M.growth_cap + '% at weight ' + M.growth_weight + '; maturity is ' + M.maturity_floor + ' + min(age, ' + M.maturity_days + 'd)/' + M.maturity_days + 'd x ' + M.maturity_range + '. Age is the time since first listing; an unlisted age uses ' + M.unknown_age_days + ' days.' }),
      el('table', null,
        el('thead', null, el('tr', null, el('th', { text: 'Held-out check' }), el('th', { text: 'Spearman' }), el('th', { text: 'log10 RMSE' }))),
        el('tbody', null,
          el('tr', null, el('td', { text: 'Walk-forward (train oldest 70%, test newest 30%)' }), el('td', { class: 'num', text: String(v.walk_forward.spearman) }), el('td', { class: 'num', text: String(v.walk_forward.log_rmse) })),
          el('tr', null, el('td', { text: 'Leave-one-out (n=' + v.loo.n + ')' }), el('td', { class: 'num', text: String(v.loo.spearman) }), el('td', { class: 'num', text: String(v.loo.log_rmse) })),
          el('tr', null, el('td', { text: 'Starter model, same walk-forward test' }), el('td', { class: 'num', text: String(v.starter_walk_forward.spearman) }), el('td', { class: 'num', text: String(v.starter_walk_forward.log_rmse) }))
        )
      ),
      el('p', { class: 'sub', text: 'Honest limit: a fitted growth coefficient came out negative and a fitted maturity coefficient flipped sign between fits, so neither is fitted — both stay small bounded priors. The model ranks value; it never predicts whether or when a token is issued.' })
    );
  }

  function sandboxPanel() {
    var box = el('section', { class: 'panel sandbox' },
      el('h2', { text: 'Model sandbox — change a constant, re-rank the board' }),
      el('p', { class: 'sub', text: 'The board above is the fitted model. Move a constant here and the page recomputes every row with the same formula, so you can see what the ranking depends on.' }),
      el('div', { class: 'sandbox-grid' })
    );
    var grid = box.querySelector('.sandbox-grid');
    var result = el('div', { class: 'sandbox-note' });
    function field(label, key, min, max, step) {
      var wrap = el('div', null, el('label', { text: label }));
      var input = el('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(sandbox[key]) });
      var out = el('output', { text: String(sandbox[key]) });
      input.addEventListener('input', function () {
        var val = parseFloat(input.value);
        if (isFinite(val)) { sandbox[key] = clamp(val, min, max); out.textContent = String(sandbox[key]); refresh(); }
      });
      wrap.appendChild(input);
      wrap.appendChild(out);
      grid.appendChild(wrap);
    }
    field('TVL exponent (fitted ' + M.tvl_exponent.toFixed(2) + ')', 'b', 0.3, 0.8, 0.01);
    field('Growth weight (prior 0.25)', 'gw', 0, 0.5, 0.05);
    field('Odds floor (prior 0.6)', 'oddsFloor', 0.3, 1, 0.05);
    field('Maturity range (prior 0.4)', 'mRange', 0, 0.6, 0.05);
    function refresh() {
      var rescored = DATA.rows.map(function (r) { return { slug: r.slug, name: r.name, rank: r.rank, v: impliedOf(r, sandbox) }; });
      rescored.sort(function (a, b) { return b.v - a.v || (a.slug < b.slug ? -1 : 1); });
      var top = rescored.slice(0, 5).map(function (r, i) { return (i + 1) + '. ' + r.name + ' ' + fmtUsd(r.v) + ' (was #' + r.rank + ')'; }).join('  ·  ');
      var moved = rescored.filter(function (r, i) { return (i + 1) !== r.rank; }).length;
      result.textContent = 'Top 5 under these constants: ' + top + ' — ' + moved + ' of ' + rescored.length + ' rows change rank.';
    }
    box.appendChild(result);
    refresh();
    return box;
  }

  function methodPanel() {
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How to read this radar' }),
      el('ol', null,
        el('li', { text: 'Pre-token means the snapshot records no token (no market cap, no CoinGecko id, no symbol). It is a record, not a promise: a protocol on this board may still have a token the record does not carry.' }),
        el('li', { text: 'Implied value is what the token would be worth if the protocol\'s record stayed as it is. It is the model\'s claim, fitted on the 128 protocols whose tokens already trade.' }),
        el('li', { text: 'Farm verdicts follow expected value: implied value times the category\'s token odds. Worth farming at $5M or more, marginal at $1M or more. Every plan states its gas, its capital and its days.' }),
        el('li', { text: 'Live-token protocols are set aside with their market caps shown. They are the market\'s own values, never the model\'s.' })
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = row.farm_steps || [];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Token odds (category record)' }), el('b', { class: 'num', text: (row.token_odds * 100).toFixed(0) + '%' })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: row.maturity_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Category adjustment' }), el('b', { class: 'num', text: (row.category_adjustment >= 0 ? '+' : '') + row.category_adjustment.toFixed(3) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': ' + row.formula }),
      el('p', { class: 'sub', text: 'The page recomputes this row as ' + fmtUsd(impliedOf(row, { b: M.tvl_exponent, gw: M.growth_weight, oddsFloor: M.odds_floor, mRange: M.maturity_range })) + (impliedOf(row, { b: M.tvl_exponent, gw: M.growth_weight, oddsFloor: M.odds_floor, mRange: M.maturity_range }) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'verdict-line ' + verdictClass(row.farm_verdict), text: row.farm_verdict + ' — about $' + row.farm_cost_usd + ' of gas, $' + row.farm_capital_usd + ' of capital, ' + row.farm_hold_days + ' days.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(strip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(sandboxPanel());
      shell.appendChild(methodPanel());
    }
    shell.appendChild(el('div', { class: 'foot', text: 'Snapshot ' + DATA.as_of + ' from ' + DATA.source + '. Implied values are a model fitted on the snapshot, not prices and not predictions of a launch.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
