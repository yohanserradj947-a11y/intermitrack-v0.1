import { View, Text, StyleSheet } from 'react-native';
export default function Calendar() {
  return <View style={s.c}><Text style={s.t}>📅 Calendrier</Text><Text style={s.s}>Bientôt disponible</Text></View>;
}
const s = StyleSheet.create({ c:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#F5F7F6'}, t:{fontSize:22,fontWeight:'900',color:'#1F4E5F'}, s:{fontSize:14,color:'#718096',marginTop:8} });