/* ermotifs.js — the structural features an ERalpha ligand is judged on.
 *
 * molmodel.js already finds the groups that matter for any receptor (phenol,
 * hydroxyl, amide, steroid core). What belongs here is the part that is about
 * THIS pocket: the estradiol pharmacophore is two hydrogen-bonding ends about
 * 11 A apart with a rigid hydrophobic body between them, and the thing that
 * separates an agonist from a SERM is a side chain leaving the cavity toward
 * Asp351.
 *
 * Measured on the crystal poses in assets/pocket_scene.json, estradiol's own
 * O3-O17 distance is 10.9 A; the span window below is set from that and from
 * the other agonist complexes in the same file, not from a textbook.
 */
'use strict';

/* ---------------------------------------------------------------- helpers */

function isHydroxyl(mol, i) {
  var a = mol.atoms[i];
  return a.el === 'O' && a.nH > 0 && a.nbr.length === 1;
}

/* An OH on an aromatic carbon. Carboxylic OH is excluded by molmodel's own
 * rule and is not a phenol here either. */
function isPhenolO(mol, i) {
  if (!isHydroxyl(mol, i)) return false;
  var host = mol.atoms[i].nbr[0];
  return !!mol.atoms[host].arom;
}

function isPolar(mol, i) {
  var a = mol.atoms[i];
  return a.el === 'O' || a.el === 'N';
}

function doubleBonded(mol, i, el) {
  var a = mol.atoms[i];
  for (var k = 0; k < a.bidx.length; k++) {
    if (mol.bonds[a.bidx[k]].order === 2 && mol.atoms[a.nbr[k]].el === el) return a.nbr[k];
  }
  return -1;
}

function aromaticRings(mol) {
  var out = [];
  for (var r = 0; r < mol.rings.length; r++) {
    var ring = mol.rings[r], all = true;
    for (var i = 0; i < ring.length; i++) {
      if (!mol.atoms[ring[i]].arom) { all = false; break; }
    }
    if (all) out.push(ring);
  }
  return out;
}

/* Bond-count distance from `start` to every atom. */
function bfs(mol, start) {
  var dist = new Array(mol.atoms.length);
  for (var i = 0; i < dist.length; i++) dist[i] = -1;
  dist[start] = 0;
  var queue = [start];
  for (var q = 0; q < queue.length; q++) {
    var cur = queue[q], nbr = mol.atoms[cur].nbr;
    for (var k = 0; k < nbr.length; k++) {
      if (dist[nbr[k]] === -1) { dist[nbr[k]] = dist[cur] + 1; queue.push(nbr[k]); }
    }
  }
  return dist;
}

/* Longest run of acyclic carbons hanging off the ring systems. Fulvestrant's
 * nonyl tail and nonylphenol's nonyl chain are both this.
 *
 * The walk stays inside the acyclic carbon subgraph. Letting it cross the
 * rings instead measured the molecule's diameter, not a side chain, and that
 * is how mestranol - a 3-methyl ether of ethinylestradiol, with no tail at
 * all - came out with a chain of 8 and was called a SERD. */
function longestAcyclicCarbonChain(mol) {
  function loose(i) { return mol.atoms[i].el === 'C' && !mol.atoms[i].inRing; }
  var best = 0;
  for (var s = 0; s < mol.atoms.length; s++) {
    if (!loose(s)) continue;
    var dist = new Array(mol.atoms.length);
    for (var i = 0; i < dist.length; i++) dist[i] = -1;
    dist[s] = 0;
    var queue = [s];
    for (var q = 0; q < queue.length; q++) {
      var cur = queue[q], nbr = mol.atoms[cur].nbr;
      for (var k = 0; k < nbr.length; k++) {
        if (!loose(nbr[k]) || dist[nbr[k]] !== -1) continue;
        dist[nbr[k]] = dist[cur] + 1;
        queue.push(nbr[k]);
      }
    }
    for (var t = 0; t < dist.length; t++) {
      if (dist[t] + 1 > best) best = dist[t] + 1;
    }
  }
  return best;
}

/* ------------------------------------------------------------- the motifs */

function erMotifs(mol) {
  var m = {
    phenolRings: 0, phenolOs: [], polarOther: [],
    resorcinol: false, catechol: false, hydroquinone: false,
    aromaticSteroid: false, steroidCore: false, steroid17Polar: false,
    alkylPhenol: 0, bisphenolLike: false, stilbene: false, triaryl: false,
    flavonoid: false, chromanone: false,
    basicAmine: false, basicAmineN: [], sermTail: false, sermTailLength: 0,
    macrolactone: false, halophenol: false, phenolCount: 0,
    sulfinyl: false, sulfonyl: false, longChain: 0,
    span: null, spanBonds: 0, spanOk: false, spanSource: null,
    rigidBody: false
  };

  var i, j, k, r, ring;

  /* --- phenols, and the polar atoms that could play the 17-OH end ------- */
  for (i = 0; i < mol.atoms.length; i++) {
    if (isPhenolO(mol, i)) { m.phenolOs.push(i); m.phenolCount++; }
    else if (isPolar(mol, i)) m.polarOther.push(i);
  }

  var arom = aromaticRings(mol);
  var phenolRingIdx = [];
  for (r = 0; r < arom.length; r++) {
    ring = arom[r];
    var ohPositions = [];
    for (i = 0; i < ring.length; i++) {
      var nbr = mol.atoms[ring[i]].nbr;
      for (k = 0; k < nbr.length; k++) {
        if (isPhenolO(mol, nbr[k])) ohPositions.push(i);
      }
    }
    if (!ohPositions.length) continue;
    m.phenolRings++;
    phenolRingIdx.push(r);
    /* ring separation of two hydroxyls: 1 ortho, 2 meta, 3 para */
    for (i = 0; i < ohPositions.length; i++) {
      for (j = i + 1; j < ohPositions.length; j++) {
        var sep = Math.abs(ohPositions[i] - ohPositions[j]);
        sep = Math.min(sep, ring.length - sep);
        if (sep === 1) m.catechol = true;
        else if (sep === 2) m.resorcinol = true;
        else if (sep === 3) m.hydroquinone = true;
      }
    }
    /* halogen or a long alkyl on the same ring */
    for (i = 0; i < ring.length; i++) {
      var rn = mol.atoms[ring[i]].nbr;
      for (k = 0; k < rn.length; k++) {
        var nb = mol.atoms[rn[k]];
        if (nb.el === 'F' || nb.el === 'Cl' || nb.el === 'Br' || nb.el === 'I') {
          m.halophenol = true;
        }
        if (nb.el === 'C' && !nb.inRing) {
          var dist = bfs(mol, rn[k]), reach = 0;
          for (j = 0; j < mol.atoms.length; j++) {
            if (mol.atoms[j].el === 'C' && !mol.atoms[j].inRing &&
                dist[j] >= 0 && dist[j] + 1 > reach) reach = dist[j] + 1;
          }
          if (reach >= 4) m.alkylPhenol = Math.max(m.alkylPhenol, reach);
        }
      }
    }
  }

  /* --- estradiol-like core: a steroid whose A-ring went aromatic -------- */
  var fused = MOL.fusedRingSystems(mol);
  for (var f = 0; f < fused.length; f++) {
    var idxs = fused[f];
    if (idxs.length < 4) continue;
    var six = 0, five = 0, aromaticInCore = false, coreSet = {};
    for (k = 0; k < idxs.length; k++) {
      var rr = mol.rings[idxs[k]];
      if (rr.length === 6) six++;
      else if (rr.length === 5) five++;
      var allArom = true;
      for (i = 0; i < rr.length; i++) {
        coreSet[rr[i]] = true;
        if (!mol.atoms[rr[i]].arom) allArom = false;
      }
      if (allArom && rr.length === 6) aromaticInCore = true;
    }
    if (six >= 3 && five >= 1) {
      m.steroidCore = true;
      if (aromaticInCore) m.aromaticSteroid = true;
      /* a polar group on the five-membered (D) ring */
      for (k = 0; k < idxs.length; k++) {
        var ring5 = mol.rings[idxs[k]];
        if (ring5.length !== 5) continue;
        for (i = 0; i < ring5.length; i++) {
          var n5 = mol.atoms[ring5[i]].nbr;
          for (j = 0; j < n5.length; j++) {
            if (isHydroxyl(mol, n5[j]) || doubleBonded(mol, ring5[i], 'O') >= 0) {
              m.steroid17Polar = true;
            }
          }
        }
      }
    }
  }

  /* --- two phenols bridged by one atom (bisphenols) or by C=C (stilbene,
         triarylethylene) ------------------------------------------------- */
  if (m.phenolRings >= 2) {
    var ringOf = {};
    for (r = 0; r < phenolRingIdx.length; r++) {
      ring = arom[phenolRingIdx[r]];
      for (i = 0; i < ring.length; i++) ringOf[ring[i]] = r;
    }
    for (i = 0; i < mol.atoms.length; i++) {
      if (mol.atoms[i].inRing) continue;
      var seen = {};
      var nb2 = mol.atoms[i].nbr;
      for (k = 0; k < nb2.length; k++) {
        if (ringOf[nb2[k]] !== undefined) seen[ringOf[nb2[k]]] = true;
      }
      if (Object.keys(seen).length >= 2 &&
          (mol.atoms[i].el === 'C' || mol.atoms[i].el === 'S')) {
        m.bisphenolLike = true;
      }
    }
  }

  for (var b = 0; b < mol.bonds.length; b++) {
    var bond = mol.bonds[b];
    if (bond.order !== 2 || bond.arom) continue;
    var ea = mol.atoms[bond.a], eb = mol.atoms[bond.b];
    if (ea.el !== 'C' || eb.el !== 'C') continue;
    var arylCount = 0;
    [bond.a, bond.b].forEach(function (end) {
      var nn = mol.atoms[end].nbr;
      for (var q = 0; q < nn.length; q++) {
        if (mol.atoms[nn[q]].arom) arylCount++;
      }
    });
    if (arylCount >= 2) m.stilbene = true;
    if (arylCount >= 3) m.triaryl = true;
  }
  if (!m.triaryl) {
    for (i = 0; i < mol.atoms.length; i++) {
      if (mol.atoms[i].el !== 'C' || mol.atoms[i].arom) continue;
      var aryl = 0, nb3 = mol.atoms[i].nbr;
      for (k = 0; k < nb3.length; k++) if (mol.atoms[nb3[k]].arom) aryl++;
      if (aryl >= 3) m.triaryl = true;
    }
  }

  /* --- flavonoid: a pyranone fused to an aromatic ring ------------------ */
  for (r = 0; r < mol.rings.length; r++) {
    ring = mol.rings[r];
    if (ring.length !== 6) continue;
    var hasO = false, carbonyl = false;
    for (i = 0; i < ring.length; i++) {
      if (mol.atoms[ring[i]].el === 'O') hasO = true;
      if (mol.atoms[ring[i]].el === 'C' && doubleBonded(mol, ring[i], 'O') >= 0) {
        carbonyl = true;
      }
    }
    if (!hasO || !carbonyl) continue;
    /* fused to an aromatic six-ring? */
    for (var r2 = 0; r2 < mol.rings.length; r2++) {
      if (r2 === r) continue;
      var other = mol.rings[r2], sharedCount = 0, allArom2 = true;
      for (i = 0; i < other.length; i++) {
        if (ring.indexOf(other[i]) >= 0) sharedCount++;
        if (!mol.atoms[other[i]].arom) allArom2 = false;
      }
      if (sharedCount >= 2 && allArom2) {
        m.flavonoid = true;
        var allAromRing = true;
        for (i = 0; i < ring.length; i++) if (!mol.atoms[ring[i]].arom) allAromRing = false;
        if (!allAromRing) m.chromanone = true;
      }
    }
  }

  /* --- the SERM side chain --------------------------------------------- */
  for (i = 0; i < mol.atoms.length; i++) {
    var at = mol.atoms[i];
    if (at.el !== 'N' || at.arom) continue;
    /* amide, nitro and nitrile nitrogens are not basic */
    var amide = false, carbons = 0;
    var nb4 = at.nbr;
    for (k = 0; k < nb4.length; k++) {
      var nbA = mol.atoms[nb4[k]];
      if (nbA.el === 'C') {
        carbons++;
        if (doubleBonded(mol, nb4[k], 'O') >= 0 || doubleBonded(mol, nb4[k], 'S') >= 0) {
          amide = true;
        }
      }
      if (mol.bonds[at.bidx[k]].order >= 2) amide = true;
    }
    if (amide || carbons < 2) continue;
    m.basicAmine = true;
    m.basicAmineN.push(i);

    /* ...reached from an aryl ether oxygen through a short chain. This is
     * the tamoxifen / raloxifene / bazedoxifene tail, and the only part of
     * those molecules that does not fit inside the cavity. */
    var distN = bfs(mol, i);
    for (j = 0; j < mol.atoms.length; j++) {
      if (mol.atoms[j].el !== 'O' || mol.atoms[j].nH > 0) continue;
      var arylEther = false, nb5 = mol.atoms[j].nbr;
      for (k = 0; k < nb5.length; k++) if (mol.atoms[nb5[k]].arom) arylEther = true;
      if (!arylEther) continue;
      if (distN[j] > 0 && distN[j] <= 5) {
        m.sermTail = true;
        if (!m.sermTailLength || distN[j] < m.sermTailLength) m.sermTailLength = distN[j];
      }
    }
  }

  /* --- odds and ends --------------------------------------------------- */
  for (i = 0; i < mol.atoms.length; i++) {
    if (mol.atoms[i].el !== 'S') continue;
    var oDouble = 0, at2 = mol.atoms[i];
    for (k = 0; k < at2.bidx.length; k++) {
      if (mol.bonds[at2.bidx[k]].order === 2 && mol.atoms[at2.nbr[k]].el === 'O') oDouble++;
    }
    if (oDouble === 1) m.sulfinyl = true;
    else if (oDouble >= 2) m.sulfonyl = true;
  }

  for (r = 0; r < mol.rings.length; r++) {
    ring = mol.rings[r];
    if (ring.length < 10) continue;
    for (i = 0; i < ring.length; i++) {
      if (mol.atoms[ring[i]].el !== 'C') continue;
      if (doubleBonded(mol, ring[i], 'O') < 0) continue;
      var esterO = false, nb6 = mol.atoms[ring[i]].nbr;
      for (k = 0; k < nb6.length; k++) {
        if (mol.atoms[nb6[k]].el === 'O' && mol.atoms[nb6[k]].nbr.length === 2) esterO = true;
      }
      if (esterO) m.macrolactone = true;
    }
  }

  m.longChain = longestAcyclicCarbonChain(mol);
  m.rigidBody = mol.rings.length >= 2 && MOL.computeDescriptors(mol).rotb <= 6;

  /* --- the two-point span ---------------------------------------------- */
  var span = measureSpan(mol, m);
  m.span = span.distance;
  m.spanBonds = span.bonds;
  m.spanSource = span.source;
  m.spanOk = span.ok;
  m.spanPair = span.pair;
  return m;
}

/* The two-point span, counted in bonds.
 *
 * Measured on the crystal ligands in assets/pocket_scene.json, the pair of
 * polar atoms that actually reaches both anchors sits 9 to 13 bonds apart,
 * every time:
 *
 *   agonist conformation     estradiol 10 bonds / 11.0 A, THC 11 / 11.9,
 *                            17a-vinyl-E2 10 / 11.1, genistein 11 / 12.2,
 *                            bicyclononene phenol 10 / 10.4
 *   antagonist conformation  4-OHT 13 / 11.7, raloxifene 10 / 11.7,
 *                            benzoxathiins 10 / 11.6
 *
 * The count is used rather than a distance because this tool has no reliable
 * geometry to measure: layout3d.js embeds a conformer good enough to draw,
 * not to measure, and it folds flexible ligands - diethylstilbestrol comes
 * out of it with its two phenols 5.7 A apart against 11.9 A in 1L2I. A bond
 * count cannot fold. Over the 39 crystal pairs above 6 bonds, distance is
 * 1.10 A per bond for the anchoring pairs, so that factor converts the count
 * for display; side-chain oxygens that fold back run lower (0.75-0.9) and the
 * displayed distance carries +-1.5 A because of them.
 *
 * The span says both anchors are reachable, not which way the receptor will
 * go: SERMs pass it too, and what separates them is the side chain.
 */
var SPAN_MIN_BONDS = 9;
var SPAN_MAX_BONDS = 13;
var A_PER_BOND = 1.10;

function measureSpan(mol, m) {
  var out = { distance: null, bonds: 0, source: null, ok: false, pair: null };
  if (!m.phenolOs.length) return out;
  var ends = m.polarOther.concat(m.phenolOs);
  var best = null;
  for (var i = 0; i < m.phenolOs.length; i++) {
    var a = m.phenolOs[i];
    var dist = bfs(mol, a);
    for (var j = 0; j < ends.length; j++) {
      var b = ends[j];
      if (b === a || dist[b] <= 0) continue;
      var bonds = dist[b];
      var inWindow = bonds >= SPAN_MIN_BONDS && bonds <= SPAN_MAX_BONDS;
      /* prefer a pair inside the window; among those, the longest, which is
       * the one spanning the body rather than cutting across a ring */
      var score = inWindow ? 0 : Math.min(Math.abs(bonds - SPAN_MIN_BONDS),
                                          Math.abs(bonds - SPAN_MAX_BONDS));
      if (!best || score < best.score ||
          (score === best.score && inWindow && bonds > best.bonds) ||
          (score === best.score && !inWindow && bonds < best.bonds)) {
        best = { score: score, bonds: bonds, a: a, b: b, ok: inWindow };
      }
    }
  }
  if (!best) return out;
  out.bonds = best.bonds;
  out.distance = best.bonds * A_PER_BOND;
  out.source = 'bond count x ' + A_PER_BOND.toFixed(2) + ' A';
  out.ok = best.ok;
  out.pair = [best.a, best.b];
  return out;
}

var ERM = {
  erMotifs: erMotifs,
  measureSpan: measureSpan,
  isPhenolO: isPhenolO,
  SPAN_MIN_BONDS: SPAN_MIN_BONDS,
  SPAN_MAX_BONDS: SPAN_MAX_BONDS,
  A_PER_BOND: A_PER_BOND
};
