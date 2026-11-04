/* app.js — UI rendering for the three tabs. Talks to the engine through the
 * AR / LY / PR namespaces, which build.py produces from the module exports. */
'use strict';

var AR = require('./armodel.js');
var LY = require('./layout.js');
var PR = require('./predict.js');

var MAX_BATCH = 400;

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fx(v, n) {
  var num = Number(v);
  if (!isFinite(num)) return '—';
  return num.toFixed(n === undefined ? 2 : n);
}

/* ------------------------------------------------------------- structure */

/* Heteroatom inks are CSS variables so they stay legible in both themes. */
var ELEMENT_INK = {
  O: 'var(--el-o)', N: 'var(--el-n)', S: 'var(--el-s)', F: 'var(--el-f)',
  Cl: 'var(--el-f)', Br: 'var(--el-br)', I: 'var(--el-i)', P: 'var(--el-p)',
  Se: 'var(--el-s)', Zn: 'var(--el-m)'
};

function atomLabel(atom) {
  if (atom.el === 'C' && !atom.charge) return null;
  var text = atom.el;
  if (atom.nH === 1) text += 'H';
  else if (atom.nH > 1) text += 'H' + atom.nH;
  if (atom.charge > 0) text += atom.charge > 1 ? '+' + atom.charge : '+';
  if (atom.charge < 0) text += atom.charge < -1 ? String(atom.charge) : '−';
  return text;
}

function svgStructure(mol) {
  var pos = LY.computeLayout(mol);
  var unit = 34, pad = 26;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  var i;
  for (i = 0; i < pos.x.length; i++) {
    if (pos.x[i] < minX) minX = pos.x[i];
    if (pos.x[i] > maxX) maxX = pos.x[i];
    if (pos.y[i] < minY) minY = pos.y[i];
    if (pos.y[i] > maxY) maxY = pos.y[i];
  }
  if (!isFinite(minX)) { minX = maxX = minY = maxY = 0; }

  var w = Math.max(160, (maxX - minX) * unit + pad * 2);
  var h = Math.max(110, (maxY - minY) * unit + pad * 2);
  var px = [], py = [];
  for (i = 0; i < pos.x.length; i++) {
    px.push((pos.x[i] - minX) * unit + pad);
    py.push(h - ((pos.y[i] - minY) * unit + pad));
  }

  var labels = mol.atoms.map(atomLabel);
  var parts = [];

  /* aromatic ring circles */
  for (var r = 0; r < mol.rings.length; r++) {
    var ring = mol.rings[r], allArom = true;
    for (var t = 0; t < ring.length; t++) {
      if (!mol.atoms[ring[t]].arom) { allArom = false; break; }
    }
    if (!allArom) continue;
    var cx = 0, cy = 0;
    for (t = 0; t < ring.length; t++) { cx += px[ring[t]]; cy += py[ring[t]]; }
    cx /= ring.length; cy /= ring.length;
    var rad = Infinity;
    for (t = 0; t < ring.length; t++) {
      var d = Math.sqrt(Math.pow(px[ring[t]] - cx, 2) + Math.pow(py[ring[t]] - cy, 2));
      if (d < rad) rad = d;
    }
    parts.push('<circle cx="' + fx(cx, 1) + '" cy="' + fx(cy, 1) + '" r="' +
               fx(rad * 0.60, 1) + '" fill="none" stroke="currentColor" ' +
               'stroke-width="1.1" opacity=".45"/>');
  }

  /* ring centroids, used to offset double bonds inwards */
  function ringCentroidFor(bondIdx) {
    var bd = mol.bonds[bondIdx];
    for (var k = 0; k < mol.rings.length; k++) {
      var ring2 = mol.rings[k];
      var ia = ring2.indexOf(bd.a), ib = ring2.indexOf(bd.b);
      if (ia < 0 || ib < 0) continue;
      var diff = Math.abs(ia - ib);
      if (diff !== 1 && diff !== ring2.length - 1) continue;
      var gx = 0, gy = 0;
      for (var q = 0; q < ring2.length; q++) { gx += px[ring2[q]]; gy += py[ring2[q]]; }
      return { x: gx / ring2.length, y: gy / ring2.length };
    }
    return null;
  }

  for (var b = 0; b < mol.bonds.length; b++) {
    var bond = mol.bonds[b];
    var x1 = px[bond.a], y1 = py[bond.a], x2 = px[bond.b], y2 = py[bond.b];
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    /* pull the line back from atoms that carry a label */
    var t1 = labels[bond.a] ? 10 : 0, t2 = labels[bond.b] ? 10 : 0;
    var ax = x1 + ux * t1, ay = y1 + uy * t1;
    var bx = x2 - ux * t2, by = y2 - uy * t2;
    var nx = -uy, ny = ux;

    function line(ox, oy, extraShrink) {
      var s = extraShrink || 0;
      return '<line x1="' + fx(ax + nx * ox + ux * s, 1) + '" y1="' + fx(ay + ny * oy + uy * s, 1) +
             '" x2="' + fx(bx + nx * ox - ux * s, 1) + '" y2="' + fx(by + ny * oy - uy * s, 1) +
             '" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
    }

    if (bond.order === 2 && !bond.arom) {
      var centre = ringCentroidFor(b);
      if (centre) {
        var mx = (ax + bx) / 2, my = (ay + by) / 2;
        var towards = ((centre.x - mx) * nx + (centre.y - my) * ny) >= 0 ? 1 : -1;
        parts.push(line(0, 0));
        parts.push(line(3.6 * towards, 3.6 * towards, 3.2));
      } else {
        parts.push(line(2, 2));
        parts.push(line(-2, -2));
      }
    } else if (bond.order === 3) {
      parts.push(line(0, 0));
      parts.push(line(3, 3));
      parts.push(line(-3, -3));
    } else {
      parts.push(line(0, 0));
    }
  }

  for (i = 0; i < mol.atoms.length; i++) {
    if (!labels[i]) continue;
    var ink = ELEMENT_INK[mol.atoms[i].el] || 'currentColor';
    parts.push('<circle cx="' + fx(px[i], 1) + '" cy="' + fx(py[i], 1) +
               '" r="10" fill="var(--card-sub)"/>');
    parts.push('<text x="' + fx(px[i], 1) + '" y="' + fx(py[i] + 4.2, 1) +
               '" text-anchor="middle" font-family="var(--sans)" font-size="12.5" ' +
               'font-weight="700" fill="' + ink + '">' + esc(labels[i]) + '</text>');
  }

  return '<svg viewBox="0 0 ' + fx(w, 1) + ' ' + fx(h, 1) + '" role="img" ' +
         'aria-label="2D 구조식" style="color:var(--ink-2)">' + parts.join('') + '</svg>';
}

/* ---------------------------------------------------------- pocket map */

var RESIDUE_XY = {
  Gln711: [72, 118], Arg752: [72, 206],
  Asn705: [488, 116], Thr877: [488, 200],
  Leu704: [148, 292], Leu707: [238, 302], Met742: [330, 302], Met745: [420, 292],
  Phe764: [150, 38], Met787: [252, 26], Leu873: [352, 26],
  Met895: [448, 40], Ile899: [534, 82]
};

function svgPocket(pocket, occupancy) {
  var parts = [];
  var cx = 280, cy = 164, rx = 118, ry = 68;

  parts.push('<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry +
             '" fill="var(--blue-wash)" stroke="var(--blue)" stroke-width="1.2" ' +
             'stroke-dasharray="3 3" opacity=".9"/>');

  var occLabel = isFinite(occupancy) ? fx(occupancy, 0) + '%' : '—';
  parts.push('<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" ' +
             'font-family="var(--sans)" font-size="30" font-weight="700" ' +
             'letter-spacing="-1" fill="var(--blue)">' + esc(occLabel) + '</text>');
  parts.push('<text x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle" ' +
             'font-family="var(--sans)" font-size="12" font-weight="500" ' +
             'fill="var(--ink-3)">포켓 점유율</text>');

  for (var i = 0; i < pocket.residues.length; i++) {
    var res = pocket.residues[i];
    var xy = RESIDUE_XY[res.id];
    if (!xy) continue;
    var colour = res.clash ? 'var(--red)' : (res.contact ? 'var(--blue)' : 'var(--grey-node)');

    if (res.contact) {
      /* tick from the node toward the cavity wall */
      var vx = cx - xy[0], vy = cy - xy[1];
      var vl = Math.sqrt(vx * vx + vy * vy) || 1;
      parts.push('<line x1="' + fx(xy[0] + vx / vl * 9, 1) + '" y1="' + fx(xy[1] + vy / vl * 9, 1) +
                 '" x2="' + fx(xy[0] + vx / vl * (vl * 0.42), 1) + '" y2="' +
                 fx(xy[1] + vy / vl * (vl * 0.42), 1) +
                 '" stroke="' + colour + '" stroke-width="1.3" opacity=".65"' +
                 (res.clash ? ' stroke-dasharray="2 2"' : '') + '/>');
    }
    parts.push('<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="6.5" fill="' + colour +
               '" opacity="' + (res.contact ? '1' : '.5') + '"/>');
    /* Nodes on the flanks get their label pushed outward and anchored away
     * from the cavity; top and bottom rows stay centred. */
    var anchor, tx, ty;
    if (xy[1] < 60) { anchor = 'middle'; tx = xy[0]; ty = xy[1] - 12; }
    else if (xy[1] > 270) { anchor = 'middle'; tx = xy[0]; ty = xy[1] + 20; }
    else if (xy[0] < 180) { anchor = 'end'; tx = xy[0] - 11; ty = xy[1] + 4; }
    else if (xy[0] > 430) { anchor = 'start'; tx = xy[0] + 11; ty = xy[1] + 4; }
    else { anchor = 'middle'; tx = xy[0]; ty = xy[1] + 20; }
    parts.push('<text x="' + fx(tx, 1) + '" y="' + fx(ty, 1) + '" text-anchor="' + anchor +
               '" font-family="var(--sans)" font-size="11.5" font-weight="600" ' +
               'fill="' + colour + '" ' +
               'opacity="' + (res.contact ? '1' : '.6') + '">' + esc(res.id) + '</text>');
  }

  return '<svg viewBox="0 0 600 330" role="img" aria-label="AR LBD 포켓 접촉도">' +
         parts.join('') + '</svg>';
}

/* ------------------------------------------------------ single result */

function tile(label, value) {
  return '<div class="tile"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
}

function renderSingle(result, title, subtitle) {
  var d = result.desc, p = result.pocket;
  var out = [];

  out.push('<div class="panel">');
  out.push('<p class="subject">' + esc(title) + '</p>');
  out.push('<p class="subject-smi">' + esc(subtitle || result.smiles) + '</p>');

  var domainWord = { 'in': '적용영역 내', edge: '적용영역 경계', out: '적용영역 밖' }[result.domain];
  var fc = result.functionCall;
  var fcLabel = PR.CLASS_LABELS[fc.label] || fc.label;
  var fcClass = (fc.label === 'antagonist' || fc.label === 'unknown') ? ' warnink' : '';

  out.push('<div class="headline">');
  out.push('<div class="pk num">' + fx(result.pKi, 2) +
           '<small>&plusmn;' + fx(result.ci, 1) + '</small></div>');
  out.push('<div class="pklabel">예측 pKi · 오차범위</div>');
  out.push('<div class="kv">');
  out.push('<div><span class="k">Ki 환산</span><span class="v num">' +
           fx(result.kiNM, result.kiNM < 10 ? 2 : 0) + ' nM</span></div>');
  out.push('<div><span class="k">기능 추정</span><span class="v' + fcClass + '">' +
           esc(fcLabel) + '<span class="sub">근거 ' + fx(fc.support, 2) + '</span></span></div>');
  out.push('<div><span class="k">구조 판정</span><span class="v">' + esc(p.verdict) + '</span></div>');
  out.push('<div><span class="k">적용영역</span><span class="v">' +
           '<span class="tag ' + esc(result.domain) + '">' + esc(domainWord) + '</span>' +
           '<span class="sub">유사도 ' + fx(result.nearestSim, 2) + '</span></span></div>');
  out.push('</div></div>');

  out.push('<h4 class="sect">포켓 접촉도</h4>');
  out.push('<div class="figwrap">' + svgPocket(p, result.occupancy) + '</div>');
  out.push('<p class="hint" style="margin:10px 0 0">파랑 = 접촉 가능 · 빨강 = helix-12 충돌 · 회색 = 미접촉<br>' +
           '분자 부피 ' + fx(result.volume, 0) + ' &Aring;&sup3; / 공동 ' + PR.POCKET_VOLUME + ' &Aring;&sup3;</p>');

  out.push('<h4 class="sect">접촉 잔기</h4>');
  out.push('<table><thead><tr><th>잔기</th><th>역할</th><th>상태</th></tr></thead><tbody>');
  for (var i = 0; i < p.residues.length; i++) {
    var r = p.residues[i];
    var state = r.clash ? 'H12 충돌' : (r.contact ? '접촉 가능' : '미접촉');
    out.push('<tr' + (r.clash ? ' class="clash"' : '') + '><td>' + esc(r.id) + '</td><td>' +
             esc(r.role) + '</td><td>' + esc(state) + '</td></tr>');
  }
  out.push('</tbody></table>');

  out.push('<h4 class="sect">2D 구조식</h4>');
  out.push('<div class="figwrap">' + svgStructure(result.mol) + '</div>');

  out.push('<h4 class="sect">기술자</h4>');
  out.push('<dl class="tiles">');
  out.push(tile('분자식', d.formula));
  out.push(tile('MW', fx(d.mw, 2)));
  out.push(tile('clogP', fx(d.clogp, 2)));
  out.push(tile('TPSA', fx(d.tpsa, 1)));
  out.push(tile('HBD', d.hbd));
  out.push(tile('HBA', d.hba));
  out.push(tile('회전결합', d.rotb));
  out.push(tile('고리', d.rings));
  out.push(tile('방향족고리', d.aromRings));
  out.push(tile('중원자', d.heavy));
  out.push(tile('할로겐', d.halogens));
  out.push(tile('Fsp3', fx(d.fsp3, 2)));
  out.push(tile('부피 (Å³)', fx(result.volume, 0)));
  out.push(tile('점유율', fx(result.occupancy, 0) + '%'));
  out.push('</dl>');

  out.push('<h4 class="sect">판정 근거</h4>');
  out.push('<ul class="why">');
  out.push('<li><span class="d">' + fx(result.ruleScore, 2) + '</span>' +
           '<span>구조규칙 점수 (read-across 가중치 ' + fx(result.weightReadAcross, 2) + ')</span></li>');
  out.push('<li><span class="d">' + fx(result.readAcross, 2) + '</span>' +
           '<span>레퍼런스 read-across 값</span></li>');
  for (var k = 0; k < result.reasons.length; k++) {
    var rs = result.reasons[k];
    var cls = rs.delta >= 0 ? 'pos' : 'neg';
    out.push('<li><span class="d ' + cls + '">' + (rs.delta >= 0 ? '+' : '') +
             fx(rs.delta, 1) + '</span><span>' + esc(rs.why) + '</span></li>');
  }
  for (var m = 0; m < p.notes.length; m++) {
    out.push('<li><span class="d">&middot;</span><span>' + esc(p.notes[m]) + '</span></li>');
  }
  out.push('</ul>');

  out.push('<h4 class="sect">최근접 레퍼런스</h4>');
  out.push('<table><thead><tr><th>물질</th><th>유형</th><th class="num">실측 pKi</th>' +
           '<th class="num">유사도</th></tr></thead><tbody>');
  for (var j = 0; j < result.neighbours.length; j++) {
    var nb = result.neighbours[j];
    out.push('<tr><td>' + esc(nb.n) + '</td><td>' + esc(nb.c) + '</td><td class="num">' +
             fx(nb.p, 2) + '</td><td class="num">' + fx(nb.sim, 3) + '</td></tr>');
  }
  out.push('</tbody></table>');
  out.push('</div>');
  return out.join('');
}

/* ------------------------------------------------------------- tabs */

var TABS = ['single', 'batch', 'library'];

function selectTab(name) {
  for (var i = 0; i < TABS.length; i++) {
    var sec = $('tab-' + TABS[i]);
    if (sec) {
      if (TABS[i] === name) sec.className = sec.className.replace(/\s*hidden/g, '');
      else if (sec.className.indexOf('hidden') < 0) sec.className += ' hidden';
    }
  }
  var nav = $('tabs');
  if (!nav || !nav.querySelectorAll) return;
  var btns = nav.querySelectorAll('button');
  for (var j = 0; j < btns.length; j++) {
    var isSel = btns[j].getAttribute('data-tab') === name;
    btns[j].setAttribute('aria-selected', isSel ? 'true' : 'false');
  }
}

/* ------------------------------------------------------- single tab */

function showError(hostId, message) {
  var host = $(hostId);
  if (host) host.innerHTML = message ? '<div class="err">' + esc(message) + '</div>' : '';
}

function runSingle(rawQuery) {
  var input = $('q');
  var query = rawQuery !== undefined ? rawQuery : (input ? input.value : '');
  query = String(query || '').trim();
  showError('single-err', '');
  var host = $('single-out');
  if (!host) return;
  if (!query) { host.innerHTML = ''; showError('single-err', '물질명 또는 SMILES를 입력하세요.'); return; }

  var hit = PR.lookupName(query);
  var smiles = hit ? hit.s : query;
  var title = hit ? hit.ko + ' / ' + hit.en : query;

  var result;
  try {
    result = PR.predict(smiles);
  } catch (err) {
    host.innerHTML = '';
    showError('single-err', '해석 실패: ' + err.message +
              (hit ? '' : ' — 사전에 없는 이름이면 SMILES로 입력해 주세요.'));
    return;
  }
  host.innerHTML = renderSingle(result, title, smiles);
}

/* -------------------------------------------------------- batch tab */

var batchRows = [];

function parseBatchText(text) {
  var lines = String(text || '').split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (i === 0 && /^(name|이름)\s*,/i.test(line)) continue;      /* header row */
    var comma = line.lastIndexOf(',');
    var name, smiles;
    if (comma < 0) { name = line; smiles = line; }
    else {
      name = line.substring(0, comma).trim().replace(/^"|"$/g, '');
      smiles = line.substring(comma + 1).trim().replace(/^"|"$/g, '');
    }
    if (!smiles) continue;
    out.push({ name: name || smiles, smiles: smiles });
  }
  return out;
}

function runBatch(text) {
  showError('batch-err', '');
  var host = $('batch-out');
  if (!host) return;
  var items = parseBatchText(text);
  if (!items.length) {
    host.innerHTML = '';
    showError('batch-err', '입력이 비어 있습니다. `이름,SMILES` 형식으로 한 줄씩 넣어주세요.');
    return;
  }
  var truncated = false;
  if (items.length > MAX_BATCH) { items = items.slice(0, MAX_BATCH); truncated = true; }

  batchRows = [];
  var failures = [];
  for (var i = 0; i < items.length; i++) {
    var hit = PR.lookupName(items[i].smiles);
    var smi = items[i].smiles;
    if (hit && !/[=#\[\]()0-9]/.test(smi)) smi = hit.s;
    try {
      var r = PR.predict(smi);
      batchRows.push({
        name: items[i].name, smiles: smi, pKi: r.pKi, ci: r.ci,
        domain: r.domain, verdict: r.pocket.verdict,
        fnLabel: PR.CLASS_LABELS[r.functionCall.label] || r.functionCall.label,
        fnKey: r.functionCall.label, fnSupport: r.functionCall.support,
        mw: r.desc.mw, clogp: r.desc.clogp, occupancy: r.occupancy
      });
    } catch (err) {
      failures.push(items[i].name + ' (' + err.message + ')');
    }
  }
  batchRows.sort(function (a, b) { return b.pKi - a.pKi; });

  var out = [];
  out.push('<div class="panel">');
  out.push('<h3>결과 ' + batchRows.length + '건</h3>');
  out.push('<p class="hint">pKi 내림차순. 행을 클릭하면 단건 조회로 이동합니다.' +
           (truncated ? ' 최대 ' + MAX_BATCH + '건까지만 처리했습니다.' : '') + '</p>');
  out.push('<div class="tscroll"><table><thead><tr><th class="num">#</th><th>물질</th>' +
           '<th class="num">pKi</th><th class="barcell">분포</th>' +
           '<th class="num col-sec">MW</th><th>기능 추정</th>' +
           '<th class="col-sec">구조 판정</th>' +
           '</tr></thead><tbody>');
  for (var k = 0; k < batchRows.length; k++) {
    var row = batchRows[k];
    var frac = Math.max(0, Math.min(1, (row.pKi - 3.5) / 6.5));
    out.push('<tr class="clickable" data-smiles="' + esc(row.smiles) + '">' +
             '<td class="num">' + (k + 1) + '</td>' +
             '<td>' + esc(row.name) + '</td>' +
             '<td class="num">' + fx(row.pKi, 2) + '</td>' +
             '<td class="barcell"><div class="bar' + (row.pKi < 6 ? ' lo' : '') +
             '" style="width:' + fx(frac * 100, 1) + '%"></div></td>' +
             '<td class="num col-sec">' + fx(row.mw, 1) + '</td>' +
             '<td' + (row.fnKey === 'antagonist' ? ' class="warnink"' : '') + '>' +
             esc(row.fnLabel) + '</td>' +
             '<td class="col-sec">' + esc(row.verdict) + '</td></tr>');
  }
  out.push('</tbody></table></div>');
  if (failures.length) {
    out.push('<p class="hint" style="margin-top:12px">해석 실패 ' + failures.length +
             '건: ' + esc(failures.slice(0, 8).join('; ')) + '</p>');
  }
  out.push('</div>');
  host.innerHTML = out.join('');

  if (host.querySelectorAll) {
    var trs = host.querySelectorAll('tr.clickable');
    for (var t = 0; t < trs.length; t++) {
      (function (tr) {
        tr.addEventListener('click', function () {
          var smi = tr.getAttribute('data-smiles');
          var qbox = $('q');
          if (qbox) qbox.value = smi;
          selectTab('single');
          runSingle(smi);
        });
      })(trs[t]);
    }
  }
}

function batchTsv() {
  var head = ['name', 'smiles', 'pKi', 'ci', 'domain', 'function', 'fn_support',
              'structural_verdict', 'mw', 'clogp', 'occupancy'];
  var lines = [head.join('\t')];
  for (var i = 0; i < batchRows.length; i++) {
    var r = batchRows[i];
    lines.push([r.name, r.smiles, fx(r.pKi, 2), fx(r.ci, 1), r.domain,
                r.fnKey, fx(r.fnSupport, 2), r.verdict,
                fx(r.mw, 2), fx(r.clogp, 2), fx(r.occupancy, 0)].join('\t'));
  }
  return lines.join('\n');
}

function copyTsv() {
  if (!batchRows.length) { showError('batch-err', '복사할 결과가 없습니다.'); return; }
  var text = batchTsv();
  var done = function () { showError('batch-err', ''); };
  var fallback = function () {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      if (ta.select) ta.select();
      if (document.execCommand) document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (err) {
      showError('batch-err', '클립보드 복사에 실패했습니다. 결과 표를 직접 선택해 복사해 주세요.');
    }
  };
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      var p = navigator.clipboard.writeText(text);
      if (p && p.then) p.then(done, fallback); else done();
    } else fallback();
  } catch (err) { fallback(); }
}

var SAMPLE_BATCH = [
  'Dihydrotestosterone,CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2',
  'Testosterone,CC12CCC3C(CCC4=CC(=O)CCC34C)C1CCC2O',
  'Enzalutamide,CC1(C)C(=O)N(c2ccc(C(=O)NC)c(F)c2)C(=S)N1c1ccc(C#N)c(c1)C(F)(F)F',
  'Bicalutamide,CC(O)(CS(=O)(=O)c1ccc(F)cc1)C(=O)Nc1ccc(C#N)c(c1)C(F)(F)F',
  'Genistein,Oc1ccc(cc1)C1=COc2cc(O)cc(O)c2C1=O',
  'Butylparaben,CCCCOC(=O)c1ccc(O)cc1',
  'beta-Sitosterol,CCC(CCC(C)C1CCC2C1(C)CCC1C2CC=C2CC(O)CCC12C)C(C)C',
  'Ketoconazole,CC(=O)N1CCN(CC1)c1ccc(OCC2COC(Cn3ccnc3)(O2)c2ccc(Cl)cc2Cl)cc1',
  'Niacinamide,NC(=O)c1ccncc1',
  'Glycerin,OCC(O)CO'
].join('\n');

/* ------------------------------------------------------ library tab */

function renderLibrary() {
  var host = $('lib-out');
  if (!host) return;
  var lib = PR.getLibrary();
  var out = [];
  out.push('<div class="panel">');
  out.push('<h3>현재 라이브러리 ' + lib.length + '종</h3>');
  out.push('<table><thead><tr><th>물질</th><th class="num">pKi</th><th>유형</th>' +
           '<th class="num">MW</th><th>비고</th></tr></thead><tbody>');
  for (var i = 0; i < lib.length; i++) {
    out.push('<tr><td>' + esc(lib[i].n) + '</td><td class="num">' + fx(lib[i].p, 2) +
             '</td><td>' + esc(lib[i].c) + '</td><td class="num">' +
             fx(lib[i].desc.mw, 1) + '</td><td style="color:var(--ink-3)">' +
             esc(lib[i].note) + '</td></tr>');
  }
  out.push('</tbody></table></div>');
  host.innerHTML = out.join('');
}

function applyLibrary(text) {
  showError('lib-err', '');
  var parsed;
  try { parsed = JSON.parse(text); }
  catch (err) { showError('lib-err', 'JSON 파싱 실패: ' + err.message); return; }
  var res;
  try { res = PR.setLibrary(parsed); }
  catch (err) { showError('lib-err', '적용 실패: ' + err.message); return; }
  renderLibrary();
  var msg = res.applied + '종 적용';
  if (res.skipped.length) {
    msg += ', ' + res.skipped.length + '종 건너뜀 (' +
           res.skipped.slice(0, 6).map(function (s) { return s.entry; }).join(', ') + ')';
  }
  showError('lib-err', msg);
}

/* ------------------------------------------------------- model card */

var modelCardDone = false;

function renderModelCard() {
  if (modelCardDone) return;
  var host = $('modelcard-body');
  if (!host) return;
  modelCardDone = true;

  var cv;
  try { cv = PR.crossValidate(); } catch (err) { cv = null; }
  var out = [];

  out.push('<h5>용도</h5>');
  out.push('<p>화장품·생활화학 원료의 안드로겐 수용체 결합 가능성을 1차 선별합니다. ' +
           '세포실험 대상의 우선순위를 정하는 데까지가 이 도구의 역할입니다.</p>');

  out.push('<h5>방법</h5>');
  out.push('<p>Morgan 지문(radius 2, 2048 bit) Tanimoto 유사도 기반 read-across와 ' +
           '파마코포어 규칙 점수를 최근접 유사도에 따라 가중 결합합니다. ' +
           '포켓 점유율은 McGowan 특성부피를 AR LBD 공동 ' + PR.POCKET_VOLUME +
           ' Å³ 와 비교해 산출합니다.</p>');

  if (cv) {
    out.push('<h5>성능 (leave-one-out, n = ' + cv.n + ')</h5>');
    out.push('<p>MAE <b>' + fx(cv.mae, 2) + '</b> log, RMSE <b>' + fx(cv.rmse, 2) +
             '</b> log. 레퍼런스 자체가 실험실 간 ±0.5~1 log의 분산을 가지므로 ' +
             '이보다 낮은 오차는 기대할 수 없습니다.</p>');
    var worst = cv.rows.slice().sort(function (a, b) {
      return Math.abs(b.error) - Math.abs(a.error);
    }).slice(0, 4);
    out.push('<table><thead><tr><th>물질</th><th class="num">실측</th>' +
             '<th class="num">예측</th><th class="num">오차</th></tr></thead><tbody>');
    for (var i = 0; i < worst.length; i++) {
      out.push('<tr><td>' + esc(worst[i].n) + '</td><td class="num">' +
               fx(worst[i].observed, 2) + '</td><td class="num">' +
               fx(worst[i].predicted, 2) + '</td><td class="num">' +
               (worst[i].error >= 0 ? '+' : '') + fx(worst[i].error, 2) + '</td></tr>');
    }
    out.push('</tbody></table>');
    out.push('<p><b>이 표의 「예측」은 해당 물질을 레퍼런스에서 제외하고 낸 값입니다.</b> ' +
             '단건 조회에 같은 이름을 넣으면 자기 자신이 레퍼런스에 있으므로 유사도 1.00으로 ' +
             '매칭되어 더 낙관적인 값이 나옵니다 — 예를 들어 피나스테리드는 조회하면 5.47, ' +
             '제외하고 예측하면 8.11입니다. <b>레퍼런스에 없는 신규 원료에서 기대할 수 있는 ' +
             '실제 성능은 제외한 쪽(8.11)입니다.</b> 라이브러리에 있는 물질의 조회 결과는 ' +
             '예측이 아니라 사실상 조회이므로, 성능의 근거로 삼지 마세요.</p>');
  }

  out.push('<h5>기능 추정(작용제/길항제)을 읽는 법</h5>');
  out.push('<p>「기능 추정」은 최근접 레퍼런스 5종의 <b>실험적으로 측정된 분류</b>를 ' +
           '유사도³로 가중해 옮겨온 값입니다. 괄호 안 「근거」는 그 가중치가 한 분류에 ' +
           '얼마나 몰렸는지를 나타내며, 1.00에 가까울수록 이웃들의 의견이 일치한다는 뜻입니다. ' +
           '최근접 유사도가 0.35 미만이면 옮겨올 근거가 없다고 보고 「판단 불가」로 표시합니다.</p>');
  out.push('<p>「구조 판정」은 이와 별개로 구조 모티프와 포켓 접촉 규칙만으로 유추한 것입니다. ' +
           '둘이 어긋나면 <b>기능 추정 쪽을 믿으세요</b> — 실측 분류에 근거하기 때문입니다. ' +
           '단, 둘 다 전사활성 측정이 아니라는 점은 같습니다.</p>');

  out.push('<h5>실패 모드 — 이 도구가 틀리는 방식</h5>');
  out.push('<ul>');
  out.push('<li><b>대사 활성화를 모릅니다.</b> flutamide는 전구체이고 활성은 ' +
           'hydroxyflutamide에 있습니다. 2D 구조가 거의 같아 flutamide의 결합력이 ' +
           '크게 과대평가됩니다.</li>');
  out.push('<li><b>4-aza 스테로이드를 오분류합니다.</b> finasteride는 5α-환원효소 ' +
           '억제제이지 AR 리간드가 아니지만, 2D 유사도로는 DHT와 구분되지 않아 ' +
           '3 log 이상 과대평가됩니다.</li>');
  out.push('<li><b>입체화학을 무시합니다.</b> 키랄리티와 동위원소 표기는 파싱만 하고 ' +
           '계산에 반영하지 않으므로 거울상 이성질체는 동일하게 평가됩니다. ' +
           'estradiol처럼 스테로이드 코어를 가져도 A-ring이 방향족이면 AR에는 약한데, ' +
           '이 차이도 충분히 반영되지 않습니다.</li>');
  out.push('<li><b>작용/길항 판정은 규칙 기반 추정입니다.</b> helix-12 충돌 여부를 ' +
           '구조 모티프로 유추한 것이며, 실제 전사활성 측정이 아닙니다.</li>');
  out.push('<li><b>레퍼런스가 적습니다.</b> 28종뿐이라 유사 레퍼런스가 없는 골격 ' +
           '(예: RU-59063)은 과소평가됩니다. 적용영역 태그가 <code>out</code>이면 ' +
           '수치보다 태그를 먼저 보세요.</li>');
  out.push('<li><b>금속 함유·고분자·혼합물은 범위 밖입니다.</b> 징크피리치온처럼 ' +
           '금속 배위 화합물은 기술자 자체가 신뢰할 수 없습니다.</li>');
  out.push('</ul>');

  out.push('<h5>다음 단계</h5>');
  out.push('<p>위 실패 모드는 2D 기술자로는 해결되지 않습니다. ' +
           '<code>local/train_qsar.py</code>로 ChEMBL 데이터를 받아 레퍼런스를 넓히고, ' +
           '<code>local/ar_dock.py</code>로 결정 구조에 도킹해 교차 확인하세요.</p>');

  host.innerHTML = out.join('');
}

/* --------------------------------------------------------------- init */

function readFile(input, handler) {
  if (!input || !input.files || !input.files.length) return;
  var reader = new FileReader();
  reader.onload = function () { handler(String(reader.result || '')); };
  reader.readAsText(input.files[0]);
}

function on(id, event, handler) {
  var el = $(id);
  if (el && el.addEventListener) el.addEventListener(event, handler);
}

function init() {
  /* name suggestions */
  var dl = $('names');
  if (dl) {
    var opts = [];
    for (var i = 0; i < PR.INGREDIENTS.length; i++) {
      opts.push('<option value="' + esc(PR.INGREDIENTS[i][0]) + '"></option>');
      opts.push('<option value="' + esc(PR.INGREDIENTS[i][1]) + '"></option>');
    }
    dl.innerHTML = opts.join('');
  }

  var nav = $('tabs');
  if (nav && nav.addEventListener) {
    nav.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.getAttribute) return;
      var name = target.getAttribute('data-tab');
      if (!name) return;
      selectTab(name);
      if (name === 'library') renderLibrary();
    });
  }

  on('run', 'click', function () { runSingle(); });
  on('q', 'keydown', function (ev) { if (ev.key === 'Enter') runSingle(); });

  on('batchrun', 'click', function () {
    var ta = $('batchin');
    runBatch(ta ? ta.value : '');
  });
  on('batchsample', 'click', function () {
    var ta = $('batchin');
    if (ta) ta.value = SAMPLE_BATCH;
    runBatch(SAMPLE_BATCH);
  });
  on('batchcopy', 'click', copyTsv);
  on('batchfile', 'change', function (ev) {
    readFile(ev.target, function (text) {
      var ta = $('batchin');
      if (ta) ta.value = text;
      runBatch(text);
    });
  });

  on('libapply', 'click', function () {
    var ta = $('libin');
    applyLibrary(ta ? ta.value : '');
  });
  on('libfile', 'change', function (ev) {
    readFile(ev.target, function (text) {
      var ta = $('libin');
      if (ta) ta.value = text;
      applyLibrary(text);
    });
  });
  on('libreset', 'click', function () {
    PR.resetLibrary();
    renderLibrary();
    showError('lib-err', '기본 레퍼런스 ' + PR.getLibrary().length + '종으로 복원했습니다.');
  });
  on('libexport', 'click', function () {
    var ta = $('libin');
    if (ta) ta.value = JSON.stringify(PR.libraryAsJson(), null, 1);
    showError('lib-err', '현재 라이브러리를 위 입력란에 JSON으로 넣었습니다.');
  });

  on('themebtn', 'click', function () {
    var root = document.documentElement;
    var cur = root.getAttribute('data-theme');
    root.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
  });

  var card = $('modelcard');
  if (card && card.addEventListener) {
    card.addEventListener('toggle', renderModelCard);
    card.addEventListener('click', renderModelCard);
  }

  renderLibrary();
  runSingle('디하이드로테스토스테론');
}

if (typeof document !== 'undefined' && document.getElementById) {
  if (document.readyState === 'loading' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

module.exports = {
  init: init, runSingle: runSingle, runBatch: runBatch, renderLibrary: renderLibrary,
  applyLibrary: applyLibrary, renderModelCard: renderModelCard, selectTab: selectTab,
  svgStructure: svgStructure, svgPocket: svgPocket, batchTsv: batchTsv,
  parseBatchText: parseBatchText, SAMPLE_BATCH: SAMPLE_BATCH
};
