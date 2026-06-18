// Formules officielles reprises du site Intermitrack. À actualiser chaque année.
export const CONFIG = {
  AJ_MIN: 31.96, NH: 507, SMIC_HORAIRE: 12.31, DIV_A: 5000, PLAFOND_AJ: 174.80,
  ARTISTE:    { aSeuil:13700, aHaut:0.36, aBas:0.05, bSeuil:690, bHaut:0.26, bBas:0.08, c:0.70, plancher:44, jourH:12 },
  TECHNICIEN: { aSeuil:14400, aHaut:0.42, aBas:0.05, bSeuil:720, bHaut:0.26, bBas:0.08, c:0.40, plancher:38, jourH:8 },
  TAUX_RETRAITE: 0.03, ABATTEMENT: 0.9825,
  CSG: { plein:0.062, reduit:0.038, exonere:0 } as Record<string,number>, CRDS: 0.005,
  FRANCHISE_CP_MAX: 30, CONGES_TAUX: 0.10, CONGES_CHARGES: 0.22,
  smicJournalier(){ return CONFIG.SMIC_HORAIRE * 151.67 / 30; },
};

// ---- Carte 1 : taux journalier (AJ) ----
export function ajBrute(annexe:'artiste'|'technicien', nht:number, sr:number){
  const k = annexe==='artiste'?CONFIG.ARTISTE:CONFIG.TECHNICIEN, m=CONFIG.AJ_MIN;
  const A = m*(k.aHaut*Math.min(sr,k.aSeuil)+k.aBas*Math.max(0,sr-k.aSeuil))/CONFIG.DIV_A;
  const B = m*(k.bHaut*Math.min(nht,k.bSeuil)+k.bBas*Math.max(0,nht-k.bSeuil))/CONFIG.NH;
  return Math.max(k.plancher, Math.min(CONFIG.PLAFOND_AJ, A+B+m*k.c));
}
export function ajNet(brute:number, csgKey:string){
  const retraite = brute*CONFIG.TAUX_RETRAITE, base = brute*CONFIG.ABATTEMENT;
  let csg = base*CONFIG.CSG[csgKey], crds = csgKey==='exonere'?0:base*CONFIG.CRDS, exempt=false;
  if(brute-retraite-csg-crds < CONFIG.smicJournalier()){ csg=0; crds=0; exempt=true; }
  return { net: brute-retraite-csg-crds, retraite, csg, crds, exempt };
}

// ---- Carte 2 : carence / franchises ----
export function carence(nht:number, prc:number, jours:number, annexe:'artiste'|'technicien', dejaInt:boolean){
  const SMIC_MENS = CONFIG.SMIC_HORAIRE*151.67;
  const SMIC_JOUR = SMIC_MENS/30;
  const diviseur = annexe==='artiste'?10:8;
  const sjm = prc/(nht/diviseur);
  const franchiseSal = Math.max(0, Math.round((prc/SMIC_MENS)*(sjm/(3*SMIC_JOUR)) - 27));
  const franchiseCP = Math.min(CONFIG.FRANCHISE_CP_MAX, Math.floor((jours*2.5)/24));
  const delai = dejaInt?0:7;
  return { sjm, franchiseSal, franchiseCP, delai, total: delai+franchiseSal+franchiseCP };
}

// ---- Carte 3 : congés spectacles ----
export function congesSpectacles(brut:number){
  const brutConges = brut*CONFIG.CONGES_TAUX;
  return { brut: brutConges, net: brutConges*(1-CONFIG.CONGES_CHARGES) };
}

// ---- Carte 4 : net à payer d'une mission ----
// % de charges salariales par statut (repris des coefficients fiscalité du site)
export const CHARGE_DEFAUT: Record<string,number> = { technicien:22.5, musicien:22.5, artiste:21 };
// Du brut au net à payer : brut − charges salariales − prélèvement à la source. Estimation indicative.
export function netAPayer(brut:number, chargePct:number, pasPct:number){
  const netImp = brut*(1-(chargePct||0)/100);
  const net = netImp*(1-(pasPct||0)/100);
  return { brut, netImp, net, charges: brut-netImp, impot: netImp-net };
}// ---- Tableau d'étalement de la carence mois par mois (repris du site) ----
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function repartir(t:number, max:number){
  const r:number[]=[]; if(t<=0)return r;
  const nb=Math.min(max,t), base=Math.floor(t/nb); let reste=t-base*nb;
  for(let i=0;i<nb;i++){ r.push(base+(reste>0?1:0)); if(reste>0)reste--; }
  return r;
}
function consoCP(t:number){
  const f=t<=24?2:3, r:number[]=[]; let reste=t;
  while(reste>0){ const m=Math.min(f,reste); r.push(m); reste-=m; }
  return r;
}

export function etalementCarence(delai:number, franchiseSal:number, franchiseCP:number, moisDebut:number){
  const fsM=repartir(franchiseSal,8), cpM=consoCP(franchiseCP);
  const n=Math.max(fsM.length, cpM.length, delai>0?1:0);
  const lignes=[]; let cumul=0;
  for(let i=0;i<n;i++){
    const d=i===0?delai:0, f=fsM[i]||0, c=cpM[i]||0, tt=d+f+c;
    cumul+=tt;
    lignes.push({ mois: MOIS[(moisDebut+i)%12], delai:d, fsal:f, fcp:c, total:tt, cumul });
  }
  return lignes;
}