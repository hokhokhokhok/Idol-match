/* test_layout3d.js — geometric quality of the generated 3D conformer.
 *
 * This is a shape sketch, not a docking pose, so the bars are set at
 * "recognisably the right molecule" rather than force-field accuracy:
 * bonds near their covalent sum, angles near the hybridisation ideal, no
 * atoms interpenetrating, and aromatic rings genuinely flat.
 */
'use strict';

const AR = require('../armodel.js');
const L3 = require('../layout3d.js');

const BOND_ERR_MAX = 0.12;     /* angstrom, mean absolute */
const ANGLE_ERR_MAX = 16.0;    /* degrees, mean absolute */
const MIN_NONBONDED = 2.40;    /* angstrom, closest 1-4-or-further pair */
const PLANARITY_MAX = 0.05;    /* angstrom RMS out of the ring plane */

/* `flat` marks molecules that really are planar, so a zero z-spread is the
 * right answer for them and a non-zero one would be the bug. Everything
 * else must come out genuinely three-dimensional; a flat embedding there
 * would mean the 3D step had silently produced a 2D drawing. */
const FLAT_MAX = 0.10;         /* angstrom, for molecules that are planar */
const DEPTH_MIN = 0.45;        /* angstrom, for everything else */

const CASES = [
  ['Benzene', 'c1ccccc1', true],
  ['Toluene', 'Cc1ccccc1', true],
  ['Naphthalene', 'c1ccc2ccccc2c1', true],
  ['Indole', 'c1ccc2[nH]ccc2c1', true],
  ['Caffeine', 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C', true],
  ['Cyclohexane', 'C1CCCCC1', false],
  ['Biphenyl', 'c1ccccc1-c1ccccc1', false],
  ['Genistein', 'Oc1ccc(cc1)c1coc2cc(O)cc(O)c2c1=O', false],
  ['Dihydrotestosterone', 'CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2', false],
  ['Estradiol', 'CC12CCC3c4ccc(O)cc4CCC3C1CCC2O', false],
  ['Bicalutamide', 'CC(O)(CS(=O)(=O)c1ccc(F)cc1)C(=O)Nc1ccc(C#N)c(c1)C(F)(F)F', false],
  ['Enzalutamide',
   'CC1(C)C(=O)N(c2ccc(C(=O)NC)c(F)c2)C(=S)N1c1ccc(C#N)c(c1)C(F)(F)F', false],
  ['Spironolactone',
   'CC(=O)SC1CC2=CC(=O)CCC2(C)C2CCC3(C)C(CCC34CCC(=O)O4)C12', false],
  ['beta-Sitosterol',
   'CCC(CCC(C)C1CCC2C1(C)CCC1C2CC=C2CC(O)CCC12C)C(C)C', false],
  ['Ketoconazole',
   'CC(=O)N1CCN(CC1)c1ccc(OCC2COC(Cn3ccnc3)(O2)c2ccc(Cl)cc2Cl)cc1', false]
];

function run() {
  let pass = 0, fail = 0;

  for (const [name, smiles, flat] of CASES) {
    const mol = AR.parseSmiles(smiles);
    const pos = L3.computeLayout3D(mol);
    const bond = L3.bondStats(mol, pos);
    const angle = L3.angleStats(mol, pos);
    const nb = L3.minNonBonded(mol, pos);
    const planar = L3.aromaticPlanarity(mol, pos);
    const worstPlanar = planar.length ? Math.max(...planar) : 0;

    const problems = [];
    let finite = true;
    for (let i = 0; i < pos.x.length; i++) {
      if (!isFinite(pos.x[i]) || !isFinite(pos.y[i]) || !isFinite(pos.z[i])) finite = false;
      if (Math.abs(pos.x[i]) > 1e4) finite = false;
    }
    if (!finite) problems.push('non-finite coordinates');
    if (!(bond.meanAbsError < BOND_ERR_MAX)) {
      problems.push(`bond error ${bond.meanAbsError.toFixed(3)}`);
    }
    if (!(angle.meanAbsError < ANGLE_ERR_MAX)) {
      problems.push(`angle error ${angle.meanAbsError.toFixed(2)}`);
    }
    if (isFinite(nb) && !(nb > MIN_NONBONDED)) {
      problems.push(`closest non-bonded ${nb.toFixed(2)}`);
    }
    if (!(worstPlanar < PLANARITY_MAX)) {
      problems.push(`aromatic ring out of plane by ${worstPlanar.toFixed(3)}`);
    }
    const zSpread = Math.max(...pos.z) - Math.min(...pos.z);
    if (flat && !(zSpread < FLAT_MAX)) {
      problems.push(`should be planar but z spread is ${zSpread.toFixed(2)}`);
    }
    if (!flat && !(zSpread > DEPTH_MIN)) {
      problems.push(`should be 3D but z spread is only ${zSpread.toFixed(2)}`);
    }

    if (problems.length) {
      fail++;
      console.log(`  FAIL  ${name.padEnd(22)} ${problems.join(', ')}`);
    } else {
      pass++;
      console.log(`  ok    ${name.padEnd(22)} bond ${bond.meanAbsError.toFixed(3)}  ` +
                  `angle ${angle.meanAbsError.toFixed(1).padStart(5)}  ` +
                  `minNB ${isFinite(nb) ? nb.toFixed(2) : ' — '}  ` +
                  `planar ${worstPlanar.toFixed(3)}  z ${zSpread.toFixed(2)}` +
                  (flat ? ' (planar)' : ''));
    }
  }

  /* the viewer re-renders on every drag frame, so the embedding must be
   * deterministic or the molecule would jitter */
  const m = AR.parseSmiles('CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2');
  const a = L3.computeLayout3D(m), b = L3.computeLayout3D(m);
  let same = true;
  for (let i = 0; i < a.x.length; i++) {
    if (Math.abs(a.x[i] - b.x[i]) > 1e-12 || Math.abs(a.y[i] - b.y[i]) > 1e-12 ||
        Math.abs(a.z[i] - b.z[i]) > 1e-12) same = false;
  }
  if (same) { pass++; console.log('  ok    deterministic          repeat run is identical'); }
  else { fail++; console.log('  FAIL  deterministic          repeat run differs'); }

  /* benzene must come out flat, as a floor under the planarity machinery */
  const bz = AR.parseSmiles('c1ccccc1');
  const bpos = L3.computeLayout3D(bz);
  const spread = Math.max(...bpos.z) - Math.min(...bpos.z);
  if (spread < 0.05) {
    pass++;
    console.log(`  ok    benzene is flat        z spread ${spread.toFixed(4)} A`);
  } else {
    fail++;
    console.log(`  FAIL  benzene is flat        z spread ${spread.toFixed(4)} A`);
  }

  console.log(`\n  layout3d: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
