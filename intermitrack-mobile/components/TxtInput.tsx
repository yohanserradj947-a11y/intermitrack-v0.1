import { useState } from 'react';
import { TextInput, InputAccessoryView, View, TouchableOpacity, Text, Keyboard, Platform, StyleSheet } from 'react-native';
let counter = 0;
export default function TxtInput(props: any) {
  const [id] = useState(() => `txt-${counter++}`);
  const accessory = Platform.OS === 'ios' ? id : undefined;
  return (
    <>
      <TextInput {...props} inputAccessoryViewID={accessory} />
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={id}>
          <View style={a.bar}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={a.btn}>
              <Text style={a.txt}>OK</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </>
  );
}
const a = StyleSheet.create({
  bar: { backgroundColor: '#EEF4F1', padding: 8, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  btn: { paddingVertical: 8, paddingHorizontal: 22, backgroundColor: '#1F4E5F', borderRadius: 10 },
  txt: { color: 'white', fontWeight: '800', fontSize: 15 },
});