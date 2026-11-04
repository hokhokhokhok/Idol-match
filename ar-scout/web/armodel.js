/* armodel.js — SMILES parser, descriptors, Morgan fingerprint, structural motifs.
 * No dependencies. Shared by the browser bundle and the Node test suite.
 */
'use strict';

/* ---------------------------------------------------------------- constants */

var ATOMIC_WEIGHT = {
  H: 1.008, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998,
  Na: 22.990, Mg: 24.305, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45,
  K: 39.098, Ca: 40.078, Fe: 55.845, Zn: 65.38, Se: 78.971, Br: 79.904,
  I: 126.904
};

var DEFAULT_VALENCE = {
  B: 3, C: 4, N: 3, O: 2, P: 3, S: 2, F: 1, Cl: 1, Br: 1, I: 1,
  Se: 2, Si: 4
};

/* Two-character tokens must be tested before single-character ones. */
var ORGANIC_TWO = ['Cl', 'Br'];
var ORGANIC_ONE = ['B', 'C', 'N', 'O', 'P', 'S', 'F', 'I'];
var AROMATIC_TWO = ['se', 'as'];
var AROMATIC_ONE = ['c', 'n', 'o', 's', 'p'];

var BOND_CHARS = {
  '-': { order: 1, arom: false },
  '=': { order: 2, arom: false },
  '#': { order: 3, arom: false },
  '$': { order: 4, arom: false },
  ':': { order: 1, arom: true },
  '/': { order: 1, arom: false },
  '\\': { order: 1, arom: false }
};

/* ------------------------------------------------------------------ parser */

function makeAtom(el, arom) {
  return {
    el: el,
    arom: !!arom,
    /* aromatic because the SMILES said so (lower case), as opposed to
     * aromatic because perception worked it out from a Kekule ring */
    aromInput: !!arom,
    charge: 0,
    isotope: 0,
    chirality: null,
    nH: 0,
    explicitH: false,
    bracket: false,
    nbr: [],
    bidx: [],
    inRing: false,
    ringSizes: []
  };
}

/* Parses the bracket body of an atom, e.g. "nH", "N+", "O-", "C@@H", "13C". */
function parseBracketAtom(body) {
  var i = 0, iso = '';
  while (i < body.length && body[i] >= '0' && body[i] <= '9') { iso += body[i]; i++; }

  var el = null, arom = false;
  var two = body.substr(i, 2);
  if (AROMATIC_TWO.indexOf(two) >= 0) { el = two[0].toUpperCase() + two[1]; arom = true; i += 2; }
  else if (/^[A-Z][a-z]$/.test(two) && ATOMIC_WEIGHT[two] !== undefined) { el = two; i += 2; }
  else if (/^[A-Z]$/.test(body[i])) { el = body[i]; i += 1; }
  else if (/^[a-z]$/.test(body[i])) { el = body[i].toUpperCase(); arom = true; i += 1; }
  else if (body[i] === '*') { el = 'C'; i += 1; }
  else throw new Error('bad bracket atom: [' + body + ']');

  var atom = makeAtom(el, arom);
  atom.bracket = true;
  if (iso) atom.isotope = parseInt(iso, 10); /* parsed, deliberately unused */

  while (i < body.length) {
    var c = body[i];
    if (c === '@') {                       /* chirality: parsed, unused */
      atom.chirality = body[i + 1] === '@' ? '@@' : '@';
      i += atom.chirality.length;
    } else if (c === 'H') {
      i++;
      var cnt = '';
      while (i < body.length && body[i] >= '0' && body[i] <= '9') { cnt += body[i]; i++; }
      atom.nH = cnt ? parseInt(cnt, 10) : 1;
      atom.explicitH = true;
    } else if (c === '+' || c === '-') {
      i++;
      var sign = c === '+' ? 1 : -1;
      var mag = '';
      while (i < body.length && body[i] >= '0' && body[i] <= '9') { mag += body[i]; i++; }
      if (mag) atom.charge += sign * parseInt(mag, 10);
      else {
        var run = 1;
        while (i < body.length && body[i] === c) { run++; i++; }
        atom.charge += sign * run;
      }
    } else if (c === ':') {                /* atom map: parsed, unused */
      i++;
      while (i < body.length && body[i] >= '0' && body[i] <= '9') i++;
    } else {
      throw new Error('bad bracket atom: [' + body + ']');
    }
  }
  return atom;
}

function parseSmiles(smiles) {
  if (typeof smiles !== 'string') throw new Error('SMILES must be a string');
  var smi = smiles.trim();
  if (!smi.length) throw new Error('empty SMILES');

  var atoms = [], bonds = [], bondSeen = {};
  var ringOpen = {};          /* ring-closure number -> {atom, order, arom} */
  var stack = [];
  var prev = -1;
  var pending = null;         /* bond spec waiting for the next atom */
  var i = 0;

  function addBond(a, b, spec) {
    if (a < 0 || b < 0 || a === b) return;
    var key = a < b ? a + '_' + b : b + '_' + a;
    if (bondSeen[key] !== undefined) return;   /* never double-bond a pair */
    var order, arom;
    if (spec) { order = spec.order; arom = spec.arom; }
    else if (atoms[a].arom && atoms[b].arom) { order = 1; arom = true; }
    else { order = 1; arom = false; }
    var idx = bonds.length;
    bondSeen[key] = idx;
    bonds.push({ a: a, b: b, order: order, arom: arom, inRing: false });
    atoms[a].nbr.push(b); atoms[a].bidx.push(idx);
    atoms[b].nbr.push(a); atoms[b].bidx.push(idx);
  }

  function pushAtom(atom) {
    atoms.push(atom);
    var idx = atoms.length - 1;
    if (prev >= 0) addBond(prev, idx, pending);
    pending = null;
    prev = idx;
  }

  while (i < smi.length) {
    var ch = smi[i];

    if (ch === ' ' || ch === '\t') { i++; continue; }

    if (ch === '[') {
      var close = smi.indexOf(']', i);
      if (close < 0) throw new Error('unclosed [ in SMILES');
      pushAtom(parseBracketAtom(smi.substring(i + 1, close)));
      i = close + 1;
      continue;
    }

    if (ch === '(') { stack.push(prev); i++; continue; }
    if (ch === ')') {
      if (!stack.length) throw new Error('unbalanced ) in SMILES');
      prev = stack.pop(); i++; continue;
    }
    if (ch === '.') { prev = -1; pending = null; i++; continue; }

    if (BOND_CHARS[ch]) {
      pending = BOND_CHARS[ch];
      i++;
      continue;
    }

    if (ch === '%' || (ch >= '0' && ch <= '9')) {
      var num;
      if (ch === '%') {
        num = smi.substr(i + 1, 2);
        if (!/^\d\d$/.test(num)) throw new Error('bad %nn ring closure');
        i += 3;
      } else { num = ch; i += 1; }
      if (prev < 0) throw new Error('ring closure before any atom');
      if (ringOpen[num] !== undefined) {
        var open = ringOpen[num];
        delete ringOpen[num];
        addBond(open.atom, prev, open.spec || pending);
      } else {
        ringOpen[num] = { atom: prev, spec: pending };
      }
      pending = null;
      continue;
    }

    var t2 = smi.substr(i, 2);
    if (ORGANIC_TWO.indexOf(t2) >= 0) { pushAtom(makeAtom(t2, false)); i += 2; continue; }
    if (AROMATIC_TWO.indexOf(t2) >= 0) {
      pushAtom(makeAtom(t2[0].toUpperCase() + t2[1], true)); i += 2; continue;
    }
    if (ORGANIC_ONE.indexOf(ch) >= 0) { pushAtom(makeAtom(ch, false)); i += 1; continue; }
    if (AROMATIC_ONE.indexOf(ch) >= 0) { pushAtom(makeAtom(ch.toUpperCase(), true)); i += 1; continue; }
    if (ch === '*') { pushAtom(makeAtom('C', false)); i += 1; continue; }

    throw new Error('unexpected character "' + ch + '" at ' + i + ' in SMILES');
  }

  if (stack.length) throw new Error('unbalanced ( in SMILES');
  for (var k in ringOpen) {
    if (Object.prototype.hasOwnProperty.call(ringOpen, k)) {
      throw new Error('unclosed ring bond ' + k + ' in SMILES');
    }
  }
  if (!atoms.length) throw new Error('no atoms parsed from SMILES');

  var mol = { smiles: smi, atoms: atoms, bonds: bonds, rings: [] };
  perceiveRings(mol);
  perceiveAromaticity(mol);
  addImplicitHydrogens(mol);
  return mol;
}

/* ------------------------------------------------------- aromaticity */

var AROMATIC_ELEMENTS = { C: 1, N: 1, O: 1, S: 1, P: 1, Se: 1 };

/* Hueckel electron count for one ring.
 *
 * Lower-case SMILES already says which atoms are aromatic, but a Kekule
 * spelling of the same molecule does not - and PubChem hands out Kekule
 * forms. Without this, "c1ccccc1" and "C1=CC=CC=C1" produce different
 * fingerprints, so the same compound scores differently depending on how
 * it was typed.
 */
function ringPiElectrons(mol, ring) {
  var inRing = {}, i;
  for (i = 0; i < ring.length; i++) inRing[ring[i]] = true;

  var electrons = 0;
  for (i = 0; i < ring.length; i++) {
    var idx = ring[i], at = mol.atoms[idx];
    if (!AROMATIC_ELEMENTS[at.el]) return -1;

    var innerDouble = false, outerPartner = -1, j;
    for (j = 0; j < at.bidx.length; j++) {
      var bd = mol.bonds[at.bidx[j]], nb = at.nbr[j];
      if (bd.order === 3 || bd.order === 4) return -1;
      if (bd.order === 2) {
        if (inRing[nb]) innerDouble = true;
        else outerPartner = nb;
      }
    }

    if (innerDouble) { electrons += 1; continue; }

    if (outerPartner >= 0) {
      /* A double bond leaving the ring is either a fusion bond into another
       * ring, which still shares its electron, or a carbonyl-like group,
       * which donates none. A plain exocyclic alkene (fulvene) breaks it. */
      if (mol.atoms[outerPartner].inRing) { electrons += 1; continue; }
      var oel = mol.atoms[outerPartner].el;
      if (oel === 'O' || oel === 'S' || oel === 'N') continue;
      return -1;
    }

    if (at.arom) {
      /* Already flagged by lower-case input: whether it offers a pi bond or
       * a lone pair is decided by the valence it has left. Implicit
       * hydrogens are not assigned yet, so only explicit ones count. */
      var sigma = at.nbr.length;
      var val = targetValence(at.el, at.charge, sigma);
      var spare = (val === null ? 0 : val) - sigma - (at.explicitH ? at.nH : 0);
      electrons += spare >= 1 ? 1 : 2;
      continue;
    }

    if (at.el === 'C') {
      if (at.charge < 0) { electrons += 2; continue; }
      return -1;                       /* sp3 carbon breaks conjugation */
    }
    if (at.charge > 0 && (at.el === 'N' || at.el === 'P')) return -1;
    electrons += 2;                    /* heteroatom lone pair */
  }
  return electrons;
}

function perceiveAromaticity(mol) {
  /* Two aromatic atoms joined outside a ring - the biaryl bond of a
   * flavone, say - make a plain single bond. The parser cannot know that
   * while reading, so it optimistically flags any bond between two
   * lower-case atoms; now that rings are known, take it back. Otherwise
   * the same molecule written with an explicit "-" fingerprints
   * differently from one written without. */
  for (var b = 0; b < mol.bonds.length; b++) {
    if (!mol.bonds[b].inRing) mol.bonds[b].arom = false;
  }

  var changed = true, guard = 0;
  while (changed && guard++ < 5) {
    changed = false;
    for (var r = 0; r < mol.rings.length; r++) {
      var ring = mol.rings[r];
      if (ring.length < 5 || ring.length > 7) continue;

      var allArom = true, t;
      for (t = 0; t < ring.length; t++) {
        if (!mol.atoms[ring[t]].arom) { allArom = false; break; }
      }
      if (allArom) continue;           /* nothing to add */

      var e = ringPiElectrons(mol, ring);
      if (e < 2 || (e - 2) % 4 !== 0) continue;

      for (t = 0; t < ring.length; t++) {
        var at = mol.atoms[ring[t]];
        if (!at.arom) { at.arom = true; changed = true; }
        var bi = bondBetween(mol, ring[t], ring[(t + 1) % ring.length]);
        if (bi >= 0 && !mol.bonds[bi].arom) { mol.bonds[bi].arom = true; changed = true; }
      }
    }
  }
}

/* ------------------------------------------------------------- ring finding */

function components(mol) {
  var n = mol.atoms.length, seen = new Array(n).fill(false), count = 0;
  for (var s = 0; s < n; s++) {
    if (seen[s]) continue;
    count++;
    var q = [s]; seen[s] = true;
    while (q.length) {
      var v = q.pop(), nb = mol.atoms[v].nbr;
      for (var j = 0; j < nb.length; j++) if (!seen[nb[j]]) { seen[nb[j]] = true; q.push(nb[j]); }
    }
  }
  return count;
}

/* Shortest path between a and b that does not use bond `skip`. */
function shortestPathExcluding(mol, a, b, skip) {
  var n = mol.atoms.length;
  var prevA = new Array(n).fill(-1);
  var seen = new Array(n).fill(false);
  var q = [a]; seen[a] = true;
  while (q.length) {
    var v = q.shift();
    if (v === b) break;
    var at = mol.atoms[v];
    for (var j = 0; j < at.nbr.length; j++) {
      if (at.bidx[j] === skip) continue;
      var w = at.nbr[j];
      if (seen[w]) continue;
      seen[w] = true; prevA[w] = v; q.push(w);
    }
  }
  if (!seen[b]) return null;
  var path = [b], cur = b;
  while (cur !== a) { cur = prevA[cur]; if (cur < 0) return null; path.push(cur); }
  return path;
}

/* Ring count from the cyclomatic number; rings themselves from per-bond
 * shortest cycles, smallest first. Not a true SSSR but stable and cheap. */
function perceiveRings(mol) {
  var n = mol.atoms.length, m = mol.bonds.length;
  var nRings = m - n + components(mol);
  mol.ringCount = Math.max(0, nRings);
  mol.rings = [];
  if (nRings <= 0) return;

  var cands = [];
  for (var bi = 0; bi < m; bi++) {
    var bd = mol.bonds[bi];
    var p = shortestPathExcluding(mol, bd.a, bd.b, bi);
    if (p && p.length >= 3) cands.push(p);
  }
  cands.sort(function (x, y) { return x.length - y.length; });

  var seenKeys = {}, out = [];
  for (var c = 0; c < cands.length && out.length < nRings; c++) {
    var key = cands[c].slice().sort(function (x, y) { return x - y; }).join(',');
    if (seenKeys[key]) continue;
    seenKeys[key] = true;
    out.push(cands[c]);
  }
  mol.rings = out;

  for (var r = 0; r < out.length; r++) {
    var ring = out[r];
    for (var t = 0; t < ring.length; t++) {
      var at = mol.atoms[ring[t]];
      at.inRing = true;
      at.ringSizes.push(ring.length);
      var u = ring[t], v = ring[(t + 1) % ring.length];
      var bk = bondBetween(mol, u, v);
      if (bk >= 0) mol.bonds[bk].inRing = true;
    }
  }
}

function bondBetween(mol, u, v) {
  var at = mol.atoms[u];
  for (var j = 0; j < at.nbr.length; j++) if (at.nbr[j] === v) return at.bidx[j];
  return -1;
}

/* --------------------------------------------------------------- hydrogens */

function bondOrderSum(mol, idx) {
  var at = mol.atoms[idx], s = 0;
  for (var j = 0; j < at.bidx.length; j++) {
    var o = mol.bonds[at.bidx[j]].order;
    s += (o === 4 ? 4 : o);
  }
  return s;
}

function targetValence(el, charge, orderSum) {
  var base = DEFAULT_VALENCE[el];
  if (base === undefined) return null;
  /* Group 16: a charge moves the valence either way, so thiolate S- takes
   * one bond and sulfonium S+ takes three. Only neutral S goes hypervalent. */
  if (el === 'S' || el === 'Se') {
    if (charge !== 0) return Math.max(1, 2 + charge);
    if (orderSum > 2) return orderSum > 4 ? 6 : 4;
    return 2;
  }
  if (el === 'P') {
    if (charge !== 0) return Math.max(1, 3 + charge);
    return orderSum > 3 ? 5 : 3;
  }
  if (el === 'N') return Math.max(1, 3 + charge);
  if (el === 'O') return Math.max(1, 2 + charge);
  if (el === 'C' && charge !== 0) return 3;
  return base;
}

function addImplicitHydrogens(mol) {
  for (var i = 0; i < mol.atoms.length; i++) {
    var at = mol.atoms[i];
    if (at.explicitH) continue;             /* bracket H count wins outright */
    var sum = bondOrderSum(mol, i);
    var val = targetValence(at.el, at.charge, sum);
    if (val === null) { at.nH = 0; continue; }

    /* An aromatic atom carries one formal double bond inside the ring.
     * Pyrrole-type N is the exception: it donates its lone pair to the
     * sextet instead, so it has three sigma bonds and no double bond.
     * That only applies when neutral — a pyridinium or N-oxide nitrogen
     * also has three connections but keeps its ring double bond, so it
     * must still get the correction or it gains a phantom hydrogen. */
    if (at.aromInput) {
      var pyrroleLike = (at.el === 'N' || at.el === 'P') &&
                        at.nbr.length >= 3 && at.charge === 0;
      /* The correction stands in for a double bond that lower-case SMILES
       * leaves unwritten. If the atom already carries an explicit multiple
       * bond - an exocyclic carbonyl on an aromatic carbon - it is already
       * counted and must not be added twice. A Kekule ring never reaches
       * here, because only lower-case input sets aromInput. */
      var hasMultiple = false;
      for (var b = 0; b < at.bidx.length; b++) {
        if (mol.bonds[at.bidx[b]].order >= 2) { hasMultiple = true; break; }
      }
      if (!pyrroleLike && !hasMultiple) sum += 1;
    }
    at.nH = Math.max(0, val - sum);
  }
}

/* -------------------------------------------------------------- properties */

function isUnsaturatedCarbon(mol, idx) {
  var at = mol.atoms[idx];
  if (at.arom) return true;
  for (var j = 0; j < at.bidx.length; j++) {
    var o = mol.bonds[at.bidx[j]].order;
    if (o === 2 || o === 3 || o === 4 || mol.bonds[at.bidx[j]].arom) return true;
  }
  return false;
}

function hasHeteroNeighbour(mol, idx) {
  var at = mol.atoms[idx];
  for (var j = 0; j < at.nbr.length; j++) {
    var e = mol.atoms[at.nbr[j]].el;
    if (e !== 'C' && e !== 'H') return true;
  }
  return false;
}

function neighbourEls(mol, idx) {
  var at = mol.atoms[idx], out = [];
  for (var j = 0; j < at.nbr.length; j++) out.push(mol.atoms[at.nbr[j]].el);
  return out;
}

function doubleBondedTo(mol, idx, el) {
  var at = mol.atoms[idx];
  for (var j = 0; j < at.bidx.length; j++) {
    var bd = mol.bonds[at.bidx[j]];
    if (bd.order === 2 && mol.atoms[at.nbr[j]].el === el) return at.nbr[j];
  }
  return -1;
}

function countDoubleBondedTo(mol, idx, el) {
  var at = mol.atoms[idx], c = 0;
  for (var j = 0; j < at.bidx.length; j++) {
    var bd = mol.bonds[at.bidx[j]];
    if (bd.order === 2 && mol.atoms[at.nbr[j]].el === el) c++;
  }
  return c;
}

function isNitroNitrogen(mol, idx) {
  var at = mol.atoms[idx];
  if (at.el !== 'N') return false;
  var oxy = 0, dbl = 0;
  for (var j = 0; j < at.nbr.length; j++) {
    if (mol.atoms[at.nbr[j]].el === 'O') {
      oxy++;
      if (mol.bonds[at.bidx[j]].order === 2) dbl++;
    }
  }
  return oxy >= 2 && (dbl >= 1 || at.charge > 0);
}

function isNitroOxygen(mol, idx) {
  var at = mol.atoms[idx];
  if (at.el !== 'O') return false;
  for (var j = 0; j < at.nbr.length; j++) {
    if (isNitroNitrogen(mol, at.nbr[j])) return true;
  }
  return false;
}

function molecularFormula(mol) {
  var counts = {}, hTotal = 0;
  for (var i = 0; i < mol.atoms.length; i++) {
    var el = mol.atoms[i].el;
    counts[el] = (counts[el] || 0) + 1;
    hTotal += mol.atoms[i].nH;
  }
  if (hTotal) counts.H = (counts.H || 0) + hTotal;

  var out = '';
  function emit(el) {
    if (!counts[el]) return;
    out += el + (counts[el] > 1 ? counts[el] : '');
    delete counts[el];
  }
  emit('C'); emit('H');
  Object.keys(counts).sort().forEach(emit);
  return out;
}

function molecularWeight(mol) {
  var w = 0;
  for (var i = 0; i < mol.atoms.length; i++) {
    var at = mol.atoms[i];
    var aw = ATOMIC_WEIGHT[at.el];
    if (aw === undefined) throw new Error('no atomic weight for ' + at.el);
    w += aw + at.nH * ATOMIC_WEIGHT.H;
  }
  return w;
}

/* ---- TPSA (Ertl 2000 polar-surface contributions, N and O only) --------- */

function tpsa(mol) {
  var total = 0;
  for (var i = 0; i < mol.atoms.length; i++) {
    var at = mol.atoms[i];
    if (at.el !== 'N' && at.el !== 'O') continue;
    var nH = at.nH, deg = at.nbr.length, sum = bondOrderSum(mol, i);
    var c = 0;

    if (at.el === 'N') {
      if (at.arom) {
        if (nH > 0) c = at.charge > 0 ? 14.14 : 15.79;
        else if (deg >= 3) c = at.charge > 0 ? 4.10 : 4.41;
        else c = 12.89;
      } else if (at.charge > 0) {
        if (sum - nH >= 4) c = 0.00;
        else if (nH === 0) c = 3.01;
        else if (nH === 1) c = 4.44;
        else c = 16.61;
      } else if (isNitroNitrogen(mol, i)) {
        c = 11.68;
      } else if (sum - nH >= 3 && deg === 1) {
        c = 23.79;                                     /* nitrile */
      } else if (nH === 0) {
        c = deg >= 3 ? 3.24 : 12.36;
      } else if (nH === 1) {
        c = deg >= 2 ? 12.03 : 23.85;
      } else {
        c = 26.02;
      }
    } else {
      if (at.arom) c = 13.14;
      else if (at.charge < 0) c = 23.06;
      else if (nH > 0) c = 20.23;
      else if (countDoubleBondedTo(mol, i, 'C') > 0 || sum >= 2 && deg === 1) c = 17.07;
      else c = 9.23;
    }
    total += c;
  }
  return total;
}

/* ---- Crippen-style clogP ------------------------------------------------ */

var LOGP = {
  C_SAT: 0.1441,        /* saturated carbon, carbon neighbours only          */
  C_SAT_HETERO: 0.0,    /* saturated carbon next to a heteroatom             */
  C_UNSAT: 0.2713,      /* aromatic or multiply-bonded carbon                */
  H_ON_C: 0.0615,
  H_ON_HETERO: -0.2200,
  N_AMIDE: -0.5500,
  N_AROM: -0.3187,
  N_NITRILE: -0.3239,
  N_NITRO: -0.3000,
  N_AMINE1: -1.0190,
  N_AMINE2: -0.7096,
  N_AMINE3: -0.4458,
  O_NITRO: -0.2000,
  O_HYDROXYL: -0.2893,
  O_ETHER: -0.0684,
  O_AROM: 0.1129,
  O_CARBONYL: -0.1526,
  O_ANION: -0.9000,
  F: 0.4202,
  F_POLY: 0.1500,       /* fluorine on a poly-fluorinated carbon            */
  Cl: 0.6895,
  Br: 0.8456,
  I: 0.8857,
  S_THIO: 0.6482,
  S_OXIDISED: -0.0024,
  P: 0.0000,
  B: 0.6000,
  Se: 0.6500,
  Si: 0.1000,
  OTHER: 0.0000
};

function fluorineCountOn(mol, idx) {
  var els = neighbourEls(mol, idx), c = 0;
  for (var j = 0; j < els.length; j++) if (els[j] === 'F') c++;
  return c;
}

function isAmideNitrogen(mol, idx) {
  var at = mol.atoms[idx];
  if (at.el !== 'N') return false;
  for (var j = 0; j < at.nbr.length; j++) {
    var nb = at.nbr[j];
    if (mol.atoms[nb].el !== 'C') continue;
    if (doubleBondedTo(mol, nb, 'O') >= 0 || doubleBondedTo(mol, nb, 'S') >= 0) return true;
  }
  return false;
}

function clogp(mol) {
  var total = 0;
  for (var i = 0; i < mol.atoms.length; i++) {
    var at = mol.atoms[i], el = at.el, c;

    if (el === 'C') {
      if (isUnsaturatedCarbon(mol, i)) c = LOGP.C_UNSAT;
      else c = hasHeteroNeighbour(mol, i) ? LOGP.C_SAT_HETERO : LOGP.C_SAT;
    } else if (el === 'N') {
      if (isNitroNitrogen(mol, i)) c = LOGP.N_NITRO;
      else if (at.arom) c = LOGP.N_AROM;
      else if (bondOrderSum(mol, i) - at.nH >= 3 && at.nbr.length === 1) c = LOGP.N_NITRILE;
      else if (isAmideNitrogen(mol, i)) c = LOGP.N_AMIDE;
      else if (at.nH >= 2) c = LOGP.N_AMINE1;
      else if (at.nH === 1) c = LOGP.N_AMINE2;
      else c = LOGP.N_AMINE3;
    } else if (el === 'O') {
      if (isNitroOxygen(mol, i)) c = LOGP.O_NITRO;
      else if (at.charge < 0) c = LOGP.O_ANION;
      else if (at.arom) c = LOGP.O_AROM;
      else if (at.nH > 0) c = LOGP.O_HYDROXYL;
      else if (countDoubleBondedTo(mol, i, 'C') > 0 || countDoubleBondedTo(mol, i, 'N') > 0 ||
               countDoubleBondedTo(mol, i, 'S') > 0) c = LOGP.O_CARBONYL;
      else c = LOGP.O_ETHER;
    } else if (el === 'F') {
      var host = at.nbr.length ? at.nbr[0] : -1;
      c = (host >= 0 && fluorineCountOn(mol, host) >= 2) ? LOGP.F_POLY : LOGP.F;
    } else if (el === 'S') {
      c = countDoubleBondedTo(mol, i, 'O') > 0 ? LOGP.S_OXIDISED : LOGP.S_THIO;
    } else if (LOGP[el] !== undefined) {
      c = LOGP[el];
    } else {
      c = LOGP.OTHER;
    }

    total += c;
    if (at.nH) {
      total += at.nH * (el === 'C' ? LOGP.H_ON_C : LOGP.H_ON_HETERO);
    }
  }
  return total;
}

/* ---- the rest of the descriptor block ---------------------------------- */

function hbd(mol) {
  var n = 0;
  for (var i = 0; i < mol.atoms.length; i++) {
    var at = mol.atoms[i];
    if ((at.el === 'N' || at.el === 'O') && at.nH > 0) n += at.nH;
  }
  return n;
}

function hba(mol) {
  var n = 0;
  for (var i = 0; i < mol.atoms.length; i++) {
    var el = mol.atoms[i].el;
    if (el === 'N' || el === 'O') n++;
  }
  return n;
}

function rotatableBonds(mol) {
  var n = 0;
  for (var bi = 0; bi < mol.bonds.length; bi++) {
    var bd = mol.bonds[bi];
    if (bd.inRing || bd.arom || bd.order !== 1) continue;
    var a = mol.atoms[bd.a], b = mol.atoms[bd.b];
    if (a.nbr.length < 2 || b.nbr.length < 2) continue;
    /* amide C-N is not freely rotatable */
    var amide = (isAmideNitrogen(mol, bd.a) && b.el === 'C' && doubleBondedTo(mol, bd.b, 'O') >= 0) ||
                (isAmideNitrogen(mol, bd.b) && a.el === 'C' && doubleBondedTo(mol, bd.a, 'O') >= 0);
    if (amide) continue;
    n++;
  }
  return n;
}

function aromaticRingCount(mol) {
  var n = 0;
  for (var r = 0; r < mol.rings.length; r++) {
    var all = true;
    for (var t = 0; t < mol.rings[r].length; t++) {
      if (!mol.atoms[mol.rings[r][t]].arom) { all = false; break; }
    }
    if (all) n++;
  }
  return n;
}

function halogenCount(mol) {
  var n = 0;
  for (var i = 0; i < mol.atoms.length; i++) {
    var el = mol.atoms[i].el;
    if (el === 'F' || el === 'Cl' || el === 'Br' || el === 'I') n++;
  }
  return n;
}

function fsp3(mol) {
  var c = 0, sp3 = 0;
  for (var i = 0; i < mol.atoms.length; i++) {
    if (mol.atoms[i].el !== 'C') continue;
    c++;
    if (!isUnsaturatedCarbon(mol, i)) sp3++;
  }
  return c ? sp3 / c : 0;
}

function longestPath(mol) {
  var n = mol.atoms.length, best = 0;
  for (var s = 0; s < n; s++) {
    var dist = new Array(n).fill(-1);
    dist[s] = 0;
    var q = [s];
    while (q.length) {
      var v = q.shift(), nb = mol.atoms[v].nbr;
      for (var j = 0; j < nb.length; j++) {
        if (dist[nb[j]] < 0) { dist[nb[j]] = dist[v] + 1; q.push(nb[j]); }
      }
    }
    for (var k = 0; k < n; k++) if (dist[k] > best) best = dist[k];
  }
  return best;
}

function computeDescriptors(mol) {
  return {
    mw: molecularWeight(mol),
    formula: molecularFormula(mol),
    clogp: clogp(mol),
    tpsa: tpsa(mol),
    hbd: hbd(mol),
    hba: hba(mol),
    rotb: rotatableBonds(mol),
    rings: mol.rings.length,
    aromRings: aromaticRingCount(mol),
    heavy: mol.atoms.length,
    halogens: halogenCount(mol),
    fsp3: fsp3(mol),
    longestPath: longestPath(mol)
  };
}

/* --------------------------------------------------- Morgan fingerprint */

var FP_BITS = 2048;

function fnv1a(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function initialInvariants(mol) {
  var inv = new Array(mol.atoms.length);
  for (var i = 0; i < mol.atoms.length; i++) {
    var at = mol.atoms[i];
    inv[i] = fnv1a([
      at.el, at.nbr.length, at.nH, at.charge,
      at.arom ? 1 : 0, at.inRing ? 1 : 0
    ].join('|'));
  }
  return inv;
}

function morganFingerprint(mol, radius, nBits) {
  radius = radius === undefined ? 2 : radius;
  nBits = nBits || FP_BITS;
  var bits = new Uint8Array(nBits);
  var inv = initialInvariants(mol);

  for (var i = 0; i < inv.length; i++) bits[inv[i] % nBits] = 1;

  for (var r = 1; r <= radius; r++) {
    var next = new Array(inv.length);
    for (var a = 0; a < inv.length; a++) {
      var at = mol.atoms[a], parts = [];
      for (var j = 0; j < at.nbr.length; j++) {
        var order = mol.bonds[at.bidx[j]].arom ? 15 : mol.bonds[at.bidx[j]].order;
        parts.push((order * 1000003 + inv[at.nbr[j]]) >>> 0);
      }
      parts.sort(function (x, y) { return x - y; });
      next[a] = fnv1a(r + ':' + inv[a] + ':' + parts.join(','));
      bits[next[a] % nBits] = 1;
    }
    inv = next;
  }
  return bits;
}

/* The bit vector packed 32 to a word. Tanimoto over 2048 bytes is the inner
 * loop of every batch run; against a few thousand references that is tens of
 * millions of iterations, so it runs on words and a popcount instead. */
function packFingerprint(bits) {
  var out = new Uint32Array((bits.length + 31) >> 5);
  for (var i = 0; i < bits.length; i++) {
    if (bits[i]) out[i >> 5] |= (1 << (i & 31));
  }
  return out;
}

function popcount(x) {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

function tanimotoPacked(a, b) {
  var both = 0, countA = 0, countB = 0;
  for (var i = 0; i < a.length; i++) {
    var x = a[i], y = b[i];
    both += popcount(x & y);
    countA += popcount(x);
    countB += popcount(y);
  }
  var either = countA + countB - both;
  return either ? both / either : 0;
}

function tanimoto(fa, fb) {
  var both = 0, either = 0;
  for (var i = 0; i < fa.length; i++) {
    if (fa[i] && fb[i]) both++;
    if (fa[i] || fb[i]) either++;
  }
  return either ? both / either : 0;
}

/* ------------------------------------------------------ structural motifs */

/* Groups of rings that share at least two atoms (i.e. are fused). */
function fusedRingSystems(mol) {
  var rings = mol.rings, n = rings.length;
  var parent = new Array(n);
  for (var i = 0; i < n; i++) parent[i] = i;
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(x, y) { var rx = find(x), ry = find(y); if (rx !== ry) parent[rx] = ry; }

  for (var a = 0; a < n; a++) {
    for (var b = a + 1; b < n; b++) {
      var shared = 0, setA = {};
      for (var t = 0; t < rings[a].length; t++) setA[rings[a][t]] = true;
      for (var u = 0; u < rings[b].length; u++) if (setA[rings[b][u]]) shared++;
      if (shared >= 2) union(a, b);
    }
  }
  var groups = {};
  for (var r = 0; r < n; r++) {
    var g = find(r);
    (groups[g] = groups[g] || []).push(r);
  }
  return Object.keys(groups).map(function (k) { return groups[k]; });
}

function steroidCore(mol) {
  var systems = fusedRingSystems(mol);
  for (var s = 0; s < systems.length; s++) {
    var idxs = systems[s];
    if (idxs.length < 4) continue;
    var sizes = idxs.map(function (i) { return mol.rings[i].length; }).sort();
    /* look for a 5/6/6/6 combination inside the fused system */
    var six = 0, five = 0;
    for (var k = 0; k < sizes.length; k++) {
      if (sizes[k] === 6) six++;
      else if (sizes[k] === 5) five++;
    }
    if (six >= 3 && five >= 1) {
      var atomSet = {};
      for (var j = 0; j < idxs.length; j++) {
        for (var t = 0; t < mol.rings[idxs[j]].length; t++) atomSet[mol.rings[idxs[j]][t]] = true;
      }
      return { rings: idxs, atoms: Object.keys(atomSet).map(Number) };
    }
  }
  return null;
}

function detectMotifs(mol) {
  var m = {
    steroid: false, steroidKeto3: false, steroidPolarTail: false,
    enone: false, ketone: false, hydroxyl: false, phenol: false,
    carboxyl: false, nitrile: false, arylNitrile: false,
    cf3: false, arylCF3: false, nitro: false, amide: false,
    sulfonyl: false, tertAlcohol: false, hydantoin: false,
    thiohydantoin: false, longestPath: longestPath(mol),
    nonsteroidalAA: false
  };

  var core = steroidCore(mol);
  m.steroid = !!core;
  var coreSet = {};
  if (core) for (var i = 0; i < core.atoms.length; i++) coreSet[core.atoms[i]] = true;

  for (var a = 0; a < mol.atoms.length; a++) {
    var at = mol.atoms[a], els = neighbourEls(mol, a);

    if (at.el === 'O' && at.nH > 0) {
      var host = at.nbr.length ? at.nbr[0] : -1;
      if (host >= 0) {
        var h = mol.atoms[host];
        var isCarboxyl = h.el === 'C' && doubleBondedTo(mol, host, 'O') >= 0;
        if (isCarboxyl) m.carboxyl = true;
        else if (h.arom) m.phenol = true;
        else {
          m.hydroxyl = true;
          var cNbr = 0;
          for (var j = 0; j < h.nbr.length; j++) if (mol.atoms[h.nbr[j]].el === 'C') cNbr++;
          if (h.el === 'C' && cNbr >= 3) m.tertAlcohol = true;
        }
      }
    }

    if (at.el === 'C') {
      var oDouble = doubleBondedTo(mol, a, 'O');
      if (oDouble >= 0) {
        var cCount = 0, nCount = 0;
        for (var k = 0; k < at.nbr.length; k++) {
          if (at.nbr[k] === oDouble) continue;
          if (mol.atoms[at.nbr[k]].el === 'C') cCount++;
          if (mol.atoms[at.nbr[k]].el === 'N') nCount++;
        }
        if (nCount > 0) m.amide = true;
        else if (cCount >= 2) {
          m.ketone = true;
          /* enone: the carbonyl carbon sits next to a C=C */
          for (var p = 0; p < at.nbr.length; p++) {
            var nb = at.nbr[p];
            if (nb === oDouble) continue;
            if (mol.atoms[nb].el === 'C' && doubleBondedTo(mol, nb, 'C') >= 0) m.enone = true;
          }
          if (core && coreSet[a]) m.steroidKeto3 = true;
        }
      }
      if (doubleBondedTo(mol, a, 'S') >= 0) {
        for (var q = 0; q < at.nbr.length; q++) {
          if (mol.atoms[at.nbr[q]].el === 'N') m.thiohydantoin = true;
        }
      }
      if (fluorineCountOn(mol, a) >= 3) {
        m.cf3 = true;
        for (var z = 0; z < at.nbr.length; z++) if (mol.atoms[at.nbr[z]].arom) m.arylCF3 = true;
      }
      var nTriple = -1;
      for (var w = 0; w < at.bidx.length; w++) {
        if (mol.bonds[at.bidx[w]].order === 3 && mol.atoms[at.nbr[w]].el === 'N') nTriple = at.nbr[w];
      }
      if (nTriple >= 0) {
        m.nitrile = true;
        for (var y = 0; y < at.nbr.length; y++) if (mol.atoms[at.nbr[y]].arom) m.arylNitrile = true;
      }
    }

    if (isNitroNitrogen(mol, a)) m.nitro = true;
    if (at.el === 'S' && countDoubleBondedTo(mol, a, 'O') >= 2) m.sulfonyl = true;
    void els;
  }

  /* hydantoin / thiohydantoin: 5-ring with two N and two exocyclic C=O|C=S */
  for (var r = 0; r < mol.rings.length; r++) {
    var ring = mol.rings[r];
    if (ring.length !== 5) continue;
    var nN = 0, carbonyls = 0, thio = 0;
    for (var t2 = 0; t2 < ring.length; t2++) {
      var ai = ring[t2], aa = mol.atoms[ai];
      if (aa.el === 'N') nN++;
      if (aa.el === 'C') {
        if (doubleBondedTo(mol, ai, 'O') >= 0) carbonyls++;
        if (doubleBondedTo(mol, ai, 'S') >= 0) thio++;
      }
    }
    if (nN >= 2 && carbonyls + thio >= 2) {
      m.hydantoin = true;
      if (thio >= 1) m.thiohydantoin = true;
    }
  }

  if (core) {
    m.steroidPolarTail = m.hydroxyl || m.carboxyl || m.nitrile || m.amide;
  }
  m.nonsteroidalAA = (m.arylNitrile || m.nitro) && m.arylCF3;
  return m;
}

/* -------------------------------------------------- McGowan volume (Å^3) */

var MCGOWAN = {
  H: 8.71, B: 18.32, C: 16.35, N: 14.39, O: 12.43, F: 10.48,
  Si: 26.83, P: 24.87, S: 22.91, Cl: 20.95, Br: 26.21, I: 34.53,
  Se: 24.50
};

function mcGowanVolume(mol) {
  var sum = 0, bondCount = mol.bonds.length;
  for (var i = 0; i < mol.atoms.length; i++) {
    var at = mol.atoms[i];
    sum += (MCGOWAN[at.el] !== undefined ? MCGOWAN[at.el] : 16.35);
    sum += at.nH * MCGOWAN.H;
    bondCount += at.nH;                  /* X-H bonds count too */
  }
  var vx = sum - 6.56 * bondCount;       /* cm^3/mol / 100 */
  return (vx / 0.6022) * 0.73;           /* -> Å^3 per molecule */
}

module.exports = {
  parseSmiles: parseSmiles,
  computeDescriptors: computeDescriptors,
  molecularFormula: molecularFormula,
  molecularWeight: molecularWeight,
  clogp: clogp,
  tpsa: tpsa,
  morganFingerprint: morganFingerprint,
  tanimoto: tanimoto,
  packFingerprint: packFingerprint,
  tanimotoPacked: tanimotoPacked,
  detectMotifs: detectMotifs,
  mcGowanVolume: mcGowanVolume,
  bondBetween: bondBetween,
  fusedRingSystems: fusedRingSystems,
  LOGP: LOGP,
  FP_BITS: FP_BITS
};
