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

export default function Sparepart({ onSelesai }: Props) {
  const db = useSQLiteContext();

  const [namaBarang, setNamaBarang] = useState('');
  const [harga, setHarga] = useState('');
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

  const simpanSparepart = async () => {
    const hargaAngka = Number(harga);

    if (!namaBarang.trim()) {
      Alert.alert(
        'Nama barang belum diisi',
        'Masukkan nama sparepart yang diganti.'
      );
      return;
    }

    if (
      !Number.isFinite(hargaAngka) ||
      hargaAngka <= 0
    ) {
      Alert.alert(
        'Harga tidak valid',
        'Masukkan harga sparepart.'
      );
      return;
    }

    if (!asetDipilih) {
      Alert.alert(
        'Pembayaran belum dipilih',
        'Pilih aset yang digunakan untuk membayar sparepart.'
      );
      return;
    }

    const periode = await ambilPeriodeAktif();

    if (!periode) {
      Alert.alert(
        'Periode belum aktif',
        'Selesaikan Set Modal terlebih dahulu sebelum mencatat sparepart.'
      );
      return;
    }

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
                periode_id
              )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            'SPAREPART',
            hargaAngka,
            sekarang,
            namaBarang.trim(),
            catatan.trim() || null,
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
        `${namaBarang.trim()} berhasil dicatat.`
      );

      setNamaBarang('');
      setHarga('');
      setCatatan('');
      setAsetDipilih('');

      await ambilAset();

      onSelesai?.();
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Data sparepart tidak berhasil disimpan.'
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
        🔩 Pergantian Sparepart
      </Text>

      <Text>Nama Barang</Text>

      <TextInput
        value={namaBarang}
        onChangeText={setNamaBarang}
        placeholder="Contoh: Ban Depan"
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
        placeholder="Contoh: 250000"
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
        placeholder="Catatan tambahan (opsional)"
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
        onPress={simpanSparepart}
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
          Simpan Sparepart
        </Text>
      </TouchableOpacity>
    </View>
  );
}