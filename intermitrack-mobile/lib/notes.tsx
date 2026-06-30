import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useSession } from './auth';

export type Note = { id: string; date: string; endDate: string; title: string; text: string; color: string };

// 5 couleurs de note (identiques au site).
export const NOTE_PRESETS = ['#1E6FE0', '#F0552B', '#15B86B', '#F59E0B', '#7C3AED'];

// Abréviation 3 lettres majuscules (VAC, REP, MÉD…), comme le site.
export function noteAbbr(title: string) { return (title || 'NOTE').trim().slice(0, 3).toUpperCase(); }
export function isDateInNote(dateStr: string, n: Note) { const end = n.endDate || n.date; return dateStr >= n.date && dateStr <= end; }

type Ctx = {
  notes: Note[];
  notesForDate: (dateStr: string) => Note[];
  addNote: (n: Omit<Note, 'id'>) => void;
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
    <NotesContext.Provider value={{ notes, notesForDate, addNote, updateNote, deleteNote }}>
      {children}
    </NotesContext.Provider>
  );
}
