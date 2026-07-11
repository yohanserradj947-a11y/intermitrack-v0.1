import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

// Widgets Android d'Intermitrack — reproduisent fidèlement les widgets iOS (targets/widget/index.swift),
// à partir des MÊMES données calculées par lib/widgetSync.ts (widget_hours / widget_next / widget_calendar).

export type WidgetData = {
  hours: { done: number; planned: number; target: number } | null;
  next: { when: string; date: string; prod: string; lieu: string; hours: number; price: number } | null;
  cal: {
    title: string; firstWeekday: number; daysInMonth: number; today: number;
    days: { d: number; ab: string; g: string[]; txt: string; hours: number; more: number; hach: boolean; note: string }[];
    upcoming?: { date: string; prod: string; color: string; hours: number; price: number }[];
  } | null;
};

type Hex = `#${string}`;
const TRANSPARENT: Hex = '#00000000';
// Ramène n'importe quelle valeur vers une couleur hex valide (les composants exigent `#...`).
const hx = (s: any): Hex => (typeof s === 'string' && s[0] === '#' ? (s as Hex) : '#000000');
type Pal = { bg: Hex; text: Hex; muted: Hex; track: Hex; petrol: Hex; green: Hex; orange: Hex; line: Hex };
function pal(dark: boolean): Pal {
  return dark
    ? { bg: '#161C21', text: '#FFFFFF', muted: '#9FB0BB', track: '#2A363D', petrol: '#7ACCE0', green: '#3FB477', orange: '#F97316', line: '#2A363D' }
    : { bg: '#FFFFFF', text: '#1A2330', muted: '#8A97A0', track: '#E6EAEC', petrol: '#1F4E5F', green: '#12754A', orange: '#F97316', line: '#E6EAEC' };
}
const fmtH = (h: number) => (h === Math.round(h) ? String(Math.round(h)) : h.toFixed(1));
const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ---------- HEURES / 507 h ----------
function HoursWidget(data: WidgetData['hours'], p: Pal) {
  const done = Math.max(0, data?.done || 0);
  const planned = Math.max(0, data?.planned || 0);
  const target = data?.target && data.target > 0 ? data.target : 507;
  const pct = Math.round(((done + planned) / target) * 100);
  const reached = pct >= 100;
  const doneW = Math.max(0, Math.round(Math.min(done / target, 1) * 1000));
  const planW = Math.max(0, Math.round(Math.min(planned / target, Math.max(0, 1 - done / target)) * 1000));
  const restW = Math.max(0, 1000 - doneW - planW);
  const restantes = Math.max(0, Math.round(target - done - planned));
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', backgroundColor: p.bg, borderRadius: 24, padding: 14 }}>
      <TextWidget text="HEURES / DROITS" style={{ fontSize: 10, fontWeight: '700', color: p.muted, letterSpacing: 0.5 }} />
      <FlexWidget style={{ flex: 1, width: 'match_parent' }} />
      <TextWidget text={`${pct} %`} style={{ fontSize: 30, fontWeight: '900', color: reached ? p.green : p.petrol }} />
      <FlexWidget style={{ flexDirection: 'row', height: 12, width: 'match_parent', borderRadius: 6, marginTop: 8, overflow: 'hidden' }}>
        <FlexWidget style={{ height: 'match_parent', flex: doneW, backgroundColor: p.green }} />
        <FlexWidget style={{ height: 'match_parent', flex: planW, backgroundColor: p.orange }} />
        <FlexWidget style={{ height: 'match_parent', flex: restW, backgroundColor: p.track }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 10, marginTop: 8 }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 4 }}>
          <FlexWidget style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: p.green }} />
          <TextWidget text={`${Math.round(done)} h faites`} style={{ fontSize: 10, fontWeight: '700', color: p.text }} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 4 }}>
          <FlexWidget style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: p.orange }} />
          <TextWidget text={`${Math.round(planned)} h prév.`} style={{ fontSize: 10, fontWeight: '700', color: p.text }} />
        </FlexWidget>
      </FlexWidget>
      <TextWidget text={restantes > 0 ? `sur ${target} h · ${restantes} h restantes` : `${target} h atteint !`} style={{ fontSize: 9.5, fontWeight: '600', color: reached ? p.green : p.muted, marginTop: 8 }} maxLines={1} />
    </FlexWidget>
  );
}

// ---------- PROCHAINE MISSION ----------
function NextWidget(data: WidgetData['next'], p: Pal) {
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', backgroundColor: p.bg, borderRadius: 24, padding: 14 }}>
      <TextWidget text="PROCHAINE MISSION" style={{ fontSize: 10, fontWeight: '700', color: p.muted, letterSpacing: 0.5 }} />
      {data ? (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', flex: 1 }}>
          <TextWidget text={(data.when || '').toUpperCase()} style={{ fontSize: 11, fontWeight: '900', color: p.orange, marginTop: 2 }} />
          <TextWidget text={data.prod || ''} style={{ fontSize: 18, fontWeight: '900', color: p.text }} maxLines={1} truncate="END" />
          <FlexWidget style={{ flex: 1, width: 'match_parent' }} />
          <TextWidget text={`${data.date} · ${fmtH(data.hours)} h`} style={{ fontSize: 12, fontWeight: '600', color: p.text }} maxLines={1} />
          <TextWidget text={[data.price > 0 ? `${Math.round(data.price)} €` : '', data.lieu].filter(Boolean).join(' · ')} style={{ fontSize: 12, fontWeight: '400', color: p.muted, marginTop: 2 }} maxLines={1} />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flex: 1, width: 'match_parent', justifyContent: 'center' }}>
          <TextWidget text="Aucune mission à venir" style={{ fontSize: 13, fontWeight: '400', color: p.muted }} />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

// Grille de cases : renvoie un tableau de lignes de 7 jours (0 = case vide).
function monthCells(cal: NonNullable<WidgetData['cal']>): number[] {
  const leading = Math.max(0, cal.firstWeekday - 1);
  const cells: number[] = [];
  for (let i = 0; i < leading; i++) cells.push(0);
  for (let d = 1; d <= Math.max(1, cal.daysInMonth); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(0);
  return cells;
}
function chunk7(a: number[]): number[][] { const rows: number[][] = []; for (let i = 0; i < a.length; i += 7) rows.push(a.slice(i, i + 7)); return rows; }
function byDay(cal: NonNullable<WidgetData['cal']>) { const m: Record<number, any> = {}; cal.days.forEach((x) => { if (m[x.d] === undefined) m[x.d] = x; }); return m; }

// ---------- CALENDRIER : ligne "À venir" ----------
function upcomingRows(cal: NonNullable<WidgetData['cal']>, p: Pal, withPrice: boolean) {
  const up = (cal.upcoming || []).slice(0, 3);
  if (up.length === 0) return [<TextWidget key="none" text="Aucune mission à venir" style={{ fontSize: 12, fontWeight: '400', color: p.muted }} />];
  return up.map((m, i) => (
    <FlexWidget key={i} style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8, width: 'match_parent', marginBottom: 7 }}>
      <FlexWidget style={{ width: 4, height: 26, borderRadius: 2, backgroundColor: hx(m.color || p.petrol) }} />
      <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
        <TextWidget text={m.prod || ''} style={{ fontSize: 13, fontWeight: '900', color: p.text }} maxLines={1} truncate="END" />
        <TextWidget text={`${m.date} · ${fmtH(m.hours)} h${withPrice && m.price > 0 ? ` · ${Math.round(m.price)} €` : ''}`} style={{ fontSize: 10, fontWeight: '500', color: p.muted }} maxLines={1} />
      </FlexWidget>
    </FlexWidget>
  ));
}

// ---------- CALENDRIER — AGENDA (large/horizontal) : mini-cal gauche + à venir droite ----------
function CalendarAgendaWidget(cal: WidgetData['cal'], p: Pal) {
  if (!cal) return EmptyCal(p);
  const bd = byDay(cal);
  const rows = chunk7(monthCells(cal));
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'row', backgroundColor: p.bg, borderRadius: 24, padding: 14, flexGap: 12 }}>
      <FlexWidget style={{ flexDirection: 'column', width: 150 }}>
        <TextWidget text={cal.title} style={{ fontSize: 11, fontWeight: '900', color: p.text, marginBottom: 3 }} maxLines={1} />
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', marginBottom: 2 }}>
          {WD.map((w, i) => (<FlexWidget key={i} style={{ flex: 1, alignItems: 'center' }}><TextWidget text={w} style={{ fontSize: 7, fontWeight: '700', color: p.muted }} /></FlexWidget>))}
        </FlexWidget>
        {rows.map((row, ri) => (
          <FlexWidget key={ri} style={{ flexDirection: 'row', width: 'match_parent', height: 16, marginBottom: 2, flexGap: 2 }}>
            {row.map((d, ci) => miniCell(d, bd[d], cal.today, p, ci))}
          </FlexWidget>
        ))}
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
        <TextWidget text="À VENIR" style={{ fontSize: 9.5, fontWeight: '900', color: p.orange, marginBottom: 8, letterSpacing: 0.4 }} />
        {upcomingRows(cal, p, false)}
      </FlexWidget>
    </FlexWidget>
  );
}
function miniCell(d: number, info: any, today: number, p: Pal, key: number) {
  if (d === 0) return <FlexWidget key={key} style={{ flex: 1, height: 'match_parent' }} />;
  const mission = info && info.g && info.g.length ? info : null;
  const isToday = d === today;
  const bg: Hex = isToday ? p.orange : mission ? hx(mission.g[1] || mission.g[0]) : TRANSPARENT;
  const txt: Hex = isToday ? '#FFFFFF' : mission ? hx(mission.txt || '#FFFFFF') : p.text;
  return (
    <FlexWidget key={key} style={{ flex: 1, height: 'match_parent', borderRadius: 3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text={String(d)} style={{ fontSize: 8, fontWeight: isToday || mission ? '900' : '500', color: txt }} />
    </FlexWidget>
  );
}

// ---------- CALENDRIER — MOIS (carré) : grand mois + à venir dessous ----------
function CalendarMonthWidget(cal: WidgetData['cal'], p: Pal) {
  if (!cal) return EmptyCal(p);
  const bd = byDay(cal);
  const rows = chunk7(monthCells(cal));
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', backgroundColor: p.bg, borderRadius: 24, padding: 14 }}>
      <TextWidget text={cal.title} style={{ fontSize: 16, fontWeight: '900', color: p.text, marginBottom: 6 }} maxLines={1} />
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', marginBottom: 3 }}>
        {WD.map((w, i) => (<FlexWidget key={i} style={{ flex: 1, alignItems: 'center' }}><TextWidget text={w} style={{ fontSize: 10, fontWeight: '700', color: p.muted }} /></FlexWidget>))}
      </FlexWidget>
      {rows.map((row, ri) => (
        <FlexWidget key={ri} style={{ flexDirection: 'row', width: 'match_parent', flexGap: 4, marginBottom: 4 }}>
          {row.map((d, ci) => bigCell(d, bd[d], cal.today, p, ci))}
        </FlexWidget>
      ))}
      <FlexWidget style={{ height: 1, width: 'match_parent', backgroundColor: p.line, marginTop: 6, marginBottom: 8 }} />
      {upcomingRows(cal, p, true)}
    </FlexWidget>
  );
}
function bigCell(d: number, info: any, today: number, p: Pal, key: number) {
  if (d === 0) return <FlexWidget key={key} style={{ flex: 1, height: 42 }} />;
  const mission = info && info.g && info.g.length ? info : null;
  const isToday = d === today;
  return (
    <FlexWidget key={key} style={{ flex: 1, height: 42, flexDirection: 'column', alignItems: 'center', flexGap: 2 }}>
      <FlexWidget style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? p.orange : TRANSPARENT }}>
        <TextWidget text={String(d)} style={{ fontSize: 11, fontWeight: isToday ? '900' : '500', color: isToday ? '#FFFFFF' : p.text }} />
      </FlexWidget>
      {mission ? (
        <FlexWidget style={{ flex: 1, width: 'match_parent', borderRadius: 3, backgroundColor: hx(mission.g[1] || mission.g[0]), alignItems: 'center', justifyContent: 'center' }}>
          <TextWidget text={mission.ab || ''} style={{ fontSize: 8, fontWeight: '900', color: hx(mission.txt || '#FFFFFF') }} maxLines={1} />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flex: 1, width: 'match_parent' }} />
      )}
    </FlexWidget>
  );
}

function EmptyCal(p: Pal) {
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', backgroundColor: p.bg, borderRadius: 24, padding: 16, justifyContent: 'center', alignItems: 'center' }}>
      <TextWidget text="Ouvre Intermitrack pour afficher tes missions." style={{ fontSize: 12, fontWeight: '400', color: p.muted, textAlign: 'center' }} />
    </FlexWidget>
  );
}

// Construit un widget par nom, pour un thème donné.
function buildOne(name: string, data: WidgetData, dark: boolean) {
  const p = pal(dark);
  switch (name) {
    case 'Hours': return HoursWidget(data.hours, p);
    case 'Next': return NextWidget(data.next, p);
    case 'CalendarAgenda': return CalendarAgendaWidget(data.cal, p);
    case 'CalendarMonth': return CalendarMonthWidget(data.cal, p);
    default: return HoursWidget(data.hours, p);
  }
}
// Renvoie les deux variantes (clair/sombre) — la lib choisit selon le thème du téléphone.
export function buildWidget(name: string, data: WidgetData) {
  return { light: buildOne(name, data, false), dark: buildOne(name, data, true) };
}
