/* app.js — UI rendering for the three tabs. Talks to the engine through the
 * AR / LY / PR namespaces, which build.py produces from the module exports. */
'use strict';

var measuredRegistered = false;


var MAX_BATCH = 400;

function $(id) { return document.getElementById(id); }

/* Estradiol's own concentration in the same screen, so that a reading can be
 * put in scale. "Active" says nothing about how active: oxybenzone and
 * estradiol are both agonist-mode actives in Tox21, at 34 µM and 0.001 µM.
 * Printing those two words identically for both is how a weak, probably
 * irrelevant signal gets read as estrogenic activity. */
var E2_SMILES = 'CC12CCC3c4ccc(O)cc4CCC3C1CCC2O';
var toxRef = null;
function toxReferenceAc50() {
  if (toxRef !== null) return toxRef;
  toxRef = false;
  try {
    var table = erTox21();
    var id = MOL.structureIdOf(MOL.parseSmiles(E2_SMILES));
    var rec = table && table.potency ? table.potency[id] : null;
    if (rec && isFinite(rec[0])) toxRef = rec[0];
  } catch (err) { toxRef = false; }
  return toxRef;
}

function potencyScale(ac50) {
  var ref = toxReferenceAc50();
  if (!ref || !isFinite(ac50) || ac50 <= 0) return '';
  var ratio = ac50 / ref;
  if (ratio < 3) return '에스트라디올과 같은 수준';
  var rounded = ratio >= 10000 ? Math.round(ratio / 1000) * 1000
    : (ratio >= 1000 ? Math.round(ratio / 100) * 100 : Math.round(ratio));
  var word = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '에스트라디올보다 약 ' + word + '배 약한 농도';
}

/* The ER engine predates the merged Tox21 table and wants a table of its
 * own: {calls, potency, assays}. This is that slice, built once. */
var erTox = null;
function erTox21() {
  if (erTox !== null) return erTox;
  erTox = false;
  try {
    if (typeof TOX21 !== 'undefined' && TOX21) {
      erTox = TOX21.calls && TOX21.calls.er && typeof PANEL !== 'undefined'
        ? PANEL.sliceTox(TOX21, 'er')
        : TOX21;                       /* an older, single-receptor bundle */
    }
  } catch (err) { erTox = false; }
  return erTox;
}

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

/* ------------------------------------------------------- 3D structure */

var CARBON_INK = 'var(--ink-2)';

var view3d = { mol: null, pos: null, rx: -0.22, ry: 0.38, dragging: false,
               lastX: 0, lastY: 0 };

function rotatePoint(x, y, z, rx, ry) {
  var cy = Math.cos(ry), sy = Math.sin(ry);
  var x1 = x * cy + z * sy;
  var z1 = -x * sy + z * cy;
  var cx = Math.cos(rx), sx = Math.sin(rx);
  var y1 = y * cx - z1 * sx;
  var z2 = y * sx + z1 * cx;
  return [x1, y1, z2];
}

function svg3D(mol, pos, rx, ry) {
  var W = 600, H = 380, pad = 34, i;
  var n = mol.atoms.length;
  var rot = [];
  for (i = 0; i < n; i++) rot.push(rotatePoint(pos.x[i], pos.y[i], pos.z[i], rx, ry));

  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  var minZ = Infinity, maxZ = -Infinity;
  for (i = 0; i < n; i++) {
    if (rot[i][0] < minX) minX = rot[i][0];
    if (rot[i][0] > maxX) maxX = rot[i][0];
    if (rot[i][1] < minY) minY = rot[i][1];
    if (rot[i][1] > maxY) maxY = rot[i][1];
    if (rot[i][2] < minZ) minZ = rot[i][2];
    if (rot[i][2] > maxZ) maxZ = rot[i][2];
  }
  var spanX = Math.max(0.001, maxX - minX), spanY = Math.max(0.001, maxY - minY);
  var scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  var depth = Math.max(0.001, maxZ - minZ);

  var px = [], py = [], pf = [];
  for (i = 0; i < n; i++) {
    /* nearer atoms a little larger: enough to read depth, not so much that
     * the molecule looks like it is falling over */
    var t = (rot[i][2] - minZ) / depth;
    var f = 0.78 + 0.44 * t;
    px.push(W / 2 + (rot[i][0] - cx) * scale);
    py.push(H / 2 - (rot[i][1] - cy) * scale);
    pf.push(f);
  }

  /* Each bond is drawn as two halves and each half is depth-sorted on its
   * own midpoint, not the whole bond's. Sorting a bond by its centre lets a
   * bond whose far end is behind an atom still paint over that atom. */
  var items = [];
  for (var b = 0; b < mol.bonds.length; b++) {
    var bd = mol.bonds[b];
    var zm = (rot[bd.a][2] + rot[bd.b][2]) / 2;
    items.push({ z: (rot[bd.a][2] + zm) / 2, kind: 'half', i: b, near: bd.a, far: bd.b });
    items.push({ z: (rot[bd.b][2] + zm) / 2, kind: 'half', i: b, near: bd.b, far: bd.a });
  }
  for (i = 0; i < n; i++) items.push({ z: rot[i][2], kind: 'atom', i: i });
  items.sort(function (p, q) { return p.z - q.z; });

  var parts = [];
  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    if (it.kind === 'half') {
      var a = it.near, c = it.far;
      var wgt = 5.6 * pf[a];
      var mid = [(px[a] + px[c]) / 2, (py[a] + py[c]) / 2];
      parts.push('<line x1="' + fx(px[a], 1) + '" y1="' + fx(py[a], 1) +
                 '" x2="' + fx(mid[0], 1) + '" y2="' + fx(mid[1], 1) +
                 '" stroke="' + (ELEMENT_INK[mol.atoms[a].el] || CARBON_INK) +
                 '" stroke-width="' + fx(wgt, 1) + '" stroke-linecap="round"/>');
    } else {
      var at = mol.atoms[it.i];
      var rad = (LY3.COVALENT[at.el] !== undefined ? LY3.COVALENT[at.el] : 0.9);
      var r = rad * 15.5 * pf[it.i];
      parts.push('<circle cx="' + fx(px[it.i], 1) + '" cy="' + fx(py[it.i], 1) +
                 '" r="' + fx(r, 1) + '" fill="' +
                 (ELEMENT_INK[at.el] || CARBON_INK) + '" stroke="var(--card-sub)" ' +
                 'stroke-width="1.5"/>');
      if (at.el !== 'C') {
        parts.push('<text x="' + fx(px[it.i], 1) + '" y="' + fx(py[it.i] + r * 0.40, 1) +
                   '" text-anchor="middle" font-family="var(--sans)" font-size="' +
                   fx(r * 1.15, 1) + '" font-weight="700" fill="var(--card)" ' +
                   'letter-spacing="-0.5">' + esc(at.el) + '</text>');
      }
    }
  }

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
         'aria-label="3D 구조 (회전 가능)" style="touch-action:none;cursor:grab">' +
         parts.join('') + '</svg>';
}

function paint3D() {
  var host = $('struct3d');
  if (!host || !view3d.pos) return;
  host.innerHTML = svg3D(view3d.mol, view3d.pos, view3d.rx, view3d.ry);
}

function mount3D(mol) {
  var host = $('struct3d');
  if (!host) return;
  host.innerHTML = '<p class="hint" style="margin:0;padding:26px 0;text-align:center">' +
                   '3D 좌표 계산 중…</p>';
  var build = function () {
    try {
      view3d.mol = mol;
      view3d.pos = LY3.computeLayout3D(mol);
      view3d.rx = -0.22; view3d.ry = 0.38;
      paint3D();
    } catch (err) {
      host.innerHTML = '<p class="hint" style="margin:0">3D 좌표를 만들지 못했습니다: ' +
                       esc(err.message) + '</p>';
    }
  };
  if (typeof setTimeout === 'function') setTimeout(build, 16); else build();

  if (!host._rotBound && host.addEventListener) {
    host._rotBound = true;
    var start = function (ev) {
      view3d.dragging = true;
      var pt = ev.touches ? ev.touches[0] : ev;
      view3d.lastX = pt.clientX; view3d.lastY = pt.clientY;
    };
    var move = function (ev) {
      if (!view3d.dragging) return;
      var pt = ev.touches ? ev.touches[0] : ev;
      view3d.ry += (pt.clientX - view3d.lastX) * 0.012;
      view3d.rx += (pt.clientY - view3d.lastY) * 0.012;
      view3d.rx = Math.max(-1.5, Math.min(1.5, view3d.rx));
      view3d.lastX = pt.clientX; view3d.lastY = pt.clientY;
      if (ev.preventDefault) ev.preventDefault();
      paint3D();
    };
    var end = function () { view3d.dragging = false; };
    host.addEventListener('mousedown', start);
    host.addEventListener('mousemove', move);
    host.addEventListener('mouseup', end);
    host.addEventListener('mouseleave', end);
    host.addEventListener('touchstart', start);
    host.addEventListener('touchmove', move);
    host.addEventListener('touchend', end);
  }
}

/* ------------------------------------------------- binding scene (3D) */

/* Nothing here is docked. The pocket is 1GWR coordinates and every pose is
 * the ligand out of a crystal complex, superposed onto that frame by
 * local/build_pocket.py. A compound with no crystal structure of its own gets
 * the pocket and the estradiol pose, and is told so - nothing is invented to
 * fill the gap. */
function sceneData() {
  return (typeof SCENE !== 'undefined' && SCENE && SCENE.pocket) ? SCENE : null;
}

function poseFor(mol) {
  try { return PR.poseForStructure(MOL.structureIdOf(mol)); }
  catch (err) { return null; }
}

var viewScene = { rx: -0.3, ry: 0.5, dragging: false, lastX: 0, lastY: 0,
                  pose: null, ghost: false };

/* Labelling every contact buries the ligand under twenty residue names.
 * Only the ones that carry the argument get a label: hydrogen-bond partners
 * and the four anchor residues the rule engine reasons about. */
var SCENE_ANCHORS = { GLU353: 1, ARG394: 1, HIS524: 1, ASP351: 1 };

function prettyResidue(id) {
  var m = /^([A-Z]{3})(\d+)$/.exec(id);
  if (!m) return id;
  return m[1].charAt(0) + m[1].substring(1).toLowerCase() + m[2];
}

function svgScene(scene, pose, rx, ry, showGhost) {
  var W = 600, H = 420, pad = 26;
  var ligand = pose && pose.placed ? pose : null;
  var ref = scene.crystal;
  var focusAtoms = (ligand ? ligand.a : ref.a);

  var cx = 0, cy = 0, cz = 0, i;
  for (i = 0; i < focusAtoms.length; i++) {
    cx += focusAtoms[i][0]; cy += focusAtoms[i][1]; cz += focusAtoms[i][2];
  }
  cx /= focusAtoms.length; cy /= focusAtoms.length; cz /= focusAtoms.length;

  var contact = {}, hbond = {};
  if (ligand) {
    for (i = 0; i < (ligand.c || []).length; i++) contact[ligand.c[i]] = true;
    for (i = 0; i < (ligand.hb || []).length; i++) hbond[ligand.hb[i]] = true;
  }

  var items = [], minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  var minZ = Infinity, maxZ = -Infinity;

  function place(a) {
    var r = rotatePoint(a[0] - cx, a[1] - cy, a[2] - cz, rx, ry);
    if (r[0] < minX) minX = r[0];
    if (r[0] > maxX) maxX = r[0];
    if (r[1] < minY) minY = r[1];
    if (r[1] > maxY) maxY = r[1];
    if (r[2] < minZ) minZ = r[2];
    if (r[2] > maxZ) maxZ = r[2];
    return r;
  }

  /* pocket sticks */
  for (var p = 0; p < scene.pocket.length; p++) {
    var res = scene.pocket[p];
    var rot = [];
    for (i = 0; i < res.a.length; i++) rot.push(place(res.a[i]));
    var tier = hbond[res.id] ? 2 : (contact[res.id] ? 1 : 0);
    for (i = 0; i < res.b.length; i++) {
      var u = res.b[i][0], v = res.b[i][1];
      items.push({ z: (rot[u][2] + rot[v][2]) / 2, t: 'stick',
                   p1: rot[u], p2: rot[v], tier: tier });
    }
    if ((tier === 2 || (tier === 1 && SCENE_ANCHORS[res.id])) && rot.length) {
      var lx = 0, ly = 0, lz = 0;
      for (i = 0; i < rot.length; i++) { lx += rot[i][0]; ly += rot[i][1]; lz += rot[i][2]; }
      items.push({ z: 1e6, t: 'label',          /* labels always on top */
                   p1: [lx / rot.length, ly / rot.length, lz / rot.length],
                   text: prettyResidue(res.id), tier: tier });
    }
  }

  /* the co-crystal ligand, as a faint reference */
  if (showGhost || !ligand) {
    var gr = [];
    for (i = 0; i < ref.a.length; i++) gr.push(place(ref.a[i]));
    for (i = 0; i < ref.b.length; i++) {
      items.push({ z: (gr[ref.b[i][0]][2] + gr[ref.b[i][1]][2]) / 2, t: 'ghost',
                   p1: gr[ref.b[i][0]], p2: gr[ref.b[i][1]] });
    }
  }

  /* the docked pose */
  if (ligand) {
    var lr = [];
    for (i = 0; i < ligand.a.length; i++) lr.push(place(ligand.a[i]));
    for (i = 0; i < ligand.b.length; i++) {
      var a1 = ligand.b[i][0], a2 = ligand.b[i][1];
      var zm = (lr[a1][2] + lr[a2][2]) / 2;
      items.push({ z: (lr[a1][2] + zm) / 2, t: 'lig', p1: lr[a1],
                   p2: [(lr[a1][0] + lr[a2][0]) / 2, (lr[a1][1] + lr[a2][1]) / 2, zm],
                   el: ligand.a[a1][3] });
      items.push({ z: (lr[a2][2] + zm) / 2, t: 'lig', p1: lr[a2],
                   p2: [(lr[a1][0] + lr[a2][0]) / 2, (lr[a1][1] + lr[a2][1]) / 2, zm],
                   el: ligand.a[a2][3] });
    }
    for (i = 0; i < lr.length; i++) {
      items.push({ z: lr[i][2], t: 'ball', p1: lr[i], el: ligand.a[i][3] });
    }
  }

  var spanX = Math.max(0.001, maxX - minX), spanY = Math.max(0.001, maxY - minY);
  var scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  var mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  var depth = Math.max(0.001, maxZ - minZ);

  function sx(pt) { return W / 2 + (pt[0] - mx) * scale; }
  function sy(pt) { return H / 2 - (pt[1] - my) * scale; }
  function fade(pt) { return 0.78 + 0.44 * ((pt[2] - minZ) / depth); }

  items.sort(function (a, b) { return a.z - b.z; });

  var parts = [], k;
  for (k = 0; k < items.length; k++) {
    var it = items[k];
    if (it.t === 'stick') {
      var col = it.tier === 2 ? 'var(--blue-ink)' : (it.tier === 1 ? 'var(--blue)' : 'var(--grey-node)');
      var op = it.tier === 2 ? 0.95 : (it.tier === 1 ? 0.7 : 0.28);
      var wd = it.tier ? 2.6 : 1.7;
      parts.push('<line x1="' + fx(sx(it.p1), 1) + '" y1="' + fx(sy(it.p1), 1) +
                 '" x2="' + fx(sx(it.p2), 1) + '" y2="' + fx(sy(it.p2), 1) +
                 '" stroke="' + col + '" stroke-width="' + wd + '" stroke-linecap="round" ' +
                 'opacity="' + fx(op * fade(it.p1), 2) + '"/>');
    } else if (it.t === 'ghost') {
      parts.push('<line x1="' + fx(sx(it.p1), 1) + '" y1="' + fx(sy(it.p1), 1) +
                 '" x2="' + fx(sx(it.p2), 1) + '" y2="' + fx(sy(it.p2), 1) +
                 '" stroke="var(--ink-3)" stroke-width="2.4" stroke-linecap="round" ' +
                 'stroke-dasharray="3 3" opacity="0.5"/>');
    } else if (it.t === 'lig') {
      parts.push('<line x1="' + fx(sx(it.p1), 1) + '" y1="' + fx(sy(it.p1), 1) +
                 '" x2="' + fx(sx(it.p2), 1) + '" y2="' + fx(sy(it.p2), 1) +
                 '" stroke="' + (ELEMENT_INK[it.el] || CARBON_INK) +
                 '" stroke-width="' + fx(6.0 * fade(it.p1), 1) + '" stroke-linecap="round"/>');
    } else if (it.t === 'ball') {
      var rad = (LY3.COVALENT[it.el] !== undefined ? LY3.COVALENT[it.el] : 0.9);
      var r = rad * 9.4 * fade(it.p1);
      parts.push('<circle cx="' + fx(sx(it.p1), 1) + '" cy="' + fx(sy(it.p1), 1) +
                 '" r="' + fx(r, 1) + '" fill="' + (ELEMENT_INK[it.el] || CARBON_INK) +
                 '" stroke="var(--card-sub)" stroke-width="1.2"/>');
    } else if (it.t === 'label') {
      var ox = sx(it.p1) - W / 2, oy = sy(it.p1) - H / 2;
      var ol = Math.sqrt(ox * ox + oy * oy) || 1;
      var tx = sx(it.p1) + ox / ol * 16, ty = sy(it.p1) + oy / ol * 16;
      parts.push('<text x="' + fx(tx, 1) + '" y="' + fx(ty, 1) +
                 '" text-anchor="middle" font-family="var(--sans)" font-size="12" ' +
                 'font-weight="700" paint-order="stroke" stroke="var(--card-sub)" ' +
                 'stroke-width="3.5" fill="' +
                 (it.tier === 2 ? 'var(--blue-ink)' : 'var(--blue)') + '">' +
                 esc(it.text) + '</text>');
    }
  }

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
         'aria-label="단백질-리간드 결합 장면" style="touch-action:none;cursor:grab">' +
         parts.join('') + '</svg>';
}

function paintScene() {
  var host = $('scene3d');
  var scene = sceneData();
  if (!host || !scene) return;
  host.innerHTML = svgScene(scene, viewScene.pose, viewScene.rx, viewScene.ry,
                            viewScene.ghost);
}

function mountScene(mol) {
  var host = $('scene3d');
  var scene = sceneData();
  if (!host) return;
  if (!scene) { host.innerHTML = ''; return; }

  var pose = poseFor(mol);
  viewScene.pose = pose;
  viewScene.rx = -0.3; viewScene.ry = 0.5;
  paintScene();

  var note = $('scene-note');
  if (note) {
    if (pose) {
      note.innerHTML = '<b>' + esc(pose.n || pose.lig) + '</b> · 결정구조 ' +
        '<b>' + esc(pose.pdb) + '</b> (주쇄 Cα 정렬 RMSD ' + fx(pose.rmsd, 2) + ' Å) · ' +
        'helix-12 변위 <b>' + fx(pose.h12, 1) + ' Å</b> → ' +
        (pose.conf === 'antagonist' ? '길항제형' : '작용제형') + ' 구조 · ' +
        '접촉 잔기 ' + (pose.c || []).length + '개' +
        ((pose.hb || []).length ? ', 수소결합 ' + pose.hb.length + '개' : '') +
        '<br>진한 파랑 = 수소결합, 파랑 = 접촉, 회색 = 나머지 포켓 잔기. ' +
        '라벨은 수소결합 상대와 앵커 잔기만 표시합니다. 도킹이 아니라 실제 결정 좌표입니다.';
    } else {
      note.innerHTML = '이 물질의 결정구조는 번들에 들어 있지 않습니다. ' +
        '1GWR 포켓과 그 안의 에스트라디올(점선)만 표시합니다. ' +
        '포즈를 추가하려면 <code>local/build_pocket.py</code>의 복합체 목록에 ' +
        'PDB 항목을 더하세요.';
    }
  }

  if (!host._sceneBound && host.addEventListener) {
    host._sceneBound = true;
    var start = function (ev) {
      viewScene.dragging = true;
      var pt = ev.touches ? ev.touches[0] : ev;
      viewScene.lastX = pt.clientX; viewScene.lastY = pt.clientY;
    };
    var move = function (ev) {
      if (!viewScene.dragging) return;
      var pt = ev.touches ? ev.touches[0] : ev;
      viewScene.ry += (pt.clientX - viewScene.lastX) * 0.012;
      viewScene.rx += (pt.clientY - viewScene.lastY) * 0.012;
      viewScene.rx = Math.max(-1.5, Math.min(1.5, viewScene.rx));
      viewScene.lastX = pt.clientX; viewScene.lastY = pt.clientY;
      if (ev.preventDefault) ev.preventDefault();
      paintScene();
    };
    var end = function () { viewScene.dragging = false; };
    host.addEventListener('mousedown', start);
    host.addEventListener('mousemove', move);
    host.addEventListener('mouseup', end);
    host.addEventListener('mouseleave', end);
    host.addEventListener('touchstart', start);
    host.addEventListener('touchmove', move);
    host.addEventListener('touchend', end);
  }
  var ghost = $('scene-ghost');
  if (ghost && ghost.addEventListener && !ghost._bound) {
    ghost._bound = true;
    ghost.addEventListener('click', function () {
      viewScene.ghost = !viewScene.ghost;
      ghost.textContent = viewScene.ghost ? '결정 에스트라디올 숨기기'
                                          : '결정 에스트라디올 겹쳐보기';
      paintScene();
    });
  }
}

/* ---------------------------------------------------------- pocket map */

/* A schematic, not a projection: the A-ring anchors on the left, the D-ring
 * anchor on the right, the hydrophobic walls above and below, the Asp351
 * channel at the bottom left and helix 12 at the top right - which is the
 * arrangement in 1GWR, flattened. Residues the engine reports but that are
 * not drawn here (Met343, Met388, Leu349, Leu384, the rest of helix 12) are
 * in the contact list under the diagram. */
var RESIDUE_XY = {
  Glu353: [68, 118], Arg394: [68, 202], Phe404: [132, 96],
  His524: [502, 120], Gly521: [502, 198],
  Thr347: [124, 288], Asp351: [72, 246],
  Ala350: [172, 296], Leu346: [252, 306], Leu387: [334, 304], Leu391: [416, 296],
  Met421: [150, 42], Ile424: [252, 28], Leu428: [348, 28], Leu525: [432, 44],
  Trp383: [196, 60],
  Leu536: [520, 64], Tyr537: [566, 102], Leu540: [550, 34]
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
    else if (xy[0] > 520) { anchor = 'end'; tx = xy[0] - 15; ty = xy[1] + 4; }
    else if (xy[0] > 430) { anchor = 'start'; tx = xy[0] + 11; ty = xy[1] + 4; }
    else { anchor = 'middle'; tx = xy[0]; ty = xy[1] + 20; }
    parts.push('<text x="' + fx(tx, 1) + '" y="' + fx(ty, 1) + '" text-anchor="' + anchor +
               '" font-family="var(--sans)" font-size="11.5" font-weight="600" ' +
               'fill="' + colour + '" ' +
               'opacity="' + (res.contact ? '1' : '.6') + '">' + esc(res.id) + '</text>');
  }

  return '<svg viewBox="0 0 600 330" role="img" aria-label="ERalpha LBD 포켓 접촉도">' +
         parts.join('') + '</svg>';
}

/* ERbeta, and why a single "ER" number is not enough.
 *
 * The two subtypes sit in different tissues and oppose each other in several
 * of them, and the phytoestrogens - the compounds this tool is most often
 * pointed at - are the textbook case: genistein is reported an order of
 * magnitude stronger at ERbeta than at ERalpha. A screen that reports one
 * number for "the estrogen receptor" hides exactly that.
 *
 * The comparison is read-across on the ERbeta library only, with no
 * pharmacophore layer and no Tox21 behind it, so it is reported as a ratio
 * with its own similarity and never folded into the ERalpha number. */
function subtypeSelectivity(result) {
  if (typeof PANEL === 'undefined' || !PANEL.panels || !PANEL.panels.erb) return null;
  var out;
  try {
    var fp = MOL.packFingerprint(MOL.morganFingerprint(result.mol, 2));
    out = PANEL.evaluatePanel('erb', fp, result.structureId, {});
  } catch (err) { return null; }
  if (!out || !out.read || !out.read.asserted) return null;
  var beta = out.read.pKi, alpha = result.pKi;
  var diff = alpha - beta;
  /* The two numbers come from two independently aggregated ChEMBL sets, not
   * from one laboratory measuring both, so the floor on what counts as
   * selectivity has to be set above that noise. A log is the honest line:
   * below it this comparison cannot tell a real preference from two
   * different assay collections disagreeing.
   *
   * Worth knowing how blunt that makes it: genistein is reported an order of
   * magnitude ERbeta-selective in the literature, and these medians put it
   * at ERalpha 6.8 against ERbeta 6.9 - no preference at all. Read this row
   * as a flag for large differences, not as a selectivity measurement. */
  var word, lean;
  if (Math.abs(diff) < 1.0) { word = '뚜렷한 선택성 없음'; lean = 'none'; }
  else if (diff > 0) {
    word = 'ERα 쪽 ' + fx(Math.pow(10, diff), 0) + '배';
    lean = 'alpha';
  } else {
    word = 'ERβ 쪽 ' + fx(Math.pow(10, -diff), 0) + '배';
    lean = 'beta';
  }
  return { lean: lean, word: word,
           detail: 'ERβ 추정 pKi ' + fx(beta, 1) + ' (유사도 ' +
                   fx(out.read.nearest, 2) + ', read-across만) · ' +
                   '두 수용체의 값은 서로 다른 데이터셋에서 온 것이라 ' +
                   '10배 미만 차이는 선택성으로 읽지 않습니다' };
}

/* ------------------------------------------------------- caveat block */

/* Two things the engine knows it cannot see. Both used to be silent, and
 * both produced confident numbers that were wrong by orders of magnitude,
 * so they are printed next to the number they affect. */
function caveatSection(result) {
  var out = [];
  var sw = result.stereoWarning;
  var mismatch = result.anchorMismatch || [];
  /* a token mismatch on one distant neighbour is not worth a warning; this
   * fires when a real part of the evidence binds some other way */
  var weak = result.anchorSupport !== undefined && result.anchorSupport < 0.85;
  if (!sw && !weak) return '';

  out.push('<div class="panel" style="margin:0 0 16px;padding:16px 18px;' +
           'border-left:3px solid var(--orange)">');
  out.push('<div style="font-size:14px;font-weight:700;margin-bottom:8px">' +
           '이 결과를 읽을 때 주의할 점</div>');
  out.push('<ul style="margin:0;padding-left:18px">');

  if (weak) {
    out.push('<li style="font-size:13.5px;line-height:1.55;color:var(--ink-2);' +
             'margin-bottom:6px"><b>앵커 불일치</b> — 가장 닮은 레퍼런스들이 ' +
             '이 물질과 <b>같은 방식으로 결합하지 않습니다</b> (앵커 일치도 ' +
             fx(100 * result.anchorSupport, 0) + '%). ' +
             (mismatch.length ? esc(mismatch.join(' · ')) + '. ' : '') +
             '지문 유사도는 분자의 어느 부분을 수용체가 붙잡는지 모르기 때문에, ' +
             'read-across 가중치를 ' + fx(result.weightReadAcrossRaw, 2) + '에서 ' +
             fx(result.weightReadAcross, 2) + '로 낮추고 구조 규칙 쪽에 ' +
             '무게를 실었습니다.</li>');
  }
  if (sw) {
    out.push('<li style="font-size:13.5px;line-height:1.55;color:var(--ink-2)">' +
             '<b>입체화학</b> — 이 엔진은 입체화학을 보지 않습니다. ' +
             (sw.centres ? '입력 구조에 입체중심이 ' + sw.centres + '개 있고, ' : '') +
             (sw.match ? '매칭된 레퍼런스(' + esc(sw.match) + ')에 ' +
                         sw.refCentres + '개 있습니다. ' : '') +
             '둘이 같은 이성질체인지 이 도구는 판별하지 못합니다. ' +
             'ERα에서 이것은 사소한 문제가 아닙니다 — 17β-에스트라디올의 ' +
             '17번 하이드록실이 His524에 닿는 쪽이고, 17α 에피머는 친화도가 ' +
             '자리 수로 떨어지는데 여기서는 <b>같은 분자로 처리됩니다</b>.</li>');
  }
  out.push('</ul></div>');
  return out.join('');
}

/* ------------------------------------------------ adipocyte signalling */

/* A second panel, for the question "does this touch fat". It is kept visually
 * and verbally separate from the ER result because it answers a different
 * question with different evidence, and because the part people most want -
 * which depot - is the part this bundle does not measure. */

var LEVEL_STYLE = {
  'measured-up':   ['warn', '실측 · 분화 촉진 쪽'],
  'measured-down': ['ok', '실측 · 분화 억제 쪽'],
  'possible-up':   ['warn', '가능성 · 분화 촉진 쪽'],
  'mixed':         ['', '보고 엇갈림'],
  'none':          ['', '근거 없음']
};

var KIND_WORD = { measured: '실측', crystal: '결정구조', predicted: '예측',
                  weak: '약한 신호', context: '배경지식', none: '' };

function panelRow(p) {
  if (!p) return '';
  var tox = p.tox21, read = p.read;
  var state, cls = '';
  if (tox && tox.unconfirmed) {
    state = (tox.unconfirmed === 'agonist' ? '작용제' : '길항제') +
            ' 모드 신호 (농도 미기록)';
  } else if (tox && tox.verdict === 'agonist') {
    state = '작용제 활성 (실측)'; cls = ' class="warnink"';
  } else if (tox && tox.verdict === 'antagonist') {
    state = '길항제 활성 (실측)';
  } else if (tox && tox.verdict === 'inactive') {
    state = '비활성 (실측)';
  } else if (read && read.nearest >= 0.999) {
    /* the compound is in the panel library itself: this is a lookup of a
       measured value, not a prediction, and calling it one would be a lie */
    state = 'ChEMBL 실측 pKi ' + fx(read.pKi, 1) + ' (라이브러리 수록)';
  } else if (read && read.asserted) {
    state = 'pKi ' + fx(read.pKi, 1) + ' 추정 (유사도 ' + fx(read.nearest, 2) + ')';
  } else if (read && read.usable) {
    state = '유사 레퍼런스 부족 (최근접 ' + fx(read.nearest, 2) + ')';
  } else {
    state = '판단 불가';
  }
  var extra = [];
  if (tox && tox.ac50 !== null && tox.ac50 !== undefined) {
    extra.push('AC50 ' + fx(tox.ac50, tox.ac50 < 1 ? 3 : 1) + ' µM');
  }
  if (p.pose) {
    extra.push('결정구조 ' + p.pose.pdb + ' · ' +
               (p.pose.conf === 'af2-engaged' ? 'Tyr473 수소결합' : 'β-sheet 결합'));
  }
  if (read && read.neighbours && read.neighbours.length && read.asserted &&
      read.neighbours[0].named) {
    extra.push('최근접 ' + read.neighbours[0].n);
  }
  return '<tr><td style="width:40%">' + esc(p.ko) + '</td><td' + cls +
         ' style="font-weight:700">' + esc(state) +
         (extra.length
           ? '<div style="font-weight:400;font-size:12.5px;color:var(--ink-3);' +
             'margin-top:2px">' + esc(extra.join(' · ')) + '</div>'
           : '') +
         '</td></tr>';
}

function adipoSection(result) {
  if (typeof PANEL === 'undefined') return '';
  var a;
  try { a = PANEL.evaluate(result.mol, result); } catch (err) { return ''; }
  if (!a) return '';
  var style = LEVEL_STYLE[a.summary.level] || LEVEL_STYLE.none;
  var out = [];
  out.push('<h4 class="sect">지방세포 신호 패널</h4>');
  out.push('<div class="panel" style="margin:0 0 16px;padding:18px">');
  out.push('<div style="font-size:16px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px"' +
           (style[0] === 'warn' ? ' class="warnink"' : '') + '>' +
           esc(a.summary.headline) + '</div>');
  out.push('<p class="hint" style="margin:0 0 14px">' + esc(style[1]) + '</p>');

  out.push('<table><tbody>');
  var order = ['pparg', 'gr', 'ar', 'hsd1', 'arom'];
  for (var oi = 0; oi < order.length; oi++) {
    out.push(panelRow(a.panels ? a.panels[order[oi]] : null));
  }
  var erFc = result.functionCall;
  out.push('<tr><td>ERα (저장 부위 분포)</td><td style="font-weight:700">' +
           esc(PR.tierPhrase(erFc.tier, erFc.label)) + '</td></tr>');
  if (a.pheno) {
    out.push('<tr><td>지방세포 분화 실측 (3T3-L1 등)</td><td style="font-weight:700">' +
             '촉진 ' + a.pheno.induces + '건 / 억제 ' + a.pheno.inhibits + '건' +
             (a.pheno.uM !== null
               ? '<div style="font-weight:400;font-size:12.5px;color:var(--ink-3);' +
                 'margin-top:2px">최저 보고 농도 ' + a.pheno.uM + ' µM</div>'
               : '') + '</td></tr>');
  } else {
    out.push('<tr><td>지방세포 분화 실측 (3T3-L1 등)</td>' +
             '<td style="color:var(--ink-3)">기록 없음</td></tr>');
  }
  out.push('</tbody></table>');

  out.push('<h4 class="sect" style="margin-top:16px">판단 근거</h4>');
  out.push('<ul style="margin:0;padding-left:18px">');
  for (var i = 0; i < a.summary.reasons.length; i++) {
    var r = a.summary.reasons[i];
    var tag = KIND_WORD[r.kind] || '';
    out.push('<li style="font-size:13.5px;line-height:1.5;color:var(--ink-2);margin-bottom:5px">' +
             (tag ? '<b>[' + esc(tag) + ']</b> ' : '') + esc(r.text) + '</li>');
  }
  out.push('</ul>');

  if (a.depot) {
    var dl = a.depot;
    out.push('<h4 class="sect" style="margin-top:18px">부위 지향 — 피하 대 내장 ' +
             '<span class="hint" style="font-weight:500">(해석 층, 측정값 아님)</span></h4>');
    out.push('<div style="font-size:15px;font-weight:700;letter-spacing:-0.02em;' +
             'margin-bottom:8px"' + (dl.lean === 'sc' ? ' class="okink"' : '') + '>' +
             esc(dl.headline) + '</div>');
    if (dl.sc.length || dl.visceral.length) {
      out.push('<table><thead><tr><th style="width:84px">방향</th><th>근거</th>' +
               '</tr></thead><tbody>');
      var rows = dl.sc.concat(dl.visceral);
      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        var gradeWord = row.grade === 'measured' ? '실측'
          : (row.grade === 'measured-weak' ? '약한 실측' : '예측');
        out.push('<tr><td style="font-weight:700"' +
                 (row.depot === 'sc' ? '' : ' class="warnink"') + '>' +
                 (row.depot === 'sc' ? '피하 쪽' : '내장 쪽') + '</td>' +
                 '<td style="font-size:13.5px;line-height:1.5">' + esc(row.text) +
                 '<div style="font-size:12.5px;color:var(--ink-3);margin-top:2px">[' +
                 esc(gradeWord) + ']' + (row.detail ? ' ' + esc(row.detail) : '') +
                 '</div></td></tr>');
      }
      out.push('</tbody></table>');
    }
    if (dl.substrates && dl.substrates.length) {
      out.push('<p class="hint" style="margin:10px 0 0">기질일 가능성 때문에 ' +
               '제외한 신호: 아로마테이즈 결합 ' +
               esc(dl.substrates[0].detail || '') + ' — 이 효소의 데이터는 ' +
               '저해제와 기질을 구분하지 못하고, 이 물질은 안드로겐/에스트로겐 ' +
               '수용체에서 작용제로 측정됐습니다.</p>');
    }
    if (dl.crossed && dl.crossed.length) {
      out.push('<p class="hint" style="margin:10px 0 0">교차반응으로 보아 ' +
               '제외한 신호: ' +
               dl.crossed.map(function (c) {
                 var who = { ar: 'AR', gr: 'GR', pparg: 'PPARγ',
                             hsd1: '11β-HSD1', arom: '아로마테이즈' }[c.panel] || c.panel;
                 if (c.withGr) {
                   return who + ' 작용 (GR과 동시 활성 — 이 리포터 세포주는 두 수용체에 ' +
                          '모두 반응하므로 구분되지 않습니다)';
                 }
                 return who + ' (AC50 ' + fx(c.ac50, c.ac50 < 1 ? 3 : 1) + ' µM, ' +
                        '가장 강한 활성보다 ' + c.ratio + '배 약함)';
               }).join(' · ') + '</p>');
    }
    out.push('<p class="hint" style="margin:10px 0 0">이 표는 <b>측정된 부위 데이터가 ' +
             '아닙니다.</b> 위의 수용체 결과에, 각 수용체가 사람·동물에서 저장 부위를 ' +
             '어느 쪽으로 미는지를 곱한 추론입니다. 부위별 지방세포 실측 자료는 ' +
             'ChEMBL 기준으로 사실상 없습니다 — 내장 지방세포 분화 어세이 0건, ' +
             '사람 피하 전지방세포 어세이 62건은 전부 세포독성·증식 측정입니다.</p>');
  }

  out.push('<details style="margin-top:14px"><summary style="cursor:pointer;' +
           'font-size:13.5px;font-weight:600;color:var(--ink-2)">' +
           '피하지방으로 읽을 때 주의할 것</summary>' +
           '<div style="font-size:13.5px;line-height:1.6;color:var(--ink-2);margin-top:8px">' +
           '<p style="margin:0 0 8px"><b>이 패널이 측정한 것</b>은 수용체 활성(ChEMBL·Tox21)과 ' +
           '배양 지방전구세포의 분화·지질축적 실측치입니다. <b>지방이 피하로 가는지 ' +
           '내장으로 가는지는 이 번들에 들어 있지 않습니다.</b> 아래는 결과가 아니라 ' +
           '해석을 돕는 배경지식입니다.</p>' +
           '<p style="margin:0 0 8px">PPARγ는 지방세포 분화의 마스터 조절자이고, ' +
           '전장작용제(TZD 계열)는 임상에서 피하지방을 늘리고 내장지방을 줄이는 쪽으로 ' +
           '보고됩니다. 글루코코르티코이드 수용체는 배양에서는 분화를 돕지만 사람에서는 ' +
           '중심성·내장지방 증가와 연결됩니다. 에스트로겐 신호는 배양 지방세포 분화를 ' +
           '오히려 억제하면서도 개체 수준에서는 저장을 피하(둔부·대퇴) 쪽으로 미는, ' +
           '방향이 엇갈리는 축입니다. 즉 <b>"분화를 켜는가"와 "어디에 쌓는가"는 서로 다른 ' +
           '질문이고, 이 도구는 앞의 것만 데이터로 답합니다.</b></p>' +
           '<p style="margin:0">배양 세포에서 µM 농도로 나온 결과가 사람에서 같은 일을 ' +
           '한다는 보장은 없습니다. 노출 경로·농도·대사가 전부 빠져 있고, ' +
           'PPARγ를 켜는 물질 상당수는 내분비계 교란물질 또는 의약품으로 관리되는 ' +
           '대상입니다. <b>이 패널은 위해성 선별용이며, 체형을 바꾸려는 목적의 ' +
           '사용 근거가 될 수 없습니다.</b></p></div></details>');
  out.push('</div>');
  return out.join('');
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
  var fcLabel = PR.tierPhrase(fc.tier, fc.label);
  var fcClass = (fc.label === 'antagonist' || fc.label === 'unknown') ? ' warnink' : '';

  var tox = result.functionCall.tox21;
  if (tox) {
    var erTable = erTox21();
    var assays = (erTable && erTable.assays) ? erTable.assays : [];
    out.push('<div class="measured">');
    out.push('<div class="mhead">실측 — Tox21 ERα 리포터 어세이</div>');
    out.push('<table style="margin-top:6px"><tbody>');
    for (var t = 0; t < tox.calls.length; t++) {
      var a = assays[t] || {};
      var ko = PR.TOX21_LABEL_KO[tox.calls[t]] || tox.calls[t];
      var bad = tox.calls[t] === 'active antagonist';
      out.push('<tr><td style="width:46%">' +
               esc((a.mode === 'agonist' ? '작용제 모드' : '길항제 모드') +
                   (a.line ? ' · ' + a.line : '')) + '</td>' +
               '<td' + (bad ? ' class="warnink"' : '') +
               ' style="font-weight:700">' + esc(ko) + '</td></tr>');
    }
    if (tox.ac50 !== null && tox.ac50 !== undefined) {
      var scale = potencyScale(tox.ac50);
      out.push('<tr><td>가장 강한 활성 농도 (AC50)</td><td style="font-weight:700">' +
               fx(tox.ac50, tox.ac50 < 1 ? 3 : 1) + ' &micro;M' +
               (tox.ac50mode ? ' <span class="hint">' +
                 (tox.ac50mode === 'agonist' ? '작용제 모드' : '길항제 모드') + '</span>' : '') +
               (scale ? '<div style="font-weight:400;font-size:12.5px;' +
                        'color:var(--ink-3);margin-top:2px">' + esc(scale) + '</div>' : '') +
               '</td></tr>');
    }
    out.push('</tbody></table>');
    out.push('<p class="hint" style="margin:8px 0 0">이 물질은 실제로 시험됐습니다. ' +
             '아래 예측값보다 이 결과를 우선하세요.' +
             (tox.ac50 !== null && tox.ac50 > PR.POOL_AC50_MAX
               ? ' 다만 AC50이 ' + fx(tox.ac50, 1) + ' µM로 높습니다 — 이 농도대의 ' +
                 '단일 웰 활성은 수용체 결합이 아닌 어세이 간섭일 수 있습니다.'
               : '') +
             (tox.cytotoxic ? ' 「세포독성으로 판정 보류」는 길항 활성의 근거가 아닙니다 — ' +
              '세포를 죽이는 물질은 길항제 모드에서 신호를 내기 때문입니다.' : '') +
             '</p>');
    out.push('</div>');
  }

  var toxRead = fc.tox21;
  if (toxRead && toxRead.verdict === 'inactive' && result.pKi >= 6.5) {
    out.push('<div class="measured" style="border-left:3px solid var(--orange)">');
    out.push('<div class="mhead">실측 비활성과 예측 친화도가 어긋납니다</div>');
    out.push('<p class="hint" style="margin:6px 0 0">Tox21 리포터 어세이는 ' +
             '<b>비활성</b>인데 예측 친화도는 pKi ' + fx(result.pKi, 1) + '입니다. ' +
             '리포터에서 비활성이라는 것은 <b>결합하지 않는다는 뜻이 아닙니다</b> — ' +
             '순수 길항제와 SERD는 작용제 모드에서 신호를 내지 않고, 용해도·세포독성· ' +
             '대사 불안정으로도 비활성으로 나옵니다. 결합 여부는 아래 예측과 ' +
             '포켓 접촉도를, 에스트로겐 활성 여부는 이 실측을 보세요.</p>');
    out.push('</div>');
  }

  var pose = result.pose;
  if (pose) {
    out.push('<div class="measured">');
    out.push('<div class="mhead">실측 — 결정구조 복합체</div>');
    out.push('<table style="margin-top:6px"><tbody>');
    out.push('<tr><td style="width:46%">PDB</td><td style="font-weight:700">' +
             esc(pose.pdb) + ' <span class="hint">' + esc(pose.lig) + '</span></td></tr>');
    out.push('<tr><td>helix-12 변위</td><td' +
             (pose.conf === 'antagonist' ? ' class="warnink"' : '') +
             ' style="font-weight:700">' + fx(pose.h12, 1) + ' &Aring; → ' +
             (pose.conf === 'antagonist' ? '길항제형' : '작용제형') + '</td></tr>');
    out.push('<tr><td>수소결합 상대</td><td style="font-weight:700">' +
             esc((pose.hb || []).map(prettyResidue).join(', ') || '없음') + '</td></tr>');
    out.push('</tbody></table>');
    out.push('<p class="hint" style="margin:8px 0 0">이 물질은 ERα LBD와의 복합체가 ' +
             '실제로 풀려 있습니다. helix-12 변위는 작용제형 기준구조(1GWR)에 ' +
             '주쇄 Cα를 맞춘 뒤 536-544번 잔기의 RMSD를 잰 값입니다 — ' +
             '작용제 복합체는 1.1 Å 이하, 길항제 복합체는 11 Å 이상으로 ' +
             '두 무리가 섞이지 않습니다. 아래 예측보다 이 결과를 우선하세요.</p>');
    out.push('</div>');
  }

  out.push('<div class="headline">');
  out.push('<div class="pk num">' + fx(result.pKi, 2) +
           '<small>&plusmn;' + fx(result.ci, 1) + '</small></div>');
  out.push('<div class="pklabel">예측 pKi · 오차범위</div>');
  out.push('<div class="kv">');
  out.push('<div><span class="k">Ki 환산</span><span class="v num">' +
           fx(result.kiNM, result.kiNM < 10 ? 2 : 0) + ' nM</span></div>');
  /* the support fraction is a read-across weight; on a measured call there
     is no read-across and printing 0.00 next to a measurement reads as a
     confidence of zero, which is the opposite of the truth */
  out.push('<div><span class="k">기능 추정</span><span class="v' + fcClass + '">' +
           esc(fcLabel) +
           (fc.tier === 'measured'
             ? (fc.thin ? '<span class="sub">유효 어세이 1개</span>' : '')
             : (fc.tier === 'crystal'
                 ? '<span class="sub">' + esc(fc.pose ? fc.pose.pdb : '') + '</span>'
                 : '<span class="sub">근거 ' + fx(fc.support, 2) + '</span>')) +
           '</span></div>');
  var tierInfo = PR.TIER_LABELS[fc.tier];
  if (tierInfo) {
    var tierNote = tierInfo.note;
    if (fc.tier === 'measured' && fc.label === 'inactive') {
      tierNote = 'Tox21 어세이 4종 모두 비활성';
    } else if (fc.tier === 'measured' && fc.thin) {
      tierNote += ' — 단 유효 판정이 어세이 1개뿐이므로 약하게 보세요';
    }
    out.push('<div><span class="k">판정 등급</span><span class="v" ' +
             'style="font-weight:500;font-size:13px;color:var(--ink-2)">' +
             esc(tierInfo.word + ' — ' + tierNote) + '</span></div>');
  }
  if (fc.reason) {
    out.push('<div><span class="k">' +
             (fc.tier === 'unknown' ? '판단 불가 이유' : '단정하지 않는 이유') +
             '</span><span class="v" style="font-weight:500;font-size:13px;' +
             'color:var(--ink-2)">' + esc(fc.reason) + '</span></div>');
  }
  /* Say outright what the reference set calls these, whatever the engine
   * decided. Someone asking "do the references treat this as an
   * antagonist?" should not have to reverse-engineer it from a verdict. */
  if (fc.neighbours && fc.neighbours.length && fc.tier !== 'measured') {
    var nAnt = fc.refAntagonists ? fc.refAntagonists.length : 0;
    var refLine;
    if (nAnt === fc.neighbours.length) {
      refLine = '최근접 레퍼런스 ' + nAnt + '종이 모두 길항제입니다 (' +
                fc.refAntagonists.slice(0, 3).join(', ') +
                (nAnt > 3 ? ' 외' : '') + ')';
    } else if (nAnt) {
      refLine = '최근접 ' + fc.neighbours.length + '종 중 ' + nAnt +
                '종이 길항제입니다 (' + fc.refAntagonists.slice(0, 3).join(', ') + ')';
    } else {
      refLine = '최근접 레퍼런스에 길항제가 없습니다';
    }
    out.push('<div><span class="k">레퍼런스가 보는 바</span><span class="v" ' +
             'style="font-weight:500;font-size:13px;color:var(--ink-2)">' +
             esc(refLine) + '</span></div>');
  }
  if (fc.evidence && fc.evidence.length) {
    out.push('<div><span class="k">판정 근거</span><span class="v" ' +
             'style="font-weight:500;font-size:13px;color:var(--ink-2)">' +
             esc(fc.evidence.join(' · ')) + '</span></div>');
  }
  out.push('<div><span class="k">구조 판정</span><span class="v">' + esc(p.verdict) + '</span></div>');
  var sel = subtypeSelectivity(result);
  if (sel) {
    out.push('<div><span class="k">ERα / ERβ</span><span class="v' +
             (sel.lean === 'beta' ? ' warnink' : '') + '">' + esc(sel.word) +
             '<span class="sub">' + esc(sel.detail) + '</span></span></div>');
  }
  out.push('<div><span class="k">적용영역</span><span class="v">' +
           '<span class="tag ' + esc(result.domain) + '">' + esc(domainWord) + '</span>' +
           '<span class="sub">유사도 ' + fx(result.nearestSim, 2) + '</span></span></div>');
  out.push('</div></div>');

  out.push(caveatSection(result));
  out.push(adipoSection(result));

  out.push('<h4 class="sect">포켓 접촉도</h4>');
  out.push('<div class="figwrap">' + svgPocket(p, result.occupancy) + '</div>');
  out.push('<p class="hint" style="margin:10px 0 0">' +
           (p.measured
             ? '<b>' + esc(p.pdb || '') + ' 결정구조에서 실제로 측정된 접촉</b>입니다. '
             : '결정구조가 없어 <b>구조 규칙으로 추정</b>한 접촉입니다. ') +
           '파랑 = 접촉 · 빨강 = helix-12 접촉 · 회색 = 미접촉<br>' +
           '분자 부피 ' + fx(result.volume, 0) + ' &Aring;&sup3; / 공동 ' + PR.POCKET_VOLUME + ' &Aring;&sup3;</p>');

  out.push('<h4 class="sect">접촉 잔기</h4>');
  out.push('<table><thead><tr><th>잔기</th><th>역할</th><th>상태</th></tr></thead><tbody>');
  for (var i = 0; i < p.residues.length; i++) {
    var r = p.residues[i];
    /* Nothing here computes steric overlap, so the column does not claim a
       clash. Both states come from the same distance cutoff; red adds only
       that the residue is in helix 12 and that this binding mode moves it. */
    var state = r.clash ? '접촉 (helix-12)'
                        : (r.contact ? (p.measured ? '접촉' : '접촉 예상') : '미접촉');
    out.push('<tr' + (r.clash ? ' class="clash"' : '') + '><td>' + esc(r.id) + '</td><td>' +
             esc(r.role) + '</td><td>' + esc(state) + '</td></tr>');
  }
  out.push('</tbody></table>');
  out.push('<p class="hint" style="margin:8px 0 0">' +
           '두 상태의 차이는 <b>세기가 아니라 위치</b>입니다. 접촉 판정은 양쪽 다 ' +
           '중원자 간 거리 기준(결정구조는 4.0 Å)으로 같고, 빨강은 그 잔기가 ' +
           '<b>helix-12(536-544)에 있고</b> 이 결합 양상이 helix-12를 밀어낸다는 ' +
           '뜻입니다. 입체 충돌을 계산한 값이 아닙니다 — 겹침이나 거리 위반을 ' +
           '재는 단계는 없습니다. 결정구조가 있는 물질에서는 helix-12가 실제로 ' +
           '어디 있는지를 재서 정하고, 없는 물질에서는 Asp351 통로로 빠져나가는 ' +
           '곁사슬이 있는지로 추정합니다. Tyr537·Asp538은 내성 변이 자리지만 ' +
           '그 자체가 길항 판정의 근거는 아닙니다.</p>');

  out.push('<h4 class="sect">2D 구조식</h4>');
  out.push('<div class="figwrap">' + svgStructure(result.mol) + '</div>');

  if (sceneData()) {
    out.push('<h4 class="sect">결합 장면 (1GWR 포켓)</h4>');
    out.push('<div class="figwrap viewer3d" id="scene3d"></div>');
    out.push('<p class="hint" id="scene-note" style="margin:10px 0 0"></p>');
    out.push('<div class="btnbar" style="margin-top:10px">' +
             '<button class="alt" id="scene-ghost" type="button">결정 에스트라디올 겹쳐보기</button></div>');
  }

  out.push('<h4 class="sect">3D 구조</h4>');
  out.push('<div class="figwrap viewer3d" id="struct3d"></div>');
  out.push('<p class="hint" style="margin:10px 0 0">드래그해서 돌려보세요. ' +
           '거리기하로 만든 <b>개략적인 형태</b>이며 입체화학(키랄리티)은 ' +
           '반영하지 않습니다 — 거울상 이성질체가 같게 나옵니다. ' +
           '파마코포어 간격 판정은 이 형태가 아니라 결합 수로 셉니다 — ' +
           '이 좌표는 유연한 분자에서 접히기 때문입니다.</p>');

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

  if (fc.neighbours && fc.neighbours.length) {
    out.push('<h4 class="sect">기능 판정에 쓰인 레퍼런스</h4>');
    out.push('<table><thead><tr><th>물질</th><th>알려진 기능</th>' +
             '<th class="num">유사도</th></tr></thead><tbody>');
    for (var f = 0; f < fc.neighbours.length; f++) {
      var fn = fc.neighbours[f];
      out.push('<tr><td>' + esc(fn.n) +
               (fn.measured ? ' <span class="hint">Tox21 실측 라벨</span>' :
                              ' <span class="hint">큐레이션 라벨</span>') +
               '</td><td' + (fn.c === 'antagonist' ? ' class="warnink"' : '') + '>' +
               esc(PR.CLASS_LABELS[fn.c] || fn.c) + '</td><td class="num">' +
               fx(fn.sim, 3) + '</td></tr>');
    }
    out.push('</tbody></table>');
  }

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

  /* A crystal complex of this compound, if the bundle has one, is handed to
   * the engine as evidence. */
  var pose = null;
  try {
    var probe = MOL.parseSmiles(smiles);
    pose = PR.poseForStructure(MOL.structureIdOf(probe));
  } catch (err) { pose = null; }

  /* The Tox21-decisive compounds join the read-across pool. Registered
   * here, once, because predict.js is bundled before the table is. */
  try {
    if (erTox21() && !measuredRegistered) {
      PR.registerMeasured(erTox21());
      measuredRegistered = true;
    }
  } catch (err) { /* the pool is optional */ }

  var tox21 = null, tox21Potency = null;
  try {
    var erTable2 = erTox21();
    if (erTable2 && erTable2.calls) {
      var sid = MOL.structureIdOf(MOL.parseSmiles(smiles));
      tox21 = erTable2.calls[sid] || null;
      tox21Potency = (erTable2.potency && erTable2.potency[sid]) || null;
    }
  } catch (err) { tox21 = null; }

  var result;
  try {
    result = PR.predict(smiles, { pose: pose, tox21: tox21,
                                  tox21Potency: tox21Potency });
  } catch (err) {
    host.innerHTML = '';
    var tips = PR.suggestNames(query, 5);
    var msg = '해석 실패: ' + err.message;
    if (!hit && tips.length) {
      msg += ' — 혹시 이 중 하나인가요? ' +
             tips.map(function (t) { return t.ko + ' (' + t.en + ')'; }).join(', ');
    } else if (!hit) {
      msg += ' — 사전에 없는 이름이면 SMILES로 입력해 주세요.';
    }
    showError('single-err', msg);
    return;
  }
  host.innerHTML = renderSingle(result, title, smiles);
  mountScene(result.mol);
  mount3D(result.mol);
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

/* The panel's own words, shortened for a table cell. A measured phenotype
 * says so, because that is a different kind of claim from a receptor read. */
var BATCH_ADIPO = {
  'measured-up': '분화 촉진 (실측)',
  'measured-down': '분화 억제 (실측)',
  'possible-up': '촉진 가능성',
  'mixed': '보고 엇갈림',
  'none': '—'
};

var BATCH_DEPOT = { sc: '피하 쪽', visceral: '내장 쪽', mixed: '엇갈림', none: '—' };

function batchDepotWord(row) {
  var word = BATCH_DEPOT[row.depotLean || 'none'] || '—';
  if (row.depotLean === 'sc' || row.depotLean === 'visceral') {
    word += ' ' + row.depotSc + '/' + row.depotVisc;
  } else if (row.depotLean === 'mixed') {
    word += ' ' + row.depotSc + '/' + row.depotVisc;
  }
  return word;
}

function batchAdipoWord(row) {
  var word = BATCH_ADIPO[row.adipoLevel || 'none'] || '—';
  if (row.adipoPheno) {
    word += ' ' + row.adipoPheno.induces + '/' + row.adipoPheno.inhibits;
  }
  return word;
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
      var adipo = null;
      try {
        if (typeof PANEL !== 'undefined') adipo = PANEL.evaluate(r.mol, r);
      } catch (errPanel) { adipo = null; }
      batchRows.push({
        name: items[i].name, smiles: smi, pKi: r.pKi, ci: r.ci,
        domain: r.domain, verdict: r.pocket.verdict,
        fnLabel: PR.tierPhrase(r.functionCall.tier, r.functionCall.label),
        fnKey: r.functionCall.label, fnSupport: r.functionCall.support,
        mw: r.desc.mw, clogp: r.desc.clogp, occupancy: r.occupancy,
        adipoLevel: adipo ? adipo.summary.level : null,
        adipoPheno: adipo ? adipo.pheno : null,
        depotLean: adipo && adipo.depot ? adipo.depot.lean : null,
        depotSc: adipo && adipo.depot ? adipo.depot.sc.length : 0,
        depotVisc: adipo && adipo.depot ? adipo.depot.visceral.length : 0
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
           '<th>지방 신호</th><th>부위 지향</th>' +
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
             '<td' + (/-up$/.test(row.adipoLevel || '') ? ' class="warnink"' : '') + '>' +
             esc(batchAdipoWord(row)) + '</td>' +
             '<td' + (row.depotLean === 'sc' ? ' class="okink"' : '') + '>' +
             esc(batchDepotWord(row)) + '</td>' +
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
              'structural_verdict', 'mw', 'clogp', 'occupancy',
              'adipo_signal', 'adipo_assays_up', 'adipo_assays_down',
              'depot_lean', 'depot_axes_sc', 'depot_axes_visceral'];
  var lines = [head.join('\t')];
  for (var i = 0; i < batchRows.length; i++) {
    var r = batchRows[i];
    lines.push([r.name, r.smiles, fx(r.pKi, 2), fx(r.ci, 1), r.domain,
                r.fnKey, fx(r.fnSupport, 2), r.verdict,
                fx(r.mw, 2), fx(r.clogp, 2), fx(r.occupancy, 0),
                r.adipoLevel || 'none',
                r.adipoPheno ? r.adipoPheno.induces : '',
                r.adipoPheno ? r.adipoPheno.inhibits : '',
                r.depotLean || 'none', r.depotSc, r.depotVisc].join('\t'));
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
  '17b-Estradiol,CC12CCC3c4ccc(O)cc4CCC3C1CCC2O',
  'Estrone,CC12CCC3c4ccc(O)cc4CCC3C1CCC2=O',
  'Diethylstilbestrol,CCC(=C(CC)c1ccc(O)cc1)c1ccc(O)cc1',
  'Genistein,Oc1ccc(cc1)-c1coc2cc(O)cc(O)c2c1=O',
  'Bisphenol A,CC(C)(c1ccc(O)cc1)c1ccc(O)cc1',
  'Bisphenol S,Oc1ccc(cc1)S(=O)(=O)c1ccc(O)cc1',
  '4-Nonylphenol,CCCCCCCCCc1ccc(O)cc1',
  'Butylparaben,CCCCOC(=O)c1ccc(O)cc1',
  '4-Hydroxytamoxifen,CCC(=C(c1ccc(O)cc1)c1ccc(OCCN(C)C)cc1)c1ccccc1',
  'Raloxifene,Oc1ccc2sc(-c3ccc(OCCN4CCCCC4)cc3)c(C(=O)c3ccc(O)cc3)c2c1',
  'Zearalenone,CC1CCCC(=O)CCCC=CC2=CC(O)=CC(O)=C2C(=O)O1',
  'Niacinamide,NC(=O)c1cccnc1',
  'Glycerin,OCC(O)CO'
].join('\n');

/* ------------------------------------------------------ library tab */

var activePreset = 'curated';

function extendedLibrary() {
  return (typeof EXTLIB !== 'undefined' && EXTLIB && EXTLIB.length) ? EXTLIB : null;
}

/* Swapping to the expanded set re-parses a few thousand structures, which
 * takes a few hundred milliseconds. Paint the busy state first, then work. */
function applyPreset(which) {
  showError('lib-err', '');
  if (which === 'extended') {
    var ext = extendedLibrary();
    if (!ext) { showError('lib-err', '이 빌드에는 확장 라이브러리가 들어 있지 않습니다.'); return; }
    var host = $('lib-out');
    if (host) host.innerHTML = '<div class="panel"><h3>확장 라이브러리 준비 중…</h3>' +
      '<p class="hint" style="margin:0">' + ext.length + '종을 해석하고 있습니다.</p></div>';
    var run = function () {
      try {
        var res = PR.setLibrary(ext);
        activePreset = 'extended';
        renderLibrary();
        showError('lib-err', res.applied + '종을 적용했습니다.');
      } catch (err) {
        showError('lib-err', '적용 실패: ' + err.message);
        renderLibrary();
      }
    };
    if (typeof setTimeout === 'function') setTimeout(run, 16); else run();
    return;
  }
  PR.resetLibrary();
  activePreset = 'curated';
  renderLibrary();
  showError('lib-err', '엄선 ' + PR.getLibrary().length + '종으로 복원했습니다.');
}

function presetCards() {
  var ext = extendedLibrary();
  var rows = [
    ['curated', '엄선 ' + PR.REFERENCE_DEFAULT.length + '종',
     'ChEMBL ERα(CHEMBL206) 실측 pKi에 작용/길항 라벨을 붙인 집합. ' +
     '에스트로겐·피토에스트로겐·SERM·내분비계 교란물질과 비결합 기준선이 들어 있습니다.'],
    ['extended', '확장 ' + (ext ? ext.length : 0) + '종',
     'ChEMBL ERα 전체를 병합한 것. SERD·SERM 의약화학 계열이 두터워지지만 ' +
     '작용/길항 라벨 대신 역가 구간만 붙습니다.']
  ];
  var out = ['<div class="presets">'];
  for (var i = 0; i < rows.length; i++) {
    var on = activePreset === rows[i][0];
    var dead = rows[i][0] === 'extended' && !ext;
    out.push('<button type="button" class="preset' + (on ? ' on' : '') + '"' +
             (dead ? ' disabled' : '') + ' data-preset="' + rows[i][0] + '">' +
             '<span class="pt">' + esc(rows[i][1]) + (on ? ' ·  사용 중' : '') + '</span>' +
             '<span class="pd">' + esc(rows[i][2]) + '</span></button>');
  }
  out.push('</div>');
  return out.join('');
}

function renderLibrary() {
  var host = $('lib-out');
  if (!host) return;
  var lib = PR.getLibrary();
  var out = [];
  out.push('<div class="panel">');
  out.push(presetCards());
  out.push('<h3 style="margin-top:20px">현재 라이브러리 ' + lib.length + '종</h3>');
  var shown = Math.min(lib.length, 300);
  if (shown < lib.length) {
    out.push('<p class="hint">상위 ' + shown + '종만 표시합니다 (pKi 순).</p>');
  }
  out.push('<div class="tscroll"><table><thead><tr><th>물질</th><th class="num">pKi</th>' +
           '<th>유형</th><th class="num col-sec">MW</th><th class="col-sec">비고</th>' +
           '</tr></thead><tbody>');
  for (var i = 0; i < shown; i++) {
    out.push('<tr><td>' + esc(lib[i].n) + '</td><td class="num">' + fx(lib[i].p, 2) +
             '</td><td>' + esc(lib[i].c) + '</td><td class="num col-sec">' +
             fx(lib[i].desc.mw, 1) + '</td><td class="col-sec" style="color:var(--ink-3)">' +
             esc(lib[i].note) + '</td></tr>');
  }
  out.push('</tbody></table></div></div>');
  host.innerHTML = out.join('');

  if (host.querySelectorAll) {
    var btns = host.querySelectorAll('button.preset');
    for (var b = 0; b < btns.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          applyPreset(btn.getAttribute('data-preset'));
        });
      })(btns[b]);
    }
  }
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

  var cv, fv, ho;
  try { cv = PR.crossValidate(); } catch (err) { cv = null; }
  try { fv = PR.validateFunction(); } catch (err) { fv = null; }
  try { ho = PR.validateHoldout(); } catch (err) { ho = null; }
  var out = [];

  out.push('<h5>용도</h5>');
  out.push('<p>화장품·생활화학 원료와 식품 성분의 <b>에스트로겐 수용체 알파(ERα) 결합 ' +
           '가능성</b>을 1차 선별합니다. 세포실험 대상의 우선순위를 정하는 데까지가 ' +
           '이 도구의 역할입니다. 규제 판단이나 안전성 결론의 근거로는 쓸 수 없습니다.</p>');

  out.push('<h5>무엇이 실측이고 무엇이 예측인가</h5>');
  out.push('<p>번들에 들어 있는 실측 자료는 세 가지입니다. ' +
           '<b>① ChEMBL CHEMBL206(사람 ERα)의 결합·기능 실측값</b> — 라이브러리의 pKi가 ' +
           '전부 여기서 왔고, 「=」 관계와 pChEMBL 값이 있는 기록만 씁니다. ' +
           '<b>② Tox21 ERα 리포터 어세이 4종</b> — 작용제 모드 2개(ERα-BLA, BG1), ' +
           '길항제 모드 2개. 조회한 물질이 여기 있으면 그 결과가 모든 예측보다 ' +
           '우선합니다. <b>③ ERα LBD 결정구조 10종</b> — 포켓 좌표와 리간드 포즈가 ' +
           '실제 PDB 좌표이며, 도킹한 것이 아닙니다. 그 밖의 값(pKi 추정, 작용/길항 ' +
           '판정, 접촉 예상)은 전부 계산된 예측입니다.</p>');

  out.push('<h5>방법</h5>');
  out.push('<p>Morgan 지문(radius 2, 2048 bit) Tanimoto 유사도 기반 read-across와 ' +
           'ER 파마코포어 규칙 점수를 최근접 유사도에 따라 가중 결합합니다 ' +
           '(유사도 0.55 이상이면 read-across 78%, 0.35 이상 50%, 그 미만 20%). ' +
           '포켓 점유율은 McGowan 특성부피를 작용제형 결정구조 3종에서 측정한 공동 ' +
           PR.POCKET_VOLUME + ' Å³(1GWR 397 · 1L2I 375 · 1X7R 337의 평균)과 ' +
           '비교해 산출합니다. 같은 측정을 4-하이드록시타목시펜 복합체(3ERT)에 하면 ' +
           '1216 Å³이 나옵니다 — 길항제 형태에서는 공동이 helix-12가 비운 홈과 ' +
           '이어져 더 이상 닫힌 주머니가 아니기 때문이고, 그래서 곁사슬이 밖으로 ' +
           '나가는 물질에는 부피 감점을 적용하지 않습니다.</p>');

  out.push('<h5>파마코포어 — 두 앵커와 그 간격</h5>');
  out.push('<p>에스트라디올은 페놀성 A-ring 하이드록실이 <b>Glu353·Arg394</b>와, ' +
           '17β-하이드록실이 <b>His524</b>와 수소결합합니다. 번들의 작용제형 결정구조 ' +
           '5종에서 Glu353·Arg394 결합은 5종 모두, His524 결합은 4종에서 ' +
           '실제로 측정됩니다. 두 앵커에 동시에 닿는 극성 원자쌍은 결정구조에서 ' +
           '예외 없이 <b>9~13결합</b> 떨어져 있습니다(에스트라디올 10결합/11.0 Å, ' +
           'THC 11/11.9, 제니스테인 11/12.2, 랄록시펜 10/11.7, ' +
           '4-하이드록시타목시펜 13/11.7). 그래서 간격 판정은 결합 수로 셉니다. ' +
           '거리로 재지 않는 이유는 이 도구의 3D 좌표가 그릴 수 있을 만큼만 ' +
           '정확해서입니다 — 디에틸스틸베스트롤은 그 좌표에서 두 페놀이 5.7 Å로 ' +
           '접히는데 1L2I 결정구조에서는 11.9 Å입니다.</p>');

  if (cv) {
    out.push('<h5>성능 ① pKi (leave-one-out, n = ' + cv.n + ')</h5>');
    out.push('<p>MAE <b>' + fx(cv.mae, 2) + '</b> log, RMSE <b>' + fx(cv.rmse, 2) +
             '</b> log. 다만 이 한 숫자는 쓸모가 적습니다 — 오차의 대부분이 ' +
             '<b>모델이 아니라 레퍼런스 값 쪽</b>에서 오기 때문입니다. ' +
             '레퍼런스가 얼마나 측정됐는지로 갈라 보면 이렇습니다.</p>');
    if (cv.solid && cv.thin && cv.solid.mae !== null && cv.thin.mae !== null) {
      out.push('<table><thead><tr><th>레퍼런스 측정 횟수</th><th class="num">종수</th>' +
               '<th class="num">MAE</th></tr></thead><tbody>');
      out.push('<tr><td>3건 이상</td><td class="num">' + cv.solid.n +
               '</td><td class="num">' + fx(cv.solid.mae, 2) + ' log</td></tr>');
      out.push('<tr><td>2건 이하</td><td class="num">' + cv.thin.n +
               '</td><td class="num">' + fx(cv.thin.mae, 2) + ' log</td></tr>');
      out.push('</tbody></table>');
      out.push('<p>나린제닌·에쿠올·레스베라트롤·아피제닌의 기준값은 ' +
               '<b>각각 논문 한 편의 측정값 하나</b>입니다. 그런 숫자에 대한 오차는 ' +
               '모델에 대해서만큼이나 그 숫자에 대해 말하는 것이라, 잘 측정된 ' +
               '레퍼런스에 대한 <b>' + fx(cv.solid.mae, 2) + ' log</b> 쪽이 ' +
               '기대 성능에 가깝습니다. 레퍼런스 표의 「비고」에 n과 퍼짐이 ' +
               '적혀 있으니 개별 값을 믿을지 여기서 판단하세요.</p>');
      out.push('<p>타목시펜은 반대 방향의 예입니다. ChEMBL 중앙값 7.0은 35건에 ' +
               '걸쳐 3.8 log 퍼져 있고 결합값과 기능값이 1.4 log 어긋나는데, ' +
               '이 도구는 4.5로 훨씬 낮게 예측합니다. 타목시펜 자체는 페놀이 없어 ' +
               'A-ring 앵커를 쓰지 못하는 전구체이고 강한 결합은 대사체인 ' +
               '4-하이드록시타목시펜의 몫이므로, 여기서는 <b>모델 쪽이 더 맞을 수 ' +
               '있습니다</b>. 큰 오차를 전부 모델 탓으로 읽지 마세요.</p>');
    }
    var worst = cv.rows.slice().sort(function (a, b) {
      return Math.abs(b.error) - Math.abs(a.error);
    }).slice(0, 5);
    out.push('<table><thead><tr><th>물질</th><th class="num">실측</th>' +
             '<th class="num">예측</th><th class="num">오차</th></tr></thead><tbody>');
    for (var i = 0; i < worst.length; i++) {
      out.push('<tr><td>' + esc(worst[i].n) + '</td><td class="num">' +
               fx(worst[i].observed, 2) + '</td><td class="num">' +
               fx(worst[i].predicted, 2) + '</td><td class="num">' +
               (worst[i].error >= 0 ? '+' : '') + fx(worst[i].error, 2) + '</td></tr>');
    }
    out.push('</tbody></table>');
    out.push('<p>오차가 큰 쪽은 전부 <b>과대평가</b>이고, 모두 페놀 두 개를 가진 ' +
             '약한 결합 물질입니다. 규칙 점수는 「두 앵커에 닿을 수 있는가」만 보고 ' +
             '「얼마나 잘 닿는가」는 보지 않기 때문에, 파마코포어는 맞고 친화도는 ' +
             '낮은 물질을 위로 밀어올립니다. 유사도 0.35 미만에서 이 도구를 ' +
             '「결합 가능성 있음」의 상한선으로 읽어야 하는 이유입니다.</p>');
    out.push('<p><b>이 표의 「예측」은 해당 물질을 레퍼런스에서 제외하고 낸 값입니다.</b> ' +
             '단건 조회에 같은 이름을 넣으면 자기 자신이 유사도 1.00으로 매칭되므로 ' +
             '훨씬 낙관적인 값이 나옵니다. 라이브러리에 있는 물질의 조회 결과는 ' +
             '예측이 아니라 사실상 조회이므로 성능의 근거로 삼지 마세요.</p>');
  }

  if (fv) {
    out.push('<h5>성능 ② 작용제/길항제 판정</h5>');
    out.push('<p>라벨 ' + fv.n + '종 leave-one-out에서 <b>' + fv.correct + '/' + fv.n +
             '</b> 적중(판정한 것 중 ' + fx(100 * fv.accuracy, 0) + '%), ' +
             '판단 보류 ' + fv.abstain + '종.</p>');
    var missed = fv.rows.filter(function (r) { return !r.ok; });
    if (missed.length) {
      out.push('<p>틀린 것: ' + missed.map(function (r) {
        return esc(r.n) + ' (실제 ' + esc(PR.CLASS_LABELS[r.truth] || r.truth) +
               ' → ' + esc(PR.CLASS_LABELS[r.call] || r.call) + ')';
      }).join(', ') + '. 레스베라트롤은 조직에 따라 작용·길항이 갈리는 물질이라 ' +
               '「부분작용제」로 라벨돼 있고, 이 도구는 그 구분을 하지 못합니다.</p>');
    }
    out.push('<p><b>이 수치는 적합도이지 외부 검증이 아닙니다.</b> 아래 곁사슬 규칙과 ' +
             '유사도 문턱값을 바로 이 ' + fv.n + '종으로 정했기 때문입니다.</p>');
    if (ho && ho.n) {
      out.push('<p><b>독립 검증</b>: 손으로 라벨하지 않고 Tox21 실측만 있는 ' + ho.n +
               '종을, 자기 어세이 결과를 가리고 구조만으로 맞혀봅니다. ' +
               '<b>' + ho.hit + '/' + ho.n + ' 적중</b>, 오답 ' + ho.miss +
               '종, 판단 보류 ' + ho.abstain + '종' +
               (ho.rows.filter(function (r) { return !r.ok && r.call !== 'unknown'; })
                  .length
                 ? ' (오답: ' + ho.rows.filter(function (r) {
                     return !r.ok && r.call !== 'unknown'; })
                     .map(function (r) { return esc(r.n); }).slice(0, 5).join(', ') + ')'
                 : '') +
               '. 이 문턱값들은 이 집합을 보고 정한 것이 아니므로, 레퍼런스에 없는 ' +
               '신규 원료에서 기대할 수 있는 성능은 위쪽 95%가 아니라 이 숫자에 ' +
               '가깝습니다.</p>');
    }
  }

  out.push('<h5>작용제와 길항제를 가르는 것 — 곁사슬</h5>');
  out.push('<p>번들의 결정구조 10종을 작용제형 기준구조(1GWR)에 주쇄 Cα로 맞춘 뒤 ' +
           'helix-12(536-544번)의 위치를 재면 두 무리로 완전히 갈립니다: ' +
           '작용제 복합체 5종은 <b>0.9~1.1 Å</b>, 길항제 복합체 5종은 ' +
           '<b>11.1~11.6 Å</b>. 그리고 길항제 쪽 5종의 공통점은 공동 밖 ' +
           'Asp351 통로로 빠져나가는 치환기입니다 — SERM은 아릴에터에 달린 ' +
           '염기성 아민, 풀베스트란트는 9개 탄소의 알킬 사슬.</p>');
  out.push('<p>그래서 이 특징은 <b>투표가 아니라 규칙</b>입니다. 라벨 21종에서 ' +
           '길항제 7종 전부가 가지고 있고 작용제 13종과 부분작용제 1종은 ' +
           '하나도 가지고 있지 않으며, 무엇보다 <b>2D 유사도로는 보이지 않는</b> ' +
           '차이입니다. 풀베스트란트의 최근접 레퍼런스 5종은 에스트라디올과 그 ' +
           '유도체들이라 read-across만 쓰면 작용제로 불립니다. ' +
           '다만 예측 친화도가 pKi 5 미만이면 규칙을 적용하지 않습니다 — ' +
           '아릴에터에 아민이 달린 구조는 의약품에 흔하고, 이 수용체에 ' +
           '친화도가 없는 물질을 「길항제」라고 부르는 것은 아무 말도 하지 않는 ' +
           '것보다 나쁩니다.</p>');

  out.push('<h5>판정 등급 — 언제 단정하는가</h5>');
  out.push('<table><thead><tr><th>등급</th><th>기준</th></tr></thead><tbody>');
  out.push('<tr><td><b>결정구조 확인</b></td><td>이 물질과 ERα LBD의 복합체가 ' +
           '번들에 있음. helix-12 위치를 직접 재서 판정합니다.</td></tr>');
  out.push('<tr><td><b>실측</b></td><td>Tox21에서 한쪽 모드만 활성. 작용제 모드 ' +
           '활성은 작용제로 읽습니다 — 에스트로겐성 선별이 묻는 질문이 그것이고, ' +
           '길항제 모드는 경쟁만 해도(부분작용제 포함) 신호가 나기 때문입니다. ' +
           '유효 어세이가 1개뿐이면 그렇게 밝힙니다.</td></tr>');
  out.push('<tr><td><b>예측</b></td><td>곁사슬 규칙에 해당하거나, 최근접 유사도 ' +
           '<b>' + fx(PR.SIM_CALL, 2) + ' 이상</b>이고 한쪽 근거가 50% 이상.</td></tr>');
  out.push('<tr><td><b>가능성</b></td><td>방향은 한쪽이지만 유사도가 ' +
           fx(PR.SIM_CALL, 2) + ' 미만(' + fx(PR.SIM_POSSIBLE, 2) + ' 이상).</td></tr>');
  out.push('<tr><td><b>판단 불가</b></td><td>유사도 <b>' + fx(PR.SIM_FLOOR, 2) +
           ' 미만</b>이거나 증거가 갈림. 이유를 문장으로 적습니다.</td></tr>');
  out.push('</tbody></table>');

  out.push('<h5>Tox21 결과를 읽는 법</h5>');
  out.push('<p>「세포독성으로 판정 보류」는 <b>길항 활성의 근거가 아닙니다</b> — ' +
           '세포를 죽이는 물질은 길항제 모드에서 신호를 내기 때문입니다. ' +
           '또 AC50이 10 µM을 넘는 단일 웰 활성은 수용체 결합이 아닌 어세이 ' +
           '간섭일 수 있어, 그런 기록은 다른 물질의 판정에 투표하지 못하게 ' +
           '막아 둡니다. 이 문턱을 만든 사례가 아스코르브산입니다: 작용제 웰 ' +
           '2개 중 1개가 48.6 µM에서 활성, 나머지는 보류/비활성이었는데 ' +
           '그대로 「실측 ERα 작용제」로 read-across 풀에 들어가 있었습니다.</p>');

  out.push('<h5>한계 — 이 도구가 못 하는 것</h5>');
  out.push('<ul>');
  out.push('<li><b>입체화학을 구분하지 못합니다.</b> 거울상 이성질체와 ' +
           '시스/트랜스 이성질체가 같은 지문·같은 구조해시를 가집니다. ' +
           '17α와 17β-에스트라디올을 넣어 보면 예측값이 소수점까지 같습니다. ' +
           '고칠 수 없는 한계라, 입체중심이 있는 입력에는 결과 위에 경고를 ' +
           '띄웁니다.</li>');
  out.push('<li><b>ERβ를 보지 않습니다.</b> 라이브러리·어세이·결정구조가 모두 ' +
           'ERα입니다. 제니스테인처럼 ERβ 선택적인 물질의 선택성은 알 수 없습니다.</li>');
  out.push('<li><b>대사를 보지 않습니다.</b> 전구체는 과소평가됩니다 — ' +
           '메톡시클로르 자체는 거의 결합하지 않고 대사체 HPTE가 결합하며, ' +
           '타목시펜도 활성 대사체인 4-하이드록시타목시펜 쪽이 훨씬 강합니다.</li>');
  out.push('<li><b>혼합물·염·고분자를 다루지 못합니다.</b> 단일 구조 하나만 받습니다.</li>');
  out.push('<li><b>농도와 노출을 모릅니다.</b> 결합 가능성은 위험성이 아닙니다.</li>');
  out.push('<li><b>부분작용제를 구분하지 못합니다.</b> 조직선택성(SERM이 어디서 ' +
           '작용제이고 어디서 길항제인지)은 이 모델의 범위 밖입니다.</li>');
  out.push('</ul>');

  out.push('<h5>지방세포 신호 패널 — 무엇을 어디까지 말하는가</h5>');
  out.push('<p>ERα 하나로는 "지방이 늘어나는가"에 답할 수 없습니다. 지방세포 분화의 ' +
           '마스터 조절자는 <b>PPARγ</b>이고, 글루코코르티코이드 수용체(GR)는 ' +
           '모든 3T3-L1 분화 칵테일에 들어가는 다른 한 축입니다. 그래서 같은 ' +
           'read-across를 그 두 수용체에도 돌리고, 가장 직접적인 증거인 ' +
           '<b>지방세포 분화·지질축적 실측치</b>를 옆에 놓습니다.</p>');
  out.push('<table><thead><tr><th>자료</th><th class="num">규모</th><th>성격</th>' +
           '</tr></thead><tbody>');
  out.push('<tr><td>ChEMBL PPARγ (CHEMBL235)</td><td class="num">' +
           (typeof PANEL_PPARG !== 'undefined' ? PANEL_PPARG.rows.length : 0) +
           '종</td><td>실측 pKi, read-across용</td></tr>');
  out.push('<tr><td>ChEMBL GR (CHEMBL2034)</td><td class="num">' +
           (typeof PANEL_GR !== 'undefined' ? PANEL_GR.rows.length : 0) +
           '종</td><td>실측 pKi, read-across용</td></tr>');
  out.push('<tr><td>Tox21 PPARγ / GR 어세이</td><td class="num">' +
           (typeof TOX21_PPARG !== 'undefined'
             ? Object.keys(TOX21_PPARG.calls).length : 0) +
           '종</td><td>작용·길항 모드 실측</td></tr>');
  out.push('<tr><td>지방세포 분화·지질축적 어세이</td><td class="num">' +
           (typeof ADIPO !== 'undefined' ? Object.keys(ADIPO.records).length : 0) +
           '종</td><td>표현형 실측 (3T3-L1 등, ChEMBL)</td></tr>');
  out.push('<tr><td>PPARγ LBD 결정구조</td><td class="num">' +
           (typeof SCENE_PPARG !== 'undefined' ? SCENE_PPARG.poses.length : 0) +
           '종</td><td>Tyr473 수소결합 여부 측정</td></tr>');
  out.push('</tbody></table>');
  out.push('<p>PPARγ 결정구조의 분류는 <b>측정한 그대로</b>입니다: 리간드가 helix-12의 ' +
           'Tyr473과 수소결합하는지 여부. 로지글리타존·파글리타자르 같은 전장작용제는 ' +
           'Ser289·His323·His449·Tyr473 네 자리를 모두 잡고, 부분작용제 MRL-24는 ' +
           'Tyr473을 잡지 않고 β-sheet 쪽에 앉습니다. 다만 공유결합 길항제인 ' +
           'GW9662 계열도 Tyr473에 닿기 때문에, 라벨을 "작용제"가 아니라 ' +
           '"AF-2 결합"이라고 씁니다 — 측정한 것이 그것이기 때문입니다.</p>');
  out.push('<p>이 두 패널에는 ER 쪽과 달리 <b>파마코포어 규칙 층이 없습니다.</b> ' +
           'read-across 숫자 하나뿐이므로 유사도가 0.35 미만이면 수치를 ' +
           '주장하지 않습니다. 또 PPARγ·GR 어세이는 방향당 웰이 하나뿐이라, ' +
           '<b>농도(AC50)가 기록되지 않은 활성 신호는 판정에 쓰지 않습니다</b> — ' +
           '에스트라디올과 비스페놀 A가 두 수용체의 길항제 웰에서 농도 없이 ' +
           '"활성"으로 나오는데, 이는 신호가 떨어지는 것을 보는 어세이에서 ' +
           '세포독성·간섭 물질이 내는 전형적인 모습입니다.</p>');
  out.push('<p><b>이 번들은 지방이 피하로 가는지 내장으로 가는지를 측정하지 ' +
           '않습니다.</b> 수용체 활성과 배양세포 분화까지가 데이터이고, 부위 분포는 ' +
           '임상·동물 문헌에서 온 배경지식으로 결과 화면에 따로 표시됩니다. ' +
           '분화를 켜는 것과 어디에 쌓이는지는 서로 다른 질문이며, 농도·노출·대사가 ' +
           '전부 빠져 있습니다. 체형을 바꿀 목적의 사용 근거로 쓸 수 없습니다.</p>');

  out.push('<h5>이 도구를 공격해 보면 — 알려진 실패와 그 대응</h5>');
  out.push('<p>에스트로겐 수용체 쪽 지식으로 이 엔진을 일부러 깨뜨려 보고, ' +
           '무너진 지점을 고친 기록입니다. 세 가지가 재현 가능한 실패였습니다.</p>');
  out.push('<table><thead><tr><th>공격</th><th class="num">고치기 전</th>' +
           '<th class="num">고친 뒤</th><th>대응</th></tr></thead><tbody>');
  out.push('<tr><td>에스트라디올에서 3-OH만 삭제<br>' +
           '<span class="hint">A-ring 앵커 상실, 실제 친화도는 자리 수로 추락</span></td>' +
           '<td class="num">pKi 7.8</td><td class="num">pKi 4.9</td>' +
           '<td>앵커 불일치 게이트</td></tr>');
  out.push('<tr><td>메스트라놀 (3-메틸에터)<br>' +
           '<span class="hint">탈메틸화돼야 활성인 프로드러그</span></td>' +
           '<td class="num">pKi 8.0</td><td class="num">pKi 5.0</td>' +
           '<td>같음</td></tr>');
  out.push('<tr><td>17α-에스트라디올<br>' +
           '<span class="hint">17β와 ERα 친화도가 자리 수로 다름</span></td>' +
           '<td class="num">17β와 동일</td><td class="num">17β와 동일</td>' +
           '<td>고치지 못함 — 경고를 띄움</td></tr>');
  out.push('</tbody></table>');
  out.push('<p><b>앵커 불일치 게이트</b>가 무엇인지가 핵심입니다. 지문 유사도는 ' +
           '분자의 어느 부분을 수용체가 붙잡는지 모릅니다. 3-OH를 지운 에스트라디올은 ' +
           '에스트라디올과 Tanimoto 0.72로 여전히 가깝고, 그 가까움만 보면 ' +
           'read-across가 규칙 점수를 눌러 버립니다. 그래서 이웃마다 ' +
           '<b>같은 앵커(페놀, 9~13결합 간격)를 쓰는지</b>를 보고, 다르면 그 이웃의 ' +
           '표를 1/5로 깎고 read-across 전체 가중치도 함께 내립니다. ' +
           '이 조치의 비용도 적어 둡니다: 엄선 레퍼런스 21종 ' +
           'leave-one-out MAE가 ' + (cv ? '1.11에서 ' + fx(cv.mae, 2) : '약 0.09 log') +
           '로 조금 나빠집니다. 정상 리간드에서 조금 잃고, 약리단이 깨진 ' +
           '유사체에서 3 log를 얻는 거래입니다.</p>');
  out.push('<p>반대 방향 실패도 있습니다. 에스트라디올과 디에틸스틸베스트롤은 ' +
           '역가가 사실상 같은데(pKi 8.9 / 9.4) Tanimoto는 <b>0.19</b>입니다. ' +
           '즉 이 지표는 ER 리간드 공간에서 가까운 것을 멀다고 말하기도 합니다. ' +
           '유사도가 낮다고 해서 결합하지 않는다는 뜻이 아니라는 것을, ' +
           '「적용영역 밖」 표시를 볼 때 같이 기억하세요.</p>');

  var dc = null;
  try { dc = PR.domainCoverage(erTox21()); } catch (err) { dc = null; }
  if (dc && dc.n) {
    out.push('<h5>ERα 하나만 보는 문제 — ERβ를 함께 띄운 이유</h5>');
  out.push('<p>"에스트로겐 수용체"라고 뭉뚱그리면 두 아형의 차이가 지워집니다. ' +
           'α와 β는 분포하는 조직이 다르고 여러 조직에서 서로 반대로 작용하며, ' +
           '이 도구가 가장 자주 조회하게 될 피토에스트로겐이 바로 그 차이가 ' +
           '큰 집단입니다. 그래서 ChEMBL CHEMBL242(ERβ) ' +
           (typeof PANEL_ERB !== 'undefined' ? PANEL_ERB.rows.length + '종' : '') +
           '을 실어 결과에 α/β 비를 함께 띄웁니다.</p>');
  out.push('<p>다만 이 비는 <b>한 실험실이 둘을 같이 잰 값이 아닙니다.</b> ' +
           '서로 다른 데이터셋에서 각각 집계한 중앙값끼리의 비라서, 10배 미만 ' +
           '차이는 선택성으로 읽지 않습니다. 이 한계가 실제로 보이는 사례도 ' +
           '적어 둡니다: 제니스테인은 문헌에서 ERβ 선택적인 것으로 유명한데, ' +
           '이 두 집계값으로는 ERα 6.8 대 ERβ 6.9로 <b>차이가 나오지 않습니다</b>. ' +
           '큰 차이를 잡는 깃발로만 쓰세요.</p>');

  out.push('<h5>결합값과 기능값을 섞지 않기</h5>');
  out.push('<p>경쟁결합 Ki와 리포터 EC50은 같은 양이 아닙니다. 세포 어세이에는 ' +
           '흡수·대사·신호증폭이 끼어들기 때문입니다. 처음에는 이 둘을 한 중앙값으로 ' +
           '뭉개고 있었는데, ChEMBL ERα에서 두 종류가 모두 있는 322종을 비교해 보면 ' +
           '중앙값 차이가 <b>0.72 log</b>이고 118종은 1 log 이상 벌어집니다. ' +
           '지금은 결합값(Ki·Kd·IC50)과 기능값(EC50)을 따로 집계하고, ' +
           '모델이 맞추는 값은 <b>결합값</b>입니다. 결합값이 없는 물질만 기능값을 ' +
           '쓰고 그 사실을 비고에 적습니다.</p>');

  out.push('<h5>적용영역 — 정작 선별하려는 화학물질에 닿는가</h5>');
    out.push('<p>레퍼런스는 ChEMBL, 즉 의약화학(스테로이드·SERM)입니다. 실제로 ' +
             '선별하려는 것은 비스페놀·알킬페놀·파라벤·농약 쪽이고요. ' +
             '사전에 들어 있으면서 Tox21이 ERα 작용제로 부른 ' + dc.n + '종을 ' +
             '조회해 보면 최근접 유사도가 이렇게 분포합니다.</p>');
    out.push('<table><thead><tr><th>구간</th><th class="num">종수</th><th>의미</th>' +
             '</tr></thead><tbody>');
    var bandRows = [['in', dc.bands.in, '0.55 이상 — read-across 신뢰'],
                    ['edge', dc.bands.edge, '0.35–0.55 — 단정 가능 하한'],
                    ['out', dc.bands.out, '0.15–0.35 — 가능성까지만'],
                    ['floor', dc.bands.floor, '0.15 미만 — 검증된 적 없는 거리']];
    for (var bi = 0; bi < bandRows.length; bi++) {
      out.push('<tr><td>' + esc(bandRows[bi][0]) + '</td><td class="num">' +
               bandRows[bi][1] + '</td><td>' + esc(bandRows[bi][2]) + '</td></tr>');
    }
    out.push('</tbody></table>');
    out.push('<p>단정 기준(0.35) 위에 있는 것은 <b>' +
             fx(100 * dc.asserted, 0) + '%</b>뿐입니다. 나머지는 Tox21 실측이 ' +
             '있으니 답을 주지만, 실측이 없는 신규 원료였다면 이 도구는 ' +
             '「가능성」이나 「판단 불가」라고 답했을 것입니다. ' +
             '산업용 화학물질 선별에서 이 도구의 real-world 성능은 위의 ' +
             'leave-one-out 숫자가 아니라 이 분포가 말해 줍니다.</p>');
  }

  out.push('<h5>부위 지향 — 피하 대 내장을 어떻게 다루는가</h5>');
  out.push('<p>이것이 이 도구에서 <b>데이터가 가장 약한 부분</b>이고, 그래서 결과 ' +
           '화면에서도 측정값과 분리해 「해석 층」으로 표시합니다. 사실관계부터: ' +
           'ChEMBL에서 <b>내장 지방세포 분화 어세이는 0건</b>이고, 사람 피하 ' +
           '전지방세포 어세이 62건은 전부 세포독성·증식 측정이지 분화 측정이 ' +
           '아닙니다. 부위별 표현형 데이터셋이라 할 것이 없습니다.</p>');
  out.push('<p>그래서 부위 판정은 <b>측정한 수용체 결과 × 각 수용체가 저장 부위를 ' +
           '미는 방향</b>으로 조립한 추론입니다. 축은 아래가 전부이고, 틀렸다고 ' +
           '생각되면 그 줄을 짚어 반박할 수 있게 적어 둡니다.</p>');
  out.push('<table><thead><tr><th>축</th><th>판정</th><th>방향</th></tr></thead><tbody>');
  var axisKo = { pparg: 'PPARγ', er: 'ERα', ar: 'AR', gr: 'GR',
                 hsd1: '11β-HSD1', arom: '아로마테이즈' };
  var axisAct = { agonist: '작용제', antagonist: '길항제', inhibitor: '저해' };
  if (typeof PANEL !== 'undefined' && PANEL.DEPOT_AXES) {
    for (var ax = 0; ax < PANEL.DEPOT_AXES.length; ax++) {
      var A = PANEL.DEPOT_AXES[ax];
      if (A.depot === 'none') continue;
      out.push('<tr><td>' + esc(axisKo[A.panel] || A.panel) + '</td><td>' +
               esc(axisAct[A.when] || A.when) + '</td><td' +
               (A.depot === 'sc' ? '' : ' class="warnink"') + '>' +
               (A.depot === 'sc' ? '피하 쪽' : '내장 쪽') + '</td></tr>');
    }
  }
  out.push('</tbody></table>');
  out.push('<p>이 추론에는 안전장치가 셋 있습니다. ' +
           '<b>① 교차반응</b> — Tox21 안드로겐 수용체 리포터는 글루코코르티코이드에도 ' +
           '반응해서 덱사메타손이 2 nM에서 "AR 작용제"로 나옵니다. GR과 AR이 동시에 ' +
           '활성이면 AR 축은 세지 않고, 가장 강한 활성보다 100배 이상 약한 신호도 ' +
           '교차반응으로 보아 뺍니다(에스트라디올의 AR 1.1 µM이 그 경우). ' +
           '<b>② 기질과 저해제</b> — 효소 데이터는 둘을 구분하지 못합니다. ' +
           '테스토스테론은 아로마테이즈 데이터셋에 pKi 6.8로 들어 있지만 저해제가 ' +
           '아니라 기질입니다. 그래서 안드로겐/에스트로겐 작용제로 측정된 물질은 ' +
           '아로마테이즈 read-across를 축으로 쓰지 않고, 직접적인 저해 스크린 결과만 ' +
           '인정합니다. <b>③ 등급</b> — ER 기능 판정이 「가능성」 수준이면 부위 축으로 ' +
           '올리지 않습니다.</p>');
  out.push('<p>마지막으로, 부위 지향이 「피하 쪽」이라고 나와도 그것은 ' +
           '<b>수용체 프로필이 그 방향이라는 뜻이지 피하지방이 늘어난다는 뜻이 ' +
           '아닙니다.</b> 농도·노출 경로·대사·전신 영향이 전부 빠져 있고, 여기서 ' +
           '피하 쪽으로 분류되는 물질의 상당수는 내분비계 교란물질이거나 처방 ' +
           '의약품입니다.</p>');

  out.push('<h5>데이터 출처</h5>');
  out.push('<ul>');
  out.push('<li>ChEMBL CHEMBL206 (사람 ERα) 활성 데이터 — 라이브러리 pKi</li>');
  out.push('<li>Tox21 / PubChem BioAssay AID 743077 · 743079 · 743078 · 743091</li>');
  out.push('<li>PDB 1GWR · 1X7R · 1L2I · 2P15 · 2B1V · 3OS8 · 1XP1 · 1SJ0 · ' +
           '3ERT · 1ERR — ERα 포켓과 리간드 포즈</li>');
  out.push('<li>ChEMBL CHEMBL235 (PPARγ) · CHEMBL2034 (GR) · CHEMBL1871 (AR) · ' +
           'CHEMBL4235 (11β-HSD1) · CHEMBL1978 (아로마테이즈) · ' +
           'CHEMBL242 (ERβ) 활성 데이터</li>');
  out.push('<li>Tox21 / PubChem BioAssay AID 743140 · 743199 (PPARγ), ' +
           '720719 · 720725 (GR)</li>');
  out.push('<li>ChEMBL 지방세포 분화·지질축적 어세이 (3T3-L1, ST-13 등)</li>');
  out.push('<li>PDB 2PRG · 4EMA · 2Q5S · 2Q59 · 3B3K · 5Y2O · 3B0R · 2HFP · ' +
           '1ZEO — PPARγ 포켓과 리간드 포즈</li>');
  out.push('<li>구조식·이름 — ChEMBL 및 PubChem 조회 결과</li>');
  out.push('</ul>');

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
  /* hand the crystal scene to the engine: it keys the poses by structure and
   * compiles their fingerprints once */
  try {
    if (typeof SCENE !== 'undefined' && SCENE) {
      PR.registerScene(SCENE);
      PR.compilePoses();
    }
  } catch (err) { /* the scene is optional */ }

  /* the adipocyte-signalling panel. The five Tox21 screens arrive as one
   * merged table; each panel takes its own column. Libraries are compiled
   * lazily, on the first query that needs them. */
  try {
    if (typeof PANEL !== 'undefined') {
      var toxAll = typeof TOX21 !== 'undefined' ? TOX21 : null;
      var defs = [
        ['pparg', 'PPARγ', 'PPARγ (지방세포 분화 스위치)', 'CHEMBL235',
         typeof PANEL_PPARG !== 'undefined' ? PANEL_PPARG : null,
         ['agonist', 'antagonist'], false,
         typeof SCENE_PPARG !== 'undefined' ? SCENE_PPARG : null],
        ['gr', 'GR', 'GR (글루코코르티코이드 수용체)', 'CHEMBL2034',
         typeof PANEL_GR !== 'undefined' ? PANEL_GR : null,
         ['agonist', 'antagonist'], false, null],
        ['ar', 'AR', 'AR (안드로겐 수용체)', 'CHEMBL1871',
         typeof PANEL_AR !== 'undefined' ? PANEL_AR : null,
         ['agonist', 'antagonist'], false, null],
        ['hsd1', '11β-HSD1', '11β-HSD1 (조직 내 코르티솔 재생 효소)', 'CHEMBL4235',
         typeof PANEL_HSD1 !== 'undefined' ? PANEL_HSD1 : null,
         [], true, null],
        ['arom', 'Aromatase', '아로마테이즈 (안드로겐 → 에스트로겐 전환)', 'CHEMBL1978',
         typeof PANEL_AROM !== 'undefined' ? PANEL_AROM : null,
         ['inhibitor'], true, null],
        ['erb', 'ERβ', 'ERβ (에스트로겐 수용체 베타)', 'CHEMBL242',
         typeof PANEL_ERB !== 'undefined' ? PANEL_ERB : null,
         [], false, null]
      ];
      for (var di = 0; di < defs.length; di++) {
        var d = defs[di];
        PANEL.registerPanel(d[0], {
          label: d[1], ko: d[2], target: d[3], lib: d[4], modes: d[5],
          enzyme: d[6], scene: d[7],
          tox: toxAll ? PANEL.sliceTox(toxAll, d[0]) : null
        });
      }
      if (typeof ADIPO !== 'undefined') PANEL.registerPheno(ADIPO);
      PANEL.compileScenePoses(PANEL.panels.pparg, null);
    }
  } catch (err) { /* the panel is optional */ }

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
  on('libreset', 'click', function () { applyPreset('curated'); });
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
  runSingle('17베타-에스트라디올');
}

if (typeof document !== 'undefined' && document.getElementById) {
  if (document.readyState === 'loading' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

var APP = {
  init: init, runSingle: runSingle, runBatch: runBatch, renderLibrary: renderLibrary,
  applyLibrary: applyLibrary, renderModelCard: renderModelCard, selectTab: selectTab,
  svgStructure: svgStructure, svgPocket: svgPocket, svg3D: svg3D,
  mount3D: mount3D, mountScene: mountScene, svgScene: svgScene, batchTsv: batchTsv,
  parseBatchText: parseBatchText, SAMPLE_BATCH: SAMPLE_BATCH
};

