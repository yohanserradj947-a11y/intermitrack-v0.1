# Soumission App Store — Intermitrack iOS

## 1. Commandes (à lancer depuis ce dossier sur Windows)

```powershell
# 1. Compiler le build iOS (cloud Apple) — demande login Apple + code 2FA
npx eas-cli build --platform ios --profile production

# 2. Envoyer le build à App Store Connect
npx eas-cli submit --platform ios --profile production --latest
```

> `eas.json` contient déjà `appleId: yohanserradj947@gmail.com`.
> ⚠️ Si ton **Apple ID Developer** est une autre adresse, corrige cette ligne dans `eas.json`.
> Au 1er `submit`, EAS demandera de créer la fiche App dans App Store Connect → réponds **Yes**.

---

## 2. ⚠️ POINT CRITIQUE — Compte de démo obligatoire

L'app a un **écran de connexion** (Supabase) et l'inscription demande une **confirmation par email**.
Le testeur Apple ne pourra PAS s'inscrire seul → **refus quasi garanti** si tu ne fournis pas de compte.

**À faire :** crée un compte de test avec email DÉJÀ confirmé, avec quelques données dedans
(missions, documents) pour que le reviewer voie l'app remplie. Puis dans App Store Connect →
section **« Informations pour l'examen App »** → coche *Connexion requise* et renseigne :

- **Nom d'utilisateur** : `demo@intermitrack.fr` (exemple — à créer)
- **Mot de passe** : `(le mot de passe du compte démo)`
- **Notes** : « Application pour intermittents du spectacle français. Utilisez le compte
  fourni pour accéder à toutes les fonctionnalités. »

---

## 3. Fiche App Store (brouillon — à coller dans App Store Connect)

**Nom (30 car. max)** : `Intermitrack`

**Sous-titre (30 car. max)** : `Missions, ARE & documents`

**Catégorie** : Productivité (secondaire : Finance)

**Description :**
```
Intermitrack rassemble toute votre intermittence au même endroit.

Conçue pour les intermittents du spectacle, l'application vous aide à suivre vos
missions, vos heures, vos droits ARE et vos documents — sans tableur ni paperasse.

FONCTIONNALITÉS
• Suivi des missions et des cachets
• Calcul et suivi des heures pour l'ARE
• Gestion de vos documents (contrats, attestations)
• Prévisions de vos droits et de votre situation
• Calendrier de votre activité
• Données chiffrées, accessibles uniquement depuis votre compte

Simple, claire, pensée pour le quotidien des intermittents.
```

**Mots-clés (100 car. max)** :
```
intermittent,spectacle,ARE,cachet,mission,france travail,pole emploi,cachetier,heures,artiste
```

**URL de support** : `https://intermitrack.fr`
**URL marketing** : `https://intermitrack.fr`
**Politique de confidentialité** : `https://intermitrack.fr/confidentialite.html`

---

## 4. Captures d'écran requises (obligatoire pour soumettre)

Apple exige AU MINIMUM le jeu **iPhone 6.9"** (iPhone 16 Pro Max etc.) :

| Taille | Résolution (px) | Obligatoire |
|--------|-----------------|-------------|
| iPhone 6.9" | **1290 × 2796** | ✅ Oui (3 à 10 captures) |
| iPhone 6.5" | 1242 × 2688 | Recommandé |

> ✅ `supportsTablet` est désormais à **false** → iPhone uniquement, AUCUNE capture iPad requise.

**Astuce :** lance l'app dans le simulateur ou prends des captures sur ton iPhone, écrans
recommandés : Accueil, Missions, Calendrier, Prévisions, Documents.

---

## 5. Vérifications techniques — ✅ OK

- ✅ `icon.png` = 1024×1024 RGB sans transparence (conforme App Store)
- ✅ `bundleIdentifier` = `fr.intermitrack.app`
- ✅ `ITSAppUsesNonExemptEncryption: false` (pas de question chiffrement export)
- ✅ `version: 1.0.0` + `autoIncrement` du build number activé
- ✅ Liens CGU / Confidentialité / Mentions légales présents dans l'app
- ✅ iPad désactivé (iPhone uniquement)
- ⚠️ Fournir le compte de démo (voir §2)

---

## 6. GUIDE COMPLET App Store Connect — quoi répondre à chaque question

### A. Création de l'app
- **Plateformes** : iOS
- **Nom** : `Intermitrack`
- **Langue principale** : Français (France)
- **Bundle ID** : `fr.intermitrack.app` (le sélectionner dans la liste)
- **UGS / SKU** : `intermitrack-ios`
- **Accès utilisateur** : Accès complet

### B. Informations sur l'app (App Information)
- **Sous-titre** : `Missions, ARE & documents`
- **Catégorie principale** : Productivité
- **Catégorie secondaire** : Finance (ou laisser vide)
- **Droits (Content Rights)** : « Non, il ne contient pas de contenu tiers »
- **URL politique de confidentialité** : `https://intermitrack.fr/confidentialite.html`

### C. Tarifs et disponibilité (Pricing)
- **Prix** : Gratuit (0 €) — ou ton tarif si payant
- **Disponibilité** : Tous les pays, ou seulement la France si tu préfères cibler

### D. Classification par âge (Age Rating) → questionnaire
- Répondre **Aucun / Non** à TOUT (violence, contenu sexuel, jeux d'argent, etc.)
- Résultat attendu : **4+**

### E. Confidentialité de l'app (App Privacy) ⚠️ LE PLUS IMPORTANT
Question « Collectez-vous des données ? » → **OUI**. Puis déclare :

| Donnée | Collectée ? | Liée à l'identité ? | Usage | Tracking ? |
|--------|-------------|---------------------|-------|-----------|
| **Adresse email** | Oui | Oui | Fonctionnalité de l'app (compte) | Non |
| **Contenu utilisateur** (missions, documents) | Oui | Oui | Fonctionnalité de l'app | Non |

- À la question **« Utilisez-vous ces données pour vous suivre (tracking) ? »** → **NON** pour tout.
- Pas de pub, pas d'analytics → ne déclare rien d'autre.

### F. Préparation de la version 1.0
- **Captures d'écran** : 3 à 10 en iPhone 6.9" (1290×2796) — voir §4
- **Texte promotionnel** : (optionnel) `Toute votre intermittence au même endroit.`
- **Description** : voir §3
- **Mots-clés** : voir §3
- **URL de support** : `https://intermitrack.fr`
- **Version** : `1.0`
- **Copyright** : `2026 Intermitrack`
- **Build** : sélectionner le build envoyé par `eas submit` (apparaît après ~10-30 min de traitement Apple)

### G. Informations pour l'examen App (Review Information) ⚠️
- **Connexion requise** : OUI
- **Identifiant** : `demo@intermitrack.fr` (compte démo à créer, email confirmé)
- **Mot de passe** : (celui du compte démo)
- **Coordonnées** : ton nom, email, téléphone
- **Notes** : « App pour intermittents du spectacle français. Utilisez le compte fourni
  pour accéder à toutes les fonctionnalités. »

### H. Conformité export (Export Compliance)
- Géré automatiquement par `ITSAppUsesNonExemptEncryption: false` → aucune question.
- Si jamais demandé : « Non » à l'utilisation de chiffrement non exempté.

### I. Diffusion de la version
- **Mise à disposition** : « Automatiquement dès l'approbation » (le plus rapide)

→ Cliquer **« Ajouter pour examen »** puis **« Soumettre pour examen »**.
