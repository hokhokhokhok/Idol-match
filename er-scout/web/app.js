/* app.js — UI rendering for the three tabs. Talks to the engine through the
 * AR / LY / PR namespaces, which build.py produces from the module exports. */
'use strict';

var measuredRegistered = false;


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
      out.push('<tr><td>가장 강한 활성 농도 (AC50)</td><td style="font-weight:700">' +
               fx(tox.ac50, tox.ac50 < 1 ? 3 : 1) + ' &micro;M' +
               (tox.ac50mode ? ' <span class="hint">' +
                 (tox.ac50mode === 'agonist' ? '작용제 모드' : '길항제 모드') + '</span>' : '') +
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
  out.push('<div><span class="k">적용영역</span><span class="v">' +
           '<span class="tag ' + esc(result.domain) + '">' + esc(domainWord) + '</span>' +
           '<span class="sub">유사도 ' + fx(result.nearestSim, 2) + '</span></span></div>');
  out.push('</div></div>');

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
    if (typeof TOX21 !== 'undefined' && TOX21 && !measuredRegistered) {
      PR.registerMeasured(TOX21);
      measuredRegistered = true;
    }
  } catch (err) { /* the pool is optional */ }

  var tox21 = null, tox21Potency = null;
  try {
    if (typeof TOX21 !== 'undefined' && TOX21 && TOX21.calls) {
      var sid = MOL.structureIdOf(MOL.parseSmiles(smiles));
      tox21 = TOX21.calls[sid] || null;
      tox21Potency = (TOX21.potency && TOX21.potency[sid]) || null;
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

  var cv, fv;
  try { cv = PR.crossValidate(); } catch (err) { cv = null; }
  try { fv = PR.validateFunction(); } catch (err) { fv = null; }
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
             '</b> log. 레퍼런스 자체가 실험실 간 ±0.5~1 log의 분산을 가지므로 ' +
             '이보다 낮은 오차는 기대할 수 없습니다. 실제로 풀베스트란트의 ChEMBL ' +
             '중앙값은 47개 측정에 걸쳐 3.65 log이 퍼져 있고, 나린제닌·레스베라트롤은 ' +
             '단 1개 측정값입니다 — 레퍼런스 표의 「비고」에 n과 퍼짐이 적혀 있으니 ' +
             '그 숫자를 보고 가중치를 두세요.</p>');
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
             '유사도 문턱값을 바로 이 ' + fv.n + '종으로 정했기 때문입니다. ' +
             '독립 검증은 Tox21로만 라벨된 물질(손으로 라벨하지 않은 것) ' +
             '14종을 자기 어세이 결과를 가리고 맞혀보는 것인데, 거기서는 ' +
             '<b>13/14</b>였습니다. 유일한 실패는 벤조페논-3으로, Tox21은 약한 ' +
             '작용제(양쪽 작용제 웰 활성, AC50 34 µM)라고 하는데 이 도구는 ' +
             '길항제 가능성으로 봤습니다.</p>');
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
           '17α-에스트라디올과 17β-에스트라디올은 친화도가 자리 수로 다른데 ' +
           '이 도구에는 같은 물질로 보입니다.</li>');
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

  out.push('<h5>데이터 출처</h5>');
  out.push('<ul>');
  out.push('<li>ChEMBL CHEMBL206 (사람 ERα) 활성 데이터 — 라이브러리 pKi</li>');
  out.push('<li>Tox21 / PubChem BioAssay AID 743077 · 743079 · 743078 · 743091</li>');
  out.push('<li>PDB 1GWR · 1X7R · 1L2I · 2P15 · 2B1V · 3OS8 · 1XP1 · 1SJ0 · ' +
           '3ERT · 1ERR — 포켓과 리간드 포즈</li>');
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

