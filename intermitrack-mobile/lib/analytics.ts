import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';

// Enregistre un évènement dans la MÊME table `analytics_events` que le site web.
// Identique à la fonction trackEvent() de app.js, côté appli mobile.
// Ne bloque jamais l'appli en cas d'erreur (réseau faible, etc.).
export async function trackEvent(eventName: string, eventData: Record<string, any> = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // pas connecté → on ne suit pas
    const { error } = await supabase.from('analytics_events').insert({
      user_id: user.id,
      event_name: eventName,
      event_data: { ...eventData, platform: 'mobile' }, // pour distinguer appli / site
    });
    if (error) console.warn('Analytics error:', error.message);
  } catch (e: any) {
    console.warn('Analytics non bloquant :', e?.message);
  }
}

// Hook à appeler en haut d'un écran : enregistre une vue à chaque fois que
// l'onglet est affiché (équivalent de activateView() / trackEvent("view_…") du site).
export function useTrackView(viewName: string) {
  useFocusEffect(
    useCallback(() => {
      trackEvent('view_' + viewName);
    }, [viewName])
  );
}
