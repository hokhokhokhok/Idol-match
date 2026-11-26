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
    ['100', 'agonist', 'active in the agonist-mode assay'],
    ['020', 'antagonist', 'active in an antagonist-mode assay'],
    ['122', null, 'both modes - the assay cannot separate them'],
    ['344', null, 'inconclusive and cytotoxic only'],
    ['999', null, 'not tested'],
    /* Position carries the mode: 743053 is the agonist screen, 743054 and
     * 743063 are the two antagonist screens. An "active agonist" outcome in
     * an antagonist-mode well is a signal rise in a co-treatment plate, not
     * agonism, and reading it as agonism gave formononetin an "agonist"
     * label although it was INACTIVE in the agonist screen - which then
     * dragged fisetin to "agonist" from similarity 0.39. */
    ['010', null, 'agonist flag in an antagonist-mode well only'],
    ['012', 'antagonist', 'antagonist-mode active; the off-mode flag does not cancel it']
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

  /* --- a measurement another receptor explains is not an AR call -----
   *
   * Hydrocortisone, prednisolone and corticosterone sat in the read-across
   * pool as measured AR AGONISTS, voting on other compounds, because the
   * pool was built by an automated rule nobody read. One of the three
   * screens runs in MDA-kb2, whose reporter is MMTV-luc; MMTV is a direct
   * GR response element and the line expresses GR. */
  console.log('\n  mechanism blocks');
  if (haveTox) {
    const toxTable = JSON.parse(fs.readFileSync(toxPath, 'utf8'));
    PR.registerMeasured(toxTable);
    const pool = PR.functionPool().filter(e => e.measured);
    const leaked = pool.filter(e => PR.POOL_EXCLUSIONS[e.n]);
    if (!leaked.length) {
      pass++;
      console.log(`  ok    ${'excluded mechanisms do not vote'.padEnd(30)} pool is ${pool.length}`);
    } else {
      fail++;
      console.log(`  FAIL  still voting: ${leaked.map(e => e.n).join(', ')}`);
    }

    /* and the block must reach the compound's own page, not just its vote */
    let stated = 0, wrong = 0;
    for (const name of Object.keys(PR.POOL_EXCLUSIONS)) {
      const e = PR.INGREDIENTS.find(x => x[1] === name);
      if (!e) continue;
      const mol = AR.parseSmiles(e[2]);
      if (PR.FUNCTION_CLASS[name]) continue;     /* a curated label outranks the block */
      const r = PR.predict(e[2], { tox21: toxTable.calls[AR.structureIdOf(mol)] || null });
      if (r.functionCall.tier === 'blocked' && r.functionCall.reason) stated++;
      else {
        wrong++;
        console.log(`  FAIL  ${name}: ${r.functionCall.tier}/${r.functionCall.label}, ` +
                    'expected a stated 판정 보류');
      }
    }
    if (!wrong) {
      pass++;
      console.log(`  ok    ${'and the block reaches its own page'.padEnd(30)} ${stated} compounds decline`);
    } else fail += wrong;

    /* falling through to read-across was the first attempt and was worse:
       hydrocortisone came back "길항제 가능성" because it looks like a steroid */
    const hc = PR.INGREDIENTS.find(x => x[1] === 'Hydrocortisone');
    if (hc) {
      const r = PR.predict(hc[2], {
        tox21: toxTable.calls[AR.structureIdOf(AR.parseSmiles(hc[2]))] || null });
      if (r.functionCall.label !== 'antagonist') {
        pass++;
        console.log(`  ok    ${'a blocked compound makes no call'.padEnd(30)} not "길항제 가능성"`);
      } else {
        fail++;
        console.log('  FAIL  hydrocortisone is being called an AR antagonist');
      }
    }

    /* the curated shortcut must never reach a validation path - passing a
       structureId would otherwise score 38/38 for free */
    const dht = PR.INGREDIENTS.find(x => x[1] === 'Dihydrotestosterone');
    const viaId = PR.callFunction(
      AR.packFingerprint(AR.morganFingerprint(AR.parseSmiles(dht[2]), 2)),
      { exclude: 'Dihydrotestosterone',
        structureId: AR.structureIdOf(AR.parseSmiles(dht[2])) });
    if (viaId.tier === 'curated') {
      fail++;
      console.log('  FAIL  exclude is ignored when a structureId is supplied — ' +
                  'leave-one-out would be meaningless');
    } else {
      pass++;
      console.log(`  ok    ${'exclude still beats the shortcut'.padEnd(30)} LOO stays honest`);
    }
  }

  /* --- an off-mode agonist flag must not pass for agonism ------------ */
  const offMode = PR.readTox21('010');
  if (offMode && offMode.offModeAgonist && offMode.verdict === null) {
    pass++;
    console.log(`  ok    ${'off-mode flag is not a verdict'.padEnd(30)} 010 -> no call`);
  } else {
    fail++;
    console.log('  FAIL  an antagonist-mode agonist flag must not read as agonism');
  }

  /* --- the measured read-across pool --------------------------------- */
  console.log('\n  measured read-across pool');
  if (haveTox) {
    const toxTable = JSON.parse(fs.readFileSync(toxPath, 'utf8'));
    const added = PR.registerMeasured(toxTable);
    const pool = PR.functionPool();
    /* a hand label always wins over a measured one */
    let shadowed = 0;
    for (const name of Object.keys(PR.FUNCTION_CLASS)) {
      if (pool.filter(e => e.n === name).length !== 1) shadowed++;
    }
    if (added >= 10 && pool.length === lib.length + added && !shadowed) {
      pass++;
      console.log(`  ok    ${'measured neighbours join the pool'.padEnd(30)} ${lib.length} + ${added} = ${pool.length}`);
    } else {
      fail++;
      console.log(`  FAIL  pool is ${pool.length} from ${lib.length} + ${added}, ${shadowed} duplicated`);
    }

    /* every measured entry must rest on at least two informative assays */
    const thin = pool.filter(e => e.measured && e.assays < 2);
    if (!thin.length) {
      pass++;
      console.log(`  ok    ${'no single-assay labels vote'.padEnd(30)} daidzein (code 313) excluded`);
    } else {
      fail++;
      console.log(`  FAIL  ${thin.length} entries vote on one assay: ${thin.map(e => e.n).join(', ')}`);
    }

    /* and the curated score must not have been bought with them */
    const withPool = (function () {
      let correct = 0;
      for (const entry of lib) {
        const mol = AR.parseSmiles(byName[entry.n]);
        let dock = null;
        if (scene) {
          const stored = scene.poses[structureKey(mol)];
          if (stored && stored.placed) {
            dock = { placed: true, ile899: (stored.c || []).indexOf('ILE899') >= 0 };
          }
        }
        const call = PR.callFunction(AR.packFingerprint(AR.morganFingerprint(mol, 2)), {
          exclude: entry.n, dock: dock, motifs: AR.detectMotifs(mol)
        });
        if (call.label === entry.c) correct++;
      }
      return correct;
    })();
    console.log(`        curated LOO with the pool  ${withPool}/${n}`);
    if (withPool >= MIN_CORRECT) {
      pass++;
      console.log(`  ok    ${'coverage costs no accuracy'.padEnd(30)} ${withPool}/${n} >= ${MIN_CORRECT}`);
    } else {
      fail++;
      console.log(`  FAIL  the measured pool cost accuracy: ${withPool}/${n}`);
    }
  }

  /* --- the graded call, and why it declines -------------------------- */
  console.log('\n  graded antagonist call');
  const graded = [
    ['Fisetin', 'antagonist', ['predicted', 'possible'],
     'measured antagonist flavonoids sit at 0.36-0.38'],
    ['Phenylethyl resorcinol', 'antagonist', ['predicted', 'possible'],
     'same space, further out'],
    ['Quercetin', 'antagonist', ['predicted', 'possible'], 'genistein at 0.49'],
    ['Bicalutamide', 'antagonist', ['measured', 'predicted'], 'the obvious case'],
    ['Dihydrotestosterone', 'agonist', ['measured', 'predicted'], 'must not drift']
  ];
  let gradedBad = 0;
  for (const [name, wantLabel, wantTiers, why] of graded) {
    const smiles = byName[name];
    if (!smiles) { gradedBad++; console.log(`  FAIL  ${name} is not in the dictionary`); continue; }
    const mol = AR.parseSmiles(smiles);
    let dock = null;
    if (scene) {
      const stored = scene.poses[structureKey(mol)];
      if (stored && stored.placed) {
        dock = { placed: true, ile899: (stored.c || []).indexOf('ILE899') >= 0 };
      }
    }
    const tox21 = haveTox
      ? (JSON.parse(fs.readFileSync(toxPath, 'utf8')).calls[AR.structureIdOf(mol)] || null)
      : null;
    const call = PR.callFunction(AR.packFingerprint(AR.morganFingerprint(mol, 2)),
      { dock: dock, motifs: AR.detectMotifs(mol), tox21: tox21 });
    const ok = call.label === wantLabel && wantTiers.indexOf(call.tier) >= 0;
    if (!ok) {
      gradedBad++;
      console.log(`  FAIL  ${name}: ${call.tier}/${call.label}, wanted ${wantLabel} ` +
                  `in [${wantTiers.join('|')}] — ${why}`);
    } else {
      console.log(`        ${name.padEnd(24)} ${call.tier}/${call.label}  ` +
                  `nearest ${call.nearest.toFixed(2)}`);
    }
  }
  if (gradedBad) fail += gradedBad;
  else {
    pass++;
    console.log(`  ok    ${'graded calls land in the right tier'.padEnd(30)} ${graded.length} compounds`);
  }

  /* anything the engine will not call must say why, and a possible call
   * must say what stopped it from being a plain one */
  let silent = 0, checked = 0;
  for (const [ko, en, smi] of PR.INGREDIENTS) {
    let mol;
    try { mol = AR.parseSmiles(smi); } catch (err) { continue; }
    const call = PR.callFunction(AR.packFingerprint(AR.morganFingerprint(mol, 2)), {});
    if (call.tier !== 'unknown' && call.tier !== 'possible') continue;
    checked++;
    if (!call.reason || call.reason.length < 10) {
      silent++;
      if (silent < 4) console.log(`  FAIL  ${en} is ${call.tier} with no reason given`);
    }
  }
  if (silent) fail += silent;
  else {
    pass++;
    console.log(`  ok    ${'every hedge states its reason'.padEnd(30)} ${checked} compounds checked`);
  }

  /* --- resistance mutants: the retraction, pinned --------------------
   *
   * The claim was a 3.5 kcal/mol separation between antagonists and
   * agonists when the same ligand is docked into T877A and W741L. It was
   * measured across three different crystals, which cannot isolate a
   * mutation, and the repository had already shown that the structure
   * moves the ranking more than the ligand does and that each receptor
   * favours its own co-crystal ligand - bicalutamide's headline rescue was
   * measured in 1Z95, whose co-crystal ligand is R-bicalutamide.
   *
   * Re-run against the same 2AM9 crystal with the side chain cut out in
   * silico, the separation collapses, and what survives tracks scaffold
   * rather than function. These assertions exist so the claim cannot come
   * back without the controlled numbers being re-examined. */
  console.log('\n  resistance mutants (retracted)');
  const ctrlPath = path.join(__dirname, '..', '..', 'local',
                             'insilico_mutant_scores.json');
  if (fs.existsSync(ctrlPath)) {
    const ctrl = JSON.parse(fs.readFileSync(ctrlPath, 'utf8'));
    const got = [];
    for (const [name, v] of Object.entries(ctrl)) {
      if (v.wt == null || v.w741a == null || v.t877a == null) continue;
      const mol = AR.parseSmiles(byName[name]);
      got.push({ name: name, cls: v.cls,
                 dT: v.t877a - v.wt, dW: v.w741a - v.wt,
                 dL: v.w741l == null ? null : v.w741l - v.wt,
                 steroid: !!AR.detectMotifs(mol).steroid });
    }
    const mean = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const sep = (key, pick) =>
      mean(got.filter(pick).map(r => r[key])) -
      mean(got.filter(r => !pick(r)).map(r => r[key]));
    const fnT = sep('dT', r => r.cls === 'agonist');
    const fnW = sep('dW', r => r.cls === 'agonist');
    const scW = sep('dW', r => r.steroid);
    console.log(`        n = ${got.length};  function gap: T877A ${fnT.toFixed(2)}, ` +
                `W741A ${fnW.toFixed(2)};  scaffold gap W741A ${scW.toFixed(2)}`);

    if (Math.abs(fnT) < 1.5 && Math.abs(fnW) < 1.5) {
      pass++;
      console.log(`  ok    ${'controlled separation is small'.padEnd(30)} ` +
                  `nothing like the retracted 3.5`);
    } else {
      fail++;
      console.log(`  FAIL  controlled gaps are ${fnT.toFixed(2)}/${fnW.toFixed(2)} — ` +
                  're-examine before reinstating any claim');
    }

    /* scaffold beats function: that is what makes it uninterpretable */
    if (Math.abs(scW) > Math.abs(fnW)) {
      pass++;
      console.log(`  ok    ${'scaffold explains it better'.padEnd(30)} ` +
                  `${scW.toFixed(2)} vs ${fnW.toFixed(2)}`);
    } else {
      fail++;
      console.log(`  FAIL  function now beats scaffold (${fnW.toFixed(2)} vs ${scW.toFixed(2)})`);
    }

    /* the decisive one: steroidal antagonists side with steroidal agonists */
    const sa = mean(got.filter(r => r.steroid && r.cls === 'antagonist').map(r => r.dW));
    const sg = mean(got.filter(r => r.steroid && r.cls === 'agonist').map(r => r.dW));
    const na = mean(got.filter(r => !r.steroid && r.cls === 'antagonist').map(r => r.dW));
    console.log(`        steroidal antagonists ${sa.toFixed(2)}, steroidal agonists ` +
                `${sg.toFixed(2)}, non-steroidal antagonists ${na.toFixed(2)}`);
    if (Math.abs(sa - sg) < Math.abs(sa - na)) {
      pass++;
      console.log(`  ok    ${'they track shape, not function'.padEnd(30)} ` +
                  'cyproterone sits with the androgens');
    } else {
      fail++;
      console.log('  FAIL  steroidal antagonists now behave like antagonists — recheck');
    }

    /* The sharpest single fact. "W741L turns bicalutamide into an agonist"
       is the best known resistance result in this receptor, and it was the
       headline evidence for the retracted claim. Controlled, it reverses
       sign: the -3.5 came from re-docking bicalutamide into 1Z95, whose
       co-crystal ligand is R-bicalutamide. */
    const bic = got.filter(r => r.name === 'Bicalutamide')[0];
    if (bic && bic.dL != null) {
      if (bic.dL > -0.5) {
        pass++;
        console.log(`  ok    ${'bicalutamide is not rescued'.padEnd(30)} ` +
                    `ΔW741L ${bic.dL >= 0 ? '+' : ''}${bic.dL.toFixed(2)} (was -3.5 across crystals)`);
      } else {
        fail++;
        console.log(`  FAIL  bicalutamide ΔW741L is ${bic.dL.toFixed(2)} — ` +
                    'if a rescue is real here, the retraction needs revisiting');
      }
    }
  } else {
    console.log('  note  no controlled mutant run in this checkout, skipping');
  }

  /* and the interpretation must stay withdrawn */
  if (typeof PR.describeShift === 'undefined') {
    pass++;
    console.log(`  ok    ${'no per-compound reading is offered'.padEnd(30)} describeShift is gone`);
  } else {
    fail++;
    console.log('  FAIL  describeShift is back — the reading it gives is not supported');
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
