import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
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

type PengisianSebelumnya = {
  motor_km: number;
  motor_liter: number;
};

export default function Bensin({ onSelesai }: Props) {
  const db = useSQLiteContext();

  const [km, setKm] = useState('');
  const [liter, setLiter] = useState('');
  const [harga, setHarga] = useState('');
  const [asetDipilih, setAsetDipilih] = useState('');
  const [aset, setAset] = useState<Aset[]>([]);

  const [penggunaanSebelumnya, setPenggunaanSebelumnya] =
    useState<number | null>(null);

  const [rataRata, setRataRata] =
    useState<number | null>(null);

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

  const ambilAset = async () => {
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
  };

  const ambilDataBensin = async () => {
    const hasil =
      await db.getAllAsync<PengisianSebelumnya>(
        `
        SELECT
          motor_km,
          motor_liter
        FROM transaksi
        WHERE jenis = 'BENSIN'
          AND motor_km IS NOT NULL
          AND motor_liter IS NOT NULL
        ORDER BY motor_km DESC
        `
      );

    if (hasil.length === 0) {
      setPenggunaanSebelumnya(null);
      setRataRata(null);
      return;
    }

    const kmSekarang = Number(km);
    const literSekarang = Number(liter);

    if (
      !Number.isFinite(kmSekarang) ||
      !Number.isFinite(literSekarang) ||
      literSekarang <= 0
    ) {
      return;
    }

    const terakhir = hasil[0];

    const jarak =
      kmSekarang - terakhir.motor_km;

    if (
      jarak > 0 &&
      terakhir.motor_liter > 0
    ) {
      const penggunaan =
        jarak / terakhir.motor_liter;

      setPenggunaanSebelumnya(penggunaan);
    } else {
      setPenggunaanSebelumnya(null);
    }

    if (hasil.length >= 2) {
      let totalKm = 0;
      let totalLiter = 0;

      for (
        let i = 0;
        i < hasil.length - 1;
        i++
      ) {
        const sekarang = hasil[i];
        const sebelumnya = hasil[i + 1];

        const jarakAntarPengisian =
          sekarang.motor_km -
          sebelumnya.motor_km;

        if (
          jarakAntarPengisian > 0 &&
          sebelumnya.motor_liter > 0
        ) {
          totalKm += jarakAntarPengisian;
          totalLiter += sebelumnya.motor_liter;
        }
      }

      const jarakSekarang =
        kmSekarang - hasil[0].motor_km;

      if (
        jarakSekarang > 0 &&
        hasil[0].motor_liter > 0
      ) {
        totalKm += jarakSekarang;
        totalLiter += hasil[0].motor_liter;
      }

      if (totalLiter > 0) {
        setRataRata(
          totalKm / totalLiter
        );
      }
    } else {
      setRataRata(null);
    }
  };

  const simpanBensin = async () => {
    const kmAngka = Number(km);
    const literAngka = Number(liter);
    const hargaAngka = Number(harga);

    if (
      !Number.isFinite(kmAngka) ||
      !Number.isFinite(literAngka) ||
      !Number.isFinite(hargaAngka)
    ) {
      Alert.alert(
        'Data belum lengkap',
        'Isi semua data dengan benar.'
      );
      return;
    }

    if (kmAngka <= 0) {
      Alert.alert(
        'KM tidak valid',
        'Masukkan KM saat ini.'
      );
      return;
    }

    if (literAngka <= 0) {
      Alert.alert(
        'Liter tidak valid',
        'Masukkan jumlah liter.'
      );
      return;
    }

    if (hargaAngka <= 0) {
      Alert.alert(
        'Harga tidak valid',
        'Masukkan harga bensin.'
      );
      return;
    }

    if (!asetDipilih) {
      Alert.alert(
        'Pembayaran belum dipilih',
        'Pilih aset yang digunakan untuk membayar bensin.'
      );
      return;
    }

    const periode = await ambilPeriodeAktif();

    if (!periode) {
      Alert.alert(
        'Periode belum aktif',
        'Selesaikan Set Modal terlebih dahulu sebelum mencatat bensin.'
      );
      return;
    }

    // Data motor tetap lintas periode.
    const kmTerakhir =
      await db.getFirstAsync<{
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

    const sekarang =
      new Date().toISOString();

    try {
      await db.withTransactionAsync(
        async () => {
          const hasilTransaksi =
            await db.runAsync(
              `
              INSERT INTO transaksi
                (
                  jenis,
                  jumlah,
                  tanggal,
                  deskripsi,
                  motor_km,
                  motor_liter,
                  periode_id
                )
              VALUES (?, ?, ?, ?, ?, ?, ?)
              `,
              'BENSIN',
              hargaAngka,
              sekarang,
              'Bensin',
              kmAngka,
              literAngka,
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
        }
      );

      Alert.alert(
        'Berhasil',
        `Pengisian bensin Rp ${hargaAngka.toLocaleString(
          'id-ID'
        )} berhasil disimpan.`
      );

      setKm('');
      setLiter('');
      setHarga('');
      setAsetDipilih('');
      setPenggunaanSebelumnya(null);
      setRataRata(null);

      onSelesai?.();
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Pengisian bensin tidak berhasil disimpan.'
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
        ⛽ Bensin
      </Text>

      <Text>KM Saat Ini</Text>

      <TextInput
        value={km}
        onChangeText={(nilai) => {
          setKm(nilai);

          setTimeout(() => {
            ambilDataBensin();
          }, 0);
        }}
        keyboardType="numeric"
        placeholder="Contoh: 10000"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 12,
          marginTop: 6,
          marginBottom: 12,
        }}
      />

      <Text>Liter</Text>

      <TextInput
        value={liter}
        onChangeText={(nilai) => {
          setLiter(nilai);

          setTimeout(() => {
            ambilDataBensin();
          }, 0);
        }}
        keyboardType="decimal-pad"
        placeholder="Contoh: 1"
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
        placeholder="Contoh: 10000"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 12,
          marginTop: 6,
          marginBottom: 16,
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
        <TouchableOpacity
          onPress={ambilAset}
          style={{
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <Text>Pilih Pembayaran</Text>
        </TouchableOpacity>
      )}

      {penggunaanSebelumnya !== null && (
        <View
          style={{
            marginTop: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: '#ddd',
            borderRadius: 8,
          }}
        >
          <Text
            style={{ fontWeight: 'bold' }}
          >
            Penggunaan sebelumnya
          </Text>

          <Text>
            {penggunaanSebelumnya.toFixed(
              1
            )}{' '}
            KM/liter
          </Text>
        </View>
      )}

      {rataRata !== null && (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            borderWidth: 1,
            borderColor: '#ddd',
            borderRadius: 8,
          }}
        >
          <Text
            style={{ fontWeight: 'bold' }}
          >
            Rata-rata penggunaan
          </Text>

          <Text>
            {rataRata.toFixed(1)} KM/liter
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={async () => {
          if (aset.length === 0) {
            await ambilAset();
          }

          await ambilDataBensin();
          await simpanBensin();
        }}
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
          Simpan Bensin
        </Text>
      </TouchableOpacity>
    </View>
  );
}