import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Aset = {
  id: number;
  nama: string;
};

export default function SetModal() {
  const db = useSQLiteContext();

  const [aset, setAset] = useState<Aset[]>([]);
  const [nilai, setNilai] = useState<Record<number, string>>({});
  const [sedangSimpan, setSedangSimpan] = useState(false);
  const [periodeId, setPeriodeId] = useState<number | null>(null);

  const ambilData = useCallback(async () => {
    const hasilAset = await db.getAllAsync<Aset>(`
      SELECT id, nama
      FROM aset
      ORDER BY
        CASE nama
          WHEN 'Tunai' THEN 1
          WHEN 'OVO' THEN 2
          WHEN 'SeaBank' THEN 3
          WHEN 'Dompet Grab' THEN 4
          WHEN 'Kredit Grab' THEN 5
          ELSE 99
        END
    `);

    setAset(hasilAset);

    const periode = await db.getFirstAsync<{
      id: number;
      status: string;
    }>(`
      SELECT id, status
      FROM periode
      WHERE status = 'MENUNGGU_MODAL'
      ORDER BY id DESC
      LIMIT 1
    `);

    setPeriodeId(periode?.id ?? null);
  }, [db]);

  useEffect(() => {
    ambilData();
  }, [ambilData]);

  const simpanModal = async () => {
    if (sedangSimpan) {
      return;
    }

    if (periodeId === null) {
      Alert.alert(
        'Set Modal tidak tersedia',
        'Saat ini tidak ada periode yang menunggu Set Modal.'
      );
      return;
    }

    const dataModal: {
      asetId: number;
      nama: string;
      nominal: number;
    }[] = [];

    for (const item of aset) {
      const input = nilai[item.id] ?? '';

      const nominal = Number(
        input.replace(/\D/g, '') || 0
      );

      if (!Number.isInteger(nominal) || nominal < 0) {
        Alert.alert(
          'Nominal tidak valid',
          `Nominal ${item.nama} tidak valid.`
        );
        return;
      }

      dataModal.push({
        asetId: item.id,
        nama: item.nama,
        nominal,
      });
    }

    const totalModal = dataModal.reduce(
      (total, item) => total + item.nominal,
      0
    );

    if (totalModal === 0) {
      Alert.alert(
        'Modal belum diisi',
        'Masukkan minimal satu nominal modal.'
      );
      return;
    }

    setSedangSimpan(true);

    try {
      /*
       * Semua proses Set Modal dilakukan dalam satu transaksi database.
       *
       * Set Modal:
       * - disimpan ke modal_awal
       * - TIDAK masuk sebagai pendapatan
       * - TIDAK membuat transaksi pendapatan
       * - mengaktifkan periode
       */

      await db.withTransactionAsync(async () => {
        const sudahAda = await db.getFirstAsync<{
          jumlah: number;
        }>(
          `
          SELECT COUNT(*) AS jumlah
          FROM modal_awal
          WHERE periode_id = ?
          `,
          periodeId
        );

        if ((sudahAda?.jumlah ?? 0) > 0) {
          throw new Error(
            'Modal untuk periode ini sudah pernah disimpan.'
          );
        }

        const tanggal = new Date()
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ');

        for (const item of dataModal) {
          await db.runAsync(
            `
            INSERT INTO modal_awal (
              periode_id,
              aset_id,
              nominal,
              tanggal
            )
            VALUES (?, ?, ?, ?)
            `,
            periodeId,
            item.asetId,
            item.nominal,
            tanggal
          );
        }

        await db.runAsync(
          `
          UPDATE periode
          SET status = 'AKTIF'
          WHERE id = ?
          `,
          periodeId
        );

        await db.runAsync(
          `
          INSERT OR REPLACE INTO pengaturan (
            nama,
            nilai
          )
          VALUES (
            'modal_sudah_diatur',
            '1'
          )
          `
        );

        await db.runAsync(
          `
          INSERT OR REPLACE INTO pengaturan (
            nama,
            nilai
          )
          VALUES (
            'periode_sudah_ditutup',
            '0'
          )
          `
        );
      });

      setNilai({});

      Alert.alert(
        'Set Modal Berhasil',
        `Modal awal sebesar Rp${totalModal.toLocaleString(
          'id-ID'
        )} berhasil disimpan.\n\nPeriode sekarang aktif dan transaksi sudah dapat digunakan.`,
        [
          {
            text: 'OK',
            onPress: () => {
              ambilData();
            },
          },
        ]
      );
    } catch (error) {
      const pesan =
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat menyimpan Set Modal.';

      Alert.alert('Gagal menyimpan', pesan);
    } finally {
      setSedangSimpan(false);
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
        Set Modal
      </Text>

      <Text style={{ marginBottom: 20 }}>
        Tentukan saldo awal yang benar-benar tersedia pada
        setiap aset untuk memulai periode baru.
      </Text>

      {periodeId === null ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#ddd',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              fontWeight: 'bold',
              marginBottom: 6,
            }}
          >
            Set Modal belum tersedia
          </Text>

          <Text>
            Set Modal hanya dapat dilakukan ketika ada
            periode yang menunggu modal.
          </Text>
        </View>
      ) : (
        <>
          {aset.map((item) => (
            <View key={item.id} style={{ marginBottom: 14 }}>
              <Text style={{ marginBottom: 6 }}>
                {item.nama}
              </Text>

              <TextInput
                value={nilai[item.id] ?? ''}
                onChangeText={(text) =>
                  setNilai((data) => ({
                    ...data,
                    [item.id]: text.replace(/\D/g, ''),
                  }))
                }
                keyboardType="numeric"
                placeholder="Rp 0"
                editable={!sedangSimpan}
                style={{
                  borderWidth: 1,
                  borderColor: '#ccc',
                  borderRadius: 8,
                  padding: 12,
                }}
              />
            </View>
          ))}

          <TouchableOpacity
            onPress={simpanModal}
            disabled={sedangSimpan}
            style={{
              backgroundColor: sedangSimpan
                ? '#999'
                : '#222',
              padding: 15,
              borderRadius: 8,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              {sedangSimpan
                ? 'Menyimpan...'
                : 'Simpan Modal'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}