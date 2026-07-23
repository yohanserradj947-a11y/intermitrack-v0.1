-- Bug Mélio : le mode d'une mission (cachet artiste vs heures technicien) était RE-DEVINÉ à partir des
-- heures/vacations (heuristique « heures ≥ vacations×12 »). Résultat : un artiste qui passe une mission
-- en heures avec ~12 h/jour était re-classé en cachet à la réouverture (le changement « ne s'enregistrait pas »).
-- On stocke désormais le mode EXPLICITEMENT. NULL = anciennes missions → on garde l'heuristique pour elles.
alter table public.missions add column if not exists is_cachet boolean;
