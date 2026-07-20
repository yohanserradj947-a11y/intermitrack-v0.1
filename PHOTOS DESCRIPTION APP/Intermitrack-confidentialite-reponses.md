# Intermitrack — Réponses questionnaires de confidentialité (V1, sans pub)

> À utiliser le jour J pour remplir la section "Sécurité des données" (Google Play)
> et le formulaire "Confidentialité de l'app" (Apple App Store).
> Cette V1 ne contient PAS de pub, PAS d'analytics, PAS de partage à des tiers.

---

## DONNÉES COLLECTÉES PAR L'APP

### 1. Adresse e-mail
- **Collectée** : OUI
- **Pourquoi** : création de compte et authentification (gestion du compte)
- **Liée à l'identité de l'utilisateur** : OUI
- **Partagée avec des tiers** : NON
- **Obligatoire** : OUI (nécessaire pour utiliser l'app)

### 2. Contenu créé par l'utilisateur (missions + documents)
- **Collecté** : OUI
- Missions : nom de production, dates, heures, montants, type
- Documents : fichiers uploadés par l'utilisateur (fiches de paie, AEM, contrats…)
- **Pourquoi** : fonctionnalité principale de l'app (suivi d'activité)
- **Liée à l'identité** : OUI (rattaché au compte)
- **Partagée avec des tiers** : NON
- **Stockage** : serveur sécurisé (Supabase), accès cloisonné par compte (RLS)

### 3. Date d'admission ARE
- **Stockée uniquement en local** sur l'appareil (pas envoyée sur le serveur)

---

## CE QUE L'APP NE FAIT PAS (à cocher "non")

- Localisation / GPS : NON
- Contacts : NON
- Photos / galerie / caméra : NON
- Microphone : NON
- Publicité / identifiants publicitaires : NON
- Traceurs tiers / analytics : NON
- Données de santé, financières sensibles partagées : NON
- Partage / vente de données à des tiers : NON

---

## PRATIQUES DE SÉCURITÉ (Google Play "Sécurité des données")

- Les données sont chiffrées en transit : OUI (HTTPS)
- L'utilisateur peut demander la suppression de ses données : OUI
  → fonction "Supprimer mon compte" intégrée dans l'app (supprime compte + missions + documents)
- Engagement à respecter la politique des familles : selon le public visé (app pro, pas destinée aux enfants)

---

## INFOS GÉNÉRALES POUR LES DEUX STORES

- **Politique de confidentialité (URL)** : https://intermitrack.fr/confidentialite.html
- **CGU (URL)** : https://intermitrack.fr/cgu.html
- **Mentions légales (URL)** : https://intermitrack.fr/mentions-legales.html
- **Catégorie** : Productivité (ou Finance)
- **Public cible** : adultes / professionnels (intermittents du spectacle) — PAS destinée aux enfants
- **Classification de contenu** : tout public / aucun contenu sensible
- **Compte de démo pour le testeur** : (email + mot de passe du compte démo créé)

---

## À METTRE À JOUR PLUS TARD (versions futures)

- Si ajout de PUB → déclarer la collecte de données publicitaires + identifiant publicitaire
- Si ajout d'ABONNEMENT → configurer la facturation (Google Play Billing / Apple IAP),
  mettre à jour la fiche (achats intégrés)
