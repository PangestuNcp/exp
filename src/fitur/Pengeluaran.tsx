import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function Pengeluaran() {
  const db = useSQLiteContext();

  const [deskripsi, setDeskripsi] = useState('');
  const [nominal, setNominal] = useState('');
  const [metode, setMetode] = useState('Tunai');

  const [saran, setSaran] = useState<string[]>([]);

  async function ambilPeriodeAktif() {
    return await db.getFirstAsync<{
      id: number;
    }>(
      `
      SELECT id
      FROM periode
      WHERE status = 'AKTIF'
      ORDER BY id DESC
      LIMIT 1
      `
    );
  }

  async function ambilSaranDeskripsi(teks: string) {
    const kata = teks.trim();

    if (!kata) {
      setSaran([]);
      return;
    }

    const hasil = await db.getAllAsync<{ deskripsi: string }>(
      `
      SELECT deskripsi
      FROM transaksi
      WHERE jenis = 'PENGELUARAN'
        AND deskripsi IS NOT NULL
        AND LOWER(deskripsi) LIKE LOWER(?)
      GROUP BY LOWER(deskripsi)
      ORDER BY deskripsi ASC
      LIMIT 5
      `,
      `${kata}%`
    );

    setSaran(hasil.map((item) => item.deskripsi));
  }

  useEffect(() => {
    ambilSaranDeskripsi(deskripsi);
  }, [deskripsi]);

  async function simpanPengeluaran() {
    const nilai = Number(nominal);
    const namaDeskripsi = deskripsi.trim();

    if (!namaDeskripsi) {
      Alert.alert(
        'Periksa lagi',
        'Masukkan deskripsi pengeluaran.'
      );
      return;
    }

    if (!nilai || nilai <= 0) {
      Alert.alert(
        'Periksa lagi',
        'Masukkan nominal pengeluaran.'
      );
      return;
    }

    const periode = await ambilPeriodeAktif();

    if (!periode) {
      Alert.alert(
        'Periode belum aktif',
        'Selesaikan Set Modal terlebih dahulu sebelum mencatat pengeluaran.'
      );
      return;
    }

    try {
      const aset = await db.getFirstAsync<{
        id: number;
        nama: string;
        saldo: number;
      }>(
        `
        SELECT
          a.id,
          a.nama,
          COALESCE((
            SELECT SUM(ma.nominal)
            FROM modal_awal ma
            WHERE ma.aset_id = a.id
              AND ma.periode_id = ?
          ), 0)
          +
          COALESCE((
            SELECT SUM(ps.jumlah)
            FROM perubahan_saldo ps
            INNER JOIN transaksi t
              ON t.id = ps.transaksi_id
            WHERE ps.aset_id = a.id
              AND t.periode_id = ?
          ), 0) AS saldo
        FROM aset a
        WHERE a.nama = ?
        `,
        periode.id,
        periode.id,
        metode
      );

      if (!aset) {
        Alert.alert(
          'Gagal',
          `${metode} tidak ditemukan.`
        );
        return;
      }

      if (aset.saldo < nilai) {
        Alert.alert(
          'Saldo tidak cukup',
          `Saldo ${metode} saat ini Rp${aset.saldo.toLocaleString(
            'id-ID'
          )}.`
        );
        return;
      }

      const tanggal = new Date().toISOString();

      await db.withTransactionAsync(async () => {
        const transaksi = await db.runAsync(
          `
          INSERT INTO transaksi
            (
              jenis,
              jumlah,
              tanggal,
              deskripsi,
              periode_id
            )
          VALUES (?, ?, ?, ?, ?)
          `,
          'PENGELUARAN',
          nilai,
          tanggal,
          namaDeskripsi,
          periode.id
        );

        await db.runAsync(
          `
          INSERT INTO perubahan_saldo
            (transaksi_id, aset_id, jumlah, tanggal)
          VALUES (?, ?, ?, ?)
          `,
          transaksi.lastInsertRowId,
          aset.id,
          -nilai,
          tanggal
        );
      });

      setDeskripsi('');
      setNominal('');
      setSaran([]);

      Alert.alert(
        'Berhasil',
        `Pengeluaran Rp${nilai.toLocaleString(
          'id-ID'
        )} dari ${metode} berhasil disimpan.`
      );
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Pengeluaran belum berhasil disimpan.'
      );
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Deskripsi pengeluaran"
        placeholderTextColor="#9AAEAA"
        value={deskripsi}
        onChangeText={setDeskripsi}
      />

      {saran.length > 0 && (
        <View style={styles.saranContainer}>
          {saran.map((item) => (
            <TouchableOpacity
              key={item}
              style={styles.saranItem}
              onPress={() => {
                setDeskripsi(item);
                setSaran([]);
              }}
            >
              <Text style={styles.saranText}>
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="Nominal (Rp)"
        placeholderTextColor="#9AAEAA"
        keyboardType="numeric"
        value={nominal}
        onChangeText={setNominal}
      />

      <Text style={styles.label}>
        Metode pembayaran
      </Text>

      <View style={styles.metodeContainer}>
        {['Tunai', 'OVO', 'SeaBank'].map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.metodeButton,
              metode === item &&
                styles.metodeButtonAktif,
            ]}
            onPress={() => setMetode(item)}
          >
            <Text
              style={[
                styles.metodeText,
                metode === item &&
                  styles.metodeTextAktif,
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.saveButton}
        onPress={simpanPengeluaran}
      >
        <Text style={styles.saveButtonText}>Simpan</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 13,
    backgroundColor: '#F7F8F4',
  },

  input: {
    width: '100%',
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#E4EBE7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#164B57',
    backgroundColor: '#FFFFFF',
  },

  saranContainer: {
    borderWidth: 1,
    borderColor: '#E4EBE7',
    borderRadius: 12,
    marginTop: -7,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },

  saranItem: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F3F1',
  },

  saranText: {
    fontSize: 13,
    color: '#164B57',
  },

  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#164B57',
    marginBottom: -4,
  },

  metodeContainer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },

  metodeButton: {
    flex: 1,
    minHeight: 43,
    borderWidth: 1,
    borderColor: '#E4EBE7',
    borderRadius: 12,
    paddingHorizontal: 5,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  metodeButtonAktif: {
    backgroundColor: '#E5F1EA',
    borderColor: '#55A982',
  },

  metodeText: {
    fontSize: 13,
    color: '#63818A',
    fontWeight: '600',
  },

  metodeTextAktif: {
    color: '#277B67',
    fontWeight: '700',
  },

  saveButton: {
    width: '100%',
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: '#277B67',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});