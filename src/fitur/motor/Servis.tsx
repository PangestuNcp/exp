import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  onSelesai?: () => void;
};

type Aset = {
  id: number;
  nama: string;
  saldo: number;
};

export default function Servis({ onSelesai }: Props) {
  const db = useSQLiteContext();

  const [km, setKm] = useState('');
  const [jenisServis, setJenisServis] = useState('');
  const [harga, setHarga] = useState('');
  const [sparepart, setSparepart] = useState('');
  const [catatan, setCatatan] = useState('');
  const [asetDipilih, setAsetDipilih] = useState('');

  const [aset, setAset] = useState<Aset[]>([]);

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

  const ambilAset = useCallback(async () => {
    const periode = await ambilPeriodeAktif();

    if (!periode) {
      setAset([]);
      return;
    }

    const hasil = await db.getAllAsync<Aset>(
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
      WHERE a.boleh_untuk_pengeluaran = 1
      ORDER BY a.id
      `,
      periode.id,
      periode.id
    );

    setAset(hasil);
  }, [db]);

  useEffect(() => {
    ambilAset();
  }, [ambilAset]);

  const simpanServis = async () => {
    const kmAngka = Number(km);
    const hargaAngka = Number(harga);

    if (!Number.isFinite(kmAngka) || kmAngka <= 0) {
      Alert.alert(
        'KM tidak valid',
        'Masukkan KM saat ini.'
      );
      return;
    }

    if (!jenisServis.trim()) {
      Alert.alert(
        'Jenis servis belum diisi',
        'Masukkan jenis servis.'
      );
      return;
    }

    if (!Number.isFinite(hargaAngka) || hargaAngka <= 0) {
      Alert.alert(
        'Harga tidak valid',
        'Masukkan harga servis.'
      );
      return;
    }

    if (!asetDipilih) {
      Alert.alert(
        'Pembayaran belum dipilih',
        'Pilih aset yang digunakan untuk membayar servis.'
      );
      return;
    }

    const periode = await ambilPeriodeAktif();

    if (!periode) {
      Alert.alert(
        'Periode belum aktif',
        'Selesaikan Set Modal terlebih dahulu sebelum mencatat servis.'
      );
      return;
    }

    /*
     * Data KM motor bersifat lintas periode.
     * Karena itu pencarian KM terakhir
     * tidak menggunakan periode_id.
     */
    const kmTerakhir = await db.getFirstAsync<{
      motor_km: number | null;
    }>(
      `
      SELECT motor_km
      FROM transaksi
      WHERE jenis IN (
        'BENSIN',
        'OLI',
        'SERVIS',
        'SPAREPART'
      )
        AND motor_km IS NOT NULL
      ORDER BY motor_km DESC
      LIMIT 1
      `
    );

    if (
      kmTerakhir?.motor_km !== null &&
      kmTerakhir?.motor_km !== undefined &&
      kmAngka < kmTerakhir.motor_km
    ) {
      Alert.alert(
        'KM tidak valid',
        `KM saat ini tidak boleh lebih rendah dari KM terakhir (${kmTerakhir.motor_km.toLocaleString(
          'id-ID'
        )} KM).`
      );
      return;
    }

    /*
     * Saldo pembayaran hanya dihitung
     * dari periode aktif.
     */
    const asetPembayaran =
      await db.getFirstAsync<{
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
        WHERE a.id = ?
        `,
        periode.id,
        periode.id,
        Number(asetDipilih)
      );

    if (!asetPembayaran) {
      Alert.alert(
        'Error',
        'Aset pembayaran tidak ditemukan.'
      );
      return;
    }

    if (asetPembayaran.saldo < hargaAngka) {
      Alert.alert(
        'Saldo tidak cukup',
        `${asetPembayaran.nama} hanya memiliki saldo Rp ${asetPembayaran.saldo.toLocaleString(
          'id-ID'
        )}.`
      );
      return;
    }

    const sekarang = new Date().toISOString();

    const deskripsi = jenisServis.trim();

    let catatanLengkap = '';

    if (sparepart.trim()) {
      catatanLengkap += `Sparepart: ${sparepart.trim()}`;
    }

    if (catatan.trim()) {
      if (catatanLengkap) {
        catatanLengkap += '\n';
      }

      catatanLengkap += catatan.trim();
    }

    try {
      await db.withTransactionAsync(async () => {
        const hasilTransaksi =
          await db.runAsync(
            `
            INSERT INTO transaksi
              (
                jenis,
                jumlah,
                tanggal,
                deskripsi,
                catatan,
                motor_km,
                periode_id
              )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            'SERVIS',
            hargaAngka,
            sekarang,
            deskripsi,
            catatanLengkap || null,
            kmAngka,
            periode.id
          );

        await db.runAsync(
          `
          INSERT INTO perubahan_saldo
            (
              transaksi_id,
              aset_id,
              jumlah,
              tanggal
            )
          VALUES (?, ?, ?, ?)
          `,
          hasilTransaksi.lastInsertRowId,
          Number(asetDipilih),
          -hargaAngka,
          sekarang
        );
      });

      Alert.alert(
        'Berhasil',
        'Data servis berhasil disimpan.'
      );

      setKm('');
      setJenisServis('');
      setHarga('');
      setSparepart('');
      setCatatan('');
      setAsetDipilih('');

      await ambilAset();

      onSelesai?.();
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Data servis tidak berhasil disimpan.'
      );
    }
  };

  return (
    <View style={{ padding: 16 }}>
      <Text
        style={{
          fontSize: 22,
          fontWeight: 'bold',
          marginBottom: 16,
        }}
      >
        🔧 Servis
      </Text>

      <Text>KM Saat Ini</Text>

      <TextInput
        value={km}
        onChangeText={setKm}
        keyboardType="numeric"
        placeholder="Contoh: 12000"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 12,
          marginTop: 6,
          marginBottom: 12,
        }}
      />

      <Text>Jenis Servis</Text>

      <TextInput
        value={jenisServis}
        onChangeText={setJenisServis}
        placeholder="Contoh: Servis rutin"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 12,
          marginTop: 6,
          marginBottom: 12,
        }}
      />

      <Text>Harga</Text>

      <TextInput
        value={harga}
        onChangeText={setHarga}
        keyboardType="numeric"
        placeholder="Contoh: 100000"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 12,
          marginTop: 6,
          marginBottom: 12,
        }}
      />

      <Text>Sparepart yang Diganti</Text>

      <TextInput
        value={sparepart}
        onChangeText={setSparepart}
        placeholder="Contoh: Kampas rem, busi"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 12,
          marginTop: 6,
          marginBottom: 12,
        }}
      />

      <Text>Catatan</Text>

      <TextInput
        value={catatan}
        onChangeText={setCatatan}
        placeholder="Catatan tambahan"
        multiline
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 12,
          marginTop: 6,
          marginBottom: 16,
          minHeight: 80,
          textAlignVertical: 'top',
        }}
      />

      <Text
        style={{
          fontWeight: 'bold',
          marginBottom: 8,
        }}
      >
        Pembayaran
      </Text>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
        }}
      >
        {aset.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() =>
              setAsetDipilih(String(item.id))
            }
            style={{
              borderWidth: 1,
              borderColor:
                asetDipilih === String(item.id)
                  ? '#000'
                  : '#ccc',
              borderRadius: 8,
              padding: 12,
              marginRight: 8,
              marginBottom: 8,
            }}
          >
            <Text>{item.nama}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {aset.length === 0 && (
        <Text
          style={{
            color: '#666',
            marginBottom: 8,
          }}
        >
          Tidak ada aset pembayaran yang tersedia.
        </Text>
      )}

      <TouchableOpacity
        onPress={simpanServis}
        style={{
          backgroundColor: '#000',
          borderRadius: 8,
          padding: 14,
          marginTop: 20,
        }}
      >
        <Text
          style={{
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
          }}
        >
          Simpan Servis
        </Text>
      </TouchableOpacity>
    </View>
  );
}