import React, { useState, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from './theme';

// Dialogue maison réutilisable — remplace Alert.alert (même signature) pour un
// rendu cohérent avec la charte (plus de pop-up natif gris).
type Btn = { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void };
type State = { title: string; message?: string; buttons: Btn[] } | null;

let _setState: ((s: State) => void) | null = null;

// À appeler comme Alert.alert : showAlert(titre, message?, [{text, style?, onPress?}])
export function showAlert(title: string, message?: string, buttons?: Btn[]) {
  const b = buttons && buttons.length ? buttons : [{ text: 'OK' }];
  if (_setState) _setState({ title, message, buttons: b });
}

// Couleurs fournies par le thème (clair/sombre) — voir makeSt(C) plus bas.

// À monter UNE seule fois, à la racine de l'app (par-dessus tout).
export function DialogHost() {
  const C = useTheme();
  const st = useMemo(() => makeSt(C), [C]);
  const [state, setState] = useState<State>(null);
  _setState = setState;
  const close = () => setState(null);
  return (
    <Modal visible={!!state} animationType="fade" transparent onRequestClose={close}>
      <View style={st.overlay}>
        <View style={st.card}>
          {state && (
            <>
              <Text style={st.title}>{state.title}</Text>
              {state.message ? <Text style={st.message}>{state.message}</Text> : null}
              <View style={st.btns}>
                {state.buttons.map((b, i) => {
                  const destructive = b.style === 'destructive';
                  const cancel = b.style === 'cancel';
                  return (
                    <TouchableOpacity
                      key={i}
                      activeOpacity={0.85}
                      style={[st.btn, destructive && st.btnDanger, cancel && st.btnCancel]}
                      onPress={() => { close(); if (b.onPress) b.onPress(); }}
                    >
                      <Text style={[st.btnTxt, destructive && st.btnTxtDanger, cancel && st.btnTxtCancel]}>{b.text}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeSt = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 22, width: '100%', maxWidth: 380, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  title: { fontSize: 17, fontWeight: '900', color: C.petrol, textAlign: 'center', marginBottom: 6 },
  message: { fontSize: 14, color: C.text, textAlign: 'center', lineHeight: 20 },
  btns: { marginTop: 18, gap: 9 },
  btn: { paddingVertical: 13, borderRadius: 12, backgroundColor: C.petrol, alignItems: 'center' },
  btnTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  btnCancel: { backgroundColor: C.soft },
  btnTxtCancel: { color: C.petrol },
  btnDanger: { backgroundColor: C.danger },
  btnTxtDanger: { color: '#fff' },
});
