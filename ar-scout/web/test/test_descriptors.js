/* test_descriptors.js — molecular formula / MW / logP sanity for the engine. */
'use strict';

const AR = require('../armodel.js');

const MW_TOL = 0.6;

/* name, SMILES, expected formula, expected MW */
const CASES = [
  ['Dihydrotestosterone',
   'CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2',
   'C19H30O2', 290.44],
  ['Testosterone',
   'CC12CCC3C(CCC4=CC(=O)CCC34C)C1CCC2O',
   'C19H28O2', 288.42],
  ['Metribolone',
   'CC12C(C)(O)CCC2C3C(C=C1)=C5CCC(=O)C=C5CC3',
   'C19H24O2', 284.40],
  ['Bicalutamide',
   'CC(O)(CS(=O)(=O)c1ccc(F)cc1)C(=O)Nc1ccc(C#N)c(c1)C(F)(F)F',
   'C18H14F4N2O4S', 430.37],
  ['Enzalutamide',
   'CC1(C)C(=O)N(c2ccc(C(=O)NC)c(F)c2)C(=S)N1c1ccc(C#N)c(c1)C(F)(F)F',
   'C21H16F4N4O2S', 464.44],
  ['Flutamide',
   'CC(C)C(=O)Nc1ccc([N+](=O)[O-])c(c1)C(F)(F)F',
   'C11H11F3N2O3', 276.21],
  ['Hydroxyflutamide',
   'CC(C)(O)C(=O)Nc1ccc([N+](=O)[O-])c(c1)C(F)(F)F',
   'C11H11F3N2O4', 292.21],
  ['Nilutamide',
   'CC1(C)NC(=O)N(c2ccc([N+](=O)[O-])c(c2)C(F)(F)F)C1=O',
   'C12H10F3N3O4', 317.22],
  ['Finasteride',
   'CC(C)(C)NC(=O)C1CCC2C3CCC4NC(=O)C=CC4(C)C3CCC12C',
   'C23H36N2O2', 372.55],
  ['Spironolactone',
   'CC(=O)SC1CC2=CC(=O)CCC2(C)C2CCC3(C)C(CCC34CCC(=O)O4)C12',
   'C24H32O4S', 416.57],
  ['Cyproterone acetate',
   'CC(=O)OC1(C(C)=O)CCC2C1(C)CCC3C2C=C(Cl)C4=CC(=O)C5CC5C34C',
   'C24H29ClO4', 416.94],
  ['Caffeine',
   'CN1C=NC2=C1C(=O)N(C)C(=O)N2C',
   'C8H10N4O2', 194.19],
  ['Niacinamide',
   'NC(=O)c1ccncc1',
   'C6H6N2O', 122.12],
  ['Benzene', 'c1ccccc1', 'C6H6', 78.11],
  ['Phenol', 'Oc1ccccc1', 'C6H6O', 94.11],
  ['Progesterone',
   'CC(=O)C1CCC2C1(C)CCC1C2CCC2=CC(=O)CCC12C',
   'C21H30O2', 314.46],
  ['Estradiol',
   'CC12CCC3c4ccc(O)cc4CCC3C1CCC2O',
   'C18H24O2', 272.38],
  ['Darolutamide',
   'CC(Cn1ccc(n1)c1ccc(C#N)c(Cl)c1)NC(=O)c1cc(C(C)O)[nH]n1',
   'C19H19ClN6O2', 398.85]
];

/* logP windows. These are acceptance bands for the additive scheme, not
 * literature values — they exist to catch a missing sp3 correction. */
const LOGP_BANDS = [
  ['Dihydrotestosterone', 3.0, 5.0],
  ['Testosterone', 3.0, 5.5],
  ['Metribolone', 2.5, 5.5],
  ['Progesterone', 3.0, 5.5],
  ['Estradiol', 3.0, 5.5],
  ['Flutamide', 0.0, 2.0],
  ['Hydroxyflutamide', 0.0, 2.0],
  ['Nilutamide', 0.0, 2.0]
];

function run() {
  let pass = 0, fail = 0;
  const bySmiles = {};
  const rows = [];

  for (const [name, smi, formula, mw] of CASES) {
    let mol, d, err = null;
    try {
      mol = AR.parseSmiles(smi);
      d = AR.computeDescriptors(mol);
      bySmiles[name] = d;
    } catch (e) { err = e; }

    if (err) {
      fail++;
      console.log(`  FAIL  ${name.padEnd(22)} parse error: ${err.message}`);
      continue;
    }
    const fOK = d.formula === formula;
    const mOK = Math.abs(d.mw - mw) <= MW_TOL;
    if (fOK && mOK) {
      pass++;
      rows.push(`  ok    ${name.padEnd(22)} ${d.formula.padEnd(16)} ` +
                `MW ${d.mw.toFixed(2).padStart(7)}  logP ${d.clogp.toFixed(2).padStart(6)}` +
                `  TPSA ${d.tpsa.toFixed(1).padStart(5)}  rings ${d.rings}`);
    } else {
      fail++;
      rows.push(`  FAIL  ${name.padEnd(22)} formula ${d.formula} (want ${formula})` +
                `  MW ${d.mw.toFixed(2)} (want ${mw})`);
    }
  }
  rows.forEach(r => console.log(r));

  console.log('\n  logP bands');
  for (const [name, lo, hi] of LOGP_BANDS) {
    const d = bySmiles[name];
    if (!d) { fail++; console.log(`  FAIL  ${name} missing`); continue; }
    if (d.clogp >= lo && d.clogp <= hi) {
      pass++;
      console.log(`  ok    ${name.padEnd(22)} logP ${d.clogp.toFixed(2)} in [${lo}, ${hi}]`);
    } else {
      fail++;
      console.log(`  FAIL  ${name.padEnd(22)} logP ${d.clogp.toFixed(2)} outside [${lo}, ${hi}]`);
    }
  }

  console.log(`\n  descriptors: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run, CASES: CASES };
