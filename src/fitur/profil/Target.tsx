import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const TARGET_DEFAULT = 100000;

const ambilTanggalLokal = () => {
  const sekarang = new Date();

  const tahun = sekarang.getFullYear();
  const bulan = String(sekarang.getMonth() + 1).padStart(2, '0');
  const hari = String(sekarang.getDate()).padStart(2, '0');

  return `${tahun}-${bulan}-${hari}`;
};

export default function Target() {
  const db = useSQLiteContext();

  const [target, setTarget] = useState(TARGET_DEFAULT);
  const [inputTarget, setInputTarget] = useState('');
  const [manual, setManual] = useState(false);

  const ambilTarget = useCallback(async () => {
    const hariIni = ambilTanggalLokal();

    const hasil = await db.getFirstAsync<{
      jumlah: number;
      manual: number;
    }>(
      `
      SELECT jumlah, manual
      FROM target
      WHERE tanggal = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      hariIni
    );

    if (hasil) {
      setTarget(hasil.jumlah);
      setManual(hasil.manual === 1);
      setInputTarget(String(hasil.jumlah));
    } else {
      setTarget(TARGET_DEFAULT);
      setManual(false);
      setInputTarget('');
    }
  }, [db]);

  useEffect(() => {
    ambilTarget();
  }, [ambilTarget]);

  const simpanTarget = async () => {
    const jumlah = Number(
      inputTarget.replace(/\D/g, '')
    );

    if (!jumlah || jumlah <= 0) {
      Alert.alert(
        'Target tidak valid',
        'Masukkan target yang lebih dari Rp0.'
      );
      return;
    }

    const hariIni = ambilTanggalLokal();

    try {
      await db.withTransactionAsync(async () => {
        /*
         * Hapus target manual sebelumnya pada hari yang sama.
         * Dengan begitu satu hari hanya memiliki satu target manual aktif.
         */
        await db.runAsync(
          `
          DELETE FROM target
          WHERE tanggal = ?
          `,
          hariIni
        );

        await db.runAsync(
          `
          INSERT INTO target (
            tanggal,
            jumlah,
            manual
          )
          VALUES (?, ?, ?)
          `,
          hariIni,
          jumlah,
          1
        );
      });

      setTarget(jumlah);
      setManual(true);
      setInputTarget(String(jumlah));

      Alert.alert(
        'Berhasil',
        `Target hari ini diatur menjadi Rp ${jumlah.toLocaleString(
          'id-ID'
        )}.`
      );
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Target tidak berhasil disimpan.'
      );
    }
  };

  const kembaliKeDefault = async () => {
    const hariIni = ambilTanggalLokal();

    try {
      await db.runAsync(
        `
        DELETE FROM target
        WHERE tanggal = ?
        `,
        hariIni
      );

      setTarget(TARGET_DEFAULT);
      setManual(false);
      setInputTarget('');

      Alert.alert(
        'Berhasil',
        `Target kembali ke default Rp ${TARGET_DEFAULT.toLocaleString(
          'id-ID'
        )}.`
      );
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Target default tidak berhasil diterapkan.'
      );
    }
  };

  return (
    <View style={{ padding: 16 }}>
      <Text
        style={{
          fontSize: 26,
          fontWeight: 'bold',
          marginBottom: 8,
        }}
      >
        Target Harian
      </Text>

      <Text style={{ marginBottom: 20 }}>
        Target akan kembali ke nilai default setiap hari
        jika kamu tidak menetapkan target manual.
      </Text>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <Text style={{ marginBottom: 6 }}>
          Target hari ini
        </Text>

        <Text
          style={{
            fontSize: 28,
            fontWeight: 'bold',
            marginBottom: 6,
          }}
        >
          Rp {target.toLocaleString('id-ID')}
        </Text>

        <Text style={{ marginBottom: 16 }}>
          {manual
            ? 'Target manual'
            : 'Target default'}
        </Text>

        <Text style={{ marginBottom: 6 }}>
          Atur target manual
        </Text>

        <TextInput
          value={inputTarget}
          onChangeText={(text) =>
            setInputTarget(
              text.replace(/\D/g, '')
            )
          }
          placeholder={`Default: Rp ${TARGET_DEFAULT.toLocaleString(
            'id-ID'
          )}`}
          keyboardType="numeric"
          style={{
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        />

        <TouchableOpacity
          onPress={simpanTarget}
          style={{
            backgroundColor: '#222',
            padding: 14,
            borderRadius: 8,
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontWeight: 'bold',
            }}
          >
            Simpan Target
          </Text>
        </TouchableOpacity>

        {manual && (
          <TouchableOpacity
            onPress={kembaliKeDefault}
            style={{
              padding: 12,
              alignItems: 'center',
            }}
          >
            <Text>
              Kembali ke Target Default
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}