-- ============================================================================
-- Barème kilométrique officiel : type de véhicule, puissance, km annuels réels
--
-- L'appli n'avait qu'une option « Moto », qui appliquait le barème des motos de
-- 1-2 CV (le plus faible) à TOUTES les motos, avec les tranches VOITURE, et sans
-- le montant fixe de la tranche intermédiaire. Voir lib/kmBareme.ts.
--
-- À exécuter dans Supabase → SQL Editor. Sans risque : que des ADD COLUMN
-- IF NOT EXISTS, rien n'est supprimé, les données existantes ne bougent pas.
-- Relançable sans effet de bord.
-- ============================================================================

-- km_vehicle : 'car' | 'moto' (+ de 50 cm³) | 'cyclo' (- de 50 cm³)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS km_vehicle text;

-- km_annual : kilométrage annuel RÉEL, et non une tranche.
-- Le barème comporte un montant fixe par tranche — ex. (d x 0,316) + 1 065 € pour
-- une voiture 3 CV entre 5 001 et 20 000 km. Ce montant est ANNUEL alors que l'appli
-- calcule par mission : on ne peut pas l'ajouter trente fois. On calcule donc le taux
-- réel de l'utilisateur, barème(km annuels) / km annuels, appliqué à chaque mission.
-- Sans le kilométrage exact, ce calcul est impossible.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS km_annual integer;

-- Majoration de 20 % : « Le barème pour les véhicules 100 % électriques correspond
-- au barème applicable majoré de 20 % » (BOFiP, à compter des revenus 2020).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS km_electric boolean DEFAULT false;

-- km_cv change de signification selon km_vehicle :
--   voiture : '3' | '4' | '5' | '6' | '7'
--   moto    : '1' (1-2 CV) | '3' (3-5 CV) | '5' (+ de 5 CV)
--   cyclo   : NULL (barème unique)
-- La colonne existe déjà, on ne la touche pas : la migration des anciennes valeurs
-- ('3'..'7' | 'moto') est faite côté appli par migrerVehicule(), pour ne pas modifier
-- les chiffres de quelqu'un sans qu'il le sache. km_tranche devient inutilisée mais
-- est CONSERVÉE : elle sert de source à cette migration.

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN ('km_vehicle','km_cv','km_annual','km_electric','km_tranche')
ORDER BY column_name;
