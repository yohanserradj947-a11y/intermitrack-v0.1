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
        data.cal.today = (data.cal.year === now.getFullYear() && data.cal.month === now.getMonth())
          ? now.getDate()
          : -1; // mois périmé (appli pas ouverte depuis) : pas de faux surlignage
      }
      props.renderWidget(buildWidget(name, data));
      break;
    }
    default:
      break;
  }
}
