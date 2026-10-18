import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

type Bulan = {
  bulan: string;
};

type Ringkasan = {
  pendapatan: number;
  pengeluaran: number;
  bersih: number;
};

type Pengeluaran = {
  id: number;
  jenis: string;
  jumlah: number;
  tanggal: string;
  deskripsi: string | null;
};

const formatRupiah = (nilai: number) => {
  return `Rp ${nilai.toLocaleString('id-ID')}`;
};

const namaBulan = (bulan: string) => {
  const [tahun, nomorBulan] = bulan.split('-');

  const tanggal = new Date(
    Number(tahun),
    Number(nomorBulan) - 1,
    1
  );

  return tanggal.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
};

const formatTanggal = (tanggal: string) => {
  const date = new Date(tanggal);

  if (Number.isNaN(date.getTime())) {
    return tanggal;
  }

  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const namaJenis = (jenis: string) => {
  switch (jenis) {
    case 'BENSIN':
      return 'Bensin';

    case 'OLI':
      return 'Oli';

    case 'SERVIS':
      return 'Servis';

    case 'SPAREPART':
      return 'Sparepart';

    case 'PENGELUARAN':
      return 'Pengeluaran';

    default:
      return jenis;
  }
};

export default function LaporanBulanan() {
  const db = useSQLiteContext();

  const [daftarBulan, setDaftarBulan] = useState<Bulan[]>([]);
  const [bulanAktif, setBulanAktif] = useState<string | null>(null);

  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
  const [daftarPengeluaran, setDaftarPengeluaran] = useState<
    Pengeluaran[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const ambilDaftarBulan = async () => {
    try {
      setLoading(true);

      const hasil = await db.getAllAsync<Bulan>(`
        SELECT DISTINCT substr(tanggal, 1, 7) AS bulan
        FROM transaksi
        WHERE tanggal IS NOT NULL
          AND tanggal != ''
        ORDER BY bulan DESC
      `);

      setDaftarBulan(hasil);

      if (hasil.length > 0) {
        setBulanAktif(hasil[0].bulan);
      } else {
        setBulanAktif(null);
      }
    } catch (error) {
      console.error('Gagal mengambil daftar bulan:', error);
    } finally {
      setLoading(false);
    }
  };

  const ambilDetailBulan = async (bulan: string) => {
    try {
      setLoadingDetail(true);

      const hasilRingkasan =
        await db.getFirstAsync<Ringkasan>(`
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN jenis = 'PENDAPATAN'
                  THEN jumlah
                  ELSE 0
                END
              ),
              0
            ) AS pendapatan,

            COALESCE(
              SUM(
                CASE
                  WHEN jenis IN (
                    'PENGELUARAN',
                    'BENSIN',
                    'OLI',
                    'SERVIS',
                    'SPAREPART'
                  )
                  THEN jumlah
                  ELSE 0
                END
              ),
              0
            ) AS pengeluaran,

            (
              COALESCE(
                SUM(
                  CASE
                    WHEN jenis = 'PENDAPATAN'
                    THEN jumlah
                    ELSE 0
                  END
                ),
                0
              )
              -
              COALESCE(
                SUM(
                  CASE
                    WHEN jenis IN (
                      'PENGELUARAN',
                      'BENSIN',
                      'OLI',
                      'SERVIS',
                      'SPAREPART'
                    )
                    THEN jumlah
                    ELSE 0
                  END
                ),
                0
              )
            ) AS bersih

          FROM transaksi
          WHERE substr(tanggal, 1, 7) = ?
        `, bulan);

      const hasilPengeluaran =
        await db.getAllAsync<Pengeluaran>(`
          SELECT
            id,
            jenis,
            jumlah,
            tanggal,
            deskripsi
          FROM transaksi
          WHERE substr(tanggal, 1, 7) = ?
            AND jenis IN (
              'PENGELUARAN',
              'BENSIN',
              'OLI',
              'SERVIS',
              'SPAREPART'
            )
          ORDER BY jumlah DESC
        `, bulan);

      setRingkasan(
        hasilRingkasan ?? {
          pendapatan: 0,
          pengeluaran: 0,
          bersih: 0,
        }
      );

      setDaftarPengeluaran(hasilPengeluaran);
    } catch (error) {
      console.error('Gagal mengambil laporan bulanan:', error);

      setRingkasan({
        pendapatan: 0,
        pengeluaran: 0,
        bersih: 0,
      });

      setDaftarPengeluaran([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    ambilDaftarBulan();
  }, []);

  useEffect(() => {
    if (bulanAktif) {
      ambilDetailBulan(bulanAktif);
    }
  }, [bulanAktif]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <ActivityIndicator />

        <Text
          style={{
            marginTop: 10,
            color: '#777777',
          }}
        >
          Memuat laporan...
        </Text>
      </View>
    );
  }

  if (daftarBulan.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 30,
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: '700',
            color: '#111111',
            textAlign: 'center',
          }}
        >
          Belum ada laporan
        </Text>

        <Text
          style={{
            marginTop: 8,
            fontSize: 14,
            color: '#777777',
            textAlign: 'center',
          }}
        >
          Laporan bulanan akan muncul setelah ada transaksi.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        paddingBottom: 40,
      }}
    >
      <Text
        style={{
          fontSize: 24,
          fontWeight: '700',
          color: '#111111',
          marginBottom: 18,
        }}
      >
        Laporan Bulanan
      </Text>

      {/* LIST BULAN */}
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          color: '#777777',
          marginBottom: 8,
        }}
      >
        PILIH BULAN
      </Text>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#eeeeee',
          borderRadius: 14,
          overflow: 'hidden',
          marginBottom: 24,
        }}
      >
        {daftarBulan.map((item, index) => {
          const aktif = item.bulan === bulanAktif;

          return (
            <Pressable
              key={item.bulan}
              onPress={() => setBulanAktif(item.bulan)}
              style={{
                paddingVertical: 15,
                paddingHorizontal: 16,
                borderBottomWidth:
                  index === daftarBulan.length - 1 ? 0 : 1,
                borderBottomColor: '#eeeeee',
                backgroundColor: aktif ? '#f5f5f5' : '#ffffff',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: aktif ? '700' : '500',
                  color: '#111111',
                }}
              >
                {namaBulan(item.bulan)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loadingDetail ? (
        <View
          style={{
            paddingVertical: 30,
            alignItems: 'center',
          }}
        >
          <ActivityIndicator />

          <Text
            style={{
              marginTop: 10,
              color: '#777777',
            }}
          >
            Memuat data bulan...
          </Text>
        </View>
      ) : (
        <>
          {/* BULAN AKTIF */}
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: '#111111',
              marginBottom: 16,
            }}
          >
            {bulanAktif ? namaBulan(bulanAktif) : ''}
          </Text>

          {/* 1. TOTAL PENDAPATAN */}
          <View
            style={{
              borderWidth: 1,
              borderColor: '#eeeeee',
              borderRadius: 14,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: '#777777',
              }}
            >
              Total Pendapatan
            </Text>

            <Text
              style={{
                marginTop: 6,
                fontSize: 22,
                fontWeight: '700',
                color: '#111111',
              }}
            >
              {formatRupiah(ringkasan?.pendapatan ?? 0)}
            </Text>
          </View>

          {/* 2. TOTAL PENGELUARAN */}
          <View
            style={{
              borderWidth: 1,
              borderColor: '#eeeeee',
              borderRadius: 14,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: '#777777',
              }}
            >
              Total Pengeluaran
            </Text>

            <Text
              style={{
                marginTop: 6,
                fontSize: 22,
                fontWeight: '700',
                color: '#111111',
              }}
            >
              {formatRupiah(ringkasan?.pengeluaran ?? 0)}
            </Text>
          </View>

          {/* 3. PENDAPATAN BERSIH */}
          <View
            style={{
              borderWidth: 1,
              borderColor: '#eeeeee',
              borderRadius: 14,
              padding: 16,
              marginBottom: 26,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: '#777777',
              }}
            >
              Pendapatan Bersih
            </Text>

            <Text
              style={{
                marginTop: 6,
                fontSize: 22,
                fontWeight: '700',
                color: '#111111',
              }}
            >
              {formatRupiah(ringkasan?.bersih ?? 0)}
            </Text>
          </View>

          {/* 4. DAFTAR PENGELUARAN */}
          <Text
            style={{
              fontSize: 17,
              fontWeight: '700',
              color: '#111111',
              marginBottom: 4,
            }}
          >
            Daftar Pengeluaran
          </Text>

          <Text
            style={{
              fontSize: 13,
              color: '#777777',
              marginBottom: 12,
            }}
          >
            Diurutkan dari terbesar ke terkecil
          </Text>

          {daftarPengeluaran.length === 0 ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#eeeeee',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  color: '#777777',
                }}
              >
                Belum ada pengeluaran pada bulan ini.
              </Text>
            </View>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#eeeeee',
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              {daftarPengeluaran.map((item, index) => (
                <View
                  key={item.id}
                  style={{
                    paddingVertical: 15,
                    paddingHorizontal: 16,
                    borderBottomWidth:
                      index === daftarPengeluaran.length - 1
                        ? 0
                        : 1,
                    borderBottomColor: '#eeeeee',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        paddingRight: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '600',
                          color: '#111111',
                        }}
                      >
                        {item.deskripsi?.trim()
                          ? item.deskripsi
                          : namaJenis(item.jenis)}
                      </Text>

                      <Text
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: '#888888',
                        }}
                      >
                        {namaJenis(item.jenis)} •{' '}
                        {formatTanggal(item.tanggal)}
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: '#111111',
                      }}
                    >
                      {formatRupiah(item.jumlah)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}