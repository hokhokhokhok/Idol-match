/* panel.js — the adipocyte-signalling panel.
 *
 * ERalpha answers one question and it is not the question "does this make
 * fat". The receptor that switches on adipocyte differentiation is PPARgamma;
 * the glucocorticoid receptor is the other half of the differentiation
 * cocktail every 3T3-L1 protocol uses. So this file runs the same read-across
 * the ER engine runs, against those two receptors, and puts the measured
 * phenotype next to them.
 *
 * Two things are kept strictly apart here and in the UI:
 *
 *   measured in this bundle   receptor activity (ChEMBL, Tox21) and
 *                             adipocyte differentiation / lipid accumulation
 *                             assays (ChEMBL, mostly 3T3-L1)
 *   background knowledge      which depot the fat ends up in. Nothing in this
 *                             bundle measures subcutaneous versus visceral:
 *                             that split comes from clinical and animal
 *                             literature and is printed as context, never as
 *                             a computed result.
 *
 * There is no pharmacophore layer for these two receptors, so a panel number
 * is read-across only and says so.
 */
'use strict';

var PANEL_SIM_CALL = 0.35;
var PANEL_SIM_FLOOR = 0.15;

var panels = {};          /* key -> { def, rows, compiled } */
var phenoTable = null;

/* Each entry: packed library, Tox21 table, crystal scene. */
function registerPanel(key, def) {
  panels[key] = {
    key: key,
    label: def.label,
    ko: def.ko,
    target: def.target,
    role: def.role,
    lib: def.lib || null,
    tox: def.tox || null,
    scene: def.scene || null,
    modes: def.modes || ['agonist', 'antagonist'],
    /* an enzyme panel: a ChEMBL potency here is inhibition, not agonism */
    enzyme: !!def.enzyme,
    compiled: null
  };
  return panels[key];
}

/* The five Tox21 screens travel as one table: a key list plus one string per
 * receptor, aligned to it. This turns a receptor's column back into the
 * lookup the panels expect. */
function sliceTox(merged, key) {
  if (!merged || !merged.calls || !merged.calls[key]) return null;
  var col = merged.calls[key], keys = merged.keys, calls = {};
  for (var i = 0; i < keys.length; i++) {
    if (col[i]) calls[keys[i]] = col[i];
  }
  var meta = (merged.panels && merged.panels[key]) || {};
  var potency = (merged.potency && merged.potency[key]) || {};
  var any = false;
  for (var k in potency) {
    if (Object.prototype.hasOwnProperty.call(potency, k)) { any = true; break; }
  }
  return { calls: calls, potency: potency, assays: meta.assays || [],
           source: meta.source || '', codes: meta.codes || {},
           /* the aromatase summary screen reports no concentrations at all,
            * so demanding one there would throw away every result it has */
           potencyRecorded: any };
}

function registerPheno(table) {
  phenoTable = table || null;
  return phenoTable && phenoTable.records
    ? Object.keys(phenoTable.records).length : 0;
}

/* The packed library is [smiles, pKi] rows plus a sparse name map; the
 * fingerprints are built once, on the first query that needs them. Over the
 * two panels that is about 7000 molecules and under a second. */
function compile(panel) {
  if (panel.compiled || !panel.lib) return panel.compiled;
  var rows = panel.lib.rows || [];
  var names = panel.lib.nm || {};
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    try {
      var mol = MOL.parseSmiles(rows[i][0]);
      out.push({
        n: names[i] || null,
        s: rows[i][0],
        p: rows[i][1],
        assays: rows[i][2] || 1,
        fp: MOL.packFingerprint(MOL.morganFingerprint(mol, 2))
      });
    } catch (err) { /* an entry that will not parse cannot be a neighbour */ }
  }
  panel.compiled = out;
  return out;
}

function readAcross(panel, fp, exclude) {
  var lib = compile(panel);
  if (!lib || !lib.length) return null;
  var neighbours = [];
  for (var i = 0; i < lib.length; i++) {
    if (exclude && lib[i].n === exclude) continue;
    neighbours.push({ n: lib[i].n || lib[i].s, named: !!lib[i].n, p: lib[i].p,
                      assays: lib[i].assays,
                      sim: MOL.tanimotoPacked(fp, lib[i].fp) });
  }
  neighbours.sort(function (a, b) { return b.sim - a.sim; });
  var top = neighbours.slice(0, 5);
  var wsum = 0, psum = 0;
  for (var k = 0; k < top.length; k++) {
    var w = Math.pow(top[k].sim, 3);
    wsum += w; psum += w * top[k].p;
  }
  var nearest = top.length ? top[0].sim : 0;
  var domain = nearest >= 0.55 ? 'in' : (nearest >= PANEL_SIM_CALL ? 'edge' : 'out');
  return {
    pKi: wsum > 1e-12 ? psum / wsum : null,
    nearest: nearest,
    domain: domain,
    usable: nearest >= PANEL_SIM_FLOOR,
    asserted: nearest >= PANEL_SIM_CALL,
    neighbours: top
  };
}

/* A two-assay Tox21 record: [agonist, antagonist]. Position is mode, and a
 * cytotoxic well is not antagonism.
 *
 * One rule is stricter here than on the ER panel, because these two screens
 * have one well per direction and no second well to agree with: an active
 * call that carries no concentration is not read as a verdict. Estradiol and
 * bisphenol A both come back "active" in the PPARgamma and GR antagonist
 * wells with no AC50 recorded, which is what a cytotoxic or interfering
 * compound looks like in a co-treatment assay built to measure a drop in
 * signal. Reading those at face value had the panel announcing that
 * estradiol blocks PPARgamma. The call is still shown, labelled for what it
 * is, but it does not set the verdict. */
function readPanelTox(panel, code, potency) {
  if (!code) return null;
  var CODE = { '0': 'inactive', '1': 'active agonist', '2': 'active antagonist',
               '3': 'inconclusive', '4': 'cytotoxic', '5': 'active inhibitor',
               '9': 'not tested' };
  var calls = [], i;
  for (i = 0; i < panel.modes.length && i < code.length; i++) {
    calls.push(CODE[code.charAt(i)] || 'not tested');
  }
  var agonist = false, antagonist = false, inhibitor = false;
  var cytotoxic = false, tested = 0;
  for (i = 0; i < calls.length; i++) {
    if (calls[i] === 'not tested') continue;
    tested++;
    if (calls[i] === 'active agonist' && panel.modes[i] === 'agonist') agonist = true;
    else if (calls[i] === 'active antagonist' && panel.modes[i] === 'antagonist') {
      antagonist = true;
    } else if (calls[i] === 'active inhibitor' && panel.modes[i] === 'inhibitor') {
      inhibitor = true;
    } else if (calls[i] === 'cytotoxic') cytotoxic = true;
  }
  if (!tested) return null;
  var ac50 = potency && isFinite(potency[0]) ? potency[0] : null;
  var confirmed = ac50 !== null;
  /* A screen that records no concentrations anywhere cannot be held to the
   * AC50 rule; its calls are kept but marked as having no potency behind
   * them. The aromatase summary screen is the one in that position. */
  var noPotencyScreen = panel.tox && panel.tox.potencyRecorded === false;
  var verdict = null, unconfirmed = null;
  var active = agonist ? 'agonist' : (antagonist ? 'antagonist' :
                                      (inhibitor ? 'inhibitor' : null));
  if (active) {
    if (confirmed || noPotencyScreen) verdict = active;
    else unconfirmed = active;
  } else if (calls.every(function (c) { return c === 'inactive' || c === 'not tested'; })) {
    verdict = 'inactive';
  }
  return {
    calls: calls, verdict: verdict, unconfirmed: unconfirmed, cytotoxic: cytotoxic,
    ac50: ac50, ac50mode: potency && potency[1] ? potency[1] : null,
    weak: !!(ac50 !== null && ac50 > 10),
    noPotencyScreen: !!noPotencyScreen
  };
}

function poseIn(panel, structureId) {
  var scene = panel.scene;
  if (!scene || !scene.poses || !structureId) return null;
  for (var i = 0; i < scene.poses.length; i++) {
    if (scene.poses[i].key === structureId) return scene.poses[i];
  }
  return null;
}

function compileScenePoses(panel, nameToSmiles) {
  var scene = panel.scene;
  if (!scene || !scene.poses) return 0;
  var done = 0;
  for (var i = 0; i < scene.poses.length; i++) {
    var pose = scene.poses[i];
    var smi = pose.s || (nameToSmiles && pose.n ? nameToSmiles[pose.n] : null);
    if (!smi) continue;
    try {
      pose.s = smi;
      pose.key = MOL.structureIdOf(MOL.parseSmiles(smi));
      done++;
    } catch (err) { /* leave it unkeyed */ }
  }
  return done;
}

/* ------------------------------------------------------------ evaluation */

function evaluatePanel(key, fp, structureId, options) {
  var panel = panels[key];
  if (!panel) return null;
  options = options || {};
  var tox = panel.tox && panel.tox.calls
    ? readPanelTox(panel, panel.tox.calls[structureId],
                   panel.tox.potency ? panel.tox.potency[structureId] : null)
    : null;
  return {
    key: key, label: panel.label, ko: panel.ko, role: panel.role,
    target: panel.target,
    read: readAcross(panel, fp, options.exclude),
    tox21: tox,
    pose: poseIn(panel, structureId),
    assays: panel.tox ? panel.tox.assays : null
  };
}

function phenotypeFor(structureId) {
  if (!phenoTable || !phenoTable.records || !structureId) return null;
  var rec = phenoTable.records[structureId];
  if (!rec) return null;
  return { name: rec.n, induces: rec.i || 0, inhibits: rec.x || 0,
           uM: rec.uM === undefined ? null : rec.uM };
}

/* ------------------------------------------------- depot orientation */

/* Which depot the fat ends up in is the question this bundle has the least
 * data for, and pretending otherwise would be the easiest way to mislead.
 * The position is worth stating plainly:
 *
 *   ChEMBL holds 0 assays described as a visceral adipocyte differentiation
 *   readout, and 62 described on human subcutaneous preadipocytes - every
 *   one of them a cytotoxicity or antiproliferative measurement, not a
 *   differentiation one. There is no depot-specific phenotype set to load.
 *
 * So the depot reading is a mechanism-level inference, assembled from
 * receptor results this bundle DOES measure plus the direction each receptor
 * is known to push storage in people and animals. Every line of it is
 * labelled as inference, and the axes are listed here with their direction
 * so the reasoning can be argued with rather than taken on faith.
 */
var DEPOT_AXES = [
  { panel: 'pparg', when: 'agonist', depot: 'sc',
    text: 'PPARγ 전장작용제 — TZD 계열은 임상에서 피하지방을 늘리고 내장지방을 줄입니다. ' +
          '지방세포 분화를 켜는 쪽이므로 총량도 늘어납니다.' },
  { panel: 'pparg', when: 'antagonist', depot: 'none',
    text: 'PPARγ 길항 — 분화를 막는 쪽이며, 부위를 가리지는 않습니다.' },
  { panel: 'er', when: 'agonist', depot: 'sc',
    text: 'ERα 작용제 — 에스트로겐 신호는 저장 부위를 둔부·대퇴 피하 쪽으로 미는 것으로 ' +
          '알려져 있습니다. 다만 배양 지방세포에서는 분화를 오히려 억제합니다.' },
  { panel: 'er', when: 'antagonist', depot: 'visceral',
    text: 'ERα 길항제 — 에스트로겐 신호를 끄는 쪽이며, 폐경·항에스트로겐 상황에서 ' +
          '지방이 내장 쪽으로 옮겨가는 것과 같은 방향입니다.' },
  { panel: 'ar', when: 'agonist', depot: 'visceral',
    text: '안드로겐 수용체 작용제 — 안드로겐 신호는 피하지방을 줄이고 복부·내장 쪽 ' +
          '축적을 늘리는 방향입니다.' },
  { panel: 'ar', when: 'antagonist', depot: 'sc',
    text: '안드로겐 수용체 길항제 — 안드로겐의 피하지방 억제를 푸는 방향입니다.' },
  { panel: 'gr', when: 'agonist', depot: 'visceral',
    text: '글루코코르티코이드 수용체 작용제 — 배양에서는 분화를 돕지만, 사람에서는 ' +
          '중심성·내장지방 증가와 연결됩니다 (쿠싱형 체지방 분포).' },
  { panel: 'hsd1', when: 'inhibitor', depot: 'sc',
    text: '11β-HSD1 저해 — 이 효소는 내장지방에서 활성이 높아 조직 안에서 코르티솔을 ' +
          '되살립니다. 막으면 내장 쪽이 선택적으로 줄어, 상대적으로 피하 비중이 올라갑니다. ' +
          '다만 이 축은 HSD1만 봅니다 — 감초 성분처럼 HSD2까지 막는 물질은 전신 ' +
          '코르티솔 작용이 오히려 늘어 반대 방향일 수 있습니다.' },
  { panel: 'arom', when: 'inhibitor', depot: 'visceral',
    text: '아로마테이즈 저해 — 피하지방은 말초에서 안드로겐을 에스트로겐으로 바꾸는 ' +
          '주 장소입니다. 막으면 국소 에스트로겐이 줄어 피하 쪽에 불리하게 작용합니다.' }
];

/* A reporter assay is not selective. The Tox21 androgen-receptor construct
 * answers to glucocorticoids as well, so dexamethasone comes back an "AR
 * agonist" at 2 nM; estradiol scores there at 1.1 uM, a thousand times
 * weaker than its own ER call. Counting those as androgen signalling would
 * have had this panel announce that estradiol pushes fat toward the viscera.
 *
 * The rule: find the compound's strongest measured concentration across the
 * panels, and treat anything more than 100-fold weaker as cross-reactivity.
 * It is still shown - it was measured - but it does not vote on the depot. */
var CROSS_FACTOR = 100;

function strongestAc50(results) {
  var best = null;
  for (var key in results) {
    if (!Object.prototype.hasOwnProperty.call(results, key)) continue;
    var t = results[key] && results[key].tox21;
    if (!t || !t.verdict || t.verdict === 'inactive') continue;
    if (t.ac50 === null || t.ac50 === undefined) continue;
    if (best === null || t.ac50 < best) best = t.ac50;
  }
  return best;
}

/* What a panel result says in one word, for matching against the axes. */
function axisReading(res) {
  if (!res) return null;
  var tox = res.tox21;
  if (tox && tox.verdict && tox.verdict !== 'inactive') {
    return { action: tox.verdict, source: 'tox21',
             grade: tox.weak || tox.noPotencyScreen ? 'measured-weak' : 'measured',
             detail: tox.ac50 !== null && tox.ac50 !== undefined
               ? 'AC50 ' + tox.ac50 + ' µM'
               : (tox.noPotencyScreen ? '농도 미기록 스크린' : '') };
  }
  if (tox && tox.verdict === 'inactive') return null;
  var read = res.read;
  if (read && read.asserted && read.pKi >= 6) {
    /* an enzyme panel's potency is inhibition; a receptor panel's is binding,
     * which does not say which direction the receptor is pushed */
    return { action: res.enzyme ? 'inhibitor' : 'binder', source: 'readacross',
             grade: read.nearest >= 0.999 ? 'measured' : 'predicted',
             detail: 'pKi ' + read.pKi.toFixed(1) +
                     (read.nearest >= 0.999 ? ' (수록된 실측치)'
                                            : ' · 유사도 ' + read.nearest.toFixed(2)) };
  }
  return null;
}

function depotOrientation(results, erResult) {
  var sc = [], visceral = [], unresolved = [], crossed = [], substrates = [];
  var strongest = strongestAc50(results);
  for (var i = 0; i < DEPOT_AXES.length; i++) {
    var axis = DEPOT_AXES[i];
    var reading, res = null;
    if (axis.panel === 'er') {
      var fc = erResult && erResult.functionCall;
      if (!fc || fc.label !== axis.when) continue;
      /* "가능성" is not enough to move a depot claim: it is the tier the
       * engine uses when it cannot assert the function at all */
      if (fc.tier !== 'measured' && fc.tier !== 'crystal' && fc.tier !== 'predicted') {
        continue;
      }
      reading = { action: fc.label, detail: '',
                  grade: (fc.tier === 'measured' || fc.tier === 'crystal')
                    ? 'measured' : 'predicted' };
    } else {
      res = results[axis.panel];
      reading = axisReading(res);
      if (!reading || reading.action !== axis.when) continue;
      /* An enzyme's ChEMBL potency cannot tell an inhibitor from a
       * substrate: testosterone sits in the aromatase set at pKi 6.8 because
       * it is what the enzyme works on, and read as an inhibitor it had this
       * panel reporting that testosterone pushes fat away from the
       * subcutaneous depot for the wrong reason. Where the compound is a
       * measured agonist of the receptor whose hormones feed the enzyme, the
       * read-across number is shown but does not vote; a direct inhibition
       * screen still does. */
      if (axis.panel === 'arom' && reading.source === 'readacross') {
        var arTox = results.ar && results.ar.tox21;
        var erAgonist = erResult && erResult.functionCall &&
                        erResult.functionCall.label === 'agonist' &&
                        (erResult.functionCall.tier === 'measured' ||
                         erResult.functionCall.tier === 'crystal');
        if ((arTox && arTox.verdict === 'agonist') || erAgonist) {
          substrates.push({ panel: axis.panel, text: axis.text,
                            detail: reading.detail });
          continue;
        }
      }
      var ac = res && res.tox21 ? res.tox21.ac50 : null;
      if (strongest !== null && ac !== null && ac !== undefined &&
          ac > strongest * CROSS_FACTOR) {
        crossed.push({ panel: axis.panel, text: axis.text, ac50: ac,
                       ratio: Math.round(ac / strongest) });
        continue;
      }
    }
    var row = { panel: axis.panel, action: axis.when, depot: axis.depot,
                text: axis.text, grade: reading.grade, detail: reading.detail };
    if (axis.depot === 'sc') sc.push(row);
    else if (axis.depot === 'visceral') visceral.push(row);
    else unresolved.push(row);
  }

  /* A steroid that lights up both the GR and the AR construct is one
   * measurement seen twice, not two findings. */
  var grActive = results.gr && results.gr.tox21 && results.gr.tox21.verdict === 'agonist';
  var arActive = results.ar && results.ar.tox21 && results.ar.tox21.verdict === 'agonist';
  if (grActive && arActive) {
    for (var v = visceral.length - 1; v >= 0; v--) {
      if (visceral[v].panel === 'ar') {
        crossed.push({ panel: 'ar', text: visceral[v].text,
                       ac50: results.ar.tox21.ac50, ratio: null, withGr: true });
        visceral.splice(v, 1);
      }
    }
  }

  /* A compound that binds an enzyme panel strongly but has no direction
   * anywhere is worth saying out loud rather than scoring as zero. */
  var headline, lean;
  if (!sc.length && !visceral.length) {
    lean = 'none';
    headline = '부위 지향을 말할 근거가 없습니다';
  } else if (sc.length && !visceral.length) {
    lean = 'sc';
    headline = '피하 쪽으로 기우는 프로필입니다 (' + sc.length + '개 축)';
  } else if (visceral.length && !sc.length) {
    lean = 'visceral';
    headline = '내장 쪽으로 기우는 프로필입니다 (' + visceral.length + '개 축)';
  } else {
    lean = 'mixed';
    headline = '축마다 방향이 엇갈립니다 (피하 ' + sc.length + ' · 내장 ' +
               visceral.length + ')';
  }
  var strongSc = sc.filter(function (r) { return r.grade === 'measured'; }).length;
  return { lean: lean, headline: headline, sc: sc, visceral: visceral,
           unresolved: unresolved, crossed: crossed, substrates: substrates,
           measuredSc: strongSc };
}

/* ------------------------------------------------- the combined reading */

/* The order is evidence first: a measured phenotype outranks a measured
 * receptor screen, which outranks read-across. Nothing here is a claim about
 * where the fat would go; that is the explainer's job, and it is marked as
 * background rather than result. */
function summarise(er, ppar, gr, pheno) {
  var reasons = [];
  var level = 'none';
  var headline = '지방세포 축과 연결되는 근거가 없습니다';

  function add(kind, text) { reasons.push({ kind: kind, text: text }); }

  if (pheno) {
    var net = pheno.induces - pheno.inhibits;
    add('measured',
        '지방세포 분화·지질축적 어세이 실측: 촉진 ' + pheno.induces + '건, 억제 ' +
        pheno.inhibits + '건' +
        (pheno.uM !== null ? ' (가장 낮은 보고 농도 ' + pheno.uM + ' µM)' : ''));
    if (net > 0) {
      level = 'measured-up';
      headline = '지방세포 분화를 촉진하는 쪽으로 실측된 물질입니다';
    } else if (net < 0) {
      level = 'measured-down';
      headline = '지방세포 분화를 억제하는 쪽으로 실측된 물질입니다';
    } else {
      level = 'mixed';
      headline = '지방세포 분화에서 촉진·억제 보고가 엇갈립니다';
    }
  }

  var pparTox = ppar && ppar.tox21;
  if (pparTox && pparTox.verdict === 'agonist') {
    add('measured', 'Tox21 PPARγ 작용제 모드 활성' +
        (pparTox.ac50 !== null ? ' (AC50 ' + pparTox.ac50 + ' µM)' : '') +
        (pparTox.weak ? ' — 다만 µM 단위 후반이라 약한 신호입니다' : ''));
    if (level === 'none') {
      level = pparTox.weak ? 'possible-up' : 'measured-up';
      headline = pparTox.weak
        ? 'PPARγ를 약하게 켜는 쪽으로 실측됐습니다'
        : 'PPARγ(지방세포 분화 스위치)를 켜는 쪽으로 실측됐습니다';
    }
  } else if (pparTox && pparTox.verdict === 'antagonist') {
    add('measured', 'Tox21 PPARγ 길항제 모드 활성 — 분화를 막는 쪽');
    if (level === 'none') { level = 'measured-down'; headline = 'PPARγ를 막는 쪽으로 실측됐습니다'; }
  } else if (pparTox && pparTox.verdict === 'inactive') {
    add('measured', 'Tox21 PPARγ 어세이에서 비활성');
  } else if (pparTox && pparTox.unconfirmed) {
    add('weak', 'Tox21 PPARγ ' +
        (pparTox.unconfirmed === 'agonist' ? '작용제' : '길항제') +
        ' 모드에서 활성 신호가 있으나 농도(AC50)가 기록되지 않았습니다 — ' +
        '세포독성·비특이 신호와 구분되지 않으므로 판정에 쓰지 않습니다');
  }

  if (ppar && ppar.pose) {
    add('crystal', 'PPARγ 결정구조 ' + ppar.pose.pdb + ' — ' +
        (ppar.pose.conf === 'af2-engaged'
          ? 'helix-12의 Tyr473과 수소결합 (전장작용제형 결합 양상)'
          : 'Tyr473을 잡지 않는 β-sheet 쪽 결합 (부분작용제형)'));
  }

  if (ppar && ppar.read && ppar.read.asserted && !pparTox) {
    var own = ppar.read.nearest >= 0.999;
    add(own ? 'measured' : 'predicted',
        own ? 'ChEMBL PPARγ 실측 pKi ' + ppar.read.pKi.toFixed(1) + ' (이 물질 자체의 기록)'
            : 'PPARγ read-across 추정 pKi ' + ppar.read.pKi.toFixed(1) +
              ' (최근접 유사도 ' + ppar.read.nearest.toFixed(2) + ')');
    if (level === 'none' && ppar.read.pKi >= 6) {
      level = 'possible-up';
      headline = 'PPARγ에 결합할 가능성이 있습니다 (구조 유사성 기반 추정)';
    }
  }

  var grTox = gr && gr.tox21;
  if (grTox && grTox.unconfirmed) {
    add('weak', 'Tox21 GR ' +
        (grTox.unconfirmed === 'agonist' ? '작용제' : '길항제') +
        ' 모드 활성 신호 (농도 미기록 — 판정에 쓰지 않음)');
  }
  if (grTox && grTox.verdict === 'agonist') {
    add('measured', 'Tox21 GR 작용제 모드 활성' +
        (grTox.ac50 !== null ? ' (AC50 ' + grTox.ac50 + ' µM)' : '') +
        ' — 분화 칵테일의 다른 축이지만, 사람에서 글루코코르티코이드는 ' +
        '피하보다 중심성·내장지방을 늘리는 쪽입니다');
    if (level === 'none') {
      level = 'possible-up';
      headline = 'GR을 켜는 쪽으로 실측됐습니다 (지방 분포는 내장 쪽)';
    }
  }

  if (er) {
    var erLabel = er.functionCall ? er.functionCall.label : null;
    if (erLabel === 'agonist') {
      add('context', 'ERα 작용제 — 에스트로겐 신호는 배양 지방세포의 분화를 ' +
          '오히려 억제하는 쪽이고, 개체 수준에서는 저장 부위를 피하(둔부·대퇴) 쪽으로 ' +
          '미는 것으로 알려져 있습니다. 이 번들이 측정한 값이 아니라 배경지식입니다.');
    } else if (erLabel === 'antagonist') {
      add('context', 'ERα 길항제 — 에스트로겐 신호를 끄는 쪽이며, 폐경·항에스트로겐 ' +
          '상황에서 지방이 내장 쪽으로 옮겨가는 것과 같은 방향입니다. ' +
          '이 번들이 측정한 값이 아니라 배경지식입니다.');
    }
  }

  if (!reasons.length) {
    add('none', 'PPARγ·GR 실측 기록이 없고 구조 유사도도 단정 기준 아래입니다');
  }
  return { level: level, headline: headline, reasons: reasons };
}

function evaluate(mol, erResult, options) {
  options = options || {};
  var fp = MOL.packFingerprint(MOL.morganFingerprint(mol, 2));
  var id = MOL.structureIdOf(mol);
  var results = {};
  for (var key in panels) {
    if (!Object.prototype.hasOwnProperty.call(panels, key)) continue;
    results[key] = evaluatePanel(key, fp, id, options);
    if (results[key]) results[key].enzyme = panels[key].enzyme;
  }
  var pheno = phenotypeFor(id);
  return {
    structureId: id,
    panels: results,
    pparg: results.pparg || null,
    gr: results.gr || null,
    pheno: pheno,
    summary: summarise(erResult, results.pparg || null, results.gr || null, pheno),
    depot: depotOrientation(results, erResult)
  };
}

var PANEL = {
  registerPanel: registerPanel,
  sliceTox: sliceTox,
  depotOrientation: depotOrientation,
  DEPOT_AXES: DEPOT_AXES,
  registerPheno: registerPheno,
  compileScenePoses: compileScenePoses,
  evaluate: evaluate,
  evaluatePanel: evaluatePanel,
  phenotypeFor: phenotypeFor,
  readPanelTox: readPanelTox,
  summarise: summarise,
  panels: panels,
  SIM_CALL: PANEL_SIM_CALL,
  SIM_FLOOR: PANEL_SIM_FLOOR
};
