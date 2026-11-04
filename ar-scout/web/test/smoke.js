/* smoke.js — run the built bundle against a DOM stub and check the rendered
 * HTML for "NaN" / "undefined" leaking into the page. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BUNDLE = path.join(__dirname, '..', '..', 'ar-scout.html');

/* --------------------------------------------------------------- DOM stub */

function makeElement(id) {
  const el = {
    id: id,
    value: '',
    className: '',
    children: [],
    files: null,
    _attrs: {},
    _listeners: {},
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      return child;
    },
    select() { this._selected = true; },
    focus() {},
    /* only ever asked for "button" and "tr.clickable"; parse the stored HTML
     * just enough to hand back stub rows carrying their data-smiles.
     * Results are cached until innerHTML changes, so the nodes the app binds
     * listeners to are the same objects a later query returns — otherwise
     * dispatching a click here would silently hit a listener-less copy. */
    querySelectorAll(sel) {
      this._qsa = this._qsa || {};
      if (this._qsa[sel]) return this._qsa[sel];
      this._qsa[sel] = this._query(sel);
      return this._qsa[sel];
    },
    _query(sel) {
      if (sel === 'tr.clickable') {
        const out = [];
        const re = /<tr class="clickable" data-smiles="([^"]*)"/g;
        let m;
        while ((m = re.exec(this.innerHTML))) {
          const node = makeElement('row');
          node.setAttribute('data-smiles', m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
          out.push(node);
        }
        return out;
      }
      if (sel === 'button') return this._buttons || [];
      return [];
    },
    dispatch(type, ev) {
      (this._listeners[type] || []).forEach(fn => fn(ev || {}));
    }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html || ''; },
    set(v) { this._html = String(v); this._qsa = null; },
    enumerable: true, configurable: true
  });
  return el;
}

const IDS = [
  'themebtn', 'tabs', 'q', 'names', 'run', 'single-err', 'single-out',
  'batchin', 'batchrun', 'batchfile', 'batchsample', 'batchcopy', 'batch-err',
  'batch-out', 'libin', 'libapply', 'libfile', 'libreset', 'libexport',
  'lib-err', 'lib-out', 'modelcard', 'modelcard-body',
  'tab-single', 'tab-batch', 'tab-library'
];

const elements = {};
IDS.forEach(id => { elements[id] = makeElement(id); });

/* the tab bar needs real buttons for aria-selected bookkeeping */
elements.tabs._buttons = ['single', 'batch', 'library'].map(name => {
  const b = makeElement('tabbtn-' + name);
  b.setAttribute('data-tab', name);
  return b;
});

let copied = null;

const documentStub = {
  readyState: 'complete',
  documentElement: makeElement('html'),
  body: makeElement('body'),
  getElementById(id) { return elements[id] || null; },
  createElement(tag) {
    const el = makeElement(tag);
    if (tag === 'textarea') {
      Object.defineProperty(el, 'value', {
        get() { return this._v || ''; },
        set(v) { this._v = v; copied = v; }
      });
    }
    return el;
  },
  addEventListener() {},
  execCommand() { return true; }
};

global.document = documentStub;
/* Node >= 21 defines a getter-only global navigator, so override the slot. */
Object.defineProperty(global, 'navigator', {
  value: {}, writable: true, configurable: true   /* no clipboard -> fallback */
});
global.window = global;
global.FileReader = function () {
  this.readAsText = function () { if (this.onload) this.onload(); };
};

/* ------------------------------------------------------------- run bundle */

if (!fs.existsSync(BUNDLE)) {
  console.log('  FAIL  bundle not found at ' + BUNDLE + ' — run build.py first');
  process.exit(1);
}
const html = fs.readFileSync(BUNDLE, 'utf8');
const scripts = [];
const re = /<script>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) scripts.push(m[1]);

if (scripts.length < 2) {
  console.log('  FAIL  expected 2 inline scripts in the bundle, found ' + scripts.length);
  process.exit(1);
}

vm.runInThisContext(scripts.join('\n'), { filename: 'ar-scout.bundle.js' });

const APP = global.APP;
const PR = global.PR;

/* ------------------------------------------------------------- assertions */

let pass = 0, fail = 0;

function check(name, text, extraMustContain) {
  const problems = [];
  if (!text || !text.length) problems.push('empty render');
  if (/\bNaN\b/.test(text)) problems.push('contains NaN');
  if (/\bundefined\b/.test(text)) problems.push('contains undefined');
  if (/\bnull\b/.test(text)) problems.push('contains null');
  (extraMustContain || []).forEach(frag => {
    if (text.indexOf(frag) < 0) problems.push('missing "' + frag + '"');
  });
  if (problems.length) {
    fail++;
    console.log(`  FAIL  ${name.padEnd(26)} ${problems.join(', ')}`);
    const hit = /.{0,60}(NaN|undefined|null).{0,60}/.exec(text);
    if (hit) console.log(`        near: ...${hit[0].replace(/\s+/g, ' ')}...`);
  } else {
    pass++;
    console.log(`  ok    ${name.padEnd(26)} ${text.length} chars`);
  }
}

if (!APP || !PR) {
  console.log('  FAIL  bundle did not expose the APP / PR namespaces');
  process.exit(1);
}

/* init() already ran on load: single + library are populated */
check('single (DHT, on load)', elements['single-out'].innerHTML,
      ['predicted pKi', 'Gln711', 'Thr877', '2D 구조식', '<svg', '분자식']);
check('library table', elements['lib-out'].innerHTML, ['Metribolone', 'Finasteride']);

/* a non-steroidal antagonist exercises the clash branch */
APP.runSingle('Enzalutamide');
check('single (enzalutamide)', elements['single-out'].innerHTML,
      ['H12 충돌', 'Met895']);

/* a name from the dictionary, and a raw SMILES */
APP.runSingle('미녹시딜');
check('single (minoxidil)', elements['single-out'].innerHTML, ['predicted pKi']);
APP.runSingle('OCC(O)CO');
check('single (raw SMILES)', elements['single-out'].innerHTML, ['predicted pKi']);

/* zinc pyrithione: fragments plus a metal, the awkward case */
APP.runSingle('징크피리치온');
check('single (zinc pyrithione)', elements['single-out'].innerHTML, ['predicted pKi']);

/* batch */
APP.runBatch(APP.SAMPLE_BATCH);
check('batch table', elements['batch-out'].innerHTML,
      ['Dihydrotestosterone', 'Niacinamide', 'class="bar']);

/* row click should route back into the single tab */
const rows = elements['batch-out'].querySelectorAll('tr.clickable');
if (rows.length) {
  rows[0].dispatch('click');
  /* top row of the sample batch is DHT, so the single tab must now show it */
  check('row click -> single', elements['single-out'].innerHTML,
        ['predicted pKi', 'C19H30O2']);
} else { fail++; console.log('  FAIL  batch produced no clickable rows'); }

/* TSV copy with no navigator.clipboard must fall back to a textarea */
APP.runBatch(APP.SAMPLE_BATCH);
const tsv = APP.batchTsv();
if (/\bNaN\b|\bundefined\b/.test(tsv)) { fail++; console.log('  FAIL  TSV contains NaN/undefined'); }
else { pass++; console.log(`  ok    ${'batch TSV'.padEnd(26)} ${tsv.split('\n').length} lines`); }

elements['batchcopy'].dispatch('click');
if (copied && copied.indexOf('pKi') >= 0) {
  pass++; console.log(`  ok    ${'clipboard fallback'.padEnd(26)} ${copied.length} chars`);
} else { fail++; console.log('  FAIL  clipboard fallback did not write a textarea'); }

/* library replacement, then restore */
APP.applyLibrary(JSON.stringify([
  { n: 'DHT', s: 'CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2', p: 9.3, c: 'agonist', note: 'single entry' },
  { n: 'Testosterone', s: 'CC12CCC3C(CCC4=CC(=O)CCC34C)C1CCC2O', p: 9.0, c: 'agonist', note: '' },
  { n: 'unparseable', s: 'C1CC', p: 5.0 }
]));
check('library after replace', elements['lib-out'].innerHTML, ['DHT', 'Testosterone']);
if (PR.getLibrary().length === 2) { pass++; console.log('  ok    library replaced        2 entries'); }
else { fail++; console.log('  FAIL  library replace gave ' + PR.getLibrary().length); }

/* prediction must still work against the shrunken library */
APP.runSingle('Bicalutamide');
check('single on small library', elements['single-out'].innerHTML, ['predicted pKi']);

elements['libreset'].dispatch('click');
if (PR.getLibrary().length === PR.REFERENCE_DEFAULT.length) {
  pass++; console.log('  ok    library reset           ' + PR.getLibrary().length + ' entries');
} else { fail++; console.log('  FAIL  library reset failed'); }

/* model card, including the live cross-validation block */
APP.renderModelCard();
check('model card', elements['modelcard-body'].innerHTML,
      ['MAE', 'leave-one-out', '실패 모드', 'finasteride', 'flutamide']);

/* malformed input must surface an error, not a broken render */
APP.runSingle('C1CC(((');
const errHtml = elements['single-err'].innerHTML;
if (errHtml.indexOf('해석 실패') >= 0) {
  pass++; console.log('  ok    bad SMILES error        reported');
} else { fail++; console.log('  FAIL  bad SMILES did not report an error'); }

console.log(`\n  smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
