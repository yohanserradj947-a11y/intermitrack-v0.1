import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

type Slice = { name: string; value: number; color: string };

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

export default function DonutChart({
  slices,
  centerTop,
  centerBottom,
}: {
  slices: Slice[];
  centerTop: string;
  centerBottom: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const size = 200, cx = 100, cy = 100, r = 80, sw = 26;

  let angle = 0;
  const paths = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const sweep = (s.value / total) * 360;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      // arc complet impossible en un seul Path : on coupe à 359.9 si une seule part
      const e = end - start >= 359.9 ? start + 359.9 : end;
      return { d: arc(cx, cy, r, start, e), color: s.color, key: s.name };
    });

  return (
    <View style={d.wrap}>
      <View style={{ width: size, height: size, alignSelf: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} stroke="#E2E8F0" strokeWidth={sw} fill="none" />
          {paths.map((p) => (
            <Path key={p.key} d={p.d} stroke={p.color} strokeWidth={sw} fill="none" strokeLinecap="butt" />
          ))}
        </Svg>
        <View style={d.center}>
          <Text style={d.top}>{centerTop}</Text>
          <Text style={d.bottom}>{centerBottom}</Text>
        </View>
      </View>
    </View>
  );
}

const d = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  top: { fontSize: 22, fontWeight: '900', color: '#1F4E5F', letterSpacing: -0.5 },
  bottom: { fontSize: 12, color: '#718096', marginTop: 2 },
});