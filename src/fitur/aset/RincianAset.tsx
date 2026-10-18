import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
    Button,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type Aset = {
  id: number;
  nama: string;
  saldo: number;
};

type Riwayat = {
  id: number;
  jenis: string;
  jumlah: number;
  tanggal: string;
  deskripsi: string | null;
  catatan: string | null;
  perubahan: number;
};

export default function RincianAset() {
  const db = useSQLiteContext();

  const [aset, setAset] = useState<Aset[]>([]);
  const [asetTerpilih, setAsetTerpilih] = useState<Aset | null>(null);
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);

  const ambilAset = useCallback(async () => {
    const hasil = await db.getAllAsync<Aset>(
      `
      SELECT
        a.id,
        a.nama,
        COALESCE(SUM(ps.jumlah), 0) AS saldo
      FROM aset a
      LEFT JOIN perubahan_saldo ps
        ON ps.aset_id = a.id
      GROUP BY a.id, a.nama
      ORDER BY a.id
      `
    );

    setAset(hasil);
  }, [db]);

  const ambilRiwayat = useCallback(
    async (asetId: number) => {
      const hasil = await db.getAllAsync<Riwayat>(
        `
        SELECT
          t.id,
          t.jenis,
          t.jumlah,
          t.tanggal,
          t.deskripsi,
          t.catatan,
          ps.jumlah AS perubahan
        FROM perubahan_saldo ps
        JOIN transaksi t
          ON t.id = ps.transaksi_id
        WHERE ps.aset_id = ?
        ORDER BY ps.tanggal DESC, ps.id DESC
        `,
        asetId
      );

      setRiwayat(hasil);
    },
    [db]
  );

  useFocusEffect(
    useCallback(() => {
      ambilAset();
    }, [ambilAset])
  );

  async function pilihAset(item: Aset) {
    setAsetTerpilih(item);
    await ambilRiwayat(item.id);
  }

  function kembaliKeDaftar() {
    setAsetTerpilih(null);
    setRiwayat([]);
  }

  function namaTransaksi(item: Riwayat) {
    if (item.deskripsi?.trim()) {
      return item.deskripsi;
    }

    if (item.catatan?.trim()) {
      return item.catatan;
    }

    if (item.jenis === 'MODAL_AWAL') {
      return 'Modal awal';
    }

    if (item.jenis === 'PENDAPATAN') {
      return 'Pendapatan';
    }

    if (item.jenis === 'PENGELUARAN') {
      return 'Pengeluaran';
    }

    return item.jenis;
  }

  function formatTanggal(tanggal: string) {
    return new Date(tanggal).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function formatJam(tanggal: string) {
    return new Date(tanggal).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (asetTerpilih) {
    return (
      <View style={styles.detailContainer}>
        <View style={styles.tombolKembali}>
          <Button
            title="Kembali"
            onPress={kembaliKeDaftar}
          />
        </View>

        <ScrollView>
          <Text style={styles.title}>
            {asetTerpilih.nama}
          </Text>

          <View style={styles.saldoBox}>
            <Text style={styles.saldoLabel}>
              Saldo saat ini
            </Text>

            <Text style={styles.saldo}>
              Rp{asetTerpilih.saldo.toLocaleString('id-ID')}
            </Text>
          </View>

          <Text style={styles.subTitle}>
            Riwayat perubahan saldo
          </Text>

          {riwayat.length === 0 ? (
            <Text style={styles.kosong}>
              Belum ada riwayat.
            </Text>
          ) : (
            riwayat.map((item) => {
              const positif = item.perubahan >= 0;

              return (
                <View
                  key={item.id}
                  style={styles.riwayatItem}
                >
                  <View style={styles.riwayatKiri}>
                    <Text style={styles.namaTransaksi}>
                      {namaTransaksi(item)}
                    </Text>

                    <Text style={styles.tanggal}>
                      {formatTanggal(item.tanggal)} •{' '}
                      {formatJam(item.tanggal)}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.perubahan,
                      positif
                        ? styles.perubahanPositif
                        : styles.perubahanNegatif,
                    ]}
                  >
                    {positif ? '+' : ''}
                    Rp{item.perubahan.toLocaleString('id-ID')}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Rincian Aset</Text>

      {aset.map((item) => (
        <View key={item.id} style={styles.asetItem}>
          <View style={styles.infoAset}>
            <Text style={styles.namaAset}>
              {item.nama}
            </Text>

            <Text style={styles.saldoAset}>
              Rp{item.saldo.toLocaleString('id-ID')}
            </Text>
          </View>

          <Button
            title="Lihat"
            onPress={() => pilihAset(item)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },

  detailContainer: {
    flex: 1,
    padding: 16,
  },

  tombolKembali: {
    marginBottom: 12,
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },

  asetItem: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    gap: 10,
  },

  infoAset: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  namaAset: {
    fontSize: 17,
    fontWeight: '600',
  },

  saldoAset: {
    fontSize: 16,
    fontWeight: '700',
  },

  saldoBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
    marginBottom: 16,
  },

  saldoLabel: {
    fontSize: 14,
  },

  saldo: {
    marginTop: 4,
    fontSize: 26,
    fontWeight: '700',
  },

  subTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },

  riwayatItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },

  riwayatKiri: {
    flex: 1,
    paddingRight: 12,
  },

  namaTransaksi: {
    fontSize: 15,
    fontWeight: '600',
  },

  tanggal: {
    marginTop: 4,
    fontSize: 12,
    color: '#777',
  },

  perubahan: {
    fontSize: 15,
    fontWeight: '700',
  },

  perubahanPositif: {
    color: 'green',
  },

  perubahanNegatif: {
    color: 'red',
  },

  kosong: {
    fontSize: 14,
    color: '#777',
  },
});