import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import SetModal from './SetModal';

type Aset = {
  id: number;
  nama: string;
  saldo: number;
};

type Periode = {
  id: number;
  tanggal_mulai: string;
  status: string;
};

type Ringkasan = {
  pendapatan: number;
  pengeluaran: number;
  bersih: number;
};

type HutangPiutang = {
  jumlah: number;
};

function formatRupiah(nilai: number) {
  return `Rp ${nilai.toLocaleString('id-ID')}`;
}

function formatTanggal(tanggal: string) {
  if (!tanggal) return '-';

  const bagian = tanggal.slice(0, 10).split('-');

  if (bagian.length !== 3) return tanggal;

  const [tahun, bulan, hari] = bagian;

  const namaBulan = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  const indexBulan = Number(bulan) - 1;

  return `${Number(hari)} ${
    namaBulan[indexBulan] ?? bulan
  } ${tahun}`;
}

export default function Settlement() {
  const db = useSQLiteContext();

  const [periode, setPeriode] = useState<Periode | null>(null);
  const [aset, setAset] = useState<Aset[]>([]);

  const [ringkasan, setRingkasan] = useState<Ringkasan>({
    pendapatan: 0,
    pengeluaran: 0,
    bersih: 0,
  });

  const [hutangPiutangTerbuka, setHutangPiutangTerbuka] =
    useState(0);

  const [sedangMemuat, setSedangMemuat] = useState(true);
  const [sedangMenutup, setSedangMenutup] = useState(false);

  const ambilData = useCallback(async () => {
    setSedangMemuat(true);

    try {
      const periodeAktif =
        await db.getFirstAsync<Periode>(`
          SELECT
            id,
            tanggal_mulai,
            status
          FROM periode
          ORDER BY id DESC
          LIMIT 1
        `);

      setPeriode(periodeAktif ?? null);

      if (!periodeAktif) {
        setAset([]);

        setRingkasan({
          pendapatan: 0,
          pengeluaran: 0,
          bersih: 0,
        });

        setHutangPiutangTerbuka(0);

        return;
      }

      /*
       * PERIODE MENUNGGU MODAL
       */
      if (periodeAktif.status === 'MENUNGGU_MODAL') {
        setAset([]);

        setRingkasan({
          pendapatan: 0,
          pengeluaran: 0,
          bersih: 0,
        });

        const terbuka =
          await db.getFirstAsync<HutangPiutang>(`
            SELECT COUNT(*) AS jumlah
            FROM hutang_piutang
            WHERE sisa > 0
          `);

        setHutangPiutangTerbuka(terbuka?.jumlah ?? 0);

        return;
      }

      /*
       * AMBIL SEMUA ASET
       */
      const hasilAset = await db.getAllAsync<{
        id: number;
        nama: string;
      }>(`
        SELECT
          id,
          nama
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

      const dataAset: Aset[] = [];

      for (const item of hasilAset) {
        const modal = await db.getFirstAsync<{
          total: number | null;
        }>(
          `
          SELECT COALESCE(SUM(nominal), 0) AS total
          FROM modal_awal
          WHERE periode_id = ?
            AND aset_id = ?
          `,
          periodeAktif.id,
          item.id
        );

        const perubahan = await db.getFirstAsync<{
          total: number | null;
        }>(
          `
          SELECT COALESCE(SUM(ps.jumlah), 0) AS total
          FROM perubahan_saldo ps
          INNER JOIN transaksi t
            ON t.id = ps.transaksi_id
          WHERE ps.aset_id = ?
            AND t.periode_id = ?
          `,
          item.id,
          periodeAktif.id
        );

        const saldo =
          (modal?.total ?? 0) +
          (perubahan?.total ?? 0);

        dataAset.push({
          id: item.id,
          nama: item.nama,
          saldo,
        });
      }

      setAset(dataAset);

      /*
       * RINGKASAN PERIODE
       */
      const pendapatan =
        await db.getFirstAsync<{ total: number | null }>(
          `
          SELECT COALESCE(SUM(jumlah), 0) AS total
          FROM transaksi
          WHERE periode_id = ?
            AND jenis = 'PENDAPATAN'
          `,
          periodeAktif.id
        );

      const pengeluaran =
        await db.getFirstAsync<{ total: number | null }>(
          `
          SELECT COALESCE(SUM(jumlah), 0) AS total
          FROM transaksi
          WHERE periode_id = ?
            AND jenis = 'PENGELUARAN'
          `,
          periodeAktif.id
        );

      const totalPendapatan = pendapatan?.total ?? 0;
      const totalPengeluaran = pengeluaran?.total ?? 0;

      setRingkasan({
        pendapatan: totalPendapatan,
        pengeluaran: totalPengeluaran,
        bersih: totalPendapatan - totalPengeluaran,
      });

      /*
       * HUTANG / PIUTANG TERBUKA
       */
      const terbuka =
        await db.getFirstAsync<HutangPiutang>(`
          SELECT COUNT(*) AS jumlah
          FROM hutang_piutang
          WHERE sisa > 0
        `);

      setHutangPiutangTerbuka(terbuka?.jumlah ?? 0);
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Data Settlement belum berhasil dimuat.'
      );
    } finally {
      setSedangMemuat(false);
    }
  }, [db]);

  useEffect(() => {
    ambilData();
  }, [ambilData]);

  /*
   * DIPANGGIL SETELAH SET MODAL BERHASIL
   */
  const setelahSetModal = async () => {
    await ambilData();
  };

  /*
   * TUTUP PERIODE
   */
  const tutupPeriode = () => {
    if (!periode) return;

    if (periode.status !== 'AKTIF') {
      Alert.alert(
        'Settlement tidak tersedia',
        'Periode saat ini belum aktif.'
      );

      return;
    }

    const totalAset = aset.reduce(
      (total, item) => total + item.saldo,
      0
    );

    const detailHutang =
      hutangPiutangTerbuka > 0
        ? `\n\nMasih ada ${hutangPiutangTerbuka} hutang/piutang yang belum selesai. Data tersebut tidak akan dihapus dan tetap dibawa ke periode berikutnya.`
        : '';

    Alert.alert(
      'Tutup Periode?',
      `Periode dimulai ${formatTanggal(
        periode.tanggal_mulai
      )} dan akan ditutup hari ini.

Pendapatan: ${formatRupiah(ringkasan.pendapatan)}
Pengeluaran: ${formatRupiah(ringkasan.pengeluaran)}
Bersih: ${formatRupiah(ringkasan.bersih)}

Total saldo akhir: ${formatRupiah(totalAset)}${detailHutang}

Setelah ditutup:
• periode lama menjadi riwayat
• saldo akhir disimpan
• periode baru dibuat
• periode baru menunggu Set Modal
• transaksi periode baru belum dapat digunakan

Data transaksi lama tidak akan dihapus.`,
      [
        {
          text: 'Batal',
          style: 'cancel',
        },
        {
          text: 'Tutup Periode',
          style: 'destructive',
          onPress: async () => {
            if (sedangMenutup) return;

            setSedangMenutup(true);

            try {
              const sekarang = new Date();

              const tanggalSekarang =
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
                ).padStart(2, '0')}`;

              await db.withTransactionAsync(async () => {
                const periodeTerakhir =
                  await db.getFirstAsync<{
                    id: number;
                    status: string;
                  }>(
                    `
                    SELECT id, status
                    FROM periode
                    WHERE id = ?
                    `,
                    periode.id
                  );

                if (
                  !periodeTerakhir ||
                  periodeTerakhir.status !== 'AKTIF'
                ) {
                  throw new Error(
                    'Periode sudah berubah atau sudah ditutup.'
                  );
                }

                /*
                 * SIMPAN SETTLEMENT
                 */
                const hasilSettlement =
                  await db.runAsync(
                    `
                    INSERT INTO settlement (
                      periode_id,
                      tanggal_tutup,
                      catatan
                    )
                    VALUES (?, ?, ?)
                    `,
                    periode.id,
                    tanggalSekarang,
                    'Settlement / Tutup Periode'
                  );

                const settlementId =
                  hasilSettlement.lastInsertRowId;

                /*
                 * SIMPAN SALDO AKHIR
                 */
                for (const item of aset) {
                  await db.runAsync(
                    `
                    INSERT INTO settlement_saldo (
                      settlement_id,
                      aset_id,
                      saldo
                    )
                    VALUES (?, ?, ?)
                    `,
                    settlementId,
                    item.id,
                    item.saldo
                  );
                }

                /*
                 * TUTUP PERIODE LAMA
                 */
                await db.runAsync(
                  `
                  UPDATE periode
                  SET
                    tanggal_tutup = ?,
                    status = 'SELESAI'
                  WHERE id = ?
                  `,
                  tanggalSekarang,
                  periode.id
                );

                /*
                 * BUAT PERIODE BARU
                 */
                await db.runAsync(
                  `
                  INSERT INTO periode (
                    tanggal_mulai,
                    tanggal_tutup,
                    status
                  )
                  VALUES (?, NULL, 'MENUNGGU_MODAL')
                  `,
                  tanggalSekarang
                );

                /*
                 * RESET STATUS MODAL
                 */
                await db.runAsync(
                  `
                  INSERT OR REPLACE INTO pengaturan (
                    nama,
                    nilai
                  )
                  VALUES ('modal_sudah_diatur', '0')
                  `
                );

                await db.runAsync(
                  `
                  INSERT OR REPLACE INTO pengaturan (
                    nama,
                    nilai
                  )
                  VALUES ('periode_sudah_ditutup', '1')
                  `
                );

                await db.runAsync(
                  `
                  INSERT OR REPLACE INTO pengaturan (
                    nama,
                    nilai
                  )
                  VALUES ('periode_ditutup_pada', ?)
                  `,
                  tanggalSekarang
                );
              });

              Alert.alert(
                'Settlement Berhasil',
                'Periode lama berhasil ditutup.\n\nPeriode baru sudah dibuat dan sekarang menunggu Set Modal.',
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
              console.error(error);

              const pesan =
                error instanceof Error
                  ? error.message
                  : 'Periode belum berhasil ditutup.';

              Alert.alert(
                'Gagal Settlement',
                pesan
              );
            } finally {
              setSedangMenutup(false);
            }
          },
        },
      ]
    );
  };

  /*
   * MEMUAT
   */
  if (sedangMemuat) {
    return (
      <View style={{ padding: 16 }}>
        <Text>Memuat Settlement...</Text>
      </View>
    );
  }

  /*
   * TIDAK ADA PERIODE
   */
  if (!periode) {
    return (
      <ScrollView
        contentContainerStyle={{
          padding: 16,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Settlement / Tutup Periode
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#ddd',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <Text>Belum ada periode.</Text>
        </View>
      </ScrollView>
    );
  }

  /*
   * PERIODE MENUNGGU SET MODAL
   */
  if (periode.status === 'MENUNGGU_MODAL') {
    return (
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 40,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Settlement / Tutup Periode
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
          <Text
            style={{
              fontSize: 18,
              fontWeight: 'bold',
              marginBottom: 8,
            }}
          >
            Periode Baru
          </Text>

          <Text style={{ marginBottom: 8 }}>
            Periode baru sudah dibuat dan sekarang
            menunggu Set Modal.
          </Text>

          <Text>
            Mulai: {formatTanggal(periode.tanggal_mulai)}
          </Text>

          <Text style={{ marginTop: 4 }}>
            Status: Menunggu Set Modal
          </Text>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: 'bold',
            }}
          >
            Set Modal
          </Text>

          <Text
            style={{
              marginTop: 6,
              marginBottom: 16,
            }}
          >
            Masukkan saldo awal yang benar-benar tersedia
            pada setiap aset untuk memulai periode ini.
          </Text>
        </View>

        <SetModal onSelesai={setelahSetModal} />
      </ScrollView>
    );
  }

  /*
   * PERIODE SELESAI
   */
  if (periode.status === 'SELESAI') {
    return (
      <ScrollView
        contentContainerStyle={{
          padding: 16,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Settlement / Tutup Periode
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#ddd',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: 'bold',
              marginBottom: 8,
            }}
          >
            Periode sudah selesai
          </Text>

          <Text>
            Periode terakhir sudah ditutup.
          </Text>
        </View>
      </ScrollView>
    );
  }

  const totalAset = aset.reduce(
    (total, item) => total + item.saldo,
    0
  );

  /*
   * PERIODE AKTIF
   */
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        paddingBottom: 40,
      }}
    >
      <Text
        style={{
          fontSize: 26,
          fontWeight: 'bold',
          marginBottom: 8,
        }}
      >
        Settlement / Tutup Periode
      </Text>

      <Text style={{ marginBottom: 20 }}>
        Periksa seluruh data sebelum menutup periode.
      </Text>

      {/* PERIODE */}
      <View
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
            marginBottom: 10,
          }}
        >
          Periode Aktif
        </Text>

        <Text>
          Mulai: {formatTanggal(periode.tanggal_mulai)}
        </Text>

        <Text style={{ marginTop: 4 }}>
          Status: Aktif
        </Text>
      </View>

      {/* RINGKASAN */}
      <View
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
          Ringkasan Periode
        </Text>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 7,
          }}
        >
          <Text>Pendapatan</Text>

          <Text style={{ fontWeight: 'bold' }}>
            {formatRupiah(ringkasan.pendapatan)}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 7,
          }}
        >
          <Text>Pengeluaran</Text>

          <Text style={{ fontWeight: 'bold' }}>
            {formatRupiah(ringkasan.pengeluaran)}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 7,
            borderTopWidth: 1,
            borderTopColor: '#eee',
            marginTop: 4,
          }}
        >
          <Text style={{ fontWeight: 'bold' }}>
            Bersih
          </Text>

          <Text style={{ fontWeight: 'bold' }}>
            {formatRupiah(ringkasan.bersih)}
          </Text>
        </View>
      </View>

      {/* SALDO AKHIR */}
      <View
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
          Saldo Saat Ini
        </Text>

        {aset.map((item) => (
          <View
            key={item.id}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: '#eee',
            }}
          >
            <Text>{item.nama}</Text>

            <Text style={{ fontWeight: 'bold' }}>
              {formatRupiah(item.saldo)}
            </Text>
          </View>
        ))}

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingTop: 12,
          }}
        >
          <Text style={{ fontWeight: 'bold' }}>
            Total
          </Text>

          <Text style={{ fontWeight: 'bold' }}>
            {formatRupiah(totalAset)}
          </Text>
        </View>
      </View>

      {/* PERINGATAN HUTANG PIUTANG */}
      {hutangPiutangTerbuka > 0 && (
        <View
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
              fontWeight: 'bold',
              marginBottom: 6,
            }}
          >
            Perhatian
          </Text>

          <Text>
            Masih ada {hutangPiutangTerbuka}{' '}
            hutang/piutang yang belum selesai.
          </Text>

          <Text style={{ marginTop: 6 }}>
            Settlement tetap dapat dilakukan. Data tersebut
            tidak akan dihapus dan tetap berlanjut ke
            periode berikutnya.
          </Text>
        </View>
      )}

      {/* PERINGATAN BELUM ADA TRANSAKSI */}
      {ringkasan.pendapatan === 0 &&
        ringkasan.pengeluaran === 0 && (
          <View
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
                fontWeight: 'bold',
                marginBottom: 6,
              }}
            >
              Periode belum memiliki transaksi
            </Text>

            <Text>
              Periksa kembali sebelum melakukan Settlement.
              Periode tetap dapat ditutup jika memang
              diinginkan.
            </Text>
          </View>
        )}

      {/* TUTUP PERIODE */}
      <TouchableOpacity
        onPress={tutupPeriode}
        disabled={sedangMenutup}
        style={{
          backgroundColor: sedangMenutup ? '#999' : '#222',
          padding: 15,
          borderRadius: 8,
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Text
          style={{
            color: '#fff',
            fontWeight: 'bold',
          }}
        >
          {sedangMenutup
            ? 'Memproses Settlement...'
            : 'Tutup Periode'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
