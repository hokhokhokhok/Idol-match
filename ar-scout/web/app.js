/* app.js — UI rendering for the three tabs. Talks to the engine through the
 * AR / LY / PR namespaces, which build.py produces from the module exports. */
'use strict';

var AR = require('./armodel.js');
var LY = require('./layout.js');
var LY3 = require('./layout3d.js');
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

/* The browser cannot dock. Everything drawn here was computed beforehand by
 * local/build_pocket_scene.py: the pocket is real 2AM9 coordinates and each
 * pose is a real smina result. A compound with no stored pose gets the
 * pocket and the co-crystal ligand, and is told so - nothing is invented to
 * fill the gap. */
function sceneData() {
  return (typeof SCENE !== 'undefined' && SCENE && SCENE.pocket) ? SCENE : null;
}

function structureKey(mol) {
  var d = AR.computeDescriptors(mol);
  var fp = AR.morganFingerprint(mol, 2);
  var bits = '';
  for (var i = 0; i < fp.length; i++) if (fp[i]) bits += i + ',';
  return d.formula + '|' + bits;
}

var viewScene = { rx: -0.3, ry: 0.5, dragging: false, lastX: 0, lastY: 0,
                  pose: null, ghost: false };

/* Labelling every contact buries the ligand under twenty residue names.
 * Only the ones that carry the argument get a label: hydrogen-bond partners
 * and the four anchor residues the rule engine reasons about. */
var SCENE_ANCHORS = { GLN711: 1, ARG752: 1, ASN705: 1, THR877: 1 };

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

  var pose = null;
  try { pose = scene.poses[structureKey(mol)] || null; } catch (err) { pose = null; }
  viewScene.pose = pose;
  viewScene.rx = -0.3; viewScene.ry = 0.5;
  paintScene();

  var note = $('scene-note');
  if (note) {
    if (pose && pose.placed) {
      note.innerHTML = '<b>' + esc(pose.n) + '</b> · smina affinity ' +
        '<b>' + fx(pose.aff, 2) + ' kcal/mol</b> · 접촉 잔기 ' + (pose.c || []).length +
        '개' + ((pose.hb || []).length ? ', 수소결합 후보 ' + pose.hb.length + '개' : '') +
        '<br>진한 파랑 = 수소결합 후보, 파랑 = 접촉, 회색 = 나머지 포켓 잔기. ' +
        '라벨은 수소결합 후보와 앵커 잔기만 표시합니다.';
    } else if (pose) {
      note.innerHTML = '<b>' + esc(pose.n) + '</b>은(는) 이 수용체 형태에 <b>배치되지 ' +
        '않았습니다</b> (affinity ' + fx(pose.aff, 2) + ', 반발항이 지배). ' +
        '포즈가 없으므로 결정 구조의 DHT만 점선으로 표시합니다. ' +
        '2AM9는 작용제 형태라 부피 큰 길항제가 들어가지 않습니다.';
    } else {
      note.innerHTML = '이 물질의 도킹 포즈는 번들에 들어 있지 않습니다. ' +
        '포켓과 결정 구조의 DHT(점선)만 표시합니다. ' +
        '포즈가 필요하면 <code>local/ar_dock.py --smiles …</code> 로 직접 계산하세요.';
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
      ghost.textContent = viewScene.ghost ? '결정 DHT 숨기기' : '결정 DHT 겹쳐보기';
      paintScene();
    });
  }
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
  if (fc.evidence && fc.evidence.length) {
    out.push('<div><span class="k">판정 근거</span><span class="v" ' +
             'style="font-weight:500;font-size:13px;color:var(--ink-2)">' +
             esc(fc.evidence.join(' · ')) + '</span></div>');
  }
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

  if (sceneData()) {
    out.push('<h4 class="sect">결합 장면 (2AM9 포켓)</h4>');
    out.push('<div class="figwrap viewer3d" id="scene3d"></div>');
    out.push('<p class="hint" id="scene-note" style="margin:10px 0 0"></p>');
    out.push('<div class="btnbar" style="margin-top:10px">' +
             '<button class="alt" id="scene-ghost" type="button">결정 DHT 겹쳐보기</button></div>');
  }

  out.push('<h4 class="sect">3D 구조</h4>');
  out.push('<div class="figwrap viewer3d" id="struct3d"></div>');
  out.push('<p class="hint" style="margin:10px 0 0">드래그해서 돌려보세요. ' +
           '거리기하로 만든 <b>개략적인 형태</b>이며 입체화학(키랄리티)은 ' +
           '반영하지 않습니다 — 거울상 이성질체가 같게 나옵니다. ' +
           '정확한 3D가 필요하면 <code>local/ar_dock.py</code>를 쓰세요.</p>');

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
      out.push('<tr><td>' + esc(fn.n) + '</td><td' +
               (fn.c === 'antagonist' ? ' class="warnink"' : '') + '>' +
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

  /* If this compound has a pre-computed pose, hand the docking evidence to
   * the engine so the functional call can use it. */
  var dock = null;
  try {
    var scene = sceneData();
    if (scene) {
      var probe = AR.parseSmiles(smiles);
      var stored = scene.poses[structureKey(probe)];
      if (stored && stored.placed) {
        dock = { placed: true, affinity: stored.aff,
                 ile899: (stored.c || []).indexOf('ILE899') >= 0 };
      }
    }
  } catch (err) { dock = null; }

  var result;
  try {
    result = PR.predict(smiles, { dock: dock });
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
    ['curated', '엄선 28종', '문헌 경쟁결합 실측값. 스테로이드·비스테로이드·화장품 원료가 고르게 들어 있습니다.'],
    ['extended', '확장 ' + (ext ? ext.length : 0) + '종',
     'ChEMBL AR 데이터를 병합한 것. 비스테로이드 의약화학 계열이 두터워집니다.']
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
  out.push('<p>세 가지 증거를 합칩니다. 어떤 것이 쓰였는지는 결과의 ' +
           '「판정 근거」 줄에 표시됩니다.</p>');
  out.push('<ul>');
  out.push('<li><b>레퍼런스 read-across</b> — AR에서의 기능이 잘 확립된 38종' +
           '(작용제 16, 길항제 17, 부분 5)과의 유사도³ 가중 투표입니다. ' +
           '이 목록은 pKi 라이브러리와 <b>별개</b>입니다. ChEMBL 확장 라이브러리의 ' +
           '분류는 「강한 결합」처럼 세기를 나타낼 뿐 작용/길항과 무관하므로, ' +
           '그런 라벨은 기능 판정에 쓰지 않습니다.</li>');
  out.push('<li><b>도킹 포즈의 helix-12 접촉</b> — 미리 계산된 2AM9 포즈가 있을 때, ' +
           'helix-12 말단의 Ile899에 닿는지를 봅니다. Met895는 작용제 형태에서 ' +
           '포켓 벽이라 대부분의 리간드가 닿지만, Ile899는 AF-2 표면 쪽으로 뻗는 ' +
           '리간드만 닿습니다.</li>');
  out.push('<li><b>스테로이드 부피 치환기</b> — 스테로이드계 길항제는 2D 유사도상 ' +
           '안드로겐 바로 옆에 있어 read-across만으로는 작용제로 불립니다. ' +
           '안드로겐이 작은 17번 치환기를 갖는 자리에 스피로 고리·에스터·나이트릴 같은 ' +
           '부피 큰 기가 있으면 길항 쪽으로 투표합니다.</li>');
  out.push('</ul>');
  out.push('<p><b>성능 (leave-one-out, n = 38):</b> read-across만 27/38(71%), ' +
           '여기에 도킹 신호를 더하면 30/38(79%), 부피 모티프까지 더하면 ' +
           '<b>32/38(84%)</b>입니다. 가중치는 손으로 정했지만 넓은 범위에서 ' +
           '결과가 같아 특정 값에 기대고 있지는 않습니다.</p>');
  out.push('<p>여전히 틀리는 것들: 클라스코테론과 디에노게스트(길항인데 작용으로), ' +
           '프로게스테론과 MPA(부분작용제 경계), 프로클로라즈(유사 레퍼런스 없음). ' +
           '최근접 유사도가 낮으면 「판단 불가」로 나오며, 이때는 수치보다 ' +
           '그 표시를 믿으세요.</p>');
  out.push('<p>「구조 판정」은 이와 별개로 포켓 접촉 규칙만으로 유추한 것입니다. ' +
           '둘이 어긋나면 <b>기능 추정 쪽을 믿으세요</b> — 실측 분류에 근거하기 ' +
           '때문입니다. 단, 둘 다 전사활성 측정이 아니라는 점은 같습니다.</p>');

  out.push('<h5>3D 구조를 어디까지 믿을 수 있나</h5>');
  out.push('<p>거리기하 완화로 만든 <b>형태 스케치</b>입니다. 힘장(force field)도, ' +
           '비틀림각 탐색도 없습니다. 결합길이는 공유결합 반지름 합에서 평균 0.03~0.08 Å, ' +
           '결합각은 혼성 이상값에서 평균 4~14°, 방향족 고리는 0.01 Å 이내로 평평하며, ' +
           '원자끼리 겹치지 않습니다(최근접 비결합 2.6 Å 이상).</p>');
  out.push('<p><b>입체화학은 반영하지 않습니다.</b> 파서가 키랄리티 표기를 읽고 버리므로 ' +
           '거울상 이성질체가 같게 나오고, 스테로이드의 고리 융합 방향도 임의로 정해집니다. ' +
           '따라서 이 3D는 “대략 이런 덩어리구나”를 보는 용도이지 포즈가 아닙니다. ' +
           '결합 양상이 중요한 판단에는 <code>local/ar_dock.py</code>의 ' +
           'RDKit ETKDGv3 + MMFF 좌표와 smina 도킹 포즈를 쓰세요.</p>');

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
  out.push('<li><b>레퍼런스를 바꾸면 답도 바뀝니다.</b> 확장 라이브러리는 ' +
           'ChEMBL AR 데이터라 비스테로이드 의약화학 계열에 치우쳐 있습니다. ' +
           '기본 28종을 덮어쓰지 않고 합쳐서 쓰는 이유입니다.</li>');
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
  svgStructure: svgStructure, svgPocket: svgPocket, svg3D: svg3D,
  mount3D: mount3D, mountScene: mountScene, svgScene: svgScene, batchTsv: batchTsv,
  parseBatchText: parseBatchText, SAMPLE_BATCH: SAMPLE_BATCH
};
