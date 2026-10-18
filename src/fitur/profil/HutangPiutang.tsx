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

type Aset = {
  id: number;
  nama: string;
};

type HutangPiutangItem = {
  id: number;
  tipe: 'HUTANG' | 'PIUTANG';
  nama: string;
  nominal: number;
  sisa: number;
  tanggal: string;
  catatan: string | null;
};

const formatRupiah = (nilai: number) =>
  `Rp ${Math.abs(nilai).toLocaleString('id-ID')}`;

export default function HutangPiutang({ onSelesai }: Props) {
  const db = useSQLiteContext();

  const [aset, setAset] = useState<Aset[]>([]);
  const [data, setData] = useState<HutangPiutangItem[]>([]);

  const [mode, setMode] = useState<'HUTANG' | 'PIUTANG' | null>(null);

  const [nama, setNama] = useState('');
  const [nominal, setNominal] = useState('');
  const [catatan, setCatatan] = useState('');
  const [asetDipilih, setAsetDipilih] = useState<number | null>(null);

  const [itemPembayaran, setItemPembayaran] =
    useState<HutangPiutangItem | null>(null);

  const [nominalBayar, setNominalBayar] = useState('');
  const [asetPembayaran, setAsetPembayaran] =
    useState<number | null>(null);

  const ambilAset = useCallback(async () => {
    const hasil = await db.getAllAsync<Aset>(`
      SELECT id, nama
      FROM aset
      WHERE nama IN ('Tunai', 'OVO', 'SeaBank')
      ORDER BY
        CASE nama
          WHEN 'Tunai' THEN 1
          WHEN 'OVO' THEN 2
          WHEN 'SeaBank' THEN 3
        END
    `);

    setAset(hasil);

    if (asetDipilih === null && hasil.length > 0) {
      setAsetDipilih(hasil[0].id);
    }

    if (asetPembayaran === null && hasil.length > 0) {
      setAsetPembayaran(hasil[0].id);
    }
  }, [db, asetDipilih, asetPembayaran]);

  /*
   * Hutang/piutang tetap ditampilkan lintas periode.
   * Yang ditampilkan hanya yang masih memiliki sisa.
   */
  const ambilData = useCallback(async () => {
    const hasil = await db.getAllAsync<HutangPiutangItem>(`
      SELECT
        id,
        tipe,
        nama,
        nominal,
        sisa,
        tanggal,
        catatan
      FROM hutang_piutang
      WHERE sisa > 0
      ORDER BY tanggal DESC, id DESC
    `);

    setData(hasil);
  }, [db]);

  useEffect(() => {
    ambilAset();
    ambilData();
  }, [ambilAset, ambilData]);

  /*
   * Mengambil periode AKTIF.
   *
   * Semua perubahan uang baru harus terjadi
   * di dalam periode yang aktif.
   */
  const ambilPeriodeAktif = async () => {
    const periode = await db.getFirstAsync<{
      id: number;
    }>(`
      SELECT id
      FROM periode
      WHERE status = 'AKTIF'
      ORDER BY id DESC
      LIMIT 1
    `);

    return periode?.id ?? null;
  };

  /*
   * Saldo aset periode aktif:
   *
   * Saldo = Modal Awal periode aktif
   *       + seluruh perubahan saldo
   *         dari transaksi periode aktif.
   *
   * Jadi tidak mengambil saldo dari periode lama.
   */
  const ambilSaldoAset = async (
    asetId: number,
    periodeId: number
  ) => {
    const hasil = await db.getFirstAsync<{
      total: number | null;
    }>(
      `
      SELECT
        COALESCE(
          (
            SELECT SUM(nominal)
            FROM modal_awal
            WHERE periode_id = ?
              AND aset_id = ?
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
      periodeId,
      asetId,
      asetId,
      periodeId
    );

    return hasil?.total ?? 0;
  };

  const resetForm = () => {
    setNama('');
    setNominal('');
    setCatatan('');
    setMode(null);
    setItemPembayaran(null);
    setNominalBayar('');
  };

  const simpanHutangPiutang = async () => {
    if (!mode) {
      return;
    }

    const namaBersih = nama.trim();
    const nominalAngka = Number(
      nominal.replace(/\D/g, '')
    );

    if (!namaBersih) {
      Alert.alert(
        'Data belum lengkap',
        'Masukkan nama.'
      );
      return;
    }

    if (!nominalAngka || nominalAngka <= 0) {
      Alert.alert(
        'Nominal tidak valid',
        'Masukkan nominal yang benar.'
      );
      return;
    }

    if (asetDipilih === null) {
      Alert.alert(
        'Aset belum dipilih',
        'Pilih tempat uang masuk atau sumber uang.'
      );
      return;
    }

    /*
     * Hutang/piutang adalah perubahan keuangan.
     * Karena itu harus memiliki periode aktif.
     */
    const periodeId = await ambilPeriodeAktif();

    if (periodeId === null) {
      Alert.alert(
        'Periode belum aktif',
        'Atur Set Modal terlebih dahulu sebelum mencatat hutang atau piutang.'
      );
      return;
    }

    const tanggal = new Date().toISOString();

    try {
      await db.withTransactionAsync(async () => {
        /*
         * Catat transaksi utama.
         */
        const transaksi = await db.runAsync(
          `
          INSERT INTO transaksi (
            jenis,
            jumlah,
            tanggal,
            deskripsi,
            catatan,
            periode_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          mode === 'HUTANG'
            ? 'HUTANG'
            : 'PIUTANG',
          nominalAngka,
          tanggal,
          mode === 'HUTANG'
            ? `Hutang - ${namaBersih}`
            : `Piutang - ${namaBersih}`,
          catatan.trim() || null,
          periodeId
        );

        /*
         * Catat data hutang/piutang.
         *
         * periode_id menunjukkan periode saat
         * hutang/piutang tersebut dibuat.
         *
         * Data tetap dipertahankan setelah Settlement.
         */
        await db.runAsync(
          `
          INSERT INTO hutang_piutang (
            tipe,
            nama,
            nominal,
            sisa,
            tanggal,
            catatan,
            periode_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          mode,
          namaBersih,
          nominalAngka,
          nominalAngka,
          tanggal,
          catatan.trim() || null,
          periodeId
        );

        /*
         * HUTANG:
         * Uang diterima → aset bertambah.
         *
         * PIUTANG:
         * Uang diberikan → aset berkurang.
         */
        await db.runAsync(
          `
          INSERT INTO perubahan_saldo (
            transaksi_id,
            aset_id,
            jumlah,
            tanggal
          )
          VALUES (?, ?, ?, ?)
          `,
          transaksi.lastInsertRowId,
          asetDipilih,
          mode === 'HUTANG'
            ? nominalAngka
            : -nominalAngka,
          tanggal
        );
      });

      Alert.alert(
        'Berhasil',
        mode === 'HUTANG'
          ? 'Hutang berhasil dicatat.'
          : 'Piutang berhasil dicatat.'
      );

      await ambilData();
      resetForm();
      onSelesai?.();
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Data hutang/piutang tidak berhasil disimpan.'
      );
    }
  };

  const bayarHutangPiutang = async () => {
    if (!itemPembayaran) {
      return;
    }

    const nominalAngka = Number(
      nominalBayar.replace(/\D/g, '')
    );

    if (!nominalAngka || nominalAngka <= 0) {
      Alert.alert(
        'Nominal tidak valid',
        'Masukkan nominal pembayaran.'
      );
      return;
    }

    if (nominalAngka > itemPembayaran.sisa) {
      Alert.alert(
        'Nominal terlalu besar',
        `Sisa ${
          itemPembayaran.tipe === 'HUTANG'
            ? 'hutang'
            : 'piutang'
        } hanya ${formatRupiah(
          itemPembayaran.sisa
        )}.`
      );
      return;
    }

    if (asetPembayaran === null) {
      Alert.alert(
        'Aset belum dipilih',
        'Pilih aset untuk pembayaran.'
      );
      return;
    }

    /*
     * Pembayaran juga harus masuk ke periode aktif.
     */
    const periodeId = await ambilPeriodeAktif();

    if (periodeId === null) {
      Alert.alert(
        'Periode belum aktif',
        'Tidak ada periode aktif. Atur Set Modal terlebih dahulu.'
      );
      return;
    }

    /*
     * Hanya pembayaran HUTANG yang membutuhkan
     * saldo aset keluar.
     *
     * Penerimaan PIUTANG justru menambah saldo.
     */
    if (itemPembayaran.tipe === 'HUTANG') {
      const saldoAset = await ambilSaldoAset(
        asetPembayaran,
        periodeId
      );

      if (saldoAset < nominalAngka) {
        Alert.alert(
          'Saldo tidak cukup',
          `Saldo ${formatRupiah(
            saldoAset
          )} tidak cukup untuk membayar ${formatRupiah(
            nominalAngka
          )}.`
        );
        return;
      }
    }

    const sisaBaru =
      itemPembayaran.sisa - nominalAngka;

    const tanggal = new Date().toISOString();

    try {
      await db.withTransactionAsync(async () => {
        /*
         * Catat transaksi pembayaran.
         */
        const transaksi = await db.runAsync(
          `
          INSERT INTO transaksi (
            jenis,
            jumlah,
            tanggal,
            deskripsi,
            catatan,
            periode_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          itemPembayaran.tipe === 'HUTANG'
            ? 'PEMBAYARAN_HUTANG'
            : 'PENGEMBALIAN_PIUTANG',
          nominalAngka,
          tanggal,
          itemPembayaran.tipe === 'HUTANG'
            ? `Bayar Hutang - ${itemPembayaran.nama}`
            : `Terima Piutang - ${itemPembayaran.nama}`,
          null,
          periodeId
        );

        /*
         * Catat pembayaran.
         */
        await db.runAsync(
          `
          INSERT INTO pembayaran_hutang_piutang (
            hutang_piutang_id,
            nominal,
            aset_id,
            tanggal,
            catatan,
            periode_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          itemPembayaran.id,
          nominalAngka,
          asetPembayaran,
          tanggal,
          null,
          periodeId
        );

        /*
         * Perubahan saldo aset.
         *
         * Bayar hutang:
         * uang keluar → negatif.
         *
         * Terima piutang:
         * uang masuk → positif.
         */
        await db.runAsync(
          `
          INSERT INTO perubahan_saldo (
            transaksi_id,
            aset_id,
            jumlah,
            tanggal
          )
          VALUES (?, ?, ?, ?)
          `,
          transaksi.lastInsertRowId,
          asetPembayaran,
          itemPembayaran.tipe === 'HUTANG'
            ? -nominalAngka
            : nominalAngka,
          tanggal
        );

        /*
         * Update sisa hutang/piutang.
         */
        await db.runAsync(
          `
          UPDATE hutang_piutang
          SET sisa = ?
          WHERE id = ?
          `,
          sisaBaru,
          itemPembayaran.id
        );
      });

      Alert.alert(
        'Berhasil',
        sisaBaru === 0
          ? `${
              itemPembayaran.tipe === 'HUTANG'
                ? 'Hutang'
                : 'Piutang'
            } sudah lunas.`
          : 'Pembayaran berhasil dicatat.'
      );

      await ambilData();
      resetForm();
      onSelesai?.();
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Pembayaran tidak berhasil disimpan.'
      );
    }
  };

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
          Hutang & Piutang
        </Text>

        <Text style={{ marginBottom: 20 }}>
          Kelola uang yang dipinjam atau diberikan tanpa
          menganggapnya sebagai pendapatan atau
          pengeluaran biasa.
        </Text>

        {!mode && !itemPembayaran && (
          <>
            <TouchableOpacity
              onPress={() => setMode('HUTANG')}
              style={{
                borderWidth: 1,
                borderColor: '#ddd',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                }}
              >
                + Tambah Hutang
              </Text>

              <Text style={{ marginTop: 4 }}>
                Uang yang kita terima dan harus dikembalikan.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMode('PIUTANG')}
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
                  fontSize: 18,
                  fontWeight: 'bold',
                }}
              >
                + Tambah Piutang
              </Text>

              <Text style={{ marginTop: 4 }}>
                Uang yang kita berikan dan harus diterima kembali.
              </Text>
            </TouchableOpacity>
          </>
        )}

        {mode && (
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
                fontSize: 20,
                fontWeight: 'bold',
                marginBottom: 16,
              }}
            >
              {mode === 'HUTANG'
                ? 'Tambah Hutang'
                : 'Tambah Piutang'}
            </Text>

            <Text style={{ marginBottom: 6 }}>
              Nama
            </Text>

            <TextInput
              value={nama}
              onChangeText={setNama}
              placeholder={
                mode === 'HUTANG'
                  ? 'Nama pemberi hutang'
                  : 'Nama penerima uang'
              }
              style={{
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
              }}
            />

            <Text style={{ marginBottom: 6 }}>
              Nominal
            </Text>

            <TextInput
              value={nominal}
              onChangeText={(text) =>
                setNominal(text.replace(/\D/g, ''))
              }
              placeholder="Masukkan nominal"
              keyboardType="numeric"
              style={{
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
              }}
            />

            <Text style={{ marginBottom: 8 }}>
              {mode === 'HUTANG'
                ? 'Uang masuk ke'
                : 'Uang diberikan dari'}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 12,
              }}
            >
              {aset.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() =>
                    setAsetDipilih(item.id)
                  }
                  style={{
                    borderWidth: 1,
                    borderColor:
                      asetDipilih === item.id
                        ? '#222'
                        : '#ccc',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text
                    style={{
                      fontWeight:
                        asetDipilih === item.id
                          ? 'bold'
                          : 'normal',
                    }}
                  >
                    {item.nama}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ marginBottom: 6 }}>
              Catatan
            </Text>

            <TextInput
              value={catatan}
              onChangeText={setCatatan}
              placeholder="Opsional"
              multiline
              style={{
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 8,
                padding: 12,
                minHeight: 70,
                textAlignVertical: 'top',
                marginBottom: 12,
              }}
            />

            <TouchableOpacity
              onPress={simpanHutangPiutang}
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
                Simpan
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={resetForm}
              style={{
                padding: 12,
                alignItems: 'center',
              }}
            >
              <Text>Batal</Text>
            </TouchableOpacity>
          </View>
        )}

        {itemPembayaran && (
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
                fontSize: 20,
                fontWeight: 'bold',
                marginBottom: 8,
              }}
            >
              {itemPembayaran.tipe === 'HUTANG'
                ? 'Bayar Hutang'
                : 'Terima Piutang'}
            </Text>

            <Text style={{ marginBottom: 4 }}>
              {itemPembayaran.nama}
            </Text>

            <Text style={{ marginBottom: 16 }}>
              Sisa:{' '}
              <Text style={{ fontWeight: 'bold' }}>
                {formatRupiah(itemPembayaran.sisa)}
              </Text>
            </Text>

            <Text style={{ marginBottom: 6 }}>
              Nominal
            </Text>

            <TextInput
              value={nominalBayar}
              onChangeText={(text) =>
                setNominalBayar(
                  text.replace(/\D/g, '')
                )
              }
              placeholder="Masukkan nominal"
              keyboardType="numeric"
              style={{
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
              }}
            />

            <Text style={{ marginBottom: 8 }}>
              {itemPembayaran.tipe === 'HUTANG'
                ? 'Bayar menggunakan'
                : 'Uang masuk ke'}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 16,
              }}
            >
              {aset.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() =>
                    setAsetPembayaran(item.id)
                  }
                  style={{
                    borderWidth: 1,
                    borderColor:
                      asetPembayaran === item.id
                        ? '#222'
                        : '#ccc',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text
                    style={{
                      fontWeight:
                        asetPembayaran === item.id
                          ? 'bold'
                          : 'normal',
                    }}
                  >
                    {item.nama}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={bayarHutangPiutang}
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
                Simpan Pembayaran
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={resetForm}
              style={{
                padding: 12,
                alignItems: 'center',
              }}
            >
              <Text>Batal</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            marginBottom: 12,
          }}
        >
          Daftar Hutang & Piutang
        </Text>

        {data.length === 0 ? (
          <Text>
            Belum ada hutang atau piutang aktif.
          </Text>
        ) : (
          data.map((item) => (
            <View
              key={item.id}
              style={{
                borderWidth: 1,
                borderColor: '#ddd',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: 'bold',
                }}
              >
                {item.nama}
              </Text>

              <Text style={{ marginTop: 4 }}>
                {item.tipe === 'HUTANG'
                  ? 'Hutang'
                  : 'Piutang'}
              </Text>

              <Text style={{ marginTop: 8 }}>
                Total:{' '}
                <Text style={{ fontWeight: 'bold' }}>
                  {formatRupiah(item.nominal)}
                </Text>
              </Text>

              <Text style={{ marginTop: 4 }}>
                Sisa:{' '}
                <Text style={{ fontWeight: 'bold' }}>
                  {formatRupiah(item.sisa)}
                </Text>
              </Text>

              {item.catatan && (
                <Text style={{ marginTop: 6 }}>
                  Catatan: {item.catatan}
                </Text>
              )}

              <TouchableOpacity
                onPress={() => {
                  setItemPembayaran(item);
                  setMode(null);
                }}
                style={{
                  backgroundColor: '#222',
                  padding: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginTop: 14,
                }}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontWeight: 'bold',
                  }}
                >
                  {item.tipe === 'HUTANG'
                    ? 'Bayar Hutang'
                    : 'Terima Pembayaran'}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}