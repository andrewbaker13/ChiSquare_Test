// Minimal, stable chi-square app logic (no chart/features)
(function () {
  var rowsInput = document.getElementById('rows');
  var colsInput = document.getElementById('cols');
  var alphaSelect = document.getElementById('alpha');
  var yatesInput = document.getElementById('yates');
  var buildBtn = document.getElementById('buildTable');
  var clearBtn = document.getElementById('clearTable');
  var sampleBtn = document.getElementById('sampleData');
  var tableContainer = document.getElementById('tableContainer');
  var expectedContainer = document.getElementById('expectedContainer');
  // Chart elements
  var chartContainer = document.getElementById('stackedChart');
  var chartLegend = document.getElementById('chartLegend');
  var chartTooltip = document.getElementById('chartTooltip');
  var chartCaption = document.getElementById('chartCaption');
  var chartXAxisSelect = document.getElementById('chartXAxis');
  var cellLabelModeSelect = document.getElementById('cellLabelMode');
  // Optional labels for rows/cols
  var rowLabelsInput = document.getElementById('rowLabelsInput');
  var colLabelsInput = document.getElementById('colLabelsInput');
  // Edit panel elements
  var toggleEditBtn = document.getElementById('toggleEditLabels');
  var editPanel = document.getElementById('editPanel');
  var editRowVar = document.getElementById('editRowVar');
  var editColVar = document.getElementById('editColVar');
  var editRowLabels = document.getElementById('editRowLabels');
  var editColLabels = document.getElementById('editColLabels');
  var applyEditBtn = document.getElementById('applyEditLabels');
  var cancelEditBtn = document.getElementById('cancelEditLabels');

  var chi2El = document.getElementById('chi2');
  var dfEl = document.getElementById('df');
  var pValEl = document.getElementById('pValue');
  var cramerVEl = document.getElementById('cramerV');
  var decisionEl = document.getElementById('decision');
  var interpEl = document.getElementById('interpretation');
  var mgrEl = document.getElementById('managerInterpretation');
  var apaEl = document.getElementById('apaReport');

  var R = clamp(parseInt(getValue(rowsInput), 10) || 2, 2, 10);
  var C = clamp(parseInt(getValue(colsInput), 10) || 2, 2, 10);
  var rowVarName = 'Rows';
  var colVarName = 'Columns';
  var rowLabels = [];
  var colLabels = [];
  var editLabelsMode = false;

  setValue(rowsInput, String(R));
  setValue(colsInput, String(C));

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function getValue(el) { return el ? el.value : ''; }
  function setValue(el, v) { if (el) el.value = v; }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    if (children && children.length) children.forEach(function (c) { node.appendChild(c); });
    return node;
  }
  function elNS(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    attrs = attrs || {};
    for (var k in attrs) { node.setAttribute(k, attrs[k]); }
    return node;
  }

  function syncNamesFromWindow() {
    if (typeof window !== 'undefined') {
      if (typeof window.rowVarName === 'string' && window.rowVarName.trim()) rowVarName = window.rowVarName.trim();
      if (typeof window.colVarName === 'string' && window.colVarName.trim()) colVarName = window.colVarName.trim();
    }
  }

  function buildObservedTable(rows, cols) {
    if (!tableContainer) return;
    syncNamesFromWindow();
    var table = el('table', { class: 'grid-table' });
    var thead = el('thead');
    // Header row 1: variable names (view-only)
    var headRow1 = el('tr');
    var rowVarTh = el('th', { id: 'rowVarNameCell' });
    rowVarTh.textContent = rowVarName;
    headRow1.appendChild(rowVarTh);
    var colVarTh = el('th', { id: 'colVarNameCell' });
    colVarTh.colSpan = cols;
    colVarTh.textContent = colVarName;
    headRow1.appendChild(colVarTh);
    headRow1.appendChild(el('th', { text: 'Row total' }));
    thead.appendChild(headRow1);
    // Header row 2: column labels (view-only)
    var headRow2 = el('tr');
    headRow2.appendChild(el('th', { text: '' }));
    for (var j = 0; j < cols; j++) {
      var th = el('th', { 'data-j': String(j) });
      th.textContent = (colLabels[j] || ('Col ' + (j + 1)));
      headRow2.appendChild(th);
    }
    headRow2.appendChild(el('th', { text: '' }));
    thead.appendChild(headRow2);
    table.appendChild(thead);

    var tbody = el('tbody');
    for (var i = 0; i < rows; i++) {
      var tr = el('tr');
      var rowTh = el('th', { 'data-i': String(i) });
      rowTh.textContent = (rowLabels[i] || ('Row ' + (i + 1)));
      tr.appendChild(rowTh);
      for (var jj = 0; jj < cols; jj++) {
        var td = el('td');
        var inp = el('input', { type: 'number', min: '0', step: '1', value: '0', 'data-i': String(i), 'data-j': String(jj) });
        on(inp, 'input', recompute);
        on(inp, 'change', recompute);
        on(inp, 'keyup', recompute);
        td.appendChild(inp);
        td.appendChild(el('span', { class: 'cell-label', text: '' }));
        tr.appendChild(td);
      }
      var totalCell = el('td', { class: 'total', text: '0' });
      tr.appendChild(totalCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    var tfoot = el('tfoot');
    var footRow = el('tr');
    footRow.appendChild(el('td', { class: 'total', text: 'Col total' }));
    for (var k = 0; k < cols; k++) footRow.appendChild(el('td', { class: 'total', text: '0' }));
    footRow.appendChild(el('td', { class: 'total', text: 'Grand total: 0' }));
    tfoot.appendChild(footRow);
    table.appendChild(tfoot);

    tableContainer.innerHTML = '';
    tableContainer.appendChild(table);
  }

  function getObserved() {
    var table = tableContainer ? tableContainer.querySelector('table') : null;
    if (!table) return null;
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    if (rows.length === 0) return null;
    var values = rows.map(function (tr) {
      var inputs = Array.prototype.slice.call(tr.querySelectorAll('input[type="number"]'));
      return inputs.map(function (inp) {
        var v = typeof inp.valueAsNumber === 'number' && !isNaN(inp.valueAsNumber) ? inp.valueAsNumber : parseFloat(inp.value);
        return !isFinite(v) || v < 0 ? 0 : v;
      });
    });
    R = values.length;
    C = values[0] ? values[0].length : 0;
    return values;
  }

  function recompute() {
    var table = tableContainer ? tableContainer.querySelector('table') : null;
    if (!table) return;
    var obs = getObserved();
    if (!obs) return;

    var totals = computeTotals(obs);
    var rowTotals = totals.rowTotals, colTotals = totals.colTotals, grand = totals.grand;

    // Update UI totals
    var rowTotalCells = table.querySelectorAll('tbody tr td.total');
    for (var i = 0; i < rowTotals.length; i++) if (rowTotalCells[i]) rowTotalCells[i].textContent = fmt(rowTotals[i]);
    var footCells = table.querySelectorAll('tfoot td');
    for (var j = 0; j < colTotals.length; j++) if (footCells[j + 1]) footCells[j + 1].textContent = fmt(colTotals[j]);
    if (footCells[colTotals.length + 1]) footCells[colTotals.length + 1].textContent = 'Grand total: ' + fmt(grand);

    // Expected counts
    var E = computeExpected(rowTotals, colTotals, grand);
    renderExpected(E);

    // Chi-square
    var useYates = (yatesInput && yatesInput.checked && R === 2 && C === 2);
    var res = chiSquare(obs, E, grand, useYates);
    displayResults(res);
    // Chart with current labels
    ensureLabelArrays();
    renderChart(obs, rowLabels.slice(), colLabels.slice());
    // Narrative outputs
    updateNarratives(grand, res, useYates);
    // Cell labels
    updateCellLabels(obs, E, rowTotals, colTotals, grand);
  }

  function computeTotals(obs) {
    var rN = obs.length;
    var cN = obs[0] ? obs[0].length : 0;
    var rowTotals = obs.map(function (row) { return row.reduce(function (a, b) { return a + b; }, 0); });
    var colTotals = new Array(cN);
    for (var j = 0; j < cN; j++) {
      var s = 0; for (var i = 0; i < rN; i++) s += obs[i][j];
      colTotals[j] = s;
    }
    var grand = rowTotals.reduce(function (a, b) { return a + b; }, 0);
    return { rowTotals: rowTotals, colTotals: colTotals, grand: grand };
  }

  function computeExpected(rowTotals, colTotals, grand) {
    var rN = rowTotals.length;
    var cN = colTotals.length;
    var E = new Array(rN);
    for (var i = 0; i < rN; i++) {
      E[i] = new Array(cN);
      for (var j = 0; j < cN; j++) E[i][j] = grand > 0 ? (rowTotals[i] * colTotals[j]) / grand : 0;
    }
    return E;
  }

  function updateCellLabels(obs, E, rowTotals, colTotals, grand) {
    if (!tableContainer) return;
    var mode = cellLabelModeSelect ? cellLabelModeSelect.value : 'none';
    var table = tableContainer.querySelector('table');
    if (!table) return;
    var rows = table.querySelectorAll('tbody tr');
    for (var i = 0; i < obs.length && i < rows.length; i++) {
      var tds = rows[i].querySelectorAll('td');
      for (var j = 0; j < obs[i].length && j < tds.length - 1; j++) {
        var td = tds[j];
        var span = td.querySelector('span.cell-label');
        if (!span) continue;
        if (mode === 'none') { span.style.display = 'none'; span.textContent = ''; continue; }
        span.style.display = 'block';
        var txt = '';
        if (mode === 'observed') { txt = fmt(obs[i][j], 0); }
        else if (mode === 'expected') { txt = fixed(E[i][j], 2); }
        else if (mode === 'row_pct') { txt = (rowTotals[i] > 0) ? ( (obs[i][j] / rowTotals[i] * 100).toFixed(1) + '%' ) : '-'; }
        else if (mode === 'col_pct') { txt = (colTotals[j] > 0) ? ( (obs[i][j] / colTotals[j] * 100).toFixed(1) + '%' ) : '-'; }
        else if (mode === 'table_pct') { txt = (grand > 0) ? ( (obs[i][j] / grand * 100).toFixed(1) + '%' ) : '-'; }
        span.textContent = txt;
      }
    }
  }

  function renderExpected(E) {
    if (!expectedContainer) return;
    var rN = E.length;
    var cN = E[0] ? E[0].length : 0;
    var table = el('table');
    // header
    var head = el('tr');
    head.appendChild(el('td', { text: '' }));
    for (var j = 0; j < cN; j++) head.appendChild(el('td', { text: (colLabels[j] || ('Col ' + (j + 1))) }));
    table.appendChild(head);
    // rows
    for (var i = 0; i < rN; i++) {
      var tr = el('tr');
      tr.appendChild(el('td', { text: (rowLabels[i] || ('Row ' + (i + 1))) }));
      for (var j2 = 0; j2 < cN; j2++) tr.appendChild(el('td', { text: fixed(E[i][j2], 3) }));
      table.appendChild(tr);
    }
    expectedContainer.innerHTML = '';
    expectedContainer.appendChild(table);
  }

  function updateHeaderTexts() {
    var table = tableContainer ? tableContainer.querySelector('table') : null;
    if (!table) return;
    var headRows = table.querySelectorAll('thead tr');
    if (headRows.length >= 2) {
      var rowVarTh = headRows[0].querySelector('#rowVarNameCell');
      var colVarTh = headRows[0].querySelector('#colVarNameCell');
      if (rowVarTh) rowVarTh.textContent = rowVarName;
      if (colVarTh) colVarTh.textContent = colVarName;
      var ths = headRows[1].querySelectorAll('th[data-j]');
      for (var j = 0; j < ths.length; j++) ths[j].textContent = (colLabels[j] || ('Col ' + (j + 1)));
    }
    var rowHeads = table.querySelectorAll('tbody tr th[data-i]');
    for (var i = 0; i < rowHeads.length; i++) rowHeads[i].textContent = (rowLabels[i] || ('Row ' + (i + 1)));
  }

  function chiSquare(obs, exp, n, yates) {
    var rN = obs.length; var cN = obs[0] ? obs[0].length : 0;
    var sum = 0;
    for (var i = 0; i < rN; i++) {
      for (var j = 0; j < cN; j++) {
        var O = obs[i][j];
        var E = exp[i][j];
        if (E <= 0) continue;
        var diff = O - E;
        if (yates) {
          var sign = diff >= 0 ? 1 : -1;
          var mag = Math.max(0, Math.abs(diff) - 0.5);
          diff = sign * mag;
        }
        sum += (diff * diff) / E;
      }
    }
    var df = (rN - 1) * (cN - 1);
    var p = chiSquarePValue(sum, df);
    var k = Math.min(rN - 1, cN - 1);
    var V = (k > 0 && n > 0) ? Math.sqrt(sum / (n * k)) : NaN;
    return { chi2: sum, df: df, p: p, V: V };
  }

  // Numerical utils (Lanczos + incomplete gamma)
  function gammaln(z) {
    var cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
    var x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < cof.length; j++) { y += 1; ser += cof[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function gammaincLowerRegularized(s, x) {
    if (x < 0 || s <= 0) return NaN; if (x === 0) return 0;
    if (x < s + 1) {
      var sum = 1 / s, term = sum;
      for (var n = 1; n < 1000; n++) {
        term *= x / (s + n); sum += term;
        if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
      }
      return sum * Math.exp(-x + s * Math.log(x) - gammaln(s));
    } else { return 1 - gammaincUpperRegularized(s, x); }
  }
  function gammaincUpperRegularized(s, x) {
    if (x < 0 || s <= 0) return NaN; if (x === 0) return 1;
    if (x < s + 1) { var P = gammaincLowerRegularized(s, x); return 1 - P; }
    var eps = 1e-14, maxIter = 10000;
    var b = x + 1 - s, c = 1 / 1e-30, d = 1 / b, h = d;
    for (var i = 1; i <= maxIter; i++) {
      var an = -i * (i - s); b += 2; d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; var del = d * c; h *= del; if (Math.abs(del - 1) < eps) break;
    }
    var pre = Math.exp(-x + s * Math.log(x) - gammaln(s));
    return h * pre;
  }
  function chiSquarePValue(chi2, df) {
    if (!isFinite(chi2) || !isFinite(df) || chi2 < 0 || df <= 0) return NaN;
    var s = df / 2; var x = chi2 / 2; return gammaincUpperRegularized(s, x);
  }

  function displayResults(res) {
    if (!chi2El || !dfEl || !pValEl) return;
    if (!res) {
      chi2El.textContent = '-'; dfEl.textContent = '-'; pValEl.textContent = '-'; if (cramerVEl) cramerVEl.textContent = '-'; if (decisionEl) decisionEl.textContent = '-'; if (interpEl) interpEl.textContent = '-'; return;
    }
    chi2El.textContent = fixed(res.chi2, 3);
    dfEl.textContent = String(res.df);
    pValEl.textContent = fixed(res.p, 3);
    if (cramerVEl) cramerVEl.textContent = isFinite(res.V) ? fixed(res.V, 4) : '-';
    var alpha = alphaSelect ? parseFloat(alphaSelect.value) : 0.05;
    if (!isFinite(alpha)) alpha = 0.05;
    var reject = isFinite(res.p) && res.p < alpha;
    if (decisionEl) decisionEl.textContent = (reject ? 'Reject H0 at alpha=' : 'Fail to reject H0 at alpha=') + alpha;
    if (interpEl) interpEl.textContent = buildInterpretation(reject, res.p, res.df);
  }

  function updateNarratives(N, res, usedYates) {
    if (!res || !isFinite(N)) {
      if (mgrEl) mgrEl.textContent = '';
      if (apaEl) apaEl.textContent = '';
      return;
    }
    // Pick up current variable names from headers if edited inline
    var rowVarTh = document.getElementById('rowVarNameCell');
    var colVarTh = document.getElementById('colVarNameCell');
    var rVar = rowVarTh && rowVarTh.textContent ? rowVarTh.textContent.trim() : rowVarName;
    var cVar = colVarTh && colVarTh.textContent ? colVarTh.textContent.trim() : colVarName;

    var alpha = alphaSelect ? parseFloat(alphaSelect.value) : 0.05;
    if (!isFinite(alpha)) alpha = 0.05;
    var reject = isFinite(res.p) && res.p < alpha;
    var Vdesc = describeEffect(res.V);

    if (mgrEl) {
      var base = 'We tested whether ' + rVar + ' and ' + cVar + ' are associated using a chi-square test of independence.';
      var sig = reject
        ? ' The test is statistically significant at alpha = ' + alpha + ' (p = ' + prettyP(res.p) + '), indicating that the distribution of ' + cVar + ' differs across levels of ' + rVar + '.'
        : ' The test is not statistically significant at alpha = ' + alpha + ' (p = ' + prettyP(res.p) + '), so we do not have sufficient evidence that the distribution of ' + cVar + ' differs across levels of ' + rVar + '.';
      var es = '';
      if (isFinite(res.V)) {
        var assocWord = Vdesc ? (' a ' + Vdesc + ' association ') : ' an association ';
        es = ' Effect size (Cramer\'s V) is ' + fixed(res.V, 3) + (Vdesc ? ' (' + Vdesc + ')' : '') + ', indicating' + assocWord + 'between ' + rVar + ' and ' + cVar + '.';
      }
      var note = (usedYates && res.df === 1) ? ' Yates\' continuity correction was applied (2x2 table).' : '';
      mgrEl.textContent = base + sig + es + note;
    }

    if (apaEl) {
      apaEl.textContent = buildApa(rVar, cVar, N, res, usedYates);
    }
  }

  function prettyP(p) {
    if (!isFinite(p)) return 'NA';
    if (p < 0.001) return '< .001';
    var v = Number(p).toFixed(3);
    return v;
  }

  function describeEffect(V) {
    if (!isFinite(V)) return '';
    // Cohen-style rough guidelines for Cramer's V
    if (V >= 0.5) return 'large';
    if (V >= 0.3) return 'medium';
    if (V >= 0.1) return 'small';
    return 'very small';
  }

  function buildApa(rVar, cVar, N, res, usedYates) {
    var stat = 'X^2(' + res.df + ', N = ' + fmt(N, 0) + ') = ' + fixed(res.chi2, 2) + ', p ' + (res.p < 0.001 ? '< .001' : '= ' + prettyP(res.p));
    var corr = (usedYates && res.df === 1) ? ' with Yates\' continuity correction' : '';
    var eff = isFinite(res.V) ? (', Cramer\'s V = ' + fixed(res.V, 3)) : '';
    return 'Association between ' + rVar + ' and ' + cVar + ': ' + stat + corr + eff + '.';
  }

  function fmt(x, digits) {
    digits = digits || 4;
    if (!isFinite(x)) return '-';
    return Number(x).toFixed(digits).replace(/\.0+$/, '');
  }
  function fixed(x, n) { return (!isFinite(x) ? '-' : Number(x).toFixed(n)); }

  function buildInterpretation(reject, p, df) {
    var pText = isFinite(p) ? ('p = ' + Number(p).toPrecision(3)) : 'p = NA';
    return reject ? ('There is a statistically significant association (' + pText + ', df = ' + df + ').') : ('There is not sufficient evidence of association (' + pText + ', df = ' + df + ').');
  }

  function parseLabels(val, n, prefix) {
    var parts = (val || '').split(',');
    var out = [];
    for (var i = 0; i < n; i++) {
      var t = (parts[i] || '').trim();
      out.push(t ? t : (prefix + (i + 1)));
    }
    return out;
  }

  function ensureLabelArrays() {
    syncNamesFromWindow();
    var winRows = (typeof window !== 'undefined' && Array.isArray(window.rowLabels) && window.rowLabels.length) ? window.rowLabels : null;
    var winCols = (typeof window !== 'undefined' && Array.isArray(window.colLabels) && window.colLabels.length) ? window.colLabels : null;
    if (winRows) {
      rowLabels = winRows.slice(0, R);
    } else if (!rowLabels.length && rowLabelsInput) {
      rowLabels = parseLabels(getValue(rowLabelsInput), R, 'Row ');
    }
    if (winCols) {
      colLabels = winCols.slice(0, C);
    } else if (!colLabels.length && colLabelsInput) {
      colLabels = parseLabels(getValue(colLabelsInput), C, 'Col ');
    }
    rowLabels = rowLabels.slice(0, R); while (rowLabels.length < R) rowLabels.push('Row ' + (rowLabels.length + 1));
    colLabels = colLabels.slice(0, C); while (colLabels.length < C) colLabels.push('Col ' + (colLabels.length + 1));
  }

  // 100% stacked bar chart
  function renderChart(obs, rowLbls, colLbls) {
    if (!chartContainer || !chartLegend) return;
    chartContainer.innerHTML = '';
    chartLegend.innerHTML = '';
    var rN = obs.length; var cN = obs[0] ? obs[0].length : 0;
    if (rN === 0 || cN === 0) return;
    var xAxis = chartXAxisSelect ? chartXAxisSelect.value : 'rows';

    var bars = [];
    var barLabels = [];
    var stackLabels = [];
    if (xAxis === 'rows') {
      for (var i = 0; i < rN; i++) bars.push(obs[i].slice());
      barLabels = rowLbls.slice();
      stackLabels = colLbls.slice();
    } else {
      for (var j = 0; j < cN; j++) {
        var col = [];
        for (var i2 = 0; i2 < rN; i2++) col.push(obs[i2][j]);
        bars.push(col);
      }
      barLabels = colLbls.slice();
      stackLabels = rowLbls.slice();
    }

    var palette = ['#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e40af','#1e3a8a','#172554'];
    var colors = stackLabels.map(function(_, idx){ return palette[idx % palette.length]; });

    var W = chartContainer.clientWidth || 800;
    var H = chartContainer.clientHeight || 360;
    var margin = { top: 20, right: 20, bottom: 40, left: 40 };
    var innerW = Math.max(100, W - margin.left - margin.right);
    var innerH = Math.max(100, H - margin.top - margin.bottom);
    var svg = elNS('svg', { width: W, height: H });
    var g = elNS('g', { transform: 'translate(' + margin.left + ',' + margin.top + ')' });
    svg.appendChild(g);

    // y grid + ticks
    var ticks = [0, 0.25, 0.5, 0.75, 1];
    for (var t = 0; t < ticks.length; t++) {
      var y = innerH * (1 - ticks[t]);
      g.appendChild(elNS('line', { x1: 0, y1: y, x2: innerW, y2: y, stroke: '#e5e7eb' }));
      var lbl = elNS('text', { x: -10, y: y + 4, 'text-anchor': 'end', fill: '#6b7280', 'font-size': '12' });
      lbl.textContent = Math.round(ticks[t] * 100) + '%';
      g.appendChild(lbl);
    }

    var barWidth = Math.max(10, innerW / (bars.length * 1.25));
    var gap = barWidth * 0.25;
    for (var b = 0; b < bars.length; b++) {
      var segs = bars[b];
      var total = segs.reduce(function(a,b){return a+b;}, 0);
      var yOffset = innerH;
      for (var s = 0; s < segs.length; s++) {
        var prop = total > 0 ? segs[s] / total : 0;
        var h = prop * innerH;
        var x = b * (barWidth + gap);
        var y = yOffset - h;
        var rect = elNS('rect', { x: x, y: y, width: barWidth, height: h, fill: colors[s] });
        (function(barName, segName, count, propStr){
          rect.addEventListener('mousemove', function(ev){ showTooltip(ev, barName, segName, count, propStr); });
          rect.addEventListener('mouseleave', hideTooltip);
        })(barLabels[b], stackLabels[s], segs[s], (total>0? ( (segs[s]/total*100).toFixed(1)+'%' ): '-'));
        g.appendChild(rect);
        // Percentage label inside the segment (if tall enough)
        if (h >= 16) {
          var percentLabel = elNS('text', { x: x + barWidth/2, y: y + h/2 + 4, 'text-anchor': 'middle', fill: '#111827', 'font-size': '12' });
          percentLabel.textContent = total > 0 ? (prop * 100).toFixed(1) + '%' : '-';
          g.appendChild(percentLabel);
        }
        yOffset -= h;
      }
      var lx = b * (barWidth + gap) + barWidth/2;
      var ly = innerH + 16;
      var tx = elNS('text', { x: lx, y: ly, 'text-anchor': 'middle', fill: '#334155', 'font-size': '12' });
      tx.textContent = barLabels[b];
      g.appendChild(tx);
    }

    chartContainer.appendChild(svg);

    // Legend
    for (var i3 = 0; i3 < stackLabels.length; i3++) {
      var item = el('div', { class: 'legend-item' });
      var sw = el('span', { class: 'legend-swatch' });
      sw.style.background = colors[i3];
      var label = el('span', { text: stackLabels[i3] });
      item.appendChild(sw); item.appendChild(label);
      chartLegend.appendChild(item);
    }

    if (chartCaption) {
      var barsName = (xAxis === 'rows') ? 'Rows' : 'Columns';
      var stacksName = (xAxis === 'rows') ? 'Columns' : 'Rows';
      chartCaption.textContent = 'Bars: ' + barsName + ' - Stacks: ' + stacksName + ' (100% per bar)';
    }
  }

  function showTooltip(ev, bar, seg, count, prop) {
    if (!chartTooltip || !chartContainer) return;
    chartTooltip.style.display = 'block';
    chartTooltip.innerHTML = '<strong>' + escapeHtml(bar) + '</strong><br>' + escapeHtml(seg) + '<br>Count: ' + fmt(count,0) + '<br>Proportion: ' + prop;
    var rect = chartContainer.getBoundingClientRect();
    var x = ev.clientX - rect.left + 10;
    var y = ev.clientY - rect.top + 10;
    chartTooltip.style.left = x + 'px';
    chartTooltip.style.top = y + 'px';
  }
  function hideTooltip(){ if(chartTooltip) chartTooltip.style.display='none'; }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]);}); }

  function clearTable() {
    var inputs = tableContainer ? tableContainer.querySelectorAll('tbody input') : [];
    inputs.forEach(function (inp) { inp.value = '0'; });
    recompute();
  }
  function sampleData() {
    var table = tableContainer ? tableContainer.querySelector('table') : null;
    if (!table) return;
    var inputs = table.querySelectorAll('tbody input');
    inputs.forEach(function (inp) {
      var v = Math.floor(Math.random() * (25 - 8 + 1)) + 8; // 8..25 inclusive
      inp.value = String(v);
    });
    recompute();
  }

  function rebuild() {
    R = clamp(parseInt(getValue(rowsInput), 10) || 2, 2, 10);
    C = clamp(parseInt(getValue(colsInput), 10) || 2, 2, 10);
    setValue(rowsInput, String(R)); setValue(colsInput, String(C));
    ensureLabelArrays();
    buildObservedTable(R, C);
    recompute();
  }

  // Wire events
  on(buildBtn, 'click', rebuild);
  on(clearBtn, 'click', clearTable);
  on(sampleBtn, 'click', sampleData);
  on(rowsInput, 'change', rebuild);
  on(colsInput, 'change', rebuild);
  on(yatesInput, 'change', recompute);
  on(alphaSelect, 'change', recompute);
  on(chartXAxisSelect, 'change', recompute);
  on(cellLabelModeSelect, 'change', recompute);
  window.addEventListener('resize', function(){ var obs = getObserved(); if (obs) { renderChart(obs, rowLabels.slice(), colLabels.slice()); } });
  on(toggleEditBtn, 'click', openEditPanel);
  on(applyEditBtn, 'click', applyEditNames);
  on(cancelEditBtn, 'click', closeEditPanel);
  on(toggleEditBtn, 'click', function(){
    editLabelsMode = !editLabelsMode;
    // Toggle contentEditable on headers
    var rowVarTh = document.getElementById('rowVarNameCell');
    var colVarTh = document.getElementById('colVarNameCell');
    if (rowVarTh) rowVarTh.contentEditable = editLabelsMode ? 'true' : 'false';
    if (colVarTh) colVarTh.contentEditable = editLabelsMode ? 'true' : 'false';
    var headRows = tableContainer ? tableContainer.querySelectorAll('thead tr') : [];
    if (headRows.length >= 2) {
      var ths = headRows[1].querySelectorAll('th[data-j]');
      ths.forEach(function(th){ th.contentEditable = editLabelsMode ? 'true' : 'false'; });
    }
    var rowHeads = tableContainer ? tableContainer.querySelectorAll('tbody tr th[data-i]') : [];
    rowHeads.forEach(function(th){ th.contentEditable = editLabelsMode ? 'true' : 'false'; });
    if (toggleEditBtn) toggleEditBtn.textContent = editLabelsMode ? 'Done Editing Names' : 'Edit Row/Column Names';
    if (!editLabelsMode) recompute();
  });

  // Initial
  rebuild();
})();

// Panel helpers
function openEditPanel(){
  var panel = document.getElementById('editPanel'); if (!panel) return;
  // Pull current values
  var rv = window.rowVarName || 'Rows';
  var cv = window.colVarName || 'Columns';
  var rl = (window.rowLabels && window.rowLabels.length) ? window.rowLabels.join(', ') : '';
  var cl = (window.colLabels && window.colLabels.length) ? window.colLabels.join(', ') : '';
  var editRowVar = document.getElementById('editRowVar');
  var editColVar = document.getElementById('editColVar');
  var editRowLabels = document.getElementById('editRowLabels');
  var editColLabels = document.getElementById('editColLabels');
  if (editRowVar) editRowVar.value = rv;
  if (editColVar) editColVar.value = cv;
  if (editRowLabels) editRowLabels.value = rl;
  if (editColLabels) editColLabels.value = cl;
  panel.style.display = 'flex';
}
function closeEditPanel(){ var panel = document.getElementById('editPanel'); if (panel) panel.style.display = 'none'; }
function applyEditNames(){
  var editRowVar = document.getElementById('editRowVar');
  var editColVar = document.getElementById('editColVar');
  var editRowLabels = document.getElementById('editRowLabels');
  var editColLabels = document.getElementById('editColLabels');
  window.rowVarName = (editRowVar && editRowVar.value.trim()) ? editRowVar.value.trim() : 'Rows';
  window.colVarName = (editColVar && editColVar.value.trim()) ? editColVar.value.trim() : 'Columns';
  var R = (document.getElementById('rows') && parseInt(document.getElementById('rows').value,10)) || 2;
  var C = (document.getElementById('cols') && parseInt(document.getElementById('cols').value,10)) || 2;
  var rls = (editRowLabels && editRowLabels.value) ? editRowLabels.value.split(',') : [];
  var cls = (editColLabels && editColLabels.value) ? editColLabels.value.split(',') : [];
  window.rowLabels = [];
  for (var i=0;i<R;i++){ var t=(rls[i]||'').trim(); window.rowLabels.push(t? t : ('Row '+(i+1))); }
  window.colLabels = [];
  for (var j=0;j<C;j++){ var tt=(cls[j]||'').trim(); window.colLabels.push(tt? tt : ('Col '+(j+1))); }
  // also update the control inputs for transparency
  var rInput = document.getElementById('rowLabelsInput'); if (rInput) rInput.value = window.rowLabels.join(', ');
  var cInput = document.getElementById('colLabelsInput'); if (cInput) cInput.value = window.colLabels.join(', ');
  // refresh header texts and outputs
  if (typeof updateHeaderTexts === 'function') updateHeaderTexts();
  var obs = (function(){ var tc=document.getElementById('tableContainer'); var t=tc?tc.querySelector('table'):null; if(!t) return null; var rows=Array.prototype.slice.call(t.querySelectorAll('tbody tr')); if(rows.length===0) return null; return rows.map(function(tr){ return Array.prototype.slice.call(tr.querySelectorAll('input[type="number"]')).map(function(inp){ var v=typeof inp.valueAsNumber==='number'&&!isNaN(inp.valueAsNumber)?inp.valueAsNumber:parseFloat(inp.value); return !isFinite(v)||v<0?0:v;});}); })();
  if (obs) {
    var app = window;
    // Recompute totals/expected/chart via existing recompute
    var evt=new Event('change'); var rowsEl=document.getElementById('rows'); if(rowsEl) rowsEl.dispatchEvent(evt); // trigger safe path
  }
  closeEditPanel();
}
