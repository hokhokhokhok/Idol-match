/* app.js — UI rendering for the three tabs. Talks to the engine through the
 * AR / LY / PR namespaces, which build.py produces from the module exports. */
'use strict';

var measuredRegistered = false;

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
  Met895: [448, 40], Ile899: [534, 82],
  Trp741: [72, 162], Phe876: [488, 158]
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
  var fcLabel = PR.tierPhrase(fc.tier, fc.label);
  var fcClass = (fc.label === 'antagonist' || fc.label === 'unknown') ? ' warnink' : '';

  var tox = result.functionCall.tox21;
  if (tox) {
    var assays = (typeof TOX21 !== 'undefined' && TOX21 && TOX21.assays) ? TOX21.assays : [];
    out.push('<div class="measured">');
    out.push('<div class="mhead">실측 — Tox21 AR 리포터 어세이</div>');
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
    out.push('</tbody></table>');
    out.push('<p class="hint" style="margin:8px 0 0">이 물질은 실제로 시험됐습니다. ' +
             '아래 예측값보다 이 결과를 우선하세요.' +
             (tox.cytotoxic ? ' 「세포독성으로 판정 보류」는 길항 활성의 근거가 아닙니다 — ' +
              '세포를 죽이는 물질은 길항제 모드에서 신호를 내기 때문입니다.' : '') +
             '</p>');
    out.push('</div>');
  }

  /* The measured potency axis. Shown above the prediction because an AC50
     from a cell assay outranks an affinity estimated by similarity. */
  var pot = null;
  try { pot = potencyFor(result.mol); } catch (err) { pot = null; }
  if (pot && (pot.ap != null || pot.gp != null)) {
    out.push('<div class="measured">');
    out.push('<div class="mhead">실측 — Tox21 역가와 효력</div>');
    out.push('<table style="margin-top:6px"><tbody>');
    if (pot.ap != null) {
      out.push('<tr><td style="width:52%">길항제 모드 AC50' +
               (pot.line ? ' <span class="hint">' + esc(pot.line) + '</span>' : '') +
               '</td><td style="font-weight:700">' + pot.ap + ' µM</td></tr>');
    }
    if (pot.ae != null) {
      out.push('<tr><td>길항제 모드 효력 <span class="hint">음수 = 신호 감소</span>' +
               '</td><td style="font-weight:700">' + pot.ae + ' %</td></tr>');
    }
    if (pot.gp != null) {
      out.push('<tr><td>작용제 모드 AC50</td><td style="font-weight:700">' +
               pot.gp + ' µM' + (pot.ge != null ? ' <span class="hint">효력 ' +
               pot.ge + '%</span>' : '') + '</td></tr>');
    }
    if (pot.margin != null) {
      out.push('<tr><td>세포생존 AC50 대비 여유</td><td' +
               (pot.cytoSuspect ? ' class="warnink"' : '') +
               ' style="font-weight:700">&times;' + pot.margin +
               ' <span class="hint">(생존 ' + pot.vp + ' µM)</span></td></tr>');
    }
    out.push('</tbody></table>');
    out.push('<p class="hint" style="margin:8px 0 0">' +
             '<b>이것이 이 도구에서 유일하게 효력에 가까운 값입니다.</b> ' +
             '아래 pKi는 결합 세기 추정이고, 위 AC50은 세포에서 실제로 측정된 ' +
             '농도입니다. 다만 <b>효력 부호를 작용/길항 판정에 쓰지는 않습니다</b> — ' +
             '라벨된 20종에서 「효력 음수면 길항」은 14/20에 그칩니다. 알려진 ' +
             '작용제 8종 중 5종도 이 웰에서 신호를 떨어뜨리기 때문입니다' +
             '(기준 작용제와 경쟁하면 그렇게 됩니다).</p>');
    if (pot.cytoSuspect) {
      out.push('<p class="hint" style="margin:6px 0 0;color:var(--red)">' +
               esc(pot.notes[pot.notes.length - 1]) + '</p>');
    }
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
             : (fc.tier === 'blocked' || fc.tier === 'curated'
               ? ''    /* a read-across weight means nothing for either */
               : '<span class="sub">근거 ' + fx(fc.support, 2) + '</span>')) +
           '</span></div>');
  var tierInfo = PR.TIER_LABELS[fc.tier];
  if (tierInfo) {
    var tierNote = tierInfo.note;
    if (fc.tier === 'measured' && fc.label === 'inactive') {
      tierNote = 'Tox21 세 어세이 모두 비활성';
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
  out.push('<div><span class="k">적용영역</span><span class="v">' +
           '<span class="tag ' + esc(result.domain) + '">' + esc(domainWord) + '</span>' +
           '<span class="sub">유사도 ' + fx(result.nearestSim, 2) + '</span></span></div>');
  out.push('</div></div>');

  out.push('<h4 class="sect">포켓 접촉도</h4>');
  out.push('<div class="figwrap">' + svgPocket(p, result.occupancy) + '</div>');
  out.push('<p class="hint" style="margin:10px 0 0">' +
           (p.measured
             ? '<b>2AM9 도킹 포즈에서 실제로 측정된 접촉</b>입니다. '
             : '도킹 포즈가 없어 <b>구조 규칙으로 추정</b>한 접촉입니다. ') +
           '파랑 = 접촉 · 빨강 = helix-12 접촉 · 회색 = 미접촉<br>' +
           '분자 부피 ' + fx(result.volume, 0) + ' &Aring;&sup3; / 공동 ' + PR.POCKET_VOLUME + ' &Aring;&sup3;</p>');

  out.push('<h4 class="sect">접촉 잔기</h4>');
  out.push('<table><thead><tr><th>잔기</th><th>역할</th><th>상태</th></tr></thead><tbody>');
  for (var i = 0; i < p.residues.length; i++) {
    var r = p.residues[i];
    /* "H12 충돌" used to sit in this column, which was a lie about what is
       measured: nothing here computes steric overlap. Both states come from
       the same 4.5 A cutoff, and the red one adds only that the residue is
       on helix-12 in a pose that also reached Ile899. */
    var state = r.clash ? '접촉 (helix-12)'
                        : (r.contact ? (p.measured ? '접촉' : '접촉 예상') : '미접촉');
    out.push('<tr' + (r.clash ? ' class="clash"' : '') + '><td>' + esc(r.id) + '</td><td>' +
             esc(r.role) + '</td><td>' + esc(state) + '</td></tr>');
  }
  out.push('</tbody></table>');
  out.push('<p class="hint" style="margin:8px 0 0;color:var(--red)">' +
           '<b>이 접촉들은 같은 좌표에서 나옵니다.</b> 그 좌표가 내놓는 도킹 ' +
           'affinity와 실측 pKi의 상관은 이 저장소 22종 패널에서 ' +
           '<b>r² = 0.03</b>으로 측정됐습니다. 점수가 사실상 무상관이면 포즈 ' +
           '기하도 그만큼만 믿을 수 있습니다 — 접촉 목록·점유율·수소결합 후보가 ' +
           '전부 그 포즈에서 나온 값입니다. 개별 접촉을 사실로 읽지 마시고 ' +
           '경향으로 보세요.</p>');
  out.push('<p class="hint" style="margin:8px 0 0">' +
           '두 상태의 차이는 <b>세기가 아니라 위치</b>입니다. 접촉 판정은 양쪽 다 ' +
           '중원자 간 <b>4.5 Å 이내</b>로 같고, 빨강은 그 잔기가 ' +
           '<b>helix-12에 있고</b>(Thr877·Met895·Ile899) 이 포즈가 ' +
           '<b>Ile899까지 닿았다</b>는 뜻입니다. 입체 충돌을 계산한 값이 ' +
           '아닙니다 — 겹침이나 거리 위반을 재는 단계는 없습니다. ' +
           'Trp741·Phe876도 내성 변이 잔기지만 helix-12 소속이 아니라서 ' +
           '파랑입니다. 같은 물질이 Thr877에 똑같이 닿아도 포즈가 Ile899에 ' +
           '못 닿으면 Thr877은 파랑으로 바뀝니다 — Thr877 자체에 대해 ' +
           '새로 측정된 것은 없기 때문입니다.</p>');

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
  var provWarn = [];
  for (var j = 0; j < result.neighbours.length; j++) {
    var nb = result.neighbours[j];
    var pv = provFor(nb.n);
    if (pv && (pv.grade === 'nonhuman' || pv.grade === 'untraceable')) provWarn.push(nb.n);
    out.push('<tr><td>' + esc(nb.n) + provChip(nb.n) + '</td><td>' + esc(nb.c) +
             '</td><td class="num">' + fx(nb.p, 2) + '</td><td class="num">' +
             fx(nb.sim, 3) + '</td></tr>');
    var note = PR.REFERENCE_NOTES[nb.n];
    if (note) {
      out.push('<tr><td colspan="4" class="hint" style="color:var(--red)">' +
               esc(nb.n + ' — ' + note) + '</td></tr>');
    }
  }
  out.push('</tbody></table>');
  out.push('<p class="hint" style="margin-top:8px">이 레퍼런스들의 pKi 출처를 ' +
           'ChEMBL에서 되짚어 종과 어세이를 붙였습니다. 28종 전체로 보면 AR 활성 ' +
           '273건이 사람, 44건이 랫, 11건이 마우스이고, <b>7종은 사람 AR 기록이 ' +
           '아예 없으며 4종은 추적되지 않습니다</b>(DHT 포함). 숫자가 틀렸다는 ' +
           '뜻은 아니지만, 교차검증 MAE 0.5는 <b>랫 전립선 세포질 결합과 사람 LBD ' +
           '어세이를 같은 열에 섞은 채</b> 계산된 값입니다.' +
           (provWarn.length ? ' 위 이웃 중 <b>' + esc(provWarn.join(', ')) +
            '</b>이 그런 경우입니다.' : '') + '</p>');
  out.push('</div>');
  return out.join('');
}

/* ------------------------------------------------------------- tabs */

var TABS = ['single', 'batch', 'affinity', 'rank', 'design', 'library'];

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

/* -------------------------------------------------- affinity ranking */

var affRows = null;

function visibleAffRows() {
  if (!affRows) return [];
  var hideOut = $('affin') && $('affin').checked;
  var onlyAnta = $('affanta') && $('affanta').checked;
  var onlyAgo = $('affago') && $('affago').checked;
  return affRows.filter(function (r) {
    if (hideOut && r.domain === 'out') return false;
    if (onlyAnta && r.label !== 'antagonist') return false;
    if (onlyAgo && r.label !== 'agonist') return false;
    return true;
  });
}

function renderAffinity() {
  var host = $('aff-out');
  if (!host || !affRows) return;
  var rows = visibleAffRows();
  var lab = {};
  for (var i = 0; i < affRows.length; i++) lab[affRows[i].label] = (lab[affRows[i].label] || 0) + 1;

  var out = [];
  out.push('<div class="panel">');
  out.push('<h3>사전 ' + affRows.length + '종 · 표시 ' + rows.length + '종</h3>');
  out.push('<dl class="tiles">');
  out.push(tile('길항제', String(lab.antagonist || 0)));
  out.push(tile('작용제', String(lab.agonist || 0)));
  out.push(tile('부분 작용제', String(lab.partial || 0)));
  out.push(tile('비활성·불명', String((lab.inactive || 0) + (lab.unknown || 0))));
  out.push('</dl>');
  out.push('<p class="hint" style="color:var(--red)"><b>친화도와 효력은 다릅니다.</b> ' +
           '이 표는 「얼마나 세게 붙느냐」만 세웁니다. pKi 8 이상 구간에 작용제와 ' +
           '길항제가 함께 있는 것이 그 증거입니다 — 세기만으로는 방향을 알 수 ' +
           '없고, 방향을 알아도 <b>효력(helix-12를 실제로 밀어내는가)</b>은 또 ' +
           '다른 문제입니다. 이 도구에 그 축은 없습니다.</p>');
  out.push('<p class="hint"><b>적용영역 태그를 먼저 보세요.</b> 가까운 레퍼런스가 ' +
           '없는 물질의 pKi는 외삽이고, pKi로 정렬하면 그 숫자가 어디에 떨어지든 ' +
           '그 자리에 앉습니다. 기본값은 <code>out</code>을 숨긴 상태입니다. ' +
           '오차범위는 물질마다 다르며 표에 함께 표시됩니다.</p>');
  out.push('</div>');

  out.push('<div class="panel"><h3>순위</h3>');
  out.push('<table><thead><tr><th>#</th><th>물질</th>' +
           '<th class="num">예측 pKi</th><th class="num">Ki</th>' +
           '<th>적용영역</th><th>기능</th><th>구조 판정</th></tr></thead><tbody>');
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    var fnCls = r.label === 'antagonist' ? ' class="warnink"' : '';
    out.push('<tr><td class="rankno">' + r.rank + '</td>' +
             '<td><b>' + esc(r.ko) + '</b><br><span class="hint">' + esc(r.en) + '</span></td>' +
             '<td class="num">' + fx(r.pKi, 2) +
             '<span class="hint"> ±' + fx(r.ci, 1) + '</span></td>' +
             '<td class="num">' + fx(r.kiNM, r.kiNM < 10 ? 2 : 0) + ' nM</td>' +
             '<td><span class="tag ' + esc(r.domain) + '">' +
             esc({ 'in': '내', edge: '경계', out: '밖' }[r.domain]) + '</span></td>' +
             '<td' + fnCls + '>' + esc(PR.tierPhrase(r.tier, r.label)) + '</td>' +
             '<td class="hint">' + esc(r.pocketVerdict || '') + '</td></tr>');
  }
  out.push('</tbody></table></div>');
  host.innerHTML = out.join('');
}

function runAffinity() {
  showError('aff-err', '');
  var host = $('aff-out');
  if (host) host.innerHTML = '<div class="panel"><p class="hint">계산 중…</p></div>';
  ensureMeasuredPool();
  setTimeout(function () {
    try { affRows = PR.rankAffinity(evidenceFor); renderAffinity(); }
    catch (err) {
      if (host) host.innerHTML = '';
      showError('aff-err', '계산 실패: ' + err.message);
    }
  }, 20);
}

function affinityTsv() {
  var rows = visibleAffRows();
  var lines = ['순위\t한글명\t영문명\t예측pKi\t오차\tKi_nM\t적용영역\t기능\t증거등급\t구조판정\tSMILES'];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    lines.push([r.rank, r.ko, r.en, r.pKi.toFixed(2), r.ci.toFixed(2),
                r.kiNM.toFixed(2), r.domain,
                PR.CLASS_LABELS[r.label] || r.label,
                PR.TIER_LABELS[r.tier] ? PR.TIER_LABELS[r.tier].word : r.tier,
                r.pocketVerdict, r.smiles].join('\t'));
  }
  return lines.join('\n');
}

/* ---------------------------------------------------- analogue design */

var designData = null;

/* The model's own noise. Leave-one-out over the reference set gives
 * MAE 0.5 and RMSE 1.4 log units, and each prediction carries its own
 * confidence interval. A delta smaller than that is not a weak signal, it
 * is no signal, and the design table says so per row instead of letting a
 * +0.06 sit at the top looking like an improvement. */
var DESIGN_NOISE = 0.7;

function renderDesign() {
  var host = $('design-out');
  if (!host || !designData) return;
  var d = designData;
  var showCtl = !$('designctl') || $('designctl').checked;
  var rows = d.scored.filter(function (a) { return showCtl || !a.control; });
  var unscored = d.unscored.filter(function (a) { return showCtl || !a.control; });

  var all = d.scored.concat(d.unscored);
  var inNoise = 0, flipped = 0;
  for (var i = 0; i < all.length; i++) {
    if (Math.abs(all[i].dPKi) <= DESIGN_NOISE) inNoise++;
    if (all[i].label !== d.parent.label) flipped++;
  }
  var pharm = all.filter(function (a) { return !a.control; });
  var ctl = all.filter(function (a) { return a.control; });
  var best = function (xs) {
    var m = -99;
    for (var k = 0; k < xs.length; k++) if (xs[k].dPKi > m) m = xs[k].dPKi;
    return m;
  };
  var pBest = best(pharm), cBest = best(ctl);

  var out = [];
  out.push('<div class="panel">');
  out.push('<h3>' + esc(d.parentName || d.parent.smiles) + '</h3>');
  out.push('<dl class="tiles">');
  out.push(tile('모화합물 pKi', fx(d.parent.pKi, 2)));
  out.push(tile('치환 자리', String(d.sites)));
  out.push(tile('검증 통과', String(all.length)));
  out.push(tile('화학식 불일치로 폐기', String(d.rejected)));
  out.push('</dl>');

  /* the honest reading, with this run's own numbers in it */
  out.push('<h4 class="sect">이 표를 읽는 법</h4>');
  out.push('<p class="hint"><b>이 탭은 최적화기가 아니라 가설 생성기입니다.</b> ' +
           '점수를 매기는 모델과 순위를 만드는 모델이 같습니다. 같은 모델을 상대로 ' +
           '점수를 올리면 <b>모델을 잘 속이는 분자</b>가 나오지, 잘 듣는 분자가 ' +
           '나오지 않습니다. 그래서 숫자가 올랐다는 것은 근거가 아니라 ' +
           '<b>실험해 볼 후보라는 뜻</b>입니다.</p>');
  out.push('<p class="hint">모델의 교차검증 오차는 MAE 0.5 · RMSE 1.4 log이고 ' +
           '이 모화합물의 예측 오차범위는 ±' + fx(d.parent.ci || 0.7, 1) + '입니다. ' +
           '<b>이번 ' + all.length + '종 중 ' + inNoise + '종(' +
           Math.round(100 * inNoise / Math.max(1, all.length)) +
           '%)은 ΔpKi가 ±' + DESIGN_NOISE + ' 안에 들어 「구분 불가」입니다.</b> ' +
           '기능 판정이 모화합물과 달라진 것은 ' + flipped + '종입니다.</p>');
  out.push('<p class="hint"><b>대조군을 일부러 섞어 넣었습니다.</b> 메틸·하이드록실·' +
           '불소·염소는 AR 길항 약리단이 아닙니다. 이것들이 CF3·나이트릴·나이트로·' +
           '설포닐과 구분되지 않으면 순위는 SAR이 아니라 잡음을 읽고 있는 것입니다. ' +
           '이번 모화합물에서는 약리단 최고 Δ ' + (pBest >= 0 ? '+' : '') + fx(pBest, 2) +
           ' 대 대조군 최고 Δ ' + (cBest >= 0 ? '+' : '') + fx(cBest, 2) + ' 로 ' +
           (pBest > cBest
             ? '<b>약리단이 앞섭니다</b> — 그래도 차이가 오차범위 안이면 의미는 없습니다.'
             : '<b>대조군이 앞섭니다. 이 분자에서는 순위를 믿지 마세요.</b>') +
           '</p>');
  out.push('<p class="hint">치환 자리는 <b>6원 방향족 고리의 수소가 남은 탄소</b>로 ' +
           '한정했습니다. 스테로이드 골격의 17번 치환처럼 길항성을 실제로 좌우하는 ' +
           '변형은 SMILES 문자열 편집으로 안전하게 만들 수 없어 넣지 않았습니다. ' +
           '생성물은 모두 다시 파싱해 <b>화학식이 규칙이 약속한 만큼 정확히</b> ' +
           '바뀌었는지, 고리 수가 그대로인지 확인한 것만 남깁니다.</p>');
  out.push('</div>');

  function table(list, title, note) {
    if (!list.length) return;
    out.push('<div class="panel"><h3>' + esc(title) + '</h3>');
    if (note) out.push('<p class="hint">' + note + '</p>');
    out.push('<table><thead><tr><th>#</th><th>치환기</th>' +
             '<th class="num">ΔpKi</th><th class="num">pKi</th>' +
             '<th>기능</th><th>적용영역</th><th class="num">모체 유사도</th>' +
             '<th>SMILES</th></tr></thead><tbody>');
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var noise = Math.abs(a.dPKi) <= DESIGN_NOISE;
      out.push('<tr' + (a.control ? ' class="flagged"' : '') + '>' +
               '<td class="rankno">' + (a.rank || '-') + '</td>' +
               '<td>' + esc(a.ruleName) +
               (a.control ? ' <span class="hint">대조군</span>' : '') +
               '<br><span class="hint">' + esc(a.why) + '</span></td>' +
               '<td class="num"' + (noise ? ' style="opacity:.5"' : '') + '>' +
               (a.dPKi >= 0 ? '+' : '') + fx(a.dPKi, 2) +
               (noise ? '<br><span class="hint">구분 불가</span>' : '') + '</td>' +
               '<td class="num">' + fx(a.pKi, 2) + '</td>' +
               '<td' + (a.label === 'antagonist' ? ' class="warnink"' : '') + '>' +
               esc(PR.tierPhrase(a.tier, a.label)) + '</td>' +
               '<td><span class="tag ' + esc(a.domain) + '">' +
               esc({ 'in': '내', edge: '경계', out: '밖' }[a.domain]) + '</span></td>' +
               '<td class="num">' + fx(a.parentSim, 2) + '</td>' +
               '<td class="smi">' + esc(a.smiles) + '</td></tr>');
    }
    out.push('</tbody></table></div>');
  }

  table(rows, '적용영역 안 유도체 ' + rows.length + '종',
        '길항 판정이 강한 순, 같으면 pKi 순입니다. 회색 Δ는 모델 오차범위 안이라 ' +
        '순위에 의미를 두지 마세요.');
  table(unscored, '적용영역 밖 ' + unscored.length + '종 — 순위에서 제외',
        '가까운 레퍼런스가 없어 pKi가 외삽입니다. 더 나쁜 후보라는 뜻이 아니라 ' +
        '<b>채점되지 않은 후보</b>라는 뜻이라, 큰 숫자가 상위에 앉지 않도록 ' +
        '따로 뺐습니다.');
  host.innerHTML = out.join('');
}

function runDesign(rawQuery) {
  showError('design-err', '');
  var input = $('designq');
  var query = rawQuery !== undefined ? rawQuery : (input ? input.value : '');
  query = String(query || '').trim();
  var host = $('design-out');
  if (!host) return;
  if (!query) {
    host.innerHTML = '';
    showError('design-err', '모화합물 이름 또는 SMILES를 입력하세요.');
    return;
  }
  ensureMeasuredPool();
  var hit = PR.lookupName(query);
  var smiles = hit ? hit.s : query;
  host.innerHTML = '<div class="panel"><p class="hint">유도체를 만드는 중…</p></div>';
  setTimeout(function () {
    try {
      var d = PR.designAnalogues(smiles, evidenceFor);
      d.parentName = hit ? hit.ko + ' / ' + hit.en : smiles;
      try {
        d.parent.ci = PR.predict(smiles, evidenceFor(smiles, AR.parseSmiles(smiles))).ci;
      } catch (e2) { d.parent.ci = 0.7; }
      if (!d.scored.length && !d.unscored.length) {
        host.innerHTML = '';
        showError('design-err',
          '치환할 수 있는 방향족 자리가 없습니다. 이 탭은 6원 방향족 고리에 ' +
          '수소가 남은 탄소만 건드립니다 — 스테로이드처럼 방향족 고리가 없는 ' +
          '골격은 지금 다루지 못합니다.');
        return;
      }
      designData = d;
      renderDesign();
    } catch (err) {
      host.innerHTML = '';
      var tips = PR.suggestNames(query, 5);
      showError('design-err', '생성 실패: ' + err.message +
        (tips.length ? ' — 혹시 이 중 하나인가요? ' +
          tips.map(function (t) { return t.ko + ' (' + t.en + ')'; }).join(', ') : ''));
    }
  }, 20);
}

function designTsv() {
  if (!designData) return '';
  var all = designData.scored.concat(designData.unscored);
  var lines = ['순위\t치환기\t대조군\tΔpKi\t예측pKi\t기능\t증거등급\t적용영역\t모체유사도\tSMILES'];
  for (var i = 0; i < all.length; i++) {
    var a = all[i];
    lines.push([a.rank || '', a.ruleName, a.control ? 'Y' : '',
                a.dPKi.toFixed(2), a.pKi.toFixed(2),
                PR.CLASS_LABELS[a.label] || a.label,
                PR.TIER_LABELS[a.tier] ? PR.TIER_LABELS[a.tier].word : a.tier,
                a.domain, a.parentSim.toFixed(3), a.smiles].join('\t'));
  }
  return lines.join('\n');
}

/* ------------------------------------------------- antagonist ranking */

var rankRows = null;
var rankSort = { key: 'rank', dir: 1 };

/* The evidence a compound gets is assembled the same way the single-compound
 * view does it, so the ranking cannot drift from what a lookup shows. */
function evidenceFor(smiles, mol) {
  var out = { dock: null, tox21: null, potencyFor: potencyFor };
  try {
    var scene = sceneData();
    if (scene) {
      var stored = scene.poses[structureKey(mol)];
      if (stored && stored.placed) {
        out.dock = { placed: true, affinity: stored.aff,
                     ile899: (stored.c || []).indexOf('ILE899') >= 0,
                     contacts: stored.c || [], hbonds: stored.hb || [] };
      }
    }
  } catch (err) { /* no pose */ }
  try {
    if (typeof TOX21 !== 'undefined' && TOX21 && TOX21.calls) {
      out.tox21 = TOX21.calls[AR.structureIdOf(mol)] || null;
    }
  } catch (err) { /* no table */ }
  return out;
}

function ensureMeasuredPool() {
  try {
    if (typeof TOX21 !== 'undefined' && TOX21 && !measuredRegistered) {
      PR.registerMeasured(TOX21);
      measuredRegistered = true;
    }
  } catch (err) { /* optional */ }
}

function visibleRankRows() {
  if (!rankRows) return [];
  var showAll = $('rankall') && $('rankall').checked;
  var onlyNew = $('ranknew') && $('ranknew').checked;
  var rows = rankRows.filter(function (r) {
    if (!showAll && r.band === 'low') return false;
    if (onlyNew && r.curated) return false;
    return true;
  });
  var k = rankSort.key, d = rankSort.dir;
  if (k !== 'rank') {
    rows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (typeof x === 'string') return d * (x < y ? -1 : (x > y ? 1 : 0));
      return d * ((x || 0) - (y || 0));
    });
  } else if (d < 0) {
    rows.reverse();
  }
  return rows;
}

function renderRank() {
  var host = $('rank-out');
  if (!host || !rankRows) return;
  var rows = visibleRankRows();
  var counts = { high: 0, medium: 0, low: 0 };
  for (var c = 0; c < rankRows.length; c++) counts[rankRows[c].band]++;

  var out = [];
  out.push('<div class="panel">');
  out.push('<h3>길항제 후보 ' + rankRows.length + '종 / 사전 ' +
           PR.INGREDIENTS.length + '종</h3>');
  /* The list is ordered by predicted pKi inside each band, and pKi is
     affinity. Antagonist potency is not affinity: bicalutamide binds AR
     roughly two orders of magnitude more weakly than DHT and is still the
     clinical antagonist, because what decides antagonism is what helix-12
     does after binding - which nothing in this tool measures. Said here,
     at the top, because a numbered list invites exactly that misreading. */
  out.push('<p class="hint" style="color:var(--red)"><b>이것은 효력 순위가 ' +
           '아닙니다.</b> 같은 구간 안의 정렬 기준은 예측 pKi, 즉 <b>결합 세기</b>' +
           '입니다. 길항 효력은 결합 세기가 아닙니다 — 비칼루타마이드는 DHT보다 ' +
           'AR 친화도가 두 자릿수 배 낮지만 임상 길항제입니다. 길항성을 결정하는 ' +
           '것은 결합 후 helix-12가 어떻게 움직이느냐이고, <b>이 도구는 그것을 ' +
           '재지 않습니다.</b> 여기 「길항제」로 찍힌 것의 실제 의미는 ' +
           '<i>결합하고, 길항하는 것들과 닮았다</i>입니다.</p>');
  out.push('<p class="hint" style="color:var(--red)"><b>노출 축도 없습니다.</b> ' +
           'pKi 5는 Ki 10 µM입니다. 화장품 사용 농도에서 그 농도가 표적 세포의 ' +
           'AR에 도달하는지는 투과도·단백결합·대사가 정하는 전혀 다른 문제이고, ' +
           '여기에는 들어 있지 않습니다. 위해성 순위로 읽지 마세요.</p>');
  var curatedN = 0;
  for (var cu = 0; cu < rankRows.length; cu++) if (rankRows[cu].curated) curatedN++;
  out.push('<dl class="tiles">');
  out.push(tile('우선 확인', String(counts.high)));
  out.push(tile('참고', String(counts.medium)));
  out.push(tile('낮음', String(counts.low)));
  out.push(tile('문헌 등재', String(curatedN)));
  out.push('</dl>');
  out.push('<p class="hint"><b>문헌 등재 ' + curatedN + '종은 이 도구의 입력이지 ' +
           '발견이 아닙니다.</b> 기능 레퍼런스에 실린 물질이라 자기 자신과 ' +
           '유사도 1.00으로 맞으므로, 「예측」이라고 적으면 순환 논리가 됩니다. ' +
           '위의 「도구가 찾은 것만」을 켜면 나머지 ' +
           (rankRows.length - curatedN) + '종만 남습니다.</p>');

  out.push('<h4 class="sect">정렬 기준</h4>');
  out.push('<p class="hint">먼저 <b>구간</b>으로 나누고, 같은 구간 안에서는 ' +
           '<b>예측 pKi가 높은 순</b>입니다. 증거의 질은 구간에 이미 반영돼 ' +
           '있으므로, 구간 안에서까지 실측을 예측보다 앞세우면 실측 pKi 5.0이 ' +
           '예측 pKi 9.0 위로 올라가 버립니다. 증거 등급은 별도 열로 봅니다.</p>');
  out.push('<table><thead><tr><th>구간</th><th>조건</th></tr></thead><tbody>');
  var bandKeys = ['high', 'medium', 'low'];
  // (the evidence-tier legend follows the band legend, below)
  for (var b = 0; b < bandKeys.length; b++) {
    var bd = PR.RANK_BANDS[bandKeys[b]];
    out.push('<tr><td><span class="band ' + bandKeys[b] + '">' + esc(bd.word) +
             '</span></td><td>' + esc(bd.note) + '</td></tr>');
  }
  out.push('</tbody></table>');
  out.push('<h4 class="sect">증거 등급</h4>');
  out.push('<table><thead><tr><th>등급</th><th>뜻</th></tr></thead><tbody>');
  var tierKeys = ['curated', 'measured', 'predicted', 'possible'];
  for (var tk = 0; tk < tierKeys.length; tk++) {
    out.push('<tr><td><b>' + esc(PR.TIER_LABELS[tierKeys[tk]].word) + '</b></td><td>' +
             esc(PR.TIER_LABELS[tierKeys[tk]].note) + '</td></tr>');
  }
  out.push('</tbody></table>');
  out.push('<p class="hint" style="margin-top:10px">' +
           '<b>강등 규칙 두 가지는 이 목록의 첫 초안을 보고 만들었습니다.</b> ' +
           'DHEA가 1위로 나왔습니다 — Tox21은 길항이라 하지만 구조는 작용제 ' +
           '(부피 큰 치환기 없는 3-케토 스테로이드)이고, DHEA는 안드로겐 ' +
           '전구체입니다. 길항제 모드는 기준 작용제와 함께 넣어 신호 감소를 ' +
           '재므로 <b>경쟁만 해도 잡힙니다</b>(알려진 부분작용제 5종이 5종 모두 ' +
           '그렇게 나옵니다). 그래서 실측과 구조가 엇갈리면 어세이만 믿고 ' +
           '올리지 않고 모순을 표시합니다. 포화지방산들도 들어와 있었는데, ' +
           '포켓 판정이 「결합 가능성 낮음」이었습니다 — 결합하지 않는 것은 ' +
           '길항제일 수 없습니다. 둘 다 지우지 않고 아래로 내린 뒤 이유를 ' +
           '적습니다.</p>');
  out.push('</div>');

  out.push('<div class="panel">');
  out.push('<h3>순위</h3>');
  function th(key, label, num) {
    var arrow = rankSort.key === key ? (rankSort.dir > 0 ? '▲' : '▼') : '⇅';
    return '<th class="sortable' + (num ? ' num' : '') + '" data-sort="' + key +
           '">' + esc(label) + '<span class="arrow">' + arrow + '</span></th>';
  }
  out.push('<table><thead><tr>');
  out.push(th('rank', '#'));
  out.push('<th>물질</th>');
  out.push('<th>구간</th>');
  out.push(th('tier', '증거'));
  out.push(th('pKi', '예측 pKi', true));
  out.push(th('nearest', '최근접', true));
  out.push('<th>비고</th>');
  out.push('</tr></thead><tbody>');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var note = r.flags.length
      ? r.flags.map(function (f) { return f.split(' — ')[0]; }).join(' · ')
      : '';
    out.push('<tr' + (r.flags.length ? ' class="flagged"' : '') + '>' +
             '<td class="rankno">' + r.rank + '</td>' +
             '<td><b>' + esc(r.ko) + '</b><br><span class="hint">' + esc(r.en) +
             '</span></td>' +
             '<td><span class="band ' + r.band + '">' +
             esc(PR.RANK_BANDS[r.band].word) + '</span></td>' +
             '<td>' + esc(PR.TIER_LABELS[r.tier].word) + '</td>' +
             '<td class="num">' + fx(r.pKi, 2) +
             (r.domain === 'out' ? ' <span class="hint">영역밖</span>' : '') + '</td>' +
             '<td class="num">' + fx(r.nearest, 2) + '</td>' +
             '<td class="hint">' + esc(note) + '</td></tr>');
  }
  out.push('</tbody></table>');
  if (!$('rankall') || !$('rankall').checked) {
    out.push('<p class="hint" style="margin-top:10px">「낮음」 ' + counts.low +
             '종은 숨겨져 있습니다 — 포켓에 결합할 구조가 아니거나 pKi 4.0 ' +
             '미만입니다. 위 체크박스로 펼칠 수 있습니다.</p>');
  }
  out.push('</div>');

  /* the flagged entries in full, because a truncated caveat is not a caveat */
  var flagged = rankRows.filter(function (x) { return x.flags.length; });
  if (flagged.length) {
    out.push('<div class="panel"><h3>주의가 붙은 ' + flagged.length + '종</h3>');
    out.push('<ul class="why">');
    for (var g = 0; g < flagged.length; g++) {
      for (var h = 0; h < flagged[g].flags.length; h++) {
        out.push('<li><span class="d">#' + flagged[g].rank + '</span><span><b>' +
                 esc(flagged[g].ko) + '</b> — ' + esc(flagged[g].flags[h]) +
                 '</span></li>');
      }
    }
    out.push('</ul></div>');
  }
  host.innerHTML = out.join('');

  var heads = host.querySelectorAll('th.sortable');
  for (var q = 0; q < heads.length; q++) {
    heads[q].onclick = (function (key) {
      return function () {
        if (rankSort.key === key) rankSort.dir = -rankSort.dir;
        else { rankSort.key = key; rankSort.dir = key === 'rank' ? 1 : -1; }
        renderRank();
      };
    })(heads[q].getAttribute('data-sort'));
  }
}

function runRank() {
  showError('rank-err', '');
  var host = $('rank-out');
  if (host) host.innerHTML = '<div class="panel"><p class="hint">' +
    PR.INGREDIENTS.length + '종을 모두 계산하는 중입니다…</p></div>';
  ensureMeasuredPool();
  setTimeout(function () {
    try {
      rankRows = PR.rankAntagonists(evidenceFor);
      renderRank();
    } catch (err) {
      if (host) host.innerHTML = '';
      showError('rank-err', '순위 계산 실패: ' + err.message);
    }
  }, 20);
}

function rankTsv() {
  var rows = visibleRankRows();
  var lines = ['순위\t한글명\t영문명\t구간\t증거등급\t예측pKi\t적용영역\t최근접유사도\t포켓판정\t주의\tSMILES'];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    lines.push([r.rank, r.ko, r.en, PR.RANK_BANDS[r.band].word,
                PR.TIER_LABELS[r.tier].word, r.pKi.toFixed(2), r.domain,
                r.nearest.toFixed(3), r.pocketVerdict,
                r.flags.join(' / '), r.smiles].join('\t'));
  }
  return lines.join('\n');
}

function potencyFor(mol) {
  try {
    if (typeof POTENCY !== 'undefined' && POTENCY && POTENCY.data) {
      return PR.readPotency(POTENCY.data[AR.structureIdOf(mol)] || null);
    }
  } catch (err) { /* not bundled */ }
  return null;
}

/* Provenance for a reference pKi, if the bundle carries the table. */
function provFor(name) {
  try {
    if (typeof PROV !== 'undefined' && PROV && PROV.refs) return PROV.refs[name] || null;
  } catch (err) { /* not bundled */ }
  return null;
}

function provChip(name) {
  var pv = provFor(name);
  if (!pv) return '';
  var g = PR.PROV_GRADE_KO[pv.grade];
  if (!g) return '';
  var warn = (pv.grade === 'nonhuman' || pv.grade === 'untraceable');
  return ' <span class="hint"' + (warn ? ' style="color:var(--red)"' : '') + '>' +
         esc(g.word) + (pv.n_ar ? ' · AR활성 ' + pv.n_ar + '건' : '') + '</span>';
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
                 ile899: (stored.c || []).indexOf('ILE899') >= 0,
                 contacts: stored.c || [], hbonds: stored.hb || [] };
      }
    }
  } catch (err) { dock = null; }

  /* The Tox21-decisive compounds join the read-across pool. Registered
   * here, once, because predict.js is bundled before the table is. */
  try {
    if (typeof TOX21 !== 'undefined' && TOX21 && !measuredRegistered) {
      PR.registerMeasured(TOX21);
      measuredRegistered = true;
    }
  } catch (err) { /* the pool is optional */ }

  var tox21 = null;
  try {
    if (typeof TOX21 !== 'undefined' && TOX21 && TOX21.calls) {
      tox21 = TOX21.calls[AR.structureIdOf(AR.parseSmiles(smiles))] || null;
    }
  } catch (err) { tox21 = null; }

  var result;
  try {
    result = PR.predict(smiles, { dock: dock, tox21: tox21 });
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
        fnLabel: PR.tierPhrase(r.functionCall.tier, r.functionCall.label),
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

function copyTsv() { copyText(batchRows.length ? batchTsv() : '', 'batch-err'); }

function copyText(text, errHost) {
  if (!text) { showError(errHost, '복사할 결과가 없습니다.'); return; }
  var done = function () { showError(errHost, ''); };
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
      showError(errHost, '클립보드 복사에 실패했습니다. 결과 표를 직접 선택해 복사해 주세요.');
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
  /* Head-to-head, measured: the same 28 observed pKis predicted with the
     compound itself removed from whichever library is active. The extended
     set wins on both axes, and the coverage gap is the bigger one - out of
     domain falls from 129 of 206 to 101. Put the numbers on the cards so
     the choice is made on evidence rather than on which one is default. */
  var rows = [
    ['curated', '엄선 28종',
     '문헌 경쟁결합 실측값, 손으로 고른 것. 같은 28종 자기제외 예측에서 ' +
     'MAE 0.84 · RMSE 1.16, 사전 206종 중 적용영역 밖이 129종입니다.'],
    ['extended', '확장 ' + (ext ? ext.length : 0) + '종',
     'ChEMBL AR 데이터 병합. 같은 시험에서 MAE 0.77 · RMSE 1.09로 더 낫고, ' +
     '적용영역 밖이 101종으로 줄어듭니다. 다만 2,349종의 종·어세이 출처는 ' +
     '확인하지 않았습니다 — 28종에서 확인했던 랫·마우스 혼재가 여기에도 ' +
     '그대로 있을 것입니다.']
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
  out.push('<p>증거를 합쳐 판정하며, 어떤 것이 쓰였는지는 결과의 ' +
           '「판정 근거」 줄에 표시됩니다. <b>Tox21 실측이 있으면 그것이 우선</b>이고, ' +
           '없을 때만 아래 세 가지를 조합합니다.</p>');
  out.push('<h5>판정 등급 — 언제 「길항제」라고 쓰는가</h5>');
  out.push('<p>등급은 증거의 종류가 아니라 <b>얼마나 단정할 수 있는지</b>를 ' +
           '나타내며, 기준은 아래가 전부입니다. 단정하지 못할 때는 왜 못하는지 ' +
           '결과 화면에 문장으로 적습니다.</p>');
  out.push('<table><thead><tr><th>등급</th><th>표기</th><th>기준</th></tr></thead><tbody>');
  out.push('<tr><td><b>실측</b></td><td>길항제 (실측)</td>' +
           '<td>Tox21에서 <b>길항제 모드 어세이</b>만 활성. 어세이 1개만 유효하면 ' +
           '그렇게 밝힙니다.</td></tr>');
  out.push('<tr><td><b>예측</b></td><td>길항제 (예측)</td>' +
           '<td>최근접 레퍼런스 유사도 <b>0.35 이상</b>이고 한쪽 근거가 ' +
           '<b>50% 이상</b>.</td></tr>');
  out.push('<tr><td><b>가능성</b></td><td>길항제 가능성</td>' +
           '<td>근거 방향은 길항 쪽이지만 유사도가 0.35 미만(0.20 이상). ' +
           '또는 유사도가 낮아도 스테로이드 부피 치환기·Ile899 접촉 같은 ' +
           '구조 신호가 있을 때.</td></tr>');
  out.push('<tr><td><b>판단 불가</b></td><td>판단 불가</td>' +
           '<td>유사도가 <b>0.15 미만</b>이거나 증거가 갈림. 이유를 명시합니다.</td></tr>');
  out.push('</tbody></table>');
  out.push('<p>0.15라는 바닥에는 근거가 있습니다. 라벨 38종을 유사도 구간별로 ' +
           'leave-one-out 해보면 0.5 이상에서 87%, 0.35–0.5에서 64%, ' +
           '0.15–0.35에서 100%(n=4)인데, <b>0.15 미만 구간에는 표본이 아예 ' +
           '없습니다</b> — 라벨된 물질은 모두 서로 가까워서요. 그 아래는 성능이 ' +
           '낮은 구간이 아니라 <b>한 번도 검증된 적 없는 구간</b>입니다. ' +
           '게다가 레퍼런스 38종 중 17종이 길항제라서, 모든 것에서 먼 분자는 ' +
           '구조가 아니라 <b>레퍼런스 구성 편향</b> 때문에 길항제 만장일치를 ' +
           '받습니다. 피세틴이 정확히 그랬습니다 — 이웃 5종 전부 길항제, ' +
           '유사도는 모두 0.09대.</p>');
  out.push('<p><b>그래서 폴리페놀 공간에 실측 이웃을 넣었습니다.</b> ' +
           'Tox21에서 한쪽 모드만 활성으로 확정된 물질 중 손으로 라벨하지 않은 ' +
           '16종(제니스테인·아피제닌·레스베라트롤·부틸파라벤 등)을 read-across ' +
           '이웃으로 씁니다. 라벨이 측정값이고, 큐레이션된 38종(약물·농약)이 ' +
           '한마디도 못 하는 공간을 메우기 때문입니다. 넣어도 큐레이션 38종 ' +
           '성적은 32/38 그대로이므로 <b>정확도가 아니라 적용 범위를 산 것</b>입니다. ' +
           '어세이 1개만 유효한 라벨(예: 다이드제인, 코드 313)은 이웃 투표에서 ' +
           '제외합니다 — 피세틴의 최강 이웃이던 유사도 0.46짜리였습니다.</p>');
  out.push('<p><b>Tox21은 어세이의 모드를 구분해 읽습니다.</b> 코드 세 자리는 ' +
           'AID 743053(작용제 모드), 743054·743063(길항제 모드) 순서입니다. ' +
           '길항제 모드 웰에서 나온 「작용제 활성」은 기준 작용제와 함께 넣은 ' +
           '플레이트에서 신호가 올라갔다는 뜻이고, 그 어세이가 답하는 질문이 ' +
           '아닙니다. 모드를 무시하고 합치면 포르모노네틴처럼 <b>작용제 모드에서 ' +
           '비활성인데도 「작용제」 라벨</b>이 붙고, 그게 유사도 0.39에서 ' +
           '피세틴까지 끌고 갑니다. 제니스테인·레스베라트롤은 반대로 진짜 길항 ' +
           '활성이 off-mode 플래그에 상쇄돼 사라졌습니다.</p>');
  out.push('<ul>');
  out.push('<li><b>Tox21 리포터 어세이 실측</b> — 약 7,800종이 작용제·길항제 모드로 ' +
           '실제 시험된 결과입니다. 사전 205종 중 151종이 여기 들어 있고 98종은 ' +
           '확정 판정이 납니다. 다만 <b>길항제 모드는 「기준 작용제의 신호를 줄였다」를 ' +
           '재는 것</b>이라, 수용체를 두고 경쟁하는 부분작용제도 길항제로 읽힙니다 — ' +
           '실제로 알려진 부분작용제 5종이 5종 모두 그렇게 나옵니다. 그래서 ' +
           '<b>한쪽 모드에서만 활성일 때만 실측 판정으로 쓰고</b>, 양쪽 다 뜨면 ' +
           '혼합 활성으로 보아 아래 구조 증거에 맡깁니다. ' +
           '「세포독성으로 판정 보류」도 길항 활성의 근거로 쓰지 않습니다.</li>');
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
  out.push('<h5>효력 축 — 있는 만큼만</h5>');
  out.push('<p>이 도구의 가장 큰 구멍은 <b>길항성을 재지 않으면서 길항제 순위를 ' +
           '매긴다</b>는 것이었습니다. pKi는 결합 세기이고, 길항 효력은 결합 후 ' +
           'helix-12가 어떻게 움직이느냐입니다. 비칼루타마이드가 DHT보다 친화도가 ' +
           '두 자릿수 배 낮으면서 임상 길항제인 이유가 그것입니다.</p>');
  out.push('<p>메울 수 있는 만큼 메웠습니다. 같은 Tox21 어세이가 활성 여부만이 ' +
           '아니라 <b>AC50(µM)과 효력(%)</b>, 그리고 같은 웰의 <b>세포생존 ' +
           'AC50</b>을 보고합니다. 사전 206종 중 85종이 여기 해당하고, 단건 ' +
           '화면에서 pKi <b>위에</b> 띄웁니다 — 세포에서 측정된 농도가 유사도로 ' +
           '추정한 친화도보다 앞서기 때문입니다.</p>');
  out.push('<p><b>효력 부호는 판정에 쓰지 않습니다.</b> 라벨 20종에서 ' +
           '「효력이 음수면 길항」은 <b>14/20</b>입니다. 알려진 작용제 8종 중 ' +
           '5종도 이 웰에서 신호를 떨어뜨리기 때문입니다 — 기준 작용제와 ' +
           '경쟁하면 그렇게 됩니다. 숫자가 붙었다고 분류기가 되지는 않습니다.</p>');
  out.push('<p><b>세포생존 여유배수는 씁니다.</b> 예전의 이진 「세포독성」 ' +
           '플래그는 표시만 하고 아무 일도 하지 않았습니다(비칼루타마이드도 ' +
           '세 웰 중 하나가 세포독성이라 강등에 쓰면 교과서적 길항제가 묻힙니다). ' +
           '이제 비율이 있습니다 — 비칼루타마이드 ×2.5, <b>프로클로라즈 ×0.16</b>. ' +
           '프로클로라즈의 길항 신호는 세포가 죽는 농도의 1/6에서 나옵니다. ' +
           '그리고 <b>작용제 모드가 훨씬 센 경우</b>도 잡습니다 — 알파트라디올은 ' +
           '작용제 AC50 1.08 µM(효력 +96.5%) 대 길항 44.9 µM으로 40배 차이인데 ' +
           '길항제 순위의 「우선 확인」에 있었습니다.</p>');
  out.push('<p><b>부분작용제는 이 데이터로도 갈리지 않습니다.</b> 두 모드의 ' +
           'AC50 쌍으로 부분작용제를 정의할 수 있을까 재봤는데, 작용제의 작용모드 ' +
           '효력이 67~190%, 부분작용제가 41~167%로 완전히 겹칩니다. 부분작용제 ' +
           '5종에서 규칙을 만들면 과적합이라 <b>만들지 않았습니다</b>. ' +
           '남은 교차검증 오답 6건 중 4건이 프로게스틴인 것은 그대로입니다.</p>');
  out.push('<h5>철회한 주장 — 내성 변이체 Δ</h5>');
  out.push('<p>한때 이 도구는 야생형(2AM9)과 T877A(2OZ7)·W741L(1Z95)에 같은 ' +
           '물질을 도킹한 차이를 단건 화면에 보여주며 <i>"길항제 −2.86 대 ' +
           '작용제 +0.71, 3.6 kcal/mol 분리"</i>라고 적었습니다. ' +
           '<b>그 주장은 철회했고 패널도 제거했습니다.</b> 두 가지가 따로따로 ' +
           '무너뜨렸습니다.</p>');
  out.push('<p><b>첫째, 서로 다른 세 결정을 비교한 값이었습니다.</b> ' +
           '이 도구는 「어느 구조를 고르느냐가 리간드보다 순위를 더 많이 ' +
           '좌우한다」와 「1Z95는 자기 공결정 리간드를 22종 중 1위로 올린다」를 ' +
           '이미 측정해 두고 있었습니다. 1Z95의 공결정 리간드가 바로 ' +
           'R-비칼루타마이드인데, 비칼루타마이드의 ΔW741L = −3.5를 대표 증거로 ' +
           '썼습니다. 자기도킹 편향입니다. 같은 2AM9 결정에서 곁사슬만 ' +
           'in-silico로 잘라내 다시 재니(나머지 249개 잔기 바이트 단위 동일) ' +
           '분리폭이 <b>3.14 → 0.55 kcal/mol</b>로, W741 쪽은 ' +
           '<b>4.45 → 0.52(W741A) / 0.28(W741L)</b>로 주저앉았습니다. ' +
           '<b>가장 결정적인 것은 비칼루타마이드입니다.</b> AR에서 가장 유명한 ' +
           '내성 사실이 「W741L이 비칼루타마이드를 작용제로 바꾼다」인데, ' +
           '그 ΔW741L이 <b>−3.5에서 +0.4로 부호가 뒤집힙니다</b>. −3.5는 ' +
           'W741L의 효과가 아니라 비칼루타마이드를 자기 공결정 구조에 ' +
           '되도킹한 값이었습니다. 스피로놀락톤 −3.10→−0.50, ' +
           '테스토스테론 +2.40→+0.20.</p>');
  out.push('<p><b>둘째, 남은 0.5마저 기능이 아니라 골격입니다.</b> ' +
           '같은 값을 스테로이드 여부로 가르면 분리폭이 <b>1.09</b>로 ' +
           '작용/길항(0.58)보다 큽니다. 그리고 스테로이드 <b>길항제</b>(+0.83)가 ' +
           '스테로이드 <b>작용제</b>(+0.52) 쪽에 붙고 비스테로이드 길항제' +
           '(−0.55)와 반대입니다. Δ가 길항성을 잰다면 사이프로테론과 ' +
           '스피로놀락톤이 음수여야 합니다. 포켓이 넓어지면 꽉 맞던 단단한 ' +
           '스테로이드가 접촉을 조금 잃을 뿐입니다 — 모양을 재고 있었습니다.</p>');
  out.push('<p>측정값은 저장소에 남겨 두되 해석은 거뒀습니다. ' +
           '여기 적어 두는 이유는, 이 주장이 한동안 화면에 있었기 때문입니다.</p>');
  out.push('<p><b>성능 (leave-one-out, n = 38):</b> read-across만 27/38(71%), ' +
           '여기에 도킹 신호를 더하면 30/38(79%), 부피 모티프까지 더하면 ' +
           '<b>32/38(84%)</b>입니다. 가중치는 손으로 정했지만 넓은 범위에서 ' +
           '결과가 같아 특정 값에 기대고 있지는 않습니다. Tox21을 더해도 이 38종에서는 ' +
           '32/38 그대로인데, 전부 이미 유사 레퍼런스가 충분한 약물이기 때문입니다. ' +
           'Tox21의 값어치는 정확도가 아니라 <b>예측을 실측으로 바꾸는 범위</b>에 ' +
           '있습니다 — 사전의 48%가 실측 판정으로 바뀌고, pKi 적용영역 밖이던 128종 중 ' +
           '67종(52%)이 그래도 기능만은 확정됩니다.</p>');
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
  out.push('<li><b>helix-12 접촉은 접촉일 뿐 충돌이 아닙니다.</b> 접촉 표의 빨간 ' +
           '칸은 중원자 간 4.5 Å 이내라는 같은 기준에, 그 잔기가 helix-12에 ' +
           '있고 포즈가 Ile899까지 닿았다는 조건을 더한 것입니다. ' +
           '<b>입체 충돌(겹침·거리 위반)을 계산하는 단계는 이 도구에 없습니다.</b> ' +
           '그리고 2AM9는 작용제 결합 형태라, 실제로 helix-12를 밀어내는 ' +
           '길항제는 이 구조에 제대로 들어가지도 못합니다(엔잘루타미드 배치 실패).</li>');
  out.push('<li><b>포즈가 없으면 작용/길항은 규칙 기반 추정입니다.</b> ' +
           'helix-12 접촉 여부를 구조 모티프로 유추한 것이며, ' +
           '실제 전사활성 측정이 아닙니다.</li>');
  out.push('<li><b>레퍼런스가 적습니다.</b> 28종뿐이라 유사 레퍼런스가 없는 골격 ' +
           '(예: RU-59063)은 과소평가됩니다. 적용영역 태그가 <code>out</code>이면 ' +
           '수치보다 태그를 먼저 보세요.</li>');
  out.push('<li><b>레퍼런스를 바꾸면 답도 바뀝니다.</b> 확장 2,349종은 ' +
           '같은 28종 자기제외 시험에서 MAE 0.84→0.77로 낫고 적용영역 밖을 ' +
           '129→101종으로 줄입니다. 기본값을 조용히 바꾸지 않은 이유는 ' +
           '이미 보신 모든 숫자가 함께 바뀌기 때문이고, 확장 쪽은 종·어세이 ' +
           '출처를 확인하지 않았기 때문입니다. 「레퍼런스」 탭에서 ' +
           '한 번에 바꿀 수 있습니다.</li>');
  out.push('<li><b>pKi 레퍼런스의 출처를 되짚었습니다.</b> 28종 뒤의 ChEMBL ' +
           'AR 활성은 사람 273건, 랫 44건, 마우스 11건입니다. ' +
           '<b>7종은 사람 AR 기록이 없고 4종은 추적되지 않습니다</b> — ' +
           'DHT가 그중 하나입니다. 빈클로졸린은 프로안티안드로겐이라 ' +
           'AR에 붙는 것은 대사체 M1·M2이지 빈클로졸린이 아닙니다. ' +
           '교차검증 MAE는 <b>랫 전립선 세포질 결합과 사람 LBD 어세이를 ' +
           '같은 열에 섞은 채</b> 계산된 값입니다.</li>');
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

  on('rankrun', 'click', function () { runRank(); });
  on('rankcopy', 'click', function () {
    copyText(rankRows ? rankTsv() : '', 'rank-err');
  });
  on('rankall', 'change', function () { if (rankRows) renderRank(); });
  on('ranknew', 'change', function () { if (rankRows) renderRank(); });

  on('affrun', 'click', function () { runAffinity(); });
  on('affcopy', 'click', function () { copyText(affRows ? affinityTsv() : '', 'aff-err'); });
  on('affin', 'change', function () { if (affRows) renderAffinity(); });
  on('affanta', 'change', function () {
    if ($('affanta').checked && $('affago')) $('affago').checked = false;
    if (affRows) renderAffinity();
  });
  on('affago', 'change', function () {
    if ($('affago').checked && $('affanta')) $('affanta').checked = false;
    if (affRows) renderAffinity();
  });

  on('designrun', 'click', function () { runDesign(); });
  on('designq', 'keydown', function (ev) { if (ev.key === 'Enter') runDesign(); });
  on('designcopy', 'click', function () {
    copyText(designData ? designTsv() : '', 'design-err');
  });
  on('designctl', 'change', function () { if (designData) renderDesign(); });
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
