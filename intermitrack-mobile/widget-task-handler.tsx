import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { buildWidget, WidgetData } from './components/widgets/IntermitrackWidgets';

// Lit les données écrites par lib/widgetSync.ts (mêmes clés que iOS).
async function loadWidgetData(): Promise<WidgetData> {
  try {
    const [h, n, c] = await Promise.all([
      AsyncStorage.getItem('widget_hours'),
      AsyncStorage.getItem('widget_next'),
      AsyncStorage.getItem('widget_calendar'),
    ]);
    return { hours: h ? JSON.parse(h) : null, next: n ? JSON.parse(n) : null, cal: c ? JSON.parse(c) : null };
  } catch (e) {
    return { hours: null, next: null, cal: null };
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
      props.renderWidget(buildWidget(name, data));
      break;
    }
    default:
      break;
  }
}
