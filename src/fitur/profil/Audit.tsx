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

const formatRupiah = (nilai: number) =>
  `Rp ${Math.abs(nilai).toLocaleString('id-ID')}`;

const ambilTanggalLokal = () => {
  const sekarang = new Date();

  return (
    `${sekarang.getFullYear()}-${String(
      sekarang.getMonth() + 1
    ).padStart(2, '0')}-${String(
      sekarang.getDate()
    ).padStart(2, '0')} ${String(
      sekarang.getHours()
    ).padStart(2, '0')}:${String(
      sekarang.getMinutes()
    ).padStart(2, '0')}:${String(
      sekarang.getSeconds()
    ).padStart(2, '0')}`
  );
};

export default function Audit({ onSelesai }: Props) {
  const db = useSQLiteContext();

  const [aset, setAset] = useState<Aset[]>([]);
  const [saldoNyata, setSaldoNyata] = useState<Record<number, string>>({});
  const [alasan, setAlasan] = useState<Record<number, string>>({});
  const [periodeId, setPeriodeId] = useState<number | null>(null);
  const [memuat, setMemuat] = useState(true);

  const ambilAset = useCallback(async () => {
    try {
      setMemuat(true);

      const periode = await db.getFirstAsync<{
        id: number;
        status: string;
      }>(
        `
        SELECT id, status
        FROM periode
        WHERE status = 'AKTIF'
        ORDER BY id DESC
        LIMIT 1
        `
      );

      if (!periode) {
        setPeriodeId(null);
        setAset([]);
        return;
      }

      setPeriodeId(periode.id);

      const daftarAset = await db.getAllAsync<{
        id: number;
        nama: string;
      }>(
        `
        SELECT id, nama
        FROM aset
        ORDER BY id
        `
      );

      const data: Aset[] = [];

      for (const item of daftarAset) {
        const saldo = await db.getFirstAsync<{
          total: number | null;
        }>(
          `
          SELECT
            COALESCE(
              (
                SELECT SUM(nominal)
                FROM modal_awal
                WHERE aset_id = ?
                  AND periode_id = ?
              ),
              0
            )
            +
            COALESCE(
              (
                SELECT SUM(ps.jumlah)
                FROM perubahan_saldo ps
                INNER JOIN transaksi t
                  ON t.id = ps.transaksi_id
                WHERE ps.aset_id = ?
                  AND t.periode_id = ?
              ),
              0
            ) AS total
          `,
          item.id,
          periode.id,
          item.id,
          periode.id
        );

        data.push({
          id: item.id,
          nama: item.nama,
          saldo: saldo?.total ?? 0,
        });
      }

      setAset(data);
    } catch (error) {
      console.error('Gagal mengambil data audit:', error);

      Alert.alert(
        'Gagal',
        'Data audit tidak dapat dimuat.'
      );
    } finally {
      setMemuat(false);
    }
  }, [db]);

  useEffect(() => {
    ambilAset();
  }, [ambilAset]);

  const simpanAudit = async (item: Aset) => {
    if (!periodeId) {
      Alert.alert(
        'Tidak ada periode aktif',
        'Audit hanya dapat dilakukan saat ada periode aktif.'
      );
      return;
    }

    const input = saldoNyata[item.id];

    if (!input || input.trim() === '') {
      Alert.alert(
        'Saldo belum diisi',
        `Masukkan saldo nyata untuk ${item.nama}.`
      );
      return;
    }

    const saldo = Number(input.replace(/\D/g, ''));

    if (!Number.isFinite(saldo)) {
      Alert.alert(
        'Nominal tidak valid',
        'Masukkan angka yang benar.'
      );
      return;
    }

    const selisih = saldo - item.saldo;
    const alasanInput = alasan[item.id]?.trim() ?? '';

    if (selisih !== 0 && alasanInput === '') {
      Alert.alert(
        'Alasan diperlukan',
        'Jika ada selisih, masukkan alasan terlebih dahulu.'
      );
      return;
    }

    try {
      const tanggal = ambilTanggalLokal();

      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `
          INSERT INTO audit_saldo (
            periode_id,
            aset_id,
            saldo_aplikasi,
            saldo_sebenarnya,
            selisih,
            alasan,
            tanggal
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          periodeId,
          item.id,
          item.saldo,
          saldo,
          selisih,
          alasanInput || null,
          tanggal
        );
      });

      Alert.alert(
        'Audit Berhasil',
        `${item.nama}\n\n` +
          `Saldo aplikasi: ${formatRupiah(item.saldo)}\n` +
          `Saldo nyata: ${formatRupiah(saldo)}\n` +
          `Selisih: ${
            selisih === 0
              ? 'Rp 0'
              : `${selisih > 0 ? '+' : '-'}${formatRupiah(
                  selisih
                )}`
          }` +
          (selisih !== 0
            ? `\n\nAlasan: ${alasanInput}`
            : ''),
        [
          {
            text: 'OK',
            onPress: () => {
              onSelesai?.();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Gagal menyimpan audit:', error);

      Alert.alert(
        'Gagal',
        'Hasil audit tidak dapat disimpan.'
      );
    }
  };

  if (memuat) {
    return (
      <View style={{ padding: 16 }}>
        <Text>Memuat data audit...</Text>
      </View>
    );
  }

  if (!periodeId) {
    return (
      <View style={{ padding: 16 }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Audit / Rekonsiliasi
        </Text>

        <Text>
          Tidak ada periode aktif. Audit dapat dilakukan
          setelah periode aktif tersedia.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      <Text
        style={{
          fontSize: 24,
          fontWeight: 'bold',
          marginBottom: 8,
        }}
      >
        Audit / Rekonsiliasi
      </Text>

      <Text style={{ marginBottom: 20 }}>
        Cocokkan saldo aplikasi dengan saldo yang benar-benar
        tersedia pada periode aktif.
      </Text>

      {aset.map((item) => {
        const input = saldoNyata[item.id] ?? '';
        const saldo =
          Number(input.replace(/\D/g, '') || 0);

        const selisih = saldo - item.saldo;

        return (
          <View
            key={item.id}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: 'bold',
                marginBottom: 12,
              }}
            >
              {item.nama}
            </Text>

            <Text style={{ marginBottom: 4 }}>
              Saldo aplikasi
            </Text>

            <Text
              style={{
                fontSize: 20,
                fontWeight: 'bold',
                marginBottom: 16,
              }}
            >
              {formatRupiah(item.saldo)}
            </Text>

            <Text style={{ marginBottom: 6 }}>
              Saldo nyata
            </Text>

            <TextInput
              value={input}
              onChangeText={(text) =>
                setSaldoNyata((data) => ({
                  ...data,
                  [item.id]: text.replace(/\D/g, ''),
                }))
              }
              placeholder="Masukkan saldo nyata"
              keyboardType="numeric"
              style={{
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
              }}
            />

            {input !== '' && (
              <View style={{ marginBottom: 12 }}>
                <Text>
                  Selisih:{' '}
                  <Text style={{ fontWeight: 'bold' }}>
                    {selisih === 0
                      ? 'Rp 0'
                      : `${selisih > 0 ? '+' : '-'}${formatRupiah(
                          selisih
                        )}`}
                  </Text>
                </Text>
              </View>
            )}

            {input !== '' && selisih !== 0 && (
              <>
                <Text style={{ marginBottom: 6 }}>
                  Alasan selisih
                </Text>

                <TextInput
                  value={alasan[item.id] ?? ''}
                  onChangeText={(text) =>
                    setAlasan((data) => ({
                      ...data,
                      [item.id]: text,
                    }))
                  }
                  placeholder="Contoh: ada transaksi yang belum dicatat"
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: '#ccc',
                    borderRadius: 8,
                    padding: 12,
                    minHeight: 80,
                    marginBottom: 12,
                    textAlignVertical: 'top',
                  }}
                />
              </>
            )}

            <TouchableOpacity
              onPress={() => simpanAudit(item)}
              style={{
                backgroundColor: '#222',
                padding: 14,
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontWeight: 'bold',
                }}
              >
                Periksa {item.nama}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}