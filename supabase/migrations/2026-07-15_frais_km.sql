-- ============================================================================
-- Frais kilométriques : mémoriser les adresses et le véhicule
-- Retours JB (puissance fiscale + tranche à retaper à chaque mission) et second
-- utilisateur (adresse de départ redondante, et adresses absentes à l'édition).
--
-- À exécuter dans Supabase → SQL Editor. Sans risque : tout est en "ADD COLUMN
-- IF NOT EXISTS", rien n'est supprimé ni modifié, les données existantes ne
-- bougent pas. Peut être relancé plusieurs fois sans effet de bord.
-- ============================================================================

-- ── 1. MISSIONS : enregistrer enfin les adresses ───────────────────────────
-- Aujourd'hui on ne stocke QUE km_distance / km_rate / km_amount. Les adresses
-- saisies sont perdues à l'enregistrement : d'où « les adresses n'apparaissent
-- pas quand je modifie une mission » — elles n'ont jamais existé en base.
--
-- Les coordonnées sont stockées à côté du texte : quand on rechoisit une adresse
-- déjà connue dans le pop-up, la distance se calcule sans réinterroger le service
-- de géocodage (plus rapide, et moins d'appels).
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS km_from     text;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS km_to       text;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS km_from_lat double precision;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS km_from_lng double precision;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS km_to_lat   double precision;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS km_to_lng   double precision;

-- ── 2. PROFILES : mémoriser le véhicule ────────────────────────────────────
-- « Je ne change pas ma voiture, et mon nombre de kilomètres annuel ne change pas
--   d'une mission à l'autre ainsi que ma puissance fiscale. » (JB)
-- Valeurs attendues, identiques à l'appli ET au site (ne pas diverger) :
--   km_cv      : '3' | '4' | '5' | '6' | '7' | 'moto'   (barème, case P.6 carte grise)
--   km_tranche : '1' (≤5 000 km/an) | '2' (5 001–20 000) | '3' (>20 000)
-- Texte et non enum : le barème évolue chaque année, on ne veut pas d'une
-- migration de type à chaque changement de tranche.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS km_cv      text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS km_tranche text;

-- ── 3. Vérification ────────────────────────────────────────────────────────
-- Doit renvoyer 8 lignes (6 sur missions + 2 sur profiles).
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ( (table_name = 'missions' AND column_name LIKE 'km\_%')
     OR (table_name = 'profiles' AND column_name LIKE 'km\_%') )
ORDER BY table_name, column_name;

-- ── Note sécurité ──────────────────────────────────────────────────────────
-- Aucune policy RLS à ajouter : ces colonnes appartiennent à des tables déjà
-- protégées (missions et profiles filtrent par user_id / id). Les policies
-- existantes couvrent automatiquement les nouvelles colonnes.
