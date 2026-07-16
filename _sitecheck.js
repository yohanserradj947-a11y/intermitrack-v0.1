// Banc de test : charge app.js dans un faux navigateur et lance les fonctions d'affichage sensibles.
const LS = { _: {}, getItem(k){ return this._[k] !== undefined ? this._[k] : null; }, setItem(k,v){ this._[k] = String(v); }, removeItem(k){ delete this._[k]; } };
const elHandler = {
  get(t, k){
    if (k in t) return t[k];
    if (k === 'style' || k === 'dataset') return (t[k] = {});
    if (k === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    if (k === 'querySelectorAll') return () => [];
    if (k === 'querySelector' || k === 'cloneNode') return () => makeEl();
    if (k === 'closest') return () => null;
    if (k === 'getContext') return () => new Proxy({}, { get(){ return () => {}; } });
    if (k === 'getBoundingClientRect') return () => ({ left:0, top:0, width:0, height:0, right:0, bottom:0 });
    if (k === 'value' || k === 'textContent' || k === 'innerHTML' || k === 'className' || k === 'id' || k === 'name') return t[k] !== undefined ? t[k] : '';
    if (k === 'checked' || k === 'disabled') return false;
    if (k === 'files') return [];
    if (k === 'parentNode' || k === 'parentElement' || k === 'offsetParent') return makeEl();
    if (k === 'firstChild' || k === 'lastChild' || k === 'nextSibling' || k === 'previousSibling' || k === 'nextElementSibling' || k === 'previousElementSibling') return null;
    if (k === 'children') return [];
    return () => {};
  },
  set(t, k, v){ t[k] = v; return true; }
};
function makeEl(){ return new Proxy({}, elHandler); }
global.document = { getElementById: () => makeEl(), querySelector: () => makeEl(), querySelectorAll: () => [], createElement: () => makeEl(), createElementNS: () => makeEl(), body: makeEl(), head: makeEl(), documentElement: makeEl(), addEventListener(){}, removeEventListener(){}, cookie: '' };
global.window = { addEventListener(){}, removeEventListener(){}, location: { href:'', search:'', pathname:'/', origin:'http://localhost' }, matchMedia: () => ({ matches:false, addEventListener(){}, addListener(){} }), devicePixelRatio:1, innerWidth:400, innerHeight:800, scrollTo(){}, open(){}, localStorage: LS, requestAnimationFrame(){}, setTimeout(){} };
global.navigator = { userAgent:'node', language:'fr-FR', onLine:true, clipboard: { writeText(){ return Promise.resolve(); } } };
global.localStorage = LS;
global.performance = { now: () => 0 };
global.fetch = () => Promise.resolve({ json: () => Promise.resolve({}), text: () => Promise.resolve(''), status:200, ok:true });
function makeSb(){ const p = Promise.resolve({ data: [], error: null, count: 0 }); return new Proxy(p, { get(t, k){ if (k === 'then' || k === 'catch' || k === 'finally') return t[k].bind(t); return () => makeSb(); } }); }
global.supabase = { createClient: () => new Proxy({}, { get(t, k){ if (k === 'auth') return { getUser: () => Promise.resolve({ data: { user: null } }), getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signInWithPassword: () => Promise.resolve({ data:{}, error:null }), resetPasswordForEmail: () => Promise.resolve({}), updateUser: () => Promise.resolve({}), signOut: () => Promise.resolve({}) }; if (k === 'channel') return () => ({ on(){ return this; }, subscribe(){ return this; } }); return () => makeSb(); } }) };

const code = require('fs').readFileSync('app.js', 'utf8');
const runner = [
  ';(function(){',
  '  try{',
  "    missions=[{id:'1',production:'TEST',type:'Tournage',date:'2026-07-05',endDate:'2026-07-05',hours:24,gross:920,vacations:2,emission:'',lieu:''}];",
  "    current=new Date('2026-07-15T00:00:00'); areAdmissionDate=''; aiYearOffset=0; currentUser={id:'u1'};",
  "    for(var _i=0,_a=['technicien','artiste','les_deux'];_i<_a.length;_i++){",
  '      _profil={annexe:_a[_i], taux_journalier:50, taux_impot:10};',
  '      render(); renderActualisation(); renderPoleEmploi(missions, 800); renderAllMissions(); renderFiscalite(920, missions);',
  '    }',
  "    console.log('OK - render/actualisation/poleEmploi/missions/fiscalite passent en technicien, artiste ET les_deux');",
  '  }catch(e){ console.log(\"ERREUR:\", e.message); console.log((e.stack||\"\").split(String.fromCharCode(10)).slice(1,3).join(\" | \")); process.exitCode=1; }',
  '})();'
].join('\n');
try { eval(code + '\n' + runner); }
catch (e) { console.log('ERREUR AU CHARGEMENT:', e.message); console.log((e.stack||'').split('\n').slice(1,3).join(' | ')); process.exitCode = 1; }
