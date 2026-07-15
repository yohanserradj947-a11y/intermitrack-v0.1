// Formules officielles reprises du site Intermitrack. À actualiser chaque année.
export const CONFIG = {
  AJ_MIN: 31.96, NH: 507, SMIC_HORAIRE: 12.31, DIV_A: 5000, PLAFOND_AJ: 174.80,
  PMSS: 4005, PLAFOND_CUMUL: 1.18, // plafond de cumul salaire + allocation = 118 % du PMSS (à actualiser chaque année)
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
// ---- Fiscalité : impôt sur le revenu (formules reprises à l'identique du site) ----
export function calculateProgressiveTax(taxableIncome:number, parts:number){
  const safeIncome=Math.max(0,Number(taxableIncome||0));
  const safeParts=Math.max(0.5,Number(parts||1));
  const incomePerPart=safeIncome/safeParts;
  const brackets=[
    {limit:11600,rate:0},{limit:29579,rate:0.11},
    {limit:84577,rate:0.30},{limit:181917,rate:0.41},{limit:Infinity,rate:0.45},
  ];
  let previous=0,taxPerPart=0,marginalRate=0;
  for(const b of brackets){
    if(incomePerPart>previous){
      const slice=Math.min(incomePerPart,b.limit)-previous;
      taxPerPart+=slice*b.rate;
      if(slice>0)marginalRate=b.rate;
    }
    if(incomePerPart<=b.limit)break;
    previous=b.limit;
  }
  const estimatedTax=Math.max(0,Math.round(taxPerPart*safeParts));
  const averageRate=safeIncome?(estimatedTax/safeIncome)*100:0;
  return {estimatedTax,averageRate,marginalRate:marginalRate*100,incomePerPart};
}

// ════════════════════════════════════════════════════════════════════════════
// DÉDUCTIONS PROFESSIONNELLES — revenus 2025, déclaration 2026
// Règles vérifiées sur sources primaires (CGI + BOFiP), voir les références ci-dessous.
// ════════════════════════════════════════════════════════════════════════════

// Forfait de 10 % — CGI art. 83, 3°, al. 2 (revenus 2025) :
// « Elle est fixée à 10 % du montant de ce revenu. Elle est limitée à 14 555 € pour l'imposition
//   des rémunérations perçues en 2025 » et « ne peut être inférieur à 509 € ».
// Le plancher est lui-même borné par la rémunération : un salaire de 400 € ouvre 400 € de
// déduction, pas 509 € (impots.gouv.fr : « au minimum 509 € — sauf si la rémunération déclarée
// est inférieure »). Sans cette borne, on sur-déduirait les employeurs marginaux.
export const FORFAIT_10_PLANCHER = 509;
export const FORFAIT_10_PLAFOND = 14555;
// Assiette maximale du 14 % : le BOFiP (§ 440/460) plafonne l'ASSIETTE, et non la déduction —
// « la partie de la rémunération […] qui n'excède pas le montant de la rémunération CORRESPONDANT
// AU plafond de la déduction forfaitaire […] de 10 % ». Soit 14 555 / 0,10 = 145 550 € pour 2025.
// L'ancien code plafonnait la DÉDUCTION à 14 555 € : facteur 10 d'écart sur l'assiette (sans effet
// aux revenus d'un intermittent, mais faux).
const ASSIETTE_14_MAX = FORFAIT_10_PLAFOND / 0.10;

function forfait10(net:number){
  return Math.min(Math.max(Math.min(net*0.10, FORFAIT_10_PLAFOND), FORFAIT_10_PLANCHER), Math.max(0, net));
}
// Frais réels spécifiques des artistes — BOI-RSA-BASE-30-50-30-30 (en vigueur depuis le 21/06/2017).
// 14 % : artistes MUSICIENS (§ 440) ; artistes CHORÉGRAPHIQUES, LYRIQUES et CHORISTES (§ 460).
//  5 % : artistes dramatiques, lyriques, cinématographiques, chorégraphiques, musiciens, choristes,
//        chefs d'orchestre et régisseurs de théâtre (§ 480) — sur-ensemble strict du 14 %.
// Les deux options sont « indépendantes l'une de l'autre » (§ 490) → cumulables (19 % au total)
// pour les seules professions éligibles aux deux.
function fraisReelsSpec(net:number, a14:boolean, a5:boolean){
  return (a14 ? Math.min(Math.max(0,net), ASSIETTE_14_MAX)*0.14 : 0) + (a5 ? Math.max(0,net)*0.05 : 0);
}

// 'artiste' était l'ancienne clé, étiquetée « Artiste dramatique / lyrique » — deux métiers que le
// BOFiP traite DIFFÉREMMENT (le lyrique a droit au 14 %, le dramatique non). On la migre vers
// 'comedien' : c'est le seul choix qui ne change PAS le résultat de ceux qui l'avaient sélectionnée
// (10 % dans les deux cas). Un artiste lyrique devra se re-sélectionner — et y gagnera.
export type ProfilFiscal='technicien'|'musicien'|'lyrique'|'danseur'|'comedien';
export function migrerProfilFiscal(v:string|null|undefined):ProfilFiscal{
  if(v==='artiste') return 'comedien';
  return (v==='technicien'||v==='musicien'||v==='lyrique'||v==='danseur'||v==='comedien') ? v : 'technicien';
}

export const PROFILS_FISCAUX:Record<ProfilFiscal,{label:string;forfaitLabel:string;netCoeff:number;a14:boolean;a5:boolean;forfait:(net:number)=>number}>={
  technicien:{label:'Technicien du spectacle',forfaitLabel:'Forfait 10 % standard',netCoeff:0.775,a14:false,a5:false,
    forfait:(net)=>Math.max(forfait10(net), fraisReelsSpec(net,false,false))},
  musicien:{label:'Musicien / choriste',forfaitLabel:'14 % + 5 % (ou forfait 10 % si plus avantageux)',netCoeff:0.775,a14:true,a5:true,
    forfait:(net)=>Math.max(forfait10(net), fraisReelsSpec(net,true,true))},
  lyrique:{label:'Artiste lyrique',forfaitLabel:'14 % + 5 % (ou forfait 10 % si plus avantageux)',netCoeff:0.79,a14:true,a5:true,
    forfait:(net)=>Math.max(forfait10(net), fraisReelsSpec(net,true,true))},
  danseur:{label:'Danseur (artiste chorégraphique)',forfaitLabel:'14 % + 5 % (ou forfait 10 % si plus avantageux)',netCoeff:0.79,a14:true,a5:true,
    forfait:(net)=>Math.max(forfait10(net), fraisReelsSpec(net,true,true))},
  // Artiste dramatique : 5 % seulement (§ 480), pas de 14 % — il n'a pas d'instrument. Son 5 % étant
  // toujours inférieur au forfait de 10 %, c'est ce dernier qui gagne en pratique.
  comedien:{label:'Comédien (artiste dramatique)',forfaitLabel:'Forfait 10 % (5 % artiste moins avantageux)',netCoeff:0.79,a14:false,a5:true,
    forfait:(net)=>Math.max(forfait10(net), fraisReelsSpec(net,false,true))},
};

export function fiscalite(i:{profil:ProfilFiscal;yearGross:number;arePercue:number;congesSpec:number;otherIncome:number;taxParts:number;totalKmAmount:number;autresFrais:number;fraisSaisis:number;}){
  const p=PROFILS_FISCAUX[i.profil]||PROFILS_FISCAUX.technicien;
  const netSalaires=Math.round(i.yearGross*p.netCoeff);
  const netAre=i.arePercue;
  const netConges=Math.round(i.congesSpec*0.88);
  const netTotal=netSalaires+netAre+netConges+i.otherIncome;
  const totalFraisReels=i.totalKmAmount+i.autresFrais+i.fraisSaisis;
  const forfait=Math.round(p.forfait(netSalaires));
  const baseAvecForfait=Math.max(0,netTotal-forfait);
  const baseAvecReels=Math.max(0,netTotal-totalFraisReels);
  const bestBase=Math.min(baseAvecForfait,baseAvecReels);
  const useForfait=forfait>=totalFraisReels;
  const csgNonDed=Math.round((i.yearGross+i.arePercue)*0.024);
  const tax=(bestBase>0&&i.taxParts>0)?calculateProgressiveTax(bestBase,i.taxParts):null;
  return {netSalaires,netConges,netTotal,totalFraisReels,forfait,baseAvecForfait,baseAvecReels,bestBase,useForfait,csgNonDed,forfaitLabel:p.forfaitLabel,profilLabel:p.label,tax};
}
