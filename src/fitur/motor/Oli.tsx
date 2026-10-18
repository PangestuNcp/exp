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

type OliTerakhir = {
  motor_km: number;
  motor_interval: number;
  tanggal: string;
};

export default function Oli({ onSelesai }: Props) {
  const db = useSQLiteContext();

  const [km, setKm] = useState('');
  const [harga, setHarga] = useState('');
  const [interval, setInterval] = useState('');
  const [asetDipilih, setAsetDipilih] = useState('');

  const [aset, setAset] = useState<Aset[]>([]);
  const [oliTerakhir, setOliTerakhir] =
    useState<OliTerakhir | null>(null);

  const [kmBerikutnya, setKmBerikutnya] =
    useState<number | null>(null);

  const [statusOli, setStatusOli] = useState('');

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

  const ambilOliTerakhir =
    useCallback(async () => {
      // Data motor tetap lintas periode.
      const hasil =
        await db.getFirstAsync<OliTerakhir>(
          `
          SELECT
            motor_km,
            motor_interval,
            tanggal
          FROM transaksi
          WHERE jenis = 'OLI'
            AND motor_km IS NOT NULL
            AND motor_interval IS NOT NULL
          ORDER BY tanggal DESC, id DESC
          LIMIT 1
          `
        );

      setOliTerakhir(hasil ?? null);

      if (!hasil) {
        setKmBerikutnya(null);
        setStatusOli('');
        return;
      }

      const berikutnya =
        hasil.motor_km + hasil.motor_interval;

      setKmBerikutnya(berikutnya);

      const kmSekarang = Number(km);

      if (
        !Number.isFinite(kmSekarang) ||
        km === ''
      ) {
        setStatusOli('');
        return;
      }

      const sisa =
        berikutnya - kmSekarang;

      if (sisa <= 0) {
        setStatusOli(
          '🔴 Sudah waktunya mengganti oli sekarang.'
        );
      } else if (sisa <= 200) {
        setStatusOli(
          `⚠️ Sedikit lagi perlu mengganti oli. Sisa ${sisa.toLocaleString(
            'id-ID'
          )} KM.`
        );
      } else {
        setStatusOli(
          `Masih ${sisa.toLocaleString(
            'id-ID'
          )} KM lagi menuju jadwal ganti oli.`
        );
      }
    }, [db, km]);

  useEffect(() => {
    ambilAset();
  }, [ambilAset]);

  useEffect(() => {
    ambilOliTerakhir();
  }, [ambilOliTerakhir]);

  const simpanOli = async () => {
    const kmAngka = Number(km);
    const hargaAngka = Number(harga);
    const intervalAngka = Number(interval);

    if (
      !Number.isFinite(kmAngka) ||
      kmAngka <= 0
    ) {
      Alert.alert(
        'KM tidak valid',
        'Masukkan KM saat ini.'
      );
      return;
    }

    if (
      !Number.isFinite(hargaAngka) ||
      hargaAngka <= 0
    ) {
      Alert.alert(
        'Harga tidak valid',
        'Masukkan harga oli.'
      );
      return;
    }

    if (
      !Number.isFinite(intervalAngka) ||
      intervalAngka <= 0
    ) {
      Alert.alert(
        'Interval tidak valid',
        'Masukkan interval penggantian oli.'
      );
      return;
    }

    if (!asetDipilih) {
      Alert.alert(
        'Pembayaran belum dipilih',
        'Pilih aset yang digunakan untuk membayar oli.'
      );
      return;
    }

    const periode =
      await ambilPeriodeAktif();

    if (!periode) {
      Alert.alert(
        'Periode belum aktif',
        'Selesaikan Set Modal terlebih dahulu sebelum mencatat penggantian oli.'
      );
      return;
    }

    // Data KM motor tetap lintas periode.
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

    if (
      asetPembayaran.saldo < hargaAngka
    ) {
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
                  motor_interval,
                  periode_id
                )
              VALUES (?, ?, ?, ?, ?, ?, ?)
              `,
              'OLI',
              hargaAngka,
              sekarang,
              'Ganti Oli',
              kmAngka,
              intervalAngka,
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

      const berikutnya =
        kmAngka + intervalAngka;

      Alert.alert(
        'Berhasil',
        `Ganti oli berhasil disimpan.\n\nJadwal berikutnya: ${berikutnya.toLocaleString(
          'id-ID'
        )} KM.`
      );

      setKm('');
      setHarga('');
      setInterval('');
      setAsetDipilih('');

      await ambilOliTerakhir();

      onSelesai?.();
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Data penggantian oli tidak berhasil disimpan.'
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
        🛢 Oli
      </Text>

      <Text>KM Saat Ini</Text>

      <TextInput
        value={km}
        onChangeText={setKm}
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

      <Text>Harga</Text>

      <TextInput
        value={harga}
        onChangeText={setHarga}
        keyboardType="numeric"
        placeholder="Contoh: 60000"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 12,
          marginTop: 6,
          marginBottom: 12,
        }}
      />

      <Text>Interval Ganti Oli</Text>

      <TextInput
        value={interval}
        onChangeText={setInterval}
        keyboardType="numeric"
        placeholder="Contoh: 2000"
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
              setAsetDipilih(
                String(item.id)
              )
            }
            style={{
              borderWidth: 1,
              borderColor:
                asetDipilih ===
                String(item.id)
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
          <Text>
            Pilih Pembayaran
          </Text>
        </TouchableOpacity>
      )}

      {oliTerakhir && (
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
            style={{
              fontWeight: 'bold',
            }}
          >
            Jadwal Oli
          </Text>

          <Text>
            Ganti terakhir:{' '}
            {oliTerakhir.motor_km.toLocaleString(
              'id-ID'
            )}{' '}
            KM
          </Text>

          <Text>
            Interval:{' '}
            {oliTerakhir.motor_interval.toLocaleString(
              'id-ID'
            )}{' '}
            KM
          </Text>

          {kmBerikutnya !== null && (
            <Text>
              Berikutnya:{' '}
              {kmBerikutnya.toLocaleString(
                'id-ID'
              )}{' '}
              KM
            </Text>
          )}

          {statusOli !== '' && (
            <Text
              style={{
                marginTop: 8,
                fontWeight: 'bold',
              }}
            >
              {statusOli}
            </Text>
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={simpanOli}
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
          Simpan Ganti Oli
        </Text>
      </TouchableOpacity>
    </View>
  );
}