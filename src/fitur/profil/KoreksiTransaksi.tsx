import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  onSelesai?: () => void;
};

type Transaksi = {
  id: number;
  jenis: string;
  jumlah: number;
  tanggal: string;
  deskripsi: string | null;
  catatan: string | null;
  periode_id: number | null;
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

const formatTanggal = (tanggal: string) => {
  const hasil = new Date(tanggal);

  if (Number.isNaN(hasil.getTime())) {
    return tanggal;
  }

  return hasil.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export default function KoreksiTransaksi({
  onSelesai,
}: Props) {
  const db = useSQLiteContext();

  const [data, setData] = useState<Transaksi[]>([]);
  const [transaksiDipilih, setTransaksiDipilih] =
    useState<Transaksi | null>(null);

  const [nominal, setNominal] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [catatan, setCatatan] = useState('');
  const [alasan, setAlasan] = useState('');

  const [periodeAktifId, setPeriodeAktifId] =
    useState<number | null>(null);

  const ambilPeriodeAktif = useCallback(async () => {
    const periode = await db.getFirstAsync<{
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

    setPeriodeAktifId(periode?.id ?? null);

    return periode?.id ?? null;
  }, [db]);

  const ambilTransaksi = useCallback(async () => {
    try {
      const periodeId = await ambilPeriodeAktif();

      if (!periodeId) {
        setData([]);
        return;
      }

      const hasil =
        await db.getAllAsync<Transaksi>(
          `
          SELECT
            id,
            jenis,
            jumlah,
            tanggal,
            deskripsi,
            catatan,
            periode_id
          FROM transaksi
          WHERE periode_id = ?
          ORDER BY tanggal DESC, id DESC
          `,
          periodeId
        );

      setData(hasil);
    } catch (error) {
      console.error(
        'Gagal mengambil transaksi:',
        error
      );

      setData([]);

      Alert.alert(
        'Gagal',
        'Data transaksi tidak dapat dimuat.'
      );
    }
  }, [db, ambilPeriodeAktif]);

  useEffect(() => {
    ambilTransaksi();
  }, [ambilTransaksi]);

  const bukaEdit = (item: Transaksi) => {
    setTransaksiDipilih(item);

    setNominal(
      String(Math.abs(item.jumlah))
    );

    setDeskripsi(item.deskripsi ?? '');
    setCatatan(item.catatan ?? '');
    setAlasan('');
  };

  const batalEdit = () => {
    setTransaksiDipilih(null);
    setNominal('');
    setDeskripsi('');
    setCatatan('');
    setAlasan('');
  };

  const simpanKoreksi = async () => {
    if (!transaksiDipilih) {
      return;
    }

    if (!periodeAktifId) {
      Alert.alert(
        'Tidak ada periode aktif',
        'Koreksi hanya dapat dilakukan saat ada periode aktif.'
      );

      return;
    }

    if (
      transaksiDipilih.periode_id !==
      periodeAktifId
    ) {
      Alert.alert(
        'Koreksi tidak tersedia',
        'Transaksi tersebut bukan bagian dari periode aktif.'
      );

      return;
    }

    const nominalBaru = Number(
      nominal.replace(/\D/g, '')
    );

    if (!nominalBaru || nominalBaru <= 0) {
      Alert.alert(
        'Nominal tidak valid',
        'Masukkan nominal yang benar.'
      );

      return;
    }

    const deskripsiBaru = deskripsi.trim();
    const catatanBaru = catatan.trim();
    const alasanBersih = alasan.trim();

    if (!deskripsiBaru) {
      Alert.alert(
        'Deskripsi belum diisi',
        'Masukkan deskripsi transaksi.'
      );

      return;
    }

    if (!alasanBersih) {
      Alert.alert(
        'Alasan diperlukan',
        'Setiap koreksi transaksi wajib memiliki alasan.'
      );

      return;
    }

    try {
      const perubahanSaldo =
        await db.getAllAsync<{
          id: number;
          jumlah: number;
          aset_id: number;
          nama_aset: string;
        }>(
          `
          SELECT
            ps.id,
            ps.jumlah,
            ps.aset_id,
            a.nama AS nama_aset
          FROM perubahan_saldo ps
          INNER JOIN aset a
            ON a.id = ps.aset_id
          WHERE ps.transaksi_id = ?
          ORDER BY ps.id
          `,
          transaksiDipilih.id
        );

      /*
       * Satu transaksi normal harus memiliki
       * satu perubahan saldo untuk dapat dikoreksi
       * dengan aman melalui layar ini.
       *
       * Transaksi seperti transfer / top up tertentu
       * dapat memiliki lebih dari satu perubahan saldo.
       * Kita tidak mengubahnya secara otomatis karena
       * bisa menyebabkan saldo aset salah.
       */
      if (perubahanSaldo.length !== 1) {
        Alert.alert(
          'Koreksi tidak tersedia',
          'Transaksi ini memiliki lebih dari satu perubahan saldo atau belum memiliki perubahan saldo. Koreksi transaksi seperti ini akan ditangani melalui mekanisme khusus agar saldo aset tetap aman.'
        );

        return;
      }

      const perubahanLama =
        perubahanSaldo[0];

      const jumlahLama =
        transaksiDipilih.jumlah;

      const jumlahBaru =
        jumlahLama < 0
          ? -nominalBaru
          : nominalBaru;

      if (
        jumlahLama === jumlahBaru &&
        (transaksiDipilih.deskripsi ?? '') ===
          deskripsiBaru &&
        (transaksiDipilih.catatan ?? '') ===
          catatanBaru
      ) {
        Alert.alert(
          'Tidak ada perubahan',
          'Tidak ada data yang berubah.'
        );

        return;
      }

      /*
       * Tentukan arah perubahan saldo.
       *
       * Contoh pengeluaran:
       * transaksi = +5.000
       * perubahan saldo = -5.000
       *
       * Pendapatan:
       * transaksi = +10.000
       * perubahan saldo = +10.000
       */
      const arahSaldo =
        perubahanLama.jumlah >= 0
          ? 1
          : -1;

      const perubahanBaru =
        arahSaldo * nominalBaru;

      const namaAset =
        perubahanLama.nama_aset;

      Alert.alert(
        'Konfirmasi Koreksi',
        `Transaksi #${transaksiDipilih.id}\n\n` +
          `Aset: ${namaAset}\n` +
          `Nominal lama: ${formatRupiah(
            Math.abs(jumlahLama)
          )}\n` +
          `Nominal baru: ${formatRupiah(
            nominalBaru
          )}\n\n` +
          `Alasan:\n${alasanBersih}\n\n` +
          `Simpan perubahan?`,
        [
          {
            text: 'Batal',
            style: 'cancel',
          },
          {
            text: 'Simpan',
            onPress: async () => {
              try {
                const tanggal =
                  ambilTanggalLokal();

                await db.withTransactionAsync(
                  async () => {
                    /*
                     * 1. Simpan riwayat koreksi
                     * sebelum mengubah data utama.
                     */
                    await db.runAsync(
                      `
                      INSERT INTO koreksi_transaksi (
                        transaksi_id,
                        periode_id,
                        jumlah_sebelum,
                        jumlah_sesudah,
                        deskripsi_sebelum,
                        deskripsi_sesudah,
                        catatan_sebelum,
                        catatan_sesudah,
                        alasan,
                        tanggal
                      )
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                      `,
                      transaksiDipilih.id,
                      periodeAktifId,
                      jumlahLama,
                      jumlahBaru,
                      transaksiDipilih.deskripsi,
                      deskripsiBaru,
                      transaksiDipilih.catatan,
                      catatanBaru || null,
                      alasanBersih,
                      tanggal
                    );

                    /*
                     * 2. Koreksi transaksi utama.
                     */
                    await db.runAsync(
                      `
                      UPDATE transaksi
                      SET
                        jumlah = ?,
                        deskripsi = ?,
                        catatan = ?
                      WHERE id = ?
                        AND periode_id = ?
                      `,
                      jumlahBaru,
                      deskripsiBaru,
                      catatanBaru || null,
                      transaksiDipilih.id,
                      periodeAktifId
                    );

                    /*
                     * 3. Koreksi perubahan saldo
                     * dengan arah yang sama.
                     */
                    await db.runAsync(
                      `
                      UPDATE perubahan_saldo
                      SET
                        jumlah = ?,
                        tanggal = ?
                      WHERE id = ?
                        AND transaksi_id = ?
                      `,
                      perubahanBaru,
                      tanggal,
                      perubahanLama.id,
                      transaksiDipilih.id
                    );
                  }
                );

                Alert.alert(
                  'Berhasil',
                  'Transaksi dan saldo aset berhasil dikoreksi.'
                );

                batalEdit();

                await ambilTransaksi();

                onSelesai?.();
              } catch (error) {
                console.error(
                  'Gagal menyimpan koreksi:',
                  error
                );

                Alert.alert(
                  'Gagal',
                  'Koreksi tidak berhasil disimpan. Tidak ada perubahan yang diterapkan.'
                );
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error(
        'Gagal memeriksa perubahan saldo:',
        error
      );

      Alert.alert(
        'Gagal',
        'Data perubahan saldo transaksi tidak dapat diperiksa.'
      );
    }
  };

  if (transaksiDipilih) {
    return (
      <ScrollView>
        <View style={{ padding: 16 }}>
          <TouchableOpacity
            onPress={batalEdit}
            style={{ marginBottom: 20 }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: 'bold',
              }}
            >
              ← Kembali
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 26,
              fontWeight: 'bold',
              marginBottom: 8,
            }}
          >
            Edit Transaksi
          </Text>

          <Text style={{ marginBottom: 20 }}>
            Transaksi #{transaksiDipilih.id}
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
              Jenis
            </Text>

            <Text
              style={{
                fontSize: 17,
                fontWeight: 'bold',
                marginBottom: 12,
              }}
            >
              {transaksiDipilih.jenis}
            </Text>

            <Text style={{ marginBottom: 6 }}>
              Tanggal
            </Text>

            <Text>
              {formatTanggal(
                transaksiDipilih.tanggal
              )}
            </Text>
          </View>

          <Text style={{ marginBottom: 6 }}>
            Nominal
          </Text>

          <TextInput
            value={nominal}
            onChangeText={(text) =>
              setNominal(
                text.replace(/\D/g, '')
              )
            }
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 8,
              padding: 12,
              marginBottom: 14,
            }}
          />

          <Text style={{ marginBottom: 6 }}>
            Deskripsi
          </Text>

          <TextInput
            value={deskripsi}
            onChangeText={setDeskripsi}
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 8,
              padding: 12,
              marginBottom: 14,
            }}
          />

          <Text style={{ marginBottom: 6 }}>
            Catatan
          </Text>

          <TextInput
            value={catatan}
            onChangeText={setCatatan}
            multiline
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 8,
              padding: 12,
              minHeight: 80,
              textAlignVertical: 'top',
              marginBottom: 14,
            }}
          />

          <Text style={{ marginBottom: 6 }}>
            Alasan Koreksi *
          </Text>

          <TextInput
            value={alasan}
            onChangeText={setAlasan}
            placeholder="Contoh: salah memasukkan nominal"
            multiline
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 8,
              padding: 12,
              minHeight: 90,
              textAlignVertical: 'top',
              marginBottom: 16,
            }}
          />

          <TouchableOpacity
            onPress={simpanKoreksi}
            style={{
              backgroundColor: '#222',
              padding: 15,
              borderRadius: 8,
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              Simpan Koreksi
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={batalEdit}
            style={{
              padding: 12,
              alignItems: 'center',
            }}
          >
            <Text>Batal</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (!periodeAktifId) {
    return (
      <View style={{ padding: 16 }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Edit & Koreksi Transaksi
        </Text>

        <Text>
          Tidak ada periode aktif. Koreksi transaksi
          hanya dapat dilakukan saat periode aktif.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView>
      <View style={{ padding: 16 }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Edit & Koreksi Transaksi
        </Text>

        <Text style={{ marginBottom: 20 }}>
          Pilih transaksi pada periode aktif yang
          ingin diperiksa atau dikoreksi.
        </Text>

        {data.length === 0 ? (
          <Text>
            Belum ada transaksi pada periode aktif.
          </Text>
        ) : (
          data.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => bukaEdit(item)}
              style={{
                borderWidth: 1,
                borderColor: '#ddd',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: 'bold',
                    }}
                  >
                    {item.deskripsi ||
                      'Transaksi'}
                  </Text>

                  <Text style={{ marginTop: 4 }}>
                    {item.jenis}
                  </Text>

                  <Text style={{ marginTop: 4 }}>
                    {formatTanggal(item.tanggal)}
                  </Text>
                </View>

                <Text
                  style={{
                    fontWeight: 'bold',
                    marginLeft: 12,
                  }}
                >
                  {formatRupiah(item.jumlah)}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}