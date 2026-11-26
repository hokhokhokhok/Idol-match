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
    compiled: null
  };
  return panels[key];
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
               '3': 'inconclusive', '4': 'cytotoxic', '9': 'not tested' };
  var calls = [], i;
  for (i = 0; i < panel.modes.length && i < code.length; i++) {
    calls.push(CODE[code.charAt(i)] || 'not tested');
  }
  var agonist = false, antagonist = false, cytotoxic = false, tested = 0;
  for (i = 0; i < calls.length; i++) {
    if (calls[i] === 'not tested') continue;
    tested++;
    if (calls[i] === 'active agonist' && panel.modes[i] === 'agonist') agonist = true;
    else if (calls[i] === 'active antagonist' && panel.modes[i] === 'antagonist') {
      antagonist = true;
    } else if (calls[i] === 'cytotoxic') cytotoxic = true;
  }
  if (!tested) return null;
  var ac50 = potency && isFinite(potency[0]) ? potency[0] : null;
  var confirmed = ac50 !== null;
  var verdict = null, unconfirmed = null;
  if (agonist) {
    if (confirmed) verdict = 'agonist'; else unconfirmed = 'agonist';
  } else if (antagonist) {
    if (confirmed) verdict = 'antagonist'; else unconfirmed = 'antagonist';
  } else if (calls.every(function (c) { return c === 'inactive' || c === 'not tested'; })) {
    verdict = 'inactive';
  }
  return {
    calls: calls, verdict: verdict, unconfirmed: unconfirmed, cytotoxic: cytotoxic,
    ac50: ac50, ac50mode: potency && potency[1] ? potency[1] : null,
    weak: !!(ac50 !== null && ac50 > 10)
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
  var ppar = evaluatePanel('pparg', fp, id, options);
  var gr = evaluatePanel('gr', fp, id, options);
  var pheno = phenotypeFor(id);
  return {
    structureId: id,
    pparg: ppar,
    gr: gr,
    pheno: pheno,
    summary: summarise(erResult, ppar, gr, pheno)
  };
}

var PANEL = {
  registerPanel: registerPanel,
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
