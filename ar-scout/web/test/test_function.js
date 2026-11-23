/* test_function.js — how well the agonist/antagonist call actually works.
 *
 * Leave-one-out over the functional reference: each compound is classified
 * with itself removed, so the score measures generalisation to a compound
 * the reference has not seen, not recall.
 *
 * Three signals are combined and all three are checked here, because the
 * point of adding the last two was that read-across alone is not enough:
 * steroidal antiandrogens sit right beside the androgens in fingerprint
 * space and get called agonists.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const AR = require('../armodel.js');
const PR = require('../predict.js');

const SCENE_PATH = path.join(__dirname, '..', 'assets', 'pocket_scene.json');

/* Hand-set weights, so the floor is set below the measured score and the
 * sweep below checks the result is not balanced on them. */
const MIN_CORRECT = 30;          /* of 38; measured 32 with all signals */
const MIN_READ_ACROSS = 25;      /* read-across alone; measured 27 */

function structureKey(mol) {
  const d = AR.computeDescriptors(mol);
  const fp = AR.morganFingerprint(mol, 2);
  let bits = '';
  for (let i = 0; i < fp.length; i++) if (fp[i]) bits += i + ',';
  return d.formula + '|' + bits;
}

function loadScene() {
  if (!fs.existsSync(SCENE_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(SCENE_PATH, 'utf8')); }
  catch (err) { return null; }
}

function run() {
  let pass = 0, fail = 0;
  const scene = loadScene();
  const lib = PR.ensureFunctionLibrary();
  const byName = {};
  for (const e of PR.INGREDIENTS) byName[e[1]] = e[2];

  const counts = {};
  for (const e of lib) counts[e.c] = (counts[e.c] || 0) + 1;
  if (lib.length >= 30 && counts.agonist >= 10 && counts.antagonist >= 10) {
    pass++;
    console.log(`  ok    ${'functional reference'.padEnd(30)} ${lib.length} compounds ` +
                `(${Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ')})`);
  } else {
    fail++;
    console.log(`  FAIL  functional reference too small or lopsided: ${JSON.stringify(counts)}`);
  }

  /* every functional reference entry must resolve to a parsable structure */
  let unresolved = 0;
  for (const name of Object.keys(PR.FUNCTION_CLASS)) {
    if (!byName[name]) { unresolved++; console.log(`  FAIL  ${name} is not in the dictionary`); }
  }
  if (unresolved) fail += unresolved;
  else { pass++; console.log(`  ok    ${'all labelled names resolve'.padEnd(30)} ${Object.keys(PR.FUNCTION_CLASS).length} labels`); }

  function evaluate(useDock, useMotif) {
    let correct = 0;
    const wrong = [];
    for (const entry of lib) {
      const smiles = byName[entry.n];
      const mol = AR.parseSmiles(smiles);
      const fp = AR.packFingerprint(AR.morganFingerprint(mol, 2));
      let dock = null;
      if (useDock && scene) {
        const stored = scene.poses[structureKey(mol)];
        if (stored && stored.placed) {
          dock = { placed: true, ile899: (stored.c || []).indexOf('ILE899') >= 0 };
        }
      }
      const call = PR.callFunction(fp, {
        exclude: entry.n, dock: dock,
        motifs: useMotif ? AR.detectMotifs(mol) : null
      });
      if (call.label === entry.c) correct++;
      else wrong.push(`${entry.n} (${entry.c} -> ${call.label})`);
    }
    return { correct, wrong };
  }

  console.log('\n  leave-one-out over the functional reference');
  const base = evaluate(false, false);
  const motif = evaluate(false, true);
  const dock = evaluate(true, false);
  const both = evaluate(true, true);
  const n = lib.length;
  for (const [label, r] of [['read-across only', base], ['+ motif', motif],
                            ['+ docking', dock], ['+ docking + motif', both]]) {
    console.log(`        ${label.padEnd(22)} ${r.correct}/${n}  ` +
                `${(100 * r.correct / n).toFixed(0)}%`);
  }
  console.log(`        remaining: ${both.wrong.join(', ')}`);

  if (base.correct >= MIN_READ_ACROSS) {
    pass++;
    console.log(`  ok    ${'read-across baseline'.padEnd(30)} ${base.correct}/${n} >= ${MIN_READ_ACROSS}`);
  } else {
    fail++;
    console.log(`  FAIL  read-across baseline ${base.correct}/${n} < ${MIN_READ_ACROSS}`);
  }

  if (both.correct >= MIN_CORRECT) {
    pass++;
    console.log(`  ok    ${'combined signals'.padEnd(30)} ${both.correct}/${n} >= ${MIN_CORRECT}`);
  } else {
    fail++;
    console.log(`  FAIL  combined signals ${both.correct}/${n} < ${MIN_CORRECT}`);
  }

  if (both.correct > base.correct) {
    pass++;
    console.log(`  ok    ${'extra signals help'.padEnd(30)} ${base.correct} -> ${both.correct}`);
  } else {
    fail++;
    console.log(`  FAIL  extra signals did not help: ${base.correct} -> ${both.correct}`);
  }

  /* the bulky-substituent motif is the thing that separates steroidal
     antiandrogens from androgens; check it does that and nothing else */
  console.log('\n  steroid bulk motif');
  const shouldFlag = ['Spironolactone', 'Drospirenone', 'Clascoterone',
                      'Cyproterone acetate', 'Chlormadinone acetate', 'Dienogest'];
  const shouldNot = ['Dihydrotestosterone', 'Testosterone', 'Methyltestosterone',
                     'Danazol', 'Stanozolol', 'Oxandrolone', 'Progesterone',
                     'Norethisterone', 'Levonorgestrel', 'Tibolone'];
  let motifOk = true;
  for (const name of shouldFlag) {
    const m = AR.detectMotifs(AR.parseSmiles(byName[name]));
    if (!m.steroidBulky) { motifOk = false; console.log(`  FAIL  ${name} should be flagged bulky`); }
  }
  for (const name of shouldNot) {
    const m = AR.detectMotifs(AR.parseSmiles(byName[name]));
    if (m.steroidBulky) { motifOk = false; console.log(`  FAIL  ${name} must not be flagged bulky`); }
  }
  if (motifOk) {
    pass++;
    console.log(`  ok    ${'flags the 6 steroidal antagonists'.padEnd(30)} and none of the 10 androgens/progestins`);
  } else { fail++; }

  /* --- Tox21, read correctly ----------------------------------------- */
  console.log('\n  Tox21 reading');
  const toxPath = path.join(__dirname, '..', 'assets', 'tox21_ar.json');
  const haveTox = fs.existsSync(toxPath);
  const cases = [
    ['000', 'inactive', 'inactive in all three'],
    ['100', 'agonist', 'agonist mode only'],
    ['020', 'antagonist', 'antagonist mode only'],
    ['122', null, 'both modes - the assay cannot separate them'],
    ['344', null, 'inconclusive and cytotoxic only'],
    ['999', null, 'not tested']
  ];
  let readOk = true;
  for (const [code, want, why] of cases) {
    const r = PR.readTox21(code);
    const got = r ? r.verdict : null;
    if (got !== want) {
      readOk = false;
      console.log(`  FAIL  ${code} -> ${got}, expected ${want} (${why})`);
    }
  }
  if (readOk) {
    pass++;
    console.log(`  ok    ${'verdict only when unambiguous'.padEnd(30)} 6 codes`);
  } else fail++;

  /* Antagonist mode co-treats with a reference agonist, so a partial agonist
     that competes also scores there. Taking it at face value flipped every
     progestin; the engine must not do that. */
  const bothModes = PR.readTox21('122');
  if (bothModes && bothModes.mixed && bothModes.verdict === null) {
    pass++;
    console.log(`  ok    ${'mixed signal defers to structure'.padEnd(30)} no verdict forced`);
  } else {
    fail++;
    console.log('  FAIL  a both-modes record must not be called antagonist');
  }

  const cyto = PR.readTox21('344');
  if (cyto && cyto.cytotoxic && cyto.verdict === null) {
    pass++;
    console.log(`  ok    ${'cytotoxicity is not antagonism'.padEnd(30)} no verdict forced`);
  } else {
    fail++;
    console.log('  FAIL  a cytotoxic record must not be called antagonist');
  }

  if (haveTox) {
    const tox = JSON.parse(fs.readFileSync(toxPath, 'utf8'));
    const withTox = (function () {
      let correct = 0;
      for (const entry of lib) {
        const mol = AR.parseSmiles(byName[entry.n]);
        const fp = AR.packFingerprint(AR.morganFingerprint(mol, 2));
        let dock = null;
        if (scene) {
          const stored = scene.poses[structureKey(mol)];
          if (stored && stored.placed) {
            dock = { placed: true, ile899: (stored.c || []).indexOf('ILE899') >= 0 };
          }
        }
        const call = PR.callFunction(fp, {
          exclude: entry.n, dock: dock, motifs: AR.detectMotifs(mol),
          tox21: tox.calls[AR.structureIdOf(mol)] || null
        });
        if (call.label === entry.c) correct++;
      }
      return correct;
    })();
    console.log(`        with Tox21             ${withTox}/${n}  ` +
                `${(100 * withTox / n).toFixed(0)}%`);
    if (withTox >= both.correct) {
      pass++;
      console.log(`  ok    ${'Tox21 does not make it worse'.padEnd(30)} ${both.correct} -> ${withTox}`);
    } else {
      fail++;
      console.log(`  FAIL  Tox21 lowered accuracy: ${both.correct} -> ${withTox}`);
    }

    /* the point of the table is coverage, not accuracy on these 38 drugs */
    let tested = 0, verdicts = 0;
    for (const [ko, en, smi] of PR.INGREDIENTS) {
      let mol;
      try { mol = AR.parseSmiles(smi); } catch (err) { continue; }
      const code = tox.calls[AR.structureIdOf(mol)];
      if (!code) continue;
      tested++;
      const r = PR.readTox21(code);
      if (r && r.verdict) verdicts++;
    }
    if (tested > 120 && verdicts > 80) {
      pass++;
      console.log(`  ok    ${'dictionary coverage'.padEnd(30)} ${tested} tested, ${verdicts} decisive`);
    } else {
      fail++;
      console.log(`  FAIL  thin coverage: ${tested} tested, ${verdicts} decisive`);
    }
  } else {
    console.log('  note  no tox21_ar.json in this build, skipping');
  }

  /* --- resistance mutants: reported, never voted on ------------------
   *
   * The shift is real evidence (antagonists average -2.86 kcal/mol on
   * min(delta), agonists +0.71) but measured redundant, so it must stay out
   * of callFunction. If someone wires it back in as a vote, this fails. */
  console.log('\n  resistance-mutant shifts');
  const mutPath = path.join(__dirname, '..', 'assets', 'mutant_shifts.json');
  if (fs.existsSync(mutPath)) {
    const mut = JSON.parse(fs.readFileSync(mutPath, 'utf8'));
    let covered = 0, separates = { agonist: [], antagonist: [] };
    for (const entry of lib) {
      const rec = mut.shifts[AR.structureIdOf(AR.parseSmiles(byName[entry.n]))];
      if (!rec || !isFinite(rec.d_t877a) || !isFinite(rec.d_w741l)) continue;
      covered++;
      if (separates[entry.c]) separates[entry.c].push(Math.min(rec.d_t877a, rec.d_w741l));
    }
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const ag = mean(separates.agonist), an = mean(separates.antagonist);
    console.log(`        coverage ${covered}/${n};  mean min(delta): ` +
                `agonist ${ag >= 0 ? '+' : ''}${ag.toFixed(2)}, ` +
                `antagonist ${an >= 0 ? '+' : ''}${an.toFixed(2)}`);
    if (covered >= n - 2 && an < ag - 2.0) {
      pass++;
      console.log(`  ok    ${'the shift does separate'.padEnd(30)} gap ${(ag - an).toFixed(2)} kcal/mol`);
    } else {
      fail++;
      console.log(`  FAIL  weak separation: covered ${covered}, gap ${(ag - an).toFixed(2)}`);
    }

    /* but it must change nothing: same call with and without it */
    let swayed = 0;
    for (const entry of lib) {
      const mol = AR.parseSmiles(byName[entry.n]);
      const fp = AR.packFingerprint(AR.morganFingerprint(mol, 2));
      const rec = mut.shifts[AR.structureIdOf(mol)] || {};
      const opts = { exclude: entry.n, motifs: AR.detectMotifs(mol) };
      const a = PR.callFunction(fp, opts);
      const b = PR.callFunction(fp, Object.assign({
        shift: { t877a: rec.d_t877a, w741l: rec.d_w741l } }, opts));
      if (a.label !== b.label) swayed++;
    }
    if (swayed === 0) {
      pass++;
      console.log(`  ok    ${'and does not vote'.padEnd(30)} passing it changes 0/${n} calls`);
    } else {
      fail++;
      console.log(`  FAIL  the shift swayed ${swayed} calls — it must be evidence only`);
    }

    /* the reading handed to the page must match the sign convention */
    const readings = [
      ['Bicalutamide', '길항제'], ['Cyproterone acetate', '길항제'],
      ['Dihydrotestosterone', null]
    ];
    let readOkM = true;
    for (const [name, want] of readings) {
      const rec = mut.shifts[AR.structureIdOf(AR.parseSmiles(byName[name]))];
      const d = PR.describeShift({ t877a: rec.d_t877a, w741l: rec.d_w741l });
      if (!d) { readOkM = false; console.log(`  FAIL  ${name}: no reading`); continue; }
      if (want && d.reading.indexOf(want) < 0) {
        readOkM = false;
        console.log(`  FAIL  ${name} (${d.t877a}/${d.w741l}) reads "${d.reading}"`);
      }
    }
    if (PR.describeShift(null) !== null || PR.describeShift({ t877a: 1 }) !== null) {
      readOkM = false;
      console.log('  FAIL  a missing shift must give no reading at all');
    }
    if (readOkM) {
      pass++;
      console.log(`  ok    ${'readings follow the signs'.padEnd(30)} and absent data reads as nothing`);
    } else fail++;
  } else {
    console.log('  note  no mutant_shifts.json in this build, skipping');
  }

  /* a potency label must never be reported as a function */
  const bogus = PR.callFunction(
    AR.packFingerprint(AR.morganFingerprint(AR.parseSmiles('OCC(O)CO'), 2)), {});
  if (['agonist', 'antagonist', 'partial', 'unknown'].indexOf(bogus.label) >= 0) {
    pass++;
    console.log(`  ok    ${'only functional labels returned'.padEnd(30)} glycerin -> ${bogus.label}`);
  } else {
    fail++;
    console.log(`  FAIL  non-functional label leaked: ${bogus.label}`);
  }

  console.log(`\n  function: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
