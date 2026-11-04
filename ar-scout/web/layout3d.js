/* layout3d.js — a rough 3D conformer by distance-geometry relaxation.
 *
 * This is a sketch of the shape, not a docking pose. There is no force
 * field, no torsion search and no stereochemistry: the parser reads chirality
 * and throws it away, so enantiomers come out identical and a given centre
 * may be drawn either way round. Use it to see the shape; use local/ar_dock.py
 * when the geometry has to be right.
 *
 * Same two safeguards as the 2D layout: constraints on the same atom pair are
 * merged into one weighted average rather than left to fight, and per-atom
 * displacement is clamped.
 */
'use strict';

/* single-bond covalent radii, angstrom */
var COVALENT = {
  H: 0.31, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Si: 1.11, P: 1.07,
  S: 1.05, Cl: 1.02, Se: 1.20, Br: 1.20, I: 1.39, Zn: 1.22
};
var DEFAULT_RADIUS = 0.90;

var ORDER_SCALE = { 1: 1.0, 2: 0.87, 3: 0.78, 4: 0.75 };
var AROMATIC_SCALE = 0.93;

var MAX_STEP_3D = 0.12;
var NONBONDED_MIN = 3.0;      /* lower bound for 1-4 and beyond */
var SEEDS_3D = [0x1f123bb5, 0x9e3779b9, 0x6a09e667, 0xbb67ae85, 0x3c6ef372];

function radiusOf(el) {
  return COVALENT[el] !== undefined ? COVALENT[el] : DEFAULT_RADIUS;
}

function bondLength(mol, bondIndex) {
  var bd = mol.bonds[bondIndex];
  var base = radiusOf(mol.atoms[bd.a].el) + radiusOf(mol.atoms[bd.b].el);
  var scale = bd.arom ? AROMATIC_SCALE : (ORDER_SCALE[bd.order] || 1.0);
  return base * scale;
}

function rng3d(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pairKey3(i, j) { return i < j ? i + '_' + j : j + '_' + i; }

/* ------------------------------------------------------------ geometry */

function idealAngle3D(mol, centre) {
  var at = mol.atoms[centre];
  var sigma = at.nbr.length + at.nH;
  var hasTriple = false, doubles = 0, j;
  for (j = 0; j < at.bidx.length; j++) {
    var o = mol.bonds[at.bidx[j]].order;
    if (o === 3) hasTriple = true;
    if (o === 2) doubles++;
  }
  if (hasTriple || doubles >= 2) return Math.PI;                 /* sp   */
  if (at.arom || doubles === 1) return 2 * Math.PI / 3;          /* sp2  */
  if (sigma >= 4) return 109.47 * Math.PI / 180;                 /* sp3  */
  if (sigma === 3) return 107.0 * Math.PI / 180;                 /* pyramidal */
  return 104.5 * Math.PI / 180;                                  /* bent */
}

/* A ring is held flat only when every atom in it is aromatic. Saturated
 * rings get 1-2 and 1-3 distances alone, which lets a cyclohexane pucker
 * into a chair instead of being pinned into an impossible planar hexagon. */
function planarRings(mol) {
  var flat = [];
  for (var r = 0; r < mol.rings.length; r++) {
    var ring = mol.rings[r], all = true;
    for (var t = 0; t < ring.length; t++) {
      if (!mol.atoms[ring[t]].arom) { all = false; break; }
    }
    if (all) flat.push(ring);
  }
  return flat;
}

function buildConstraints3D(mol) {
  var merged = {}, i, j;

  function add(a, b, d, w) {
    if (a === b) return;
    var key = pairKey3(a, b);
    var e = merged[key];
    if (e) { e.sum += d * w; e.w += w; }
    else merged[key] = { i: Math.min(a, b), j: Math.max(a, b), sum: d * w, w: w };
  }

  var lengths = new Array(mol.bonds.length);
  for (i = 0; i < mol.bonds.length; i++) {
    lengths[i] = bondLength(mol, i);
    add(mol.bonds[i].a, mol.bonds[i].b, lengths[i], 1.0);
  }

  /* 1-3 distances from the bond angle at the shared atom */
  for (i = 0; i < mol.atoms.length; i++) {
    var at = mol.atoms[i];
    if (at.nbr.length < 2) continue;
    var theta = idealAngle3D(mol, i);
    for (j = 0; j < at.nbr.length; j++) {
      for (var k = j + 1; k < at.nbr.length; k++) {
        var la = lengths[at.bidx[j]], lb = lengths[at.bidx[k]];
        var d = Math.sqrt(Math.max(0.01,
          la * la + lb * lb - 2 * la * lb * Math.cos(theta)));
        add(at.nbr[j], at.nbr[k], d, 0.8);
      }
    }
  }

  /* aromatic rings as flat regular polygons */
  var flat = planarRings(mol);
  for (var f = 0; f < flat.length; f++) {
    var ring = flat[f], n = ring.length, total = 0, count = 0;
    for (var t = 0; t < n; t++) {
      var bi = bondBetweenIdx(mol, ring[t], ring[(t + 1) % n]);
      if (bi >= 0) { total += lengths[bi]; count++; }
    }
    var side = count ? total / count : 1.39;
    var circ = side / (2 * Math.sin(Math.PI / n));
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        var sep = Math.min(b - a, n - (b - a));
        var chord = 2 * circ * Math.sin(sep * Math.PI / n);
        add(ring[a], ring[b], chord, sep === 1 ? 1.0 : 0.85);
      }
    }
  }

  var out = [];
  for (var key in merged) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) continue;
    var e = merged[key];
    out.push({ i: e.i, j: e.j, d: e.sum / e.w, w: Math.min(1.0, e.w) });
  }
  return out;
}

function bondBetweenIdx(mol, u, v) {
  var at = mol.atoms[u];
  for (var j = 0; j < at.nbr.length; j++) if (at.nbr[j] === v) return at.bidx[j];
  return -1;
}

/* ------------------------------------------------------------ embedding */

/* Atoms that must share a plane: each aromatic ring plus whatever hangs
 * directly off it (a methyl carbon on toluene does lie in the ring plane). */
function planarGroups(mol) {
  var rings = planarRings(mol), n = rings.length, i, j, t;
  if (!n) return [];

  /* Fused aromatic rings share one plane. Projecting each ring onto its own
   * plane instead makes neighbouring rings shove each other on every step -
   * naphthalene came out with a 1.58 A clash and 28 degrees of angle error. */
  var parent = [];
  for (i = 0; i < n; i++) parent[i] = i;
  function find(v) { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; }
  for (i = 0; i < n; i++) {
    for (j = i + 1; j < n; j++) {
      var shares = false;
      for (t = 0; t < rings[i].length; t++) {
        if (rings[j].indexOf(rings[i][t]) >= 0) { shares = true; break; }
      }
      if (shares) { var a = find(i), b = find(j); if (a !== b) parent[a] = b; }
    }
  }

  var systems = {};
  for (i = 0; i < n; i++) (systems[find(i)] = systems[find(i)] || []).push(i);

  var groups = [];
  for (var key in systems) {
    if (!Object.prototype.hasOwnProperty.call(systems, key)) continue;
    var idxs = systems[key], members = {}, biggest = rings[idxs[0]];
    for (i = 0; i < idxs.length; i++) {
      var ring = rings[idxs[i]];
      if (ring.length > biggest.length) biggest = ring;
      for (t = 0; t < ring.length; t++) members[ring[t]] = true;
    }
    var all = Object.keys(members).map(Number), extra = [];
    for (i = 0; i < all.length; i++) {
      var at = mol.atoms[all[i]];
      for (j = 0; j < at.nbr.length; j++) {
        if (!members[at.nbr[j]] && extra.indexOf(at.nbr[j]) < 0) extra.push(at.nbr[j]);
      }
    }
    /* `cycle` keeps a true cyclic order for Newell; `ring` is every atom in
     * the fused system that the plane applies to */
    groups.push({ cycle: biggest, ring: all, extra: extra });
  }

  /* An exocyclic atom that belongs to another aromatic system must not be
   * dragged into this one's plane: biphenyl's rings are twisted, not
   * coplanar, and pulling each ipso carbon into the opposite ring's plane
   * forces the two flat against each other. */
  var claimed = {};
  for (i = 0; i < groups.length; i++) {
    for (t = 0; t < groups[i].ring.length; t++) claimed[groups[i].ring[t]] = true;
  }
  for (i = 0; i < groups.length; i++) {
    var kept = [];
    for (t = 0; t < groups[i].extra.length; t++) {
      if (!claimed[groups[i].extra[t]]) kept.push(groups[i].extra[t]);
    }
    groups[i].extra = kept;
  }
  return groups;
}

/* Newell's method: an area-weighted normal straight from the cyclic order,
 * with no iteration and stable when the polygon is already nearly flat. */
function newellNormal(ring, x, y, z) {
  var nx = 0, ny = 0, nz = 0, n = ring.length;
  for (var i = 0; i < n; i++) {
    var a = ring[i], b = ring[(i + 1) % n];
    nx += (y[a] - y[b]) * (z[a] + z[b]);
    ny += (z[a] - z[b]) * (x[a] + x[b]);
    nz += (x[a] - x[b]) * (y[a] + y[b]);
  }
  var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (!(len > 1e-9)) return null;
  return [nx / len, ny / len, nz / len];
}

/* Pull a planar group onto its own best plane.
 *
 * The all-pairs chord constraints already imply planarity, but the
 * out-of-plane direction is the softest mode they restrain, so relaxation
 * alone leaves aromatic rings visibly buckled - 0.05 to 0.26 A here, where
 * a real ring is flat to under 0.01. Restraining it directly converges in
 * the same few hundred steps. */
function applyPlanarity(groups, x, y, z, strength) {
  for (var g = 0; g < groups.length; g++) {
    var ring = groups[g].ring, extra = groups[g].extra, i;
    var normal = newellNormal(groups[g].cycle, x, y, z);
    if (!normal) continue;
    var cx = 0, cy = 0, cz = 0;
    for (i = 0; i < ring.length; i++) { cx += x[ring[i]]; cy += y[ring[i]]; cz += z[ring[i]]; }
    cx /= ring.length; cy /= ring.length; cz /= ring.length;

    for (var pass = 0; pass < 2; pass++) {
      var list = pass === 0 ? ring : extra;
      var w = pass === 0 ? strength : strength * 0.45;
      for (i = 0; i < list.length; i++) {
        var idx = list[i];
        var d = (x[idx] - cx) * normal[0] + (y[idx] - cy) * normal[1] +
                (z[idx] - cz) * normal[2];
        x[idx] -= normal[0] * d * w;
        y[idx] -= normal[1] * d * w;
        z[idx] -= normal[2] * d * w;
      }
    }
  }
}

function relax3D(mol, cons, pos, iterations, groups) {
  var n = mol.atoms.length;
  var x = pos.x, y = pos.y, z = pos.z;
  var fx = new Float64Array(n), fy = new Float64Array(n), fz = new Float64Array(n);
  var cnt = new Float64Array(n);

  var constrained = {};
  for (var c = 0; c < cons.length; c++) constrained[pairKey3(cons[c].i, cons[c].j)] = true;

  for (var it = 0; it < iterations; it++) {
    fx.fill(0); fy.fill(0); fz.fill(0); cnt.fill(0);

    for (var k = 0; k < cons.length; k++) {
      var con = cons[k], i = con.i, j = con.j;
      var dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i];
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!(dist > 1e-9)) { dx = 1e-3; dy = 0; dz = 0; dist = 1e-3; }
      var pull = (dist - con.d) / dist * 0.5 * con.w;
      fx[i] += dx * pull; fy[i] += dy * pull; fz[i] += dz * pull;
      fx[j] -= dx * pull; fy[j] -= dy * pull; fz[j] -= dz * pull;
      cnt[i] += con.w; cnt[j] += con.w;
    }

    /* lower bound on everything that is not 1-2 or 1-3: this is what keeps a
     * saturated ring from folding flat once the planar terms are absent */
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        if (constrained[pairKey3(a, b)]) continue;
        var rx = x[b] - x[a], ry = y[b] - y[a], rz = z[b] - z[a];
        var rd = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (rd >= NONBONDED_MIN) continue;
        if (!(rd > 1e-9)) { rx = 1e-3; ry = 0; rz = 0; rd = 1e-3; }
        var push = (rd - NONBONDED_MIN) / rd * 0.22;
        fx[a] += rx * push; fy[a] += ry * push; fz[a] += rz * push;
        fx[b] -= rx * push; fy[b] -= ry * push; fz[b] -= rz * push;
        cnt[a] += 0.35; cnt[b] += 0.35;
      }
    }

    for (var m = 0; m < n; m++) {
      var div = cnt[m] > 1 ? cnt[m] : 1;
      var sx = fx[m] / div, sy = fy[m] / div, sz = fz[m] / div;
      var mag = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (mag > MAX_STEP_3D) {
        sx = sx / mag * MAX_STEP_3D; sy = sy / mag * MAX_STEP_3D; sz = sz / mag * MAX_STEP_3D;
      }
      if (!isFinite(sx) || !isFinite(sy) || !isFinite(sz)) { sx = sy = sz = 0; }
      x[m] += sx; y[m] += sy; z[m] += sz;
    }

    if (groups && groups.length) {
      /* ease it in so the planes are not forced before the rough shape
       * has settled, which would freeze a bad starting fold */
      applyPlanarity(groups, x, y, z, 0.06 + 0.22 * (it / iterations));
    }
  }
  return pos;
}

function seed3D(mol, rnd) {
  var n = mol.atoms.length;
  var pos = { x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n) };
  var radius = Math.cbrt(n) * 1.5 + 1;
  for (var i = 0; i < n; i++) {
    /* uniform-ish points in a ball */
    var u = rnd() * 2 - 1, phi = rnd() * 2 * Math.PI;
    var r = radius * Math.cbrt(rnd());
    var s = Math.sqrt(Math.max(0, 1 - u * u));
    pos.x[i] = r * s * Math.cos(phi);
    pos.y[i] = r * s * Math.sin(phi);
    pos.z[i] = r * u;
  }
  return pos;
}

function score3D(mol, cons, pos) {
  var err = 0, k;
  for (k = 0; k < cons.length; k++) {
    var con = cons[k];
    var dx = pos.x[con.j] - pos.x[con.i];
    var dy = pos.y[con.j] - pos.y[con.i];
    var dz = pos.z[con.j] - pos.z[con.i];
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    err += (d - con.d) * (d - con.d) * con.w;
  }
  /* clashes count heavily: a folded conformer can satisfy every distance */
  var n = mol.atoms.length, clash = 0;
  var constrained = {};
  for (k = 0; k < cons.length; k++) constrained[pairKey3(cons[k].i, cons[k].j)] = true;
  for (var a = 0; a < n; a++) {
    for (var b = a + 1; b < n; b++) {
      if (constrained[pairKey3(a, b)]) continue;
      var rx = pos.x[b] - pos.x[a], ry = pos.y[b] - pos.y[a], rz = pos.z[b] - pos.z[a];
      var rd = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (rd < NONBONDED_MIN - 0.4) clash += (NONBONDED_MIN - 0.4 - rd);
    }
  }
  return err + clash * 6;
}

/* longest axis along x, second along y, so the molecule faces the viewer */
function orientPrincipal3D(pos) {
  var n = pos.x.length, i;
  if (n < 3) return pos;
  var mx = 0, my = 0, mz = 0;
  for (i = 0; i < n; i++) { mx += pos.x[i]; my += pos.y[i]; mz += pos.z[i]; }
  mx /= n; my /= n; mz /= n;
  for (i = 0; i < n; i++) { pos.x[i] -= mx; pos.y[i] -= my; pos.z[i] -= mz; }

  /* power iteration for the dominant covariance eigenvector */
  var c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (i = 0; i < n; i++) {
    var v = [pos.x[i], pos.y[i], pos.z[i]];
    for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) c[a][b] += v[a] * v[b];
  }
  function mul(m, v) {
    return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
  }
  function norm(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  var e1 = norm([1, 0.3, 0.1]);
  for (i = 0; i < 48; i++) e1 = norm(mul(c, e1));

  /* deflate, then find the second axis */
  var c2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (var p = 0; p < 3; p++) {
    for (var q = 0; q < 3; q++) {
      var lam = e1[p] * (c[p][0] * e1[0] + c[p][1] * e1[1] + c[p][2] * e1[2]);
      c2[p][q] = c[p][q] - e1[p] * e1[q] * (lam / (e1[p] * e1[p] + 1e-9));
    }
  }
  var e2 = norm([0.2, 1, 0.3]);
  for (i = 0; i < 48; i++) {
    e2 = norm(mul(c2, e2));
    var dot = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2];
    e2 = norm([e2[0] - dot * e1[0], e2[1] - dot * e1[1], e2[2] - dot * e1[2]]);
  }
  var e3 = [e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0]];

  for (i = 0; i < n; i++) {
    var vx = pos.x[i], vy = pos.y[i], vz = pos.z[i];
    pos.x[i] = vx * e1[0] + vy * e1[1] + vz * e1[2];
    pos.y[i] = vx * e2[0] + vy * e2[1] + vz * e2[2];
    pos.z[i] = vx * e3[0] + vy * e3[1] + vz * e3[2];
  }
  return pos;
}

function computeLayout3D(mol, options) {
  options = options || {};
  var iterations = options.iterations || 500;
  var cons = buildConstraints3D(mol);
  var groups = planarGroups(mol);
  var best = null, bestScore = Infinity;

  for (var s = 0; s < SEEDS_3D.length; s++) {
    var pos = seed3D(mol, rng3d(SEEDS_3D[s]));
    relax3D(mol, cons, pos, iterations, groups);

    var bad = false;
    for (var i = 0; i < pos.x.length; i++) {
      if (!isFinite(pos.x[i]) || !isFinite(pos.y[i]) || !isFinite(pos.z[i]) ||
          Math.abs(pos.x[i]) > 1e5) { bad = true; break; }
    }
    if (bad) continue;
    var sc = score3D(mol, cons, pos);
    if (sc < bestScore) { bestScore = sc; best = pos; }
  }

  if (!best) {
    var n = mol.atoms.length;
    best = { x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n) };
    for (var k = 0; k < n; k++) {
      best.x[k] = Math.cos(k) * 2; best.y[k] = Math.sin(k) * 2; best.z[k] = k * 0.4;
    }
    bestScore = Infinity;
  }

  orientPrincipal3D(best);
  return {
    x: Array.prototype.slice.call(best.x),
    y: Array.prototype.slice.call(best.y),
    z: Array.prototype.slice.call(best.z),
    score: bestScore
  };
}

/* ------------------------------------------------------- measurements */

function bondStats(mol, pos) {
  var errs = [], i;
  for (i = 0; i < mol.bonds.length; i++) {
    var bd = mol.bonds[i];
    var dx = pos.x[bd.b] - pos.x[bd.a];
    var dy = pos.y[bd.b] - pos.y[bd.a];
    var dz = pos.z[bd.b] - pos.z[bd.a];
    errs.push(Math.sqrt(dx * dx + dy * dy + dz * dz) - bondLength(mol, i));
  }
  var mean = 0;
  for (i = 0; i < errs.length; i++) mean += Math.abs(errs[i]);
  return { meanAbsError: errs.length ? mean / errs.length : 0, errors: errs };
}

function minNonBonded(mol, pos) {
  var cons = buildConstraints3D(mol), constrained = {}, k;
  for (k = 0; k < cons.length; k++) constrained[pairKey3(cons[k].i, cons[k].j)] = true;
  var best = Infinity, n = mol.atoms.length;
  for (var a = 0; a < n; a++) {
    for (var b = a + 1; b < n; b++) {
      if (constrained[pairKey3(a, b)]) continue;
      var dx = pos.x[b] - pos.x[a], dy = pos.y[b] - pos.y[a], dz = pos.z[b] - pos.z[a];
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) best = d;
    }
  }
  return best;
}

function angleStats(mol, pos) {
  var errs = [];
  for (var c = 0; c < mol.atoms.length; c++) {
    var at = mol.atoms[c];
    if (at.nbr.length < 2) continue;
    var ideal = idealAngle3D(mol, c) * 180 / Math.PI;
    for (var j = 0; j < at.nbr.length; j++) {
      for (var k = j + 1; k < at.nbr.length; k++) {
        var u = at.nbr[j], v = at.nbr[k];
        var ax = pos.x[u] - pos.x[c], ay = pos.y[u] - pos.y[c], az = pos.z[u] - pos.z[c];
        var bx = pos.x[v] - pos.x[c], by = pos.y[v] - pos.y[c], bz = pos.z[v] - pos.z[c];
        var la = Math.sqrt(ax * ax + ay * ay + az * az);
        var lb = Math.sqrt(bx * bx + by * by + bz * bz);
        if (!(la > 1e-9 && lb > 1e-9)) continue;
        var cosv = (ax * bx + ay * by + az * bz) / (la * lb);
        cosv = Math.max(-1, Math.min(1, cosv));
        errs.push(Math.acos(cosv) * 180 / Math.PI - ideal);
      }
    }
  }
  var mean = 0;
  for (var i = 0; i < errs.length; i++) mean += Math.abs(errs[i]);
  return { meanAbsError: errs.length ? mean / errs.length : 0, n: errs.length };
}

/* planarity of each aromatic ring: RMS distance from its best-fit plane */
function aromaticPlanarity(mol, pos) {
  var rings = planarRings(mol), out = [];
  for (var r = 0; r < rings.length; r++) {
    var ring = rings[r], n = ring.length, i;
    var cx = 0, cy = 0, cz = 0;
    for (i = 0; i < n; i++) { cx += pos.x[ring[i]]; cy += pos.y[ring[i]]; cz += pos.z[ring[i]]; }
    cx /= n; cy /= n; cz /= n;

    /* Normal of the least-squares plane, i.e. the covariance eigenvector with
     * the smallest eigenvalue. Taking the normal from three atoms instead
     * lets their own small deviations tilt the reference plane, which then
     * reports a flat ring as buckled. */
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], a, b;
    for (i = 0; i < n; i++) {
      var v = [pos.x[ring[i]] - cx, pos.y[ring[i]] - cy, pos.z[ring[i]] - cz];
      for (a = 0; a < 3; a++) for (b = 0; b < 3; b++) C[a][b] += v[a] * v[b];
    }
    /* power-iterate (trace*I - C): its dominant vector is C's weakest */
    var tr = C[0][0] + C[1][1] + C[2][2];
    var M = [[tr - C[0][0], -C[0][1], -C[0][2]],
             [-C[1][0], tr - C[1][1], -C[1][2]],
             [-C[2][0], -C[2][1], tr - C[2][2]]];
    var vec = [0.31, 0.57, 0.76];
    for (var it = 0; it < 64; it++) {
      var r0 = M[0][0] * vec[0] + M[0][1] * vec[1] + M[0][2] * vec[2];
      var r1 = M[1][0] * vec[0] + M[1][1] * vec[1] + M[1][2] * vec[2];
      var r2 = M[2][0] * vec[0] + M[2][1] * vec[1] + M[2][2] * vec[2];
      var ln = Math.sqrt(r0 * r0 + r1 * r1 + r2 * r2) || 1;
      vec = [r0 / ln, r1 / ln, r2 / ln];
    }
    var nx = vec[0], ny = vec[1], nz = vec[2];
    var sum = 0;
    for (i = 0; i < n; i++) {
      var d = (pos.x[ring[i]] - cx) * nx + (pos.y[ring[i]] - cy) * ny +
              (pos.z[ring[i]] - cz) * nz;
      sum += d * d;
    }
    out.push(Math.sqrt(sum / n));
  }
  return out;
}

module.exports = {
  computeLayout3D: computeLayout3D,
  buildConstraints3D: buildConstraints3D,
  bondLength: bondLength,
  bondStats: bondStats,
  angleStats: angleStats,
  minNonBonded: minNonBonded,
  aromaticPlanarity: aromaticPlanarity,
  planarRings: planarRings,
  planarGroups: planarGroups,
  newellNormal: newellNormal,
  COVALENT: COVALENT,
  NONBONDED_MIN: NONBONDED_MIN
};
