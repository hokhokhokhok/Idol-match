/* layout.js — 2D coordinates by distance-geometry relaxation.
 *
 * Two things keep this stable and both are easy to get wrong:
 *   1. Fused rings generate several constraints for the same atom pair. They
 *      must be merged into one weighted average, otherwise they fight each
 *      other and the coordinates diverge (1e+117 on DHT / spironolactone).
 *   2. Per-atom displacement is clamped, so one bad constraint cannot throw
 *      an atom across the plane.
 */
'use strict';

var BOND_LEN = 1.0;
var MAX_STEP = 0.15;
var REPULSE_CUT = 2.0;
var CLOSE_PAIR = 0.72;
var SEEDS = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f,
             0x165667b1, 0xd3a2646c, 0xfd7046c5, 0xb55a4f09];

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pairKey(i, j) { return i < j ? i + '_' + j : j + '_' + i; }

/* ------------------------------------------------------------ constraints */

function idealAngle(mol, c) {
  var at = mol.atoms[c], deg = at.nbr.length;
  if (deg <= 2) {
    var linear = false;
    for (var j = 0; j < at.bidx.length; j++) {
      if (mol.bonds[at.bidx[j]].order === 3) linear = true;
    }
    var dbl = 0;
    for (var k = 0; k < at.bidx.length; k++) {
      if (mol.bonds[at.bidx[k]].order === 2) dbl++;
    }
    if (linear || dbl >= 2) return Math.PI;            /* sp  */
    return 2 * Math.PI / 3;                            /* sp2 */
  }
  if (deg === 3) return 2 * Math.PI / 3;
  return 109.5 * Math.PI / 180;
}

function sameRing(mol, a, b, c) {
  for (var r = 0; r < mol.rings.length; r++) {
    var ring = mol.rings[r], ha = false, hb = false, hc = false;
    for (var t = 0; t < ring.length; t++) {
      if (ring[t] === a) ha = true;
      else if (ring[t] === b) hb = true;
      else if (ring[t] === c) hc = true;
    }
    if (ha && hb && hc) return true;
  }
  return false;
}

/* True when p and q reach the centre through rings that meet only at the
 * centre (a spiro junction). Two rings there already claim ~108-120 deg each;
 * adding 109.5 deg cross terms over-determines the 360 deg around the atom and
 * the solver resolves it by folding one ring onto the other. Leave those pairs
 * to the soft repulsion instead. */
function spiroPair(mol, centre, p, q) {
  var rings = mol.rings;
  for (var a = 0; a < rings.length; a++) {
    if (rings[a].indexOf(centre) < 0 || rings[a].indexOf(p) < 0) continue;
    for (var b = 0; b < rings.length; b++) {
      if (a === b) continue;
      if (rings[b].indexOf(centre) < 0 || rings[b].indexOf(q) < 0) continue;
      var shared = 0;
      for (var t = 0; t < rings[a].length; t++) {
        if (rings[b].indexOf(rings[a][t]) >= 0) shared++;
      }
      if (shared === 1) return true;
    }
  }
  return false;
}

function buildConstraints(mol) {
  var merged = {};

  function add(i, j, d, w) {
    if (i === j) return;
    var key = pairKey(i, j);
    var e = merged[key];
    if (e) { e.sum += d * w; e.w += w; }
    else merged[key] = { i: Math.min(i, j), j: Math.max(i, j), sum: d * w, w: w };
  }

  for (var b = 0; b < mol.bonds.length; b++) {
    add(mol.bonds[b].a, mol.bonds[b].b, BOND_LEN, 1.0);
  }

  /* every ring becomes a regular polygon: all internal chords constrained */
  for (var r = 0; r < mol.rings.length; r++) {
    var ring = mol.rings[r], n = ring.length;
    var s = Math.sin(Math.PI / n);
    for (var a = 0; a < n; a++) {
      for (var c = a + 1; c < n; c++) {
        var sep = Math.min(c - a, n - (c - a));
        var d = Math.sin(sep * Math.PI / n) / s;
        add(ring[a], ring[c], d, sep === 1 ? 1.0 : 0.9);
      }
    }
  }

  /* 1-3 distances outside rings, from the ideal bond angle */
  for (var ci = 0; ci < mol.atoms.length; ci++) {
    var nb = mol.atoms[ci].nbr;
    if (nb.length < 2) continue;
    var theta = idealAngle(mol, ci);
    var dist13 = Math.sqrt(Math.max(0, 2 - 2 * Math.cos(theta))) * BOND_LEN;
    for (var p = 0; p < nb.length; p++) {
      for (var q = p + 1; q < nb.length; q++) {
        if (sameRing(mol, nb[p], nb[q], ci)) continue;
        if (spiroPair(mol, ci, nb[p], nb[q])) continue;
        add(nb[p], nb[q], dist13, 0.7);
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

/* ------------------------------------------------------- initial embedding */

/* Rings that touch at all (fused OR spiro) are laid out together. */
function ringSystems(mol) {
  var rings = mol.rings, n = rings.length, parent = [];
  for (var i = 0; i < n; i++) parent[i] = i;
  function find(v) { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; }
  for (var a = 0; a < n; a++) {
    for (var b = a + 1; b < n; b++) {
      var shared = 0;
      for (var t = 0; t < rings[a].length; t++) {
        if (rings[b].indexOf(rings[a][t]) >= 0) shared++;
      }
      if (shared >= 1) {
        var ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  }
  var groups = {};
  for (var r = 0; r < n; r++) {
    var g = find(r);
    (groups[g] = groups[g] || []).push(r);
  }
  return Object.keys(groups).map(function (k) { return groups[k]; });
}

function circumradius(k) { return 0.5 / Math.sin(Math.PI / k); }

function placePolygon(ring, cx, cy, rot, x, y, placed) {
  var k = ring.length, R = circumradius(k);
  for (var t = 0; t < k; t++) {
    var a = rot + 2 * Math.PI * t / k;
    x[ring[t]] = cx + R * Math.cos(a);
    y[ring[t]] = cy + R * Math.sin(a);
    placed[ring[t]] = true;
  }
}

function placedCentroid(x, y, placed) {
  var gx = 0, gy = 0, n = 0;
  for (var i = 0; i < placed.length; i++) {
    if (placed[i]) { gx += x[i]; gy += y[i]; n++; }
  }
  return n ? { x: gx / n, y: gy / n } : { x: 0, y: 0 };
}

/* Attach a ring to two of its atoms that are already placed and adjacent,
 * putting the new ring's centre on the far side from everything placed. */
function placeRingOnSharedEdge(ring, x, y, placed) {
  var k = ring.length, iu = -1;
  for (var t = 0; t < k; t++) {
    if (placed[ring[t]] && placed[ring[(t + 1) % k]]) { iu = t; break; }
  }
  if (iu < 0) return false;
  var u = ring[iu], v = ring[(iu + 1) % k];
  var dx = x[v] - x[u], dy = y[v] - y[u];
  var L = Math.sqrt(dx * dx + dy * dy);
  if (!(L > 1e-6)) return false;

  var R = circumradius(k);
  var mx = (x[u] + x[v]) / 2, my = (y[u] + y[v]) / 2;
  var h = Math.sqrt(Math.max(0, R * R - L * L / 4));
  var nx = -dy / L, ny = dx / L;
  var g = placedCentroid(x, y, placed);
  var c1x = mx + nx * h, c1y = my + ny * h;
  var c2x = mx - nx * h, c2y = my - ny * h;
  var far1 = (c1x - g.x) * (c1x - g.x) + (c1y - g.y) * (c1y - g.y);
  var far2 = (c2x - g.x) * (c2x - g.x) + (c2y - g.y) * (c2y - g.y);
  var cx = far1 >= far2 ? c1x : c2x;
  var cy = far1 >= far2 ? c1y : c2y;

  var au = Math.atan2(y[u] - cy, x[u] - cx);
  var av = Math.atan2(y[v] - cy, x[v] - cx);
  var diff = av - au;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  var dir = diff >= 0 ? 1 : -1;
  var step = 2 * Math.PI / k;

  for (var s = 0; s < k; s++) {
    var idx = ring[(iu + s) % k];
    if (placed[idx]) continue;
    var ang = au + dir * step * s;
    x[idx] = cx + R * Math.cos(ang);
    y[idx] = cy + R * Math.sin(ang);
    placed[idx] = true;
  }
  return true;
}

/* Spiro: only one atom is shared, so push the new ring straight out along the
 * direction away from that atom's existing bonds. */
function placeRingAtSpiro(mol, ring, anchor, x, y, placed) {
  var k = ring.length, R = circumradius(k);
  var at = mol.atoms[anchor], ax = 0, ay = 0;
  for (var j = 0; j < at.nbr.length; j++) {
    var w = at.nbr[j];
    if (placed[w]) { ax += x[w] - x[anchor]; ay += y[w] - y[anchor]; }
  }
  var len = Math.sqrt(ax * ax + ay * ay);
  var ux = len > 1e-6 ? -ax / len : 1;
  var uy = len > 1e-6 ? -ay / len : 0;
  var cx = x[anchor] + ux * R, cy = y[anchor] + uy * R;
  var a0 = Math.atan2(y[anchor] - cy, x[anchor] - cx);
  var ia = ring.indexOf(anchor), step = 2 * Math.PI / k;
  for (var t = 0; t < k; t++) {
    var idx = ring[(ia + t) % k];
    if (placed[idx]) continue;
    var ang = a0 + step * t;
    x[idx] = cx + R * Math.cos(ang);
    y[idx] = cy + R * Math.sin(ang);
    placed[idx] = true;
  }
  return true;
}

/* Pick the bond direction that keeps the new atom furthest from everything
 * already on the page. */
function bestAngle(mol, from, x, y, placed, rnd) {
  var samples = 24, best = 0, bestGap = -Infinity;
  var jitter = rnd() * 2 * Math.PI / samples;
  for (var s = 0; s < samples; s++) {
    var ang = jitter + 2 * Math.PI * s / samples;
    var px = x[from] + Math.cos(ang) * BOND_LEN;
    var py = y[from] + Math.sin(ang) * BOND_LEN;
    var gap = Infinity;
    for (var i = 0; i < placed.length; i++) {
      if (!placed[i] || i === from) continue;
      var dx = x[i] - px, dy = y[i] - py;
      var d = dx * dx + dy * dy;
      if (d < gap) gap = d;
    }
    if (gap > bestGap) { bestGap = gap; best = ang; }
  }
  return best;
}

function placeChains(mol, x, y, placed, rnd) {
  var n = mol.atoms.length, queue = [];
  for (var i = 0; i < n; i++) if (placed[i]) queue.push(i);

  var guard = 0;
  while (guard++ < n * 8) {
    if (!queue.length) {
      var seed = -1;
      for (var k = 0; k < n; k++) if (!placed[k]) { seed = k; break; }
      if (seed < 0) break;
      var g = placedCentroid(x, y, placed);
      x[seed] = g.x + 7 + rnd(); y[seed] = g.y + rnd();
      placed[seed] = true;
      queue.push(seed);
      continue;
    }
    var cur = queue.shift(), at = mol.atoms[cur];
    for (var j = 0; j < at.nbr.length; j++) {
      var w = at.nbr[j];
      if (placed[w]) continue;
      var ang = bestAngle(mol, cur, x, y, placed, rnd);
      x[w] = x[cur] + Math.cos(ang) * BOND_LEN;
      y[w] = y[cur] + Math.sin(ang) * BOND_LEN;
      placed[w] = true;
      queue.push(w);
    }
  }
}

/* Ring-aware initial embedding: fused systems first as joined polygons, then
 * the acyclic decoration. A topologically sound start matters more than the
 * relaxation itself — from a tangled start the solver cannot unknot a
 * polycyclic core, which is where stray bond crossings come from. */
function seedCoords(mol, rnd) {
  var n = mol.atoms.length;
  var x = new Float64Array(n), y = new Float64Array(n);
  var placed = new Array(n).fill(false);
  var systems = ringSystems(mol);
  var offsetX = 0;

  for (var s = 0; s < systems.length; s++) {
    var idxs = systems[s].slice();
    idxs.sort(function (a, b) { return mol.rings[b].length - mol.rings[a].length; });
    if (idxs.length > 1 && rnd() < 0.5) {
      /* vary which ring anchors the system between restarts */
      var swap = 1 + Math.floor(rnd() * (idxs.length - 1));
      var tmp = idxs[0]; idxs[0] = idxs[swap]; idxs[swap] = tmp;
    }
    placePolygon(mol.rings[idxs[0]], offsetX, 0, rnd() * 2 * Math.PI, x, y, placed);

    var pending = idxs.slice(1), guard = 0;
    while (pending.length && guard++ < 400) {
      var done = -1;
      for (var p = 0; p < pending.length; p++) {
        var ring = mol.rings[pending[p]], cnt = 0;
        for (var t = 0; t < ring.length; t++) if (placed[ring[t]]) cnt++;
        if (cnt >= 2 && placeRingOnSharedEdge(ring, x, y, placed)) { done = p; break; }
      }
      if (done < 0) {
        for (var q = 0; q < pending.length; q++) {
          var ring2 = mol.rings[pending[q]], anchor = -1;
          for (var u = 0; u < ring2.length; u++) {
            if (placed[ring2[u]]) { anchor = ring2[u]; break; }
          }
          if (anchor >= 0) {
            placeRingAtSpiro(mol, ring2, anchor, x, y, placed);
            done = q; break;
          }
        }
      }
      if (done < 0) {
        placePolygon(mol.rings[pending[0]], offsetX + 6, 0, rnd() * 2 * Math.PI, x, y, placed);
        done = 0;
      }
      pending.splice(done, 1);
    }
    offsetX += 8;
  }

  placeChains(mol, x, y, placed, rnd);
  return { x: x, y: y };
}

/* -------------------------------------------------------------- relaxation */

function relax(mol, cons, pos, iterations) {
  var n = mol.atoms.length, x = pos.x, y = pos.y;
  var fx = new Float64Array(n), fy = new Float64Array(n);
  var cnt = new Float64Array(n);

  var constrained = {};
  for (var c = 0; c < cons.length; c++) constrained[pairKey(cons[c].i, cons[c].j)] = true;

  for (var it = 0; it < iterations; it++) {
    fx.fill(0); fy.fill(0); cnt.fill(0);

    for (var k = 0; k < cons.length; k++) {
      var con = cons[k], i = con.i, j = con.j;
      var dx = x[j] - x[i], dy = y[j] - y[i];
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (!(dist > 1e-9)) { dx = 1e-3; dy = 0; dist = 1e-3; }
      var pull = (dist - con.d) / dist * 0.5 * con.w;
      fx[i] += dx * pull; fy[i] += dy * pull;
      fx[j] -= dx * pull; fy[j] -= dy * pull;
      cnt[i] += con.w; cnt[j] += con.w;
    }

    /* soft repulsion only for close, unconstrained pairs */
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        if (constrained[pairKey(a, b)]) continue;
        var rx = x[b] - x[a], ry = y[b] - y[a];
        var rd = Math.sqrt(rx * rx + ry * ry);
        if (rd >= REPULSE_CUT) continue;
        if (!(rd > 1e-9)) { rx = 1e-3; ry = 0; rd = 1e-3; }
        var push = (rd - REPULSE_CUT) / rd * 0.15;
        fx[a] += rx * push; fy[a] += ry * push;
        fx[b] -= rx * push; fy[b] -= ry * push;
        cnt[a] += 0.3; cnt[b] += 0.3;
      }
    }

    for (var m = 0; m < n; m++) {
      var div = cnt[m] > 1 ? cnt[m] : 1;
      var sx = fx[m] / div, sy = fy[m] / div;
      var mag = Math.sqrt(sx * sx + sy * sy);
      if (mag > MAX_STEP) { sx = sx / mag * MAX_STEP; sy = sy / mag * MAX_STEP; }
      if (!isFinite(sx) || !isFinite(sy)) { sx = 0; sy = 0; }
      x[m] += sx; y[m] += sy;
    }
  }
  return pos;
}

/* ------------------------------------------------------------- scoring */

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  function cross(ox, oy, px, py, qx, qy) {
    return (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  }
  var d1 = cross(ax, ay, bx, by, cx, cy);
  var d2 = cross(ax, ay, bx, by, dx, dy);
  var d3 = cross(cx, cy, dx, dy, ax, ay);
  var d4 = cross(cx, cy, dx, dy, bx, by);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function countCrossings(mol, pos) {
  var bonds = mol.bonds, x = pos.x, y = pos.y, n = 0;
  for (var i = 0; i < bonds.length; i++) {
    for (var j = i + 1; j < bonds.length; j++) {
      var p = bonds[i], q = bonds[j];
      if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
      if (segmentsCross(x[p.a], y[p.a], x[p.b], y[p.b],
                        x[q.a], y[q.a], x[q.b], y[q.b])) n++;
    }
  }
  return n;
}

function countClosePairs(mol, pos) {
  var n = mol.atoms.length, x = pos.x, y = pos.y, c = 0;
  for (var a = 0; a < n; a++) {
    for (var b = a + 1; b < n; b++) {
      var dx = x[b] - x[a], dy = y[b] - y[a];
      if (Math.sqrt(dx * dx + dy * dy) < CLOSE_PAIR) c++;
    }
  }
  return c;
}

function scoreLayout(mol, pos) {
  return countCrossings(mol, pos) * 10 + countClosePairs(mol, pos) * 3;
}

/* ------------------------------------------------------- principal axis */

function orientToPrincipalAxis(pos) {
  var x = pos.x, y = pos.y, n = x.length;
  if (n < 2) return pos;
  var mx = 0, my = 0;
  for (var i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  var sxx = 0, syy = 0, sxy = 0;
  for (var j = 0; j < n; j++) {
    var dx = x[j] - mx, dy = y[j] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  var theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  var ct = Math.cos(-theta), st = Math.sin(-theta);
  for (var k = 0; k < n; k++) {
    var px = x[k] - mx, py = y[k] - my;
    x[k] = px * ct - py * st;
    y[k] = px * st + py * ct;
  }
  return pos;
}

/* ------------------------------------------------------------------ entry */

function computeLayout(mol, options) {
  options = options || {};
  var iterations = options.iterations || 420;
  var cons = buildConstraints(mol);
  var best = null, bestScore = Infinity;

  for (var s = 0; s < SEEDS.length; s++) {
    var rnd = mulberry32(SEEDS[s]);
    var pos = seedCoords(mol, rnd);
    relax(mol, cons, pos, iterations);

    var bad = false;
    for (var i = 0; i < pos.x.length; i++) {
      if (!isFinite(pos.x[i]) || !isFinite(pos.y[i]) ||
          Math.abs(pos.x[i]) > 1e6 || Math.abs(pos.y[i]) > 1e6) { bad = true; break; }
    }
    if (bad) continue;

    var score = scoreLayout(mol, pos);
    if (score < bestScore) { bestScore = score; best = pos; }
    if (bestScore === 0) break;
  }

  if (!best) {
    /* last resort: a plain circle, which is ugly but always finite */
    var n = mol.atoms.length;
    best = { x: new Float64Array(n), y: new Float64Array(n) };
    var radius = Math.max(1, n / (2 * Math.PI));
    for (var k = 0; k < n; k++) {
      best.x[k] = Math.cos(2 * Math.PI * k / n) * radius;
      best.y[k] = Math.sin(2 * Math.PI * k / n) * radius;
    }
    bestScore = scoreLayout(mol, best);
  }

  orientToPrincipalAxis(best);
  return {
    x: Array.prototype.slice.call(best.x),
    y: Array.prototype.slice.call(best.y),
    score: bestScore,
    crossings: countCrossings(mol, best)
  };
}

module.exports = {
  computeLayout: computeLayout,
  buildConstraints: buildConstraints,
  countCrossings: countCrossings,
  countClosePairs: countClosePairs,
  scoreLayout: scoreLayout,
  BOND_LEN: BOND_LEN
};
