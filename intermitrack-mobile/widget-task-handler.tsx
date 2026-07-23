import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { buildWidget, WidgetData } from './components/widgets/IntermitrackWidgets';

// Lit les données écrites par lib/widgetSync.ts (mêmes clés que iOS).
async function loadWidgetData(): Promise<WidgetData> {
  try {
    const [h, n, c, t] = await Promise.all([
      AsyncStorage.getItem('widget_hours'),
      AsyncStorage.getItem('widget_next'),
      AsyncStorage.getItem('widget_calendar'),
      AsyncStorage.getItem('widget_theme'),
    ]);
    return { hours: h ? JSON.parse(h) : null, next: n ? JSON.parse(n) : null, cal: c ? JSON.parse(c) : null, theme: t ? JSON.parse(t) : null };
  } catch (e) {
    return { hours: null, next: null, cal: null, theme: null };
  }
}

// Rend le widget quand Android le demande (ajout, mise à jour périodique, redimensionnement).
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const name = props.widgetInfo.widgetName;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await loadWidgetData();
      // Recalcule « aujourd'hui » à chaque rafraîchissement Android (sinon le jour surligné restait figé
      // au dernier jour où l'appli avait été ouverte). On ne surligne que si le widget montre le bon mois.
      if (data.cal) {
        const now = new Date();
        const y = (data.cal as any).year, m = (data.cal as any).month;
        if (y != null && m != null) {
          // On connaît le mois affiché : today = jour courant si c'est le bon mois, sinon pas de surlignage.
          data.cal.today = (y === now.getFullYear() && m === now.getMonth()) ? now.getDate() : -1;
        } else {
          // Vieilles données sans mois : on suppose le mois courant (mieux que rien).
          data.cal.today = now.getDate();
        }
      }
      props.renderWidget(buildWidget(name, data));
      break;
    }
    default:
      break;
  }
}
