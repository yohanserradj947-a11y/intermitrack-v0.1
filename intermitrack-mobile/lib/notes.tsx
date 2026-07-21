import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useSession } from './auth';

// kind: 'note' (défaut), 'formation' ou 'arret'. Formation ET arrêt = une note avec des heures qui
// comptent dans les 507 h. Stockées dans le même JSON profiles.notes → aucune table, aucune migration.
export type ArretType = 'maternite' | 'paternite' | 'adoption' | 'accident_travail' | 'maladie';
export type Note = { id: string; date: string; endDate: string; title: string; text: string; color: string; kind?: 'note' | 'formation' | 'arret'; hours?: number; arretType?: ArretType; pendantContrat?: boolean };

export function isFormation(n: Note) { return n.kind === 'formation'; }
export function isArret(n: Note) { return n.kind === 'arret'; }

// Métadonnées d'affichage des arrêts. `ask` = on demande « pendant une mission ou entre deux ? »
// (uniquement quand le calcul en dépend : maladie et paternité).
export const ARRET_META: Record<ArretType, { label: string; icon: string; color: string; ask: boolean }> = {
  maternite:        { label: 'Congé maternité',   icon: 'woman-outline',   color: '#DB2777', ask: false },
  paternite:        { label: 'Congé paternité',   icon: 'man-outline',     color: '#2563EB', ask: false },
  adoption:         { label: 'Congé adoption',    icon: 'heart-outline',   color: '#0D9488', ask: false },
  accident_travail: { label: 'Accident du travail', icon: 'bandage-outline', color: '#DC2626', ask: false },
  maladie:          { label: 'Arrêt maladie',     icon: 'medkit-outline',  color: '#D97706', ask: false },
};
export const ARRET_ORDER: ArretType[] = ['maternite', 'paternite', 'adoption', 'accident_travail', 'maladie'];

// Nombre de jours (bornes incluses) d'un arrêt.
export function daysInclusive(startISO: string, endISO: string) {
  const a = new Date(startISO + 'T00:00:00').getTime();
  const b = new Date((endISO || startISO) + 'T00:00:00').getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

// Heures assimilées PAR JOUR d'arrêt pour les 507 h.
// Pour l'instant : AUCUN arrêt ne compte d'heures. Les formules exactes (maternité, adoption,
// accident du travail, maladie, paternité) sont EN COURS DE VÉRIFICATION sur source primaire.
// Intuition à confirmer : le statut est surtout PROTÉGÉ / mis en pause et l'indemnisation vient
// de la Sécu, plutôt qu'un cumul d'heures (peu crédible : un congé mat = 560 h sinon). On ne
// compte donc rien pour ne pas induire en erreur ; on rebranchera les bons taux une fois tranché.
export function arretHoursPerDay(_type: ArretType, _pendantContrat?: boolean): number {
  return 0;
}

// 5 couleurs de note (identiques au site).
export const NOTE_PRESETS = ['#1E6FE0', '#F0552B', '#15B86B', '#F59E0B', '#7C3AED'];

// Abréviation 3 lettres majuscules (VAC, REP, MÉD…), comme le site.
export function noteAbbr(title: string) { return (title || 'NOTE').trim().slice(0, 3).toUpperCase(); }
export function isDateInNote(dateStr: string, n: Note) { const end = n.endDate || n.date; return dateStr >= n.date && dateStr <= end; }

type Ctx = {
  notes: Note[];
  notesForDate: (dateStr: string) => Note[];
  addNote: (n: Omit<Note, 'id'>) => void;
  addNotes: (ns: Omit<Note, 'id'>[]) => void;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
};
const NotesContext = createContext<Ctx>({} as Ctx);
export function useNotes() { return useContext(NotesContext); }

const nkey = (uid: string) => `intermitrack_notes_${uid}`;

export function NotesProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const uid = session?.user?.id || null;
  const [notes, setNotes] = useState<Note[]>([]);

  // Au login : la base Supabase fait foi, sinon migration du local vers la base.
  useEffect(() => {
    (async () => {
      if (!uid) { setNotes([]); return; }
      const flagKey = `intermitrack_notes_synced_${uid}`;
      let arr: Note[] = [];
      try {
        const { data } = await supabase.from('profiles').select('notes').eq('id', uid).maybeSingle();
        const db = (data && Array.isArray(data.notes)) ? data.notes : [];
        const flag = await AsyncStorage.getItem(flagKey);
        if (db.length) { arr = db; }
        else if (!flag) { const l = await AsyncStorage.getItem(nkey(uid)); const local = l ? JSON.parse(l) : []; if (local.length) { arr = local; try { await supabase.from('profiles').upsert({ id: uid, notes: local }, { onConflict: 'id' }); } catch (e) {} } }
        await AsyncStorage.setItem(nkey(uid), JSON.stringify(arr));
        await AsyncStorage.setItem(flagKey, '1');
      } catch (e) {
        try { const l = await AsyncStorage.getItem(nkey(uid)); arr = l ? JSON.parse(l) : []; } catch (_) { arr = []; }
      }
      setNotes(arr);
    })();
  }, [uid]);

  const persist = useCallback((next: Note[]) => {
    if (uid) {
      AsyncStorage.setItem(nkey(uid), JSON.stringify(next));
      supabase.from('profiles').upsert({ id: uid, notes: next }, { onConflict: 'id' }).then(() => {}, () => {});
    }
  }, [uid]);

  const notesForDate = useCallback((dateStr: string) => notes.filter(n => isDateInNote(dateStr, n)), [notes]);

  const addNote = useCallback((n: Omit<Note, 'id'>) => {
    setNotes(prev => {
      const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const next = [...prev, { ...n, id }];
      persist(next);
      return next;
    });
  }, [persist]);

  // Ajout GROUPÉ : une seule sauvegarde pour N notes (évite la course sur l'upsert
  // quand on crée plusieurs jours de formation d'un coup).
  const addNotes = useCallback((ns: Omit<Note, 'id'>[]) => {
    if (!ns.length) return;
    setNotes(prev => {
      const base = Date.now();
      const created = ns.map((n, i) => ({ ...n, id: 'n' + (base + i).toString(36) + Math.random().toString(36).slice(2, 6) }));
      const next = [...prev, ...created];
      persist(next);
      return next;
    });
  }, [persist]);

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, ...patch } : n);
      persist(next);
      return next;
    });
  }, [persist]);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  return (
    <NotesContext.Provider value={{ notes, notesForDate, addNote, addNotes, updateNote, deleteNote }}>
      {children}
    </NotesContext.Provider>
  );
}
