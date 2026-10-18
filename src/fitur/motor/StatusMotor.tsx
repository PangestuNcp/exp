import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Text,
    TextInput,
    View,
} from 'react-native';

export default function StatusMotor() {
  const db = useSQLiteContext();

  const [km, setKm] = useState('');
  const [kmTersimpan, setKmTersimpan] = useState<number | null>(null);

  const ambilKM = useCallback(async () => {
    const hasil = await db.getFirstAsync<{ nilai: string }>(
      `SELECT nilai FROM pengaturan WHERE nama = ?`,
      'motor_km'
    );

    if (hasil) {
      setKmTersimpan(Number(hasil.nilai));
      setKm(String(hasil.nilai));
    }
  }, [db]);

  useEffect(() => {
    ambilKM();
  }, [ambilKM]);

  const simpanKM = async () => {
    const nilai = Number(km);

    if (!km.trim() || !Number.isFinite(nilai) || nilai < 0) {
      Alert.alert('Perhatian', 'Masukkan KM yang valid.');
      return;
    }

    if (
      kmTersimpan !== null &&
      nilai < kmTersimpan
    ) {
      Alert.alert(
        'Perhatian',
        `KM tidak boleh lebih kecil dari KM sebelumnya (${kmTersimpan.toLocaleString(
          'id-ID'
        )} km).`
      );
      return;
    }

    await db.runAsync(
      `INSERT INTO pengaturan (nama, nilai)
       VALUES (?, ?)
       ON CONFLICT(nama)
       DO UPDATE SET nilai = excluded.nilai`,
      'motor_km',
      String(Math.floor(nilai))
    );

    setKmTersimpan(Math.floor(nilai));

    Alert.alert('Berhasil', 'KM motor berhasil disimpan.');
  };

  return (
    <View style={{ padding: 16 }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: 'bold',
          marginBottom: 12,
        }}
      >
        Status Motor
      </Text>

      <Text style={{ marginBottom: 6 }}>
        KM Motor Saat Ini
      </Text>

      <TextInput
        value={km}
        onChangeText={setKm}
        keyboardType="numeric"
        placeholder="Contoh: 12500"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 12,
          marginBottom: 10,
        }}
      />

      <Button
        title="Simpan KM"
        onPress={simpanKM}
      />

      {kmTersimpan !== null ? (
        <Text style={{ marginTop: 12 }}>
          KM tersimpan: {kmTersimpan.toLocaleString('id-ID')} km
        </Text>
      ) : null}
    </View>
  );
}