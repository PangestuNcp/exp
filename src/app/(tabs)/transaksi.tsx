import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import Pendapatan from '../../fitur/Pendapatan';
import Pengeluaran from '../../fitur/Pengeluaran';

type PilihanPeriode = 'MINGGU' | 'BULAN';

type Transaksi = {
  id: number;
  jenis: string;
  jumlah: number;
  tanggal: string;
  deskripsi: string | null;
};

type GrafikHari = {
  label: string;
  pendapatan: number;
  pengeluaran: number;
};

const WARNA = {
  background: '#F7F8F4',
  card: '#FFFFFF',

  hijau: '#55A982',
  hijauGelap: '#277B67',
  hijauMuda: '#E5F1EA',

  merah: '#EF626B',
  merahMuda: '#FBE7E8',

  biru: '#4B91E8',
  biruMuda: '#E5EFFD',

  kuning: '#DFAE45',
  kuningMuda: '#FFF4DB',

  teks: '#164B57',
  teksGelap: '#123F4A',
  teksLembut: '#63818A',

  garis: '#E4EBE7',
  putih: '#FFFFFF',
};

const formatRupiah = (nilai: number) => {
  const angka = Math.abs(Math.round(nilai));

  return `Rp ${angka.toLocaleString('id-ID')}`;
};

const formatTanggalHeader = () => {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatJam = (tanggal: string) => {
  return new Date(tanggal).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const adalahPengeluaran = (jenis: string): boolean => {
  const jenisNormal = jenis.trim().toUpperCase();

  return [
    'PENGELUARAN',
    'BENSIN',
    'OLI',
    'SERVIS',
    'SPAREPART',
  ].includes(jenisNormal);
};

const getAwalHari = (tanggal: Date) => {
  return new Date(
    tanggal.getFullYear(),
    tanggal.getMonth(),
    tanggal.getDate(),
    0,
    0,
    0,
    0
  );
};

const getAwalMinggu = (tanggal: Date) => {
  const hasil = getAwalHari(tanggal);

  const hari = hasil.getDay();
  const selisih = hari === 0 ? 6 : hari - 1;

  hasil.setDate(hasil.getDate() - selisih);

  return hasil;
};

const getTanggalKey = (tanggal: Date) => {
  const tahun = tanggal.getFullYear();

  const bulan = String(
    tanggal.getMonth() + 1
  ).padStart(2, '0');

  const hari = String(
    tanggal.getDate()
  ).padStart(2, '0');

  return `${tahun}-${bulan}-${hari}`;
};

const getNomorMinggu = (tanggal: Date) => {
  const hari = new Date(
    tanggal.getFullYear(),
    tanggal.getMonth(),
    tanggal.getDate()
  );

  const awalTahun = new Date(
    hari.getFullYear(),
    0,
    1
  );

  const awalMingguTahun =
    getAwalMinggu(awalTahun);

  const selisihHari = Math.floor(
    (hari.getTime() -
      awalMingguTahun.getTime()) /
      (24 * 60 * 60 * 1000)
  );

  return (
    Math.floor(selisihHari / 7) + 1
  );
};

export default function TransaksiScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [periode, setPeriode] =
    useState<PilihanPeriode>('MINGGU');

  const [
    dropdownTerbuka,
    setDropdownTerbuka,
  ] = useState(false);

  const [modal, setModal] = useState<
    'PENDAPATAN' | 'PENGELUARAN' | null
  >(null);

  const [transaksi, setTransaksi] =
    useState<Transaksi[]>([]);

  const [target, setTarget] =
    useState(100000);

  const [refresh, setRefresh] =
    useState(0);

  const [
    bensinTerakhir,
    setBensinTerakhir,
  ] = useState<number | null>(null);

  const [
    kmTerakhir,
    setKmTerakhir,
  ] = useState<number | null>(null);

  const [
    oliBerikutnya,
    setOliBerikutnya,
  ] = useState<number | null>(null);

  /* ============================================================
     AMBIL TRANSAKSI
  ============================================================ */

  useEffect(() => {
    const ambilTransaksi = async () => {
      try {
        const data =
          await db.getAllAsync<Transaksi>(
            `
            SELECT
              id,
              jenis,
              jumlah,
              tanggal,
              deskripsi
            FROM transaksi
            ORDER BY tanggal DESC, id DESC
            `
          );

        setTransaksi(data);
      } catch (error) {
        console.log(
          'Gagal mengambil transaksi:',
          error
        );
      }
    };

    ambilTransaksi();
  }, [db, refresh]);

  /* ============================================================
     TARGET
  ============================================================ */

  useEffect(() => {
    const ambilTarget = async () => {
      try {
        const tanggal =
          getTanggalKey(new Date());

        const data =
          await db.getFirstAsync<{
            jumlah: number;
          }>(
            `
            SELECT jumlah
            FROM target
            WHERE tanggal = ?
            ORDER BY id DESC
            LIMIT 1
            `,
            tanggal
          );

        if (data?.jumlah) {
          setTarget(data.jumlah);
        } else {
          setTarget(100000);
        }
      } catch (error) {
        console.log(
          'Gagal mengambil target:',
          error
        );

        setTarget(100000);
      }
    };

    ambilTarget();
  }, [db, refresh]);

  /* ============================================================
     DATA MOTOR
  ============================================================ */

  useEffect(() => {
    const ambilMotor = async () => {
      try {
        const bensin =
          await db.getFirstAsync<{
            motor_liter: number | null;
            motor_km: number | null;
          }>(
            `
            SELECT
              motor_liter,
              motor_km
            FROM transaksi
            WHERE motor_liter IS NOT NULL
            ORDER BY tanggal DESC, id DESC
            LIMIT 1
            `
          );

        const oli =
          await db.getFirstAsync<{
            motor_km: number | null;
            motor_interval: number | null;
          }>(
            `
            SELECT
              motor_km,
              motor_interval
            FROM transaksi
            WHERE motor_interval IS NOT NULL
            ORDER BY tanggal DESC, id DESC
            LIMIT 1
            `
          );

        setBensinTerakhir(
          bensin?.motor_liter ?? null
        );

        setKmTerakhir(
          bensin?.motor_km ?? null
        );

        if (
          oli?.motor_km !== null &&
          oli?.motor_km !== undefined &&
          oli?.motor_interval !== null &&
          oli?.motor_interval !== undefined
        ) {
          setOliBerikutnya(
            oli.motor_km +
              oli.motor_interval
          );
        } else {
          setOliBerikutnya(null);
        }
      } catch (error) {
        console.log(
          'Gagal mengambil data motor:',
          error
        );
      }
    };

    ambilMotor();
  }, [db, refresh]);

  /* ============================================================
     FILTER PERIODE
  ============================================================ */

  const transaksiPeriode = useMemo(() => {
    const sekarang = new Date();

    if (periode === 'MINGGU') {
      const awal =
        getAwalMinggu(sekarang);

      return transaksi.filter((item) => {
        const tanggal =
          new Date(item.tanggal);

        return (
          tanggal >= awal &&
          tanggal <= sekarang
        );
      });
    }

    const awalMinggu =
      getAwalMinggu(sekarang);

    const awalRolling =
      new Date(awalMinggu);

    awalRolling.setDate(
      awalRolling.getDate() - 42
    );

    return transaksi.filter((item) => {
      const tanggal =
        new Date(item.tanggal);

      return (
        tanggal >= awalRolling &&
        tanggal <= sekarang
      );
    });
  }, [transaksi, periode]);

  /* ============================================================
     TOTAL PENDAPATAN
  ============================================================ */

  const totalPendapatan =
    useMemo(() => {
      return transaksiPeriode
        .filter(
          (item) =>
            item.jenis ===
            'PENDAPATAN'
        )
        .reduce(
          (total, item) =>
            total + item.jumlah,
          0
        );
    }, [transaksiPeriode]);

  /* ============================================================
   TOTAL PENGELUARAN
  ============================================================ */

  const totalPengeluaran = useMemo(() => {
    return transaksiPeriode
      .filter((item) => adalahPengeluaran(item.jenis))
      .reduce((total, item) => total + item.jumlah, 0);
  }, [transaksiPeriode]);

  /* ============================================================
     PENDAPATAN BERSIH
  ============================================================ */

  const pendapatanBersih =
    totalPendapatan -
    totalPengeluaran;

  /* ============================================================
     TARGET HARI INI
  ============================================================ */

  const pendapatanHariIni =
    useMemo(() => {
      const awal =
        getAwalHari(new Date());

      const sekarang = new Date();

      return transaksi
        .filter((item) => {
          const tanggal =
            new Date(item.tanggal);

          return (
            item.jenis ===
              'PENDAPATAN' &&
            tanggal >= awal &&
            tanggal <= sekarang
          );
        })
        .reduce(
          (total, item) =>
            total + item.jumlah,
          0
        );
    }, [transaksi]);

  const persentaseTarget =
    target > 0
      ? Math.min(
          100,
          Math.round(
            (pendapatanHariIni /
              target) *
              100
          )
        )
      : 0;

  /* ============================================================
     GRAFIK
  ============================================================ */

  const grafik =
    useMemo<GrafikHari[]>(() => {
      const sekarang = new Date();

      const awalMinggu =
        getAwalMinggu(sekarang);

      const hasil: GrafikHari[] = [];

      if (periode === 'MINGGU') {
        const namaHari = [
          'Sen',
          'Sel',
          'Rab',
          'Kam',
          'Jum',
          'Sab',
          'Min',
        ];

        for (
          let i = 0;
          i < 7;
          i++
        ) {
          const tanggal =
            new Date(awalMinggu);

          tanggal.setDate(
            tanggal.getDate() + i
          );

          const key =
            getTanggalKey(tanggal);

          let pendapatan = 0;
          let pengeluaran = 0;

          transaksi.forEach(
            (item) => {
              const tanggalTransaksi =
                new Date(
                  item.tanggal
                );

              if (
                getTanggalKey(
                  tanggalTransaksi
                ) !== key
              ) {
                return;
              }

              if (
                item.jenis ===
                'PENDAPATAN'
              ) {
                pendapatan +=
                  item.jumlah;
              }

              if (adalahPengeluaran(item.jenis)) {
                pengeluaran += item.jumlah;
              }
            }
          );

          hasil.push({
            label: namaHari[i],
            pendapatan,
            pengeluaran,
          });
        }

        return hasil;
      }

      const awalRolling =
        new Date(awalMinggu);

      awalRolling.setDate(
        awalRolling.getDate() - 42
      );

      for (
        let i = 0;
        i < 7;
        i++
      ) {
        const awalSlot =
          new Date(awalRolling);

        awalSlot.setDate(
          awalSlot.getDate() +
            i * 7
        );

        const akhirSlot =
          new Date(awalSlot);

        akhirSlot.setDate(
          akhirSlot.getDate() + 6
        );

        akhirSlot.setHours(
          23,
          59,
          59,
          999
        );

        let pendapatan = 0;
        let pengeluaran = 0;

        transaksi.forEach(
          (item) => {
            const tanggal =
              new Date(item.tanggal);

            if (
              tanggal < awalSlot ||
              tanggal > akhirSlot
            ) {
              return;
            }

            if (
              item.jenis ===
              'PENDAPATAN'
            ) {
              pendapatan +=
                item.jumlah;
            }

            if (adalahPengeluaran(item.jenis)) {
              pengeluaran += item.jumlah;
            } 
          }
        );

        hasil.push({
          label: `M${getNomorMinggu(
            awalSlot
          )}`,
          pendapatan,
          pengeluaran,
        });
      }

      return hasil;
    }, [transaksi, periode]);

  const nilaiMaksimumGrafik =
    Math.max(
      ...grafik.flatMap(
        (item) => [
          item.pendapatan,
          item.pengeluaran,
        ]
      ),
      1
    );

  /* ============================================================
     TRANSAKSI HARI INI
  ============================================================ */

  const transaksiHariIni =
    useMemo(() => {
      const awal =
        getAwalHari(new Date());

      const sekarang = new Date();

      return transaksi
        .filter((item) => {
          const tanggal =
            new Date(item.tanggal);

          return (
            tanggal >= awal &&
            tanggal <= sekarang
          );
        })
        .slice(0, 5);
    }, [transaksi]);

  /* ============================================================
     STATUS MOTOR
  ============================================================ */

  const statusMotor =
    useMemo(() => {
      if (
        oliBerikutnya === null ||
        kmTerakhir === null
      ) {
        return {
          teks:
            'Data oli belum tersedia',
          warna:
            WARNA.teksLembut,
          background:
            '#F0F3F1',
          icon:
            'information-circle-outline',
        };
      }

      const sisa =
        oliBerikutnya -
        kmTerakhir;

      if (sisa <= 0) {
        return {
          teks:
            'Waktunya ganti oli',
          warna:
            WARNA.merah,
          background:
            WARNA.merahMuda,
          icon:
            'warning-outline',
        };
      }

      if (sisa <= 300) {
        return {
          teks:
            'Segera ganti, waktunya ganti',
          warna:
            WARNA.kuning,
          background:
            WARNA.kuningMuda,
          icon:
            'warning-outline',
        };
      }

      return {
        teks:
          'Motor dalam kondisi baik',
        warna:
          WARNA.hijau,
        background:
          WARNA.hijauMuda,
        icon:
          'checkmark-circle-outline',
      };
    }, [
      oliBerikutnya,
      kmTerakhir,
    ]);

  /* ============================================================
     TUTUP MODAL
  ============================================================ */

  const tutupModal = () => {
    setModal(null);

    setTimeout(() => {
      setRefresh(
        (nilai) => nilai + 1
      );
    }, 250);
  };

  /* ============================================================
     RENDER
  ============================================================ */

  return (
    <View
      style={styles.container}
    >
      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.scrollContent
        }
      >
        {/* HEADER */}

        <View
          style={styles.header}
        >
          <View
            style={styles.brandArea}
          >
            <View
              style={styles.logo}
            >
              <Ionicons
                name="leaf"
                size={23}
                color={
                  WARNA.hijauGelap
                }
              />
            </View>

            <View>
              <Text
                style={
                  styles.logoText
                }
              >
                Tertata
              </Text>

              <Text
                style={
                  styles.tanggalText
                }
              >
                {formatTanggalHeader()}
              </Text>
            </View>
          </View>

          <View
            style={{
              position: 'relative',
            }}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                setDropdownTerbuka(
                  !dropdownTerbuka
                )
              }
              style={
                styles.dropdownButton
              }
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={
                  WARNA.teks
                }
              />

              <Text
                style={
                  styles.dropdownText
                }
              >
                {periode ===
                'MINGGU'
                  ? 'Minggu'
                  : 'Bulan'}
              </Text>

              <Ionicons
                name="chevron-down"
                size={16}
                color={
                  WARNA.teks
                }
              />
            </TouchableOpacity>

            {dropdownTerbuka && (
              <View
                style={
                  styles.dropdownMenu
                }
              >
                {(
                  [
                    'MINGGU',
                    'BULAN',
                  ] as PilihanPeriode[]
                ).map(
                  (item) => (
                    <TouchableOpacity
                      key={item}
                      onPress={() => {
                        setPeriode(
                          item
                        );

                        setDropdownTerbuka(
                          false
                        );
                      }}
                      style={
                        styles.dropdownItem
                      }
                    >
                      <Text
                        style={{
                          color:
                            periode ===
                            item
                              ? WARNA.hijauGelap
                              : WARNA.teks,

                          fontWeight:
                            periode ===
                            item
                              ? '700'
                              : '500',
                        }}
                      >
                        {item ===
                        'MINGGU'
                          ? 'Minggu'
                          : 'Bulan'}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            )}
          </View>
        </View>

        {/* CARD KEUANGAN */}

        <View
          style={
            styles.financeCard
          }
        >
          <View
            style={
              styles.financeTop
            }
          >
            <View
              style={
                styles.netIncomeArea
              }
            >
              <Text
                style={
                  styles.sectionLabel
                }
              >
                Pendapatan Bersih
              </Text>

              <Text
                style={[
                  styles.netIncome,
                  {
                    color:
                      pendapatanBersih >
                      0
                        ? WARNA.hijauGelap
                        : pendapatanBersih <
                          0
                        ? WARNA.merah
                        : WARNA.teks,
                  },
                ]}
              >
                {pendapatanBersih <
                0
                  ? '-'
                  : ''}

                {formatRupiah(
                  pendapatanBersih
                )}
              </Text>

              <View
                style={
                  styles.netStatus
                }
              >
                <Ionicons
                  name={
                    pendapatanBersih >=
                    0
                      ? 'arrow-up'
                      : 'arrow-down'
                  }
                  size={15}
                  color={
                    pendapatanBersih >=
                    0
                      ? WARNA.hijau
                      : WARNA.merah
                  }
                />

                <Text
                  style={{
                    color:
                      pendapatanBersih >=
                      0
                        ? WARNA.hijauGelap
                        : WARNA.merah,

                    fontSize: 13,
                    marginLeft: 5,
                  }}
                >
                  {pendapatanBersih >=
                  0
                    ? 'Keuangan positif'
                    : 'Pengeluaran lebih besar'}
                </Text>
              </View>
            </View>

            {/* RINGKASAN */}

            <View
              style={
                styles.summaryArea
              }
            >
              <View
                style={
                  styles.summaryItem
                }
              >
                <View
                  style={[
                    styles.summaryIcon,
                    {
                      backgroundColor:
                        WARNA.hijauMuda,
                    },
                  ]}
                >
                  <Ionicons
                    name="arrow-up"
                    size={16}
                    color={
                      WARNA.hijauGelap
                    }
                  />
                </View>

                <View
                  style={
                    styles.summaryTextArea
                  }
                >
                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    Pendapatan
                  </Text>

                  <Text
                    style={[
                      styles.summaryValue,
                      {
                        color:
                          WARNA.teks,
                      },
                    ]}
                  >
                    {formatRupiah(
                      totalPendapatan
                    )}
                  </Text>
                </View>
              </View>

              <View
                style={
                  styles.summaryItem
                }
              >
                <View
                  style={[
                    styles.summaryIcon,
                    {
                      backgroundColor:
                        WARNA.merahMuda,
                    },
                  ]}
                >
                  <Ionicons
                    name="arrow-down"
                    size={16}
                    color={
                      WARNA.merah
                    }
                  />
                </View>

                <View
                  style={
                    styles.summaryTextArea
                  }
                >
                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    Pengeluaran
                  </Text>

                  <Text
                    style={[
                      styles.summaryValue,
                      {
                        color:
                          WARNA.merah,
                      },
                    ]}
                  >
                    {formatRupiah(
                      totalPengeluaran
                    )}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* GRAFIK */}

          <View
            style={
              styles.chartContainer
            }
          >
            <View
              style={
                styles.chartHeader
              }
            >
              <Text
                style={
                  styles.chartTitle
                }
              >
                Grafik Keuangan
              </Text>

              <View
                style={
                  styles.legendArea
                }
              >
                <View
                  style={
                    styles.legendItem
                  }
                >
                  <View
                    style={[
                      styles.legendDot,
                      {
                        backgroundColor:
                          WARNA.hijau,
                      },
                    ]}
                  />

                  <Text
                    style={
                      styles.legendText
                    }
                  >
                    Pendapatan
                  </Text>
                </View>

                <View
                  style={
                    styles.legendItem
                  }
                >
                  <View
                    style={[
                      styles.legendDot,
                      {
                        backgroundColor:
                          WARNA.merah,
                      },
                    ]}
                  />

                  <Text
                    style={
                      styles.legendText
                    }
                  >
                    Pengeluaran
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={
                styles.chart
              }
            >
              {grafik.map(
                (item) => {
                  const tinggiPendapatan =
                    item.pendapatan >
                    0
                      ? Math.max(
                          10,
                          (item.pendapatan /
                            nilaiMaksimumGrafik) *
                            120
                        )
                      : 5;

                  const tinggiPengeluaran =
                    item.pengeluaran >
                    0
                      ? Math.max(
                          10,
                          (item.pengeluaran /
                            nilaiMaksimumGrafik) *
                            120
                        )
                      : 5;

                  return (
                    <View
                      key={
                        item.label
                      }
                      style={
                        styles.chartColumn
                      }
                    >
                      <View
                        style={
                          styles.barsArea
                        }
                      >
                        <View
                          style={
                            styles.bars
                          }
                        >
                          <View
                            style={[
                              styles.bar,
                              {
                                height:
                                  tinggiPendapatan,
                                backgroundColor:
                                  WARNA.hijau,
                              },
                            ]}
                          />

                          <View
                            style={[
                              styles.bar,
                              {
                                height:
                                  tinggiPengeluaran,
                                backgroundColor:
                                  WARNA.merah,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      {/* LABEL DI BAWAH GARIS */}

                      <Text
                        style={
                          styles.chartLabel
                        }
                      >
                        {item.label}
                      </Text>
                    </View>
                  );
                }
              )}
            </View>
          </View>

          {/* BUTTON */}

          <View
            style={
              styles.financeButtons
            }
          >
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                setModal(
                  'PENDAPATAN'
                )
              }
              style={[
                styles.actionButton,
                {
                  backgroundColor:
                    WARNA.hijau,
                },
              ]}
            >
              <Ionicons
                name="arrow-up"
                size={15}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.actionButtonText
                }
              >
                Pendapatan
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                setModal(
                  'PENGELUARAN'
                )
              }
              style={[
                styles.actionButton,
                {
                  backgroundColor:
                    WARNA.merah,
                },
              ]}
            >
              <Ionicons
                name="arrow-down"
                size={15}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.actionButtonText
                }
              >
                Pengeluaran
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* TARGET */}

        <View
          style={styles.card}
        >
          <Text
            style={
              styles.cardTitle
            }
          >
            Target Pendapatan
          </Text>

          <View
            style={
              styles.targetContent
            }
          >
            <View
              style={
                styles.targetLeft
              }
            >
              <View
                style={
                  styles.targetNumberRow
                }
              >
                <Text
                  style={
                    styles.targetCurrent
                  }
                >
                  {formatRupiah(
                    pendapatanHariIni
                  )}
                </Text>

                <Text
                  style={
                    styles.targetMax
                  }
                >
                  {' '}
                  /{' '}
                  {formatRupiah(
                    target
                  )}
                </Text>
              </View>

              <View
                style={
                  styles.progressBar
                }
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${persentaseTarget}%`,
                    },
                  ]}
                />
              </View>
            </View>

            <View
              style={
                styles.progressCircle
              }
            >
              <View
                style={
                  styles.progressCircleInner
                }
              >
                <Text
                  style={
                    styles.progressPercent
                  }
                >
                  {persentaseTarget}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* MOTOR */}
        
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.titleWithIcon}>
              <Ionicons
                name="bicycle"
                size={24}
                color={WARNA.hijauGelap}
              />

              <Text style={styles.cardTitle}>
                Motor
              </Text>
            </View>

            {/* HANYA TOMBOL INI YANG BISA DIKLIK */}
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => router.push('/motor')}
              style={styles.motorArrowButton}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={WARNA.teksLembut}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.motorDivider} />

          {/* DETAIL BENSIN & OLI */}
          <View style={styles.motorContent}>

            {/* BENSIN */}
            <View style={styles.motorItem}>
              <View style={styles.motorIcon}>
                <Ionicons
                  name="water-outline"
                  size={17}
                  color={WARNA.hijauGelap}
                />
              </View>

              <View>
                <Text style={styles.motorLabel}>
                  Bensin terakhir
                </Text>

                <Text style={styles.motorValue}>
                  {bensinTerakhir !== null
                    ? `${bensinTerakhir} L`
                    : '-'}
                </Text>
              </View>
            </View>

            <View style={styles.motorVertical} />

            {/* OLI */}
            <View style={styles.motorItem}>
              <View style={styles.motorIcon}>
                <Ionicons
                  name="construct-outline"
                  size={17}
                  color={WARNA.hijauGelap}
                />
              </View>

              <View>
                <Text style={styles.motorLabel}>
                  Oli berikutnya
                </Text>

                <Text style={styles.motorValue}>
                  {oliBerikutnya !== null
                    ? `${oliBerikutnya.toLocaleString('id-ID')} KM`
                    : '-'}
                </Text>
              </View>
            </View>

          </View>

          {/* STATUS MOTOR */}
          <View
            style={[
              styles.motorStatus,
              {
                backgroundColor: statusMotor.background,
              },
            ]}
          >
            <Ionicons
              name={statusMotor.icon as any}
              size={16}
              color={statusMotor.warna}
            />

            <Text
              style={[
                styles.motorStatusText,
                {
                  color: statusMotor.warna,
                },
              ]}
            >
              {statusMotor.teks}
            </Text>
          </View>
        </View>

        {/* TRANSAKSI HARI INI */}

        <View
          style={styles.card}
        >
          <View
            style={
              styles.cardHeader
            }
          >
            <View
              style={
                styles.titleWithIcon
              }
            >
              <Ionicons
                name="receipt-outline"
                size={20}
                color={
                  WARNA.hijauGelap
                }
              />

              <Text
                style={
                  styles.cardTitle
                }
              >
                Transaksi Hari Ini
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
            >
              <Text
                style={
                  styles.lihatSemua
                }
              >
                Lihat Semua
              </Text>
            </TouchableOpacity>
          </View>

          {transaksiHariIni.length ===
          0 ? (
            <View
              style={
                styles.emptyTransaction
              }
            >
              <Text
                style={
                  styles.emptyText
                }
              >
                Belum ada transaksi
                hari ini.
              </Text>
            </View>
          ) : (
            transaksiHariIni.map(
              (item, index) => {
                const pendapatan =
                  item.jenis ===
                  'PENDAPATAN';

                const transfer =
                  item.jenis ===
                    'TRANSFER' ||
                  item.jenis ===
                    'TOP_UP' ||
                  item.jenis ===
                    'CASH_OUT';

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.transactionRow,
                      index ===
                        transaksiHariIni.length -
                          1 && {
                        borderBottomWidth: 0,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.transactionIcon,
                        {
                          backgroundColor:
                            pendapatan
                              ? WARNA.hijau
                              : transfer
                              ? WARNA.biru
                              : WARNA.merah,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          pendapatan
                            ? 'arrow-up'
                            : transfer
                            ? 'swap-horizontal'
                            : 'arrow-down'
                        }
                        size={17}
                        color="#FFFFFF"
                      />
                    </View>

                    <View
                      style={
                        styles.transactionInfo
                      }
                    >
                      <Text
                        numberOfLines={1}
                        style={
                          styles.transactionName
                        }
                      >
                        {item.deskripsi ||
                          item.jenis}
                      </Text>

                      <Text
                        style={
                          styles.transactionType
                        }
                      >
                        {pendapatan
                          ? 'Pendapatan'
                          : transfer
                          ? 'Transfer'
                          : 'Pengeluaran'}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.transactionAmountArea
                      }
                    >
                      <Text
                        style={[
                          styles.transactionAmount,
                          {
                            color:
                              pendapatan
                                ? WARNA.hijauGelap
                                : transfer
                                ? WARNA.teks
                                : WARNA.merah,
                          },
                        ]}
                      >
                        {pendapatan
                          ? '+ '
                          : !transfer
                          ? '- '
                          : ''}

                        {formatRupiah(
                          item.jumlah
                        )}
                      </Text>

                      <Text
                        style={
                          styles.transactionTime
                        }
                      >
                        {formatJam(
                          item.tanggal
                        )}
                      </Text>
                    </View>
                  </View>
                );
              }
            )
          )}
        </View>
      </ScrollView>

      {/* MODAL PENDAPATAN */}

      <Modal
        visible={modal === 'PENDAPATAN'}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={tutupModal}
      >
        <View style={styles.modalOverlay}>
          <BlurView
            intensity={100}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            style={styles.modalDim}
            onPress={tutupModal}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pendapatan</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tutup pendapatan"
                hitSlop={10}
                onPress={tutupModal}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={22} color={WARNA.teksLembut} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pendapatan />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL PENGELUARAN */}

      <Modal
        visible={modal === 'PENGELUARAN'}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={tutupModal}
      >
        <View style={styles.modalOverlay}>
          <BlurView
            intensity={100}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            style={styles.modalDim}
            onPress={tutupModal}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pengeluaran</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tutup pengeluaran"
                hitSlop={10}
                onPress={tutupModal}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={22} color={WARNA.merah} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pengeluaran />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor:
      WARNA.background,
  },

  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 40,
    paddingBottom: 30,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginBottom: 16,
  },

  brandArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  logo: {
    width: 36,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },

  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: WARNA.teks,
  },

  tanggalText: {
    fontSize: 12,
    color:
      WARNA.teksLembut,
    marginTop: 1,
  },

  dropdownButton: {
    height: 35,
    minWidth: 104,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D4E0DB',
    backgroundColor:
      '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    gap: 6,
  },

  dropdownText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARNA.teks,
  },

  dropdownMenu: {
    position: 'absolute',
    top: 43,
    right: 0,
    width: 104,
    backgroundColor:
      '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor:
      WARNA.garis,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    zIndex: 100,
  },

  dropdownItem: {
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  /* ============================================================
     FINANCE CARD
  ============================================================ */

  financeCard: {
    backgroundColor:
      WARNA.card,
    borderRadius: 18,
    padding: 13,
    marginBottom: 14,
    borderWidth: 1,
    borderColor:
      WARNA.garis,
    shadowColor:
      '#1D5D4F',
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 1,
  },

  financeTop: {
    flexDirection: 'row',
    marginBottom: 14,
  },

  netIncomeArea: {
    flex: 1.08,
    paddingTop: 3,
  },

  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: WARNA.teks,
    marginBottom: 6,
  },

  netIncome: {
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.7,
  },

  netStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },

  summaryArea: {
    width: '42%',
    gap: 7,
  },

  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 6,
  },

  summaryIcon: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },

  summaryTextArea: {
    flex: 1,
  },

  summaryLabel: {
    fontSize: 12,
    color:
      WARNA.teksLembut,
    marginBottom: 2,
  },

  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
  },

  /* ============================================================
     GRAFIK
  ============================================================ */

  chartContainer: {
    backgroundColor:
      'transparent',
    borderRadius: 0,
    padding: 0,
    marginBottom: 13,
  },

  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginBottom: 12,
  },

  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: WARNA.teks,
  },

  legendArea: {
    flexDirection: 'row',
    gap: 11,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 4,
  },

  legendText: {
    fontSize: 10,
    color:
      WARNA.teksLembut,
  },

  chart: {
    height: 165,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent:
      'space-between',
    paddingTop: 10,
  },

  chartColumn: {
    flex: 1,
    alignItems: 'center',
  },

  barsArea: {
    height: 130,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor:
      '#DCE5E0',
    alignItems: 'center',
    justifyContent:
      'flex-end',
  },

  bars: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  bar: {
    width: 20,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },

  chartLabel: {
    fontSize: 10,
    color:
      WARNA.teksLembut,
    marginTop: 5,
  },

  financeButtons: {
    flexDirection: 'row',
    gap: 8,
  },

  actionButton: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'center',
    gap: 8,
  },

  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* ============================================================
     CARD
  ============================================================ */

  card: {
    backgroundColor:
      WARNA.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor:
      WARNA.garis,
    shadowColor:
      '#1D5D4F',
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 1,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: WARNA.teks,
  },

  /* ============================================================
     TARGET
  ============================================================ */

  targetContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },

  targetLeft: {
    flex: 1,
    paddingRight: 12,
  },

  targetNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 15,
  },

  targetCurrent: {
    fontSize: 24,
    fontWeight: '700',
    color:
      WARNA.hijauGelap,
  },

  targetMax: {
    fontSize: 16,
    color:
      WARNA.teksLembut,
  },

  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 8,
    backgroundColor:
      '#E3EBE7',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor:
      WARNA.hijau,
    borderRadius: 8,
  },

  progressCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 7,
    borderColor:
      '#DDE9E4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressCircleInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressPercent: {
    fontSize: 16,
    fontWeight: '700',
    color: WARNA.teks,
  },

  /* ============================================================
     MOTOR
  ============================================================ */

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  motorDivider: {
    height: 1,
    backgroundColor:
      WARNA.garis,
    marginTop: 13,
  },

  motorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },

  motorArrowButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  motorItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  motorVertical: {
    width: 1,
    height: 42,
    backgroundColor:
      WARNA.garis,
    marginHorizontal: 10,
  },

  motorIcon: {
    width: 30,
    height: 30,
    borderRadius: 18,
    backgroundColor: WARNA.hijauMuda,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  motorLabel: {
    fontSize: 11,
    color:
      WARNA.teksLembut,
    // marginBottom: 2,
  },

  motorValue: {
    fontSize: 16,
    fontWeight: '700',
    color: WARNA.teks,
  },

  motorStatus: {
    borderRadius: 12,
    minHeight: 35,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  motorStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },

  /* ============================================================
     TRANSAKSI
  ============================================================ */

  lihatSemua: {
    color:
      WARNA.hijauGelap,
    fontSize: 12,
    fontWeight: '600',
  },

  transactionRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor:
      WARNA.garis,
  },

  transactionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  transactionInfo: {
    flex: 1,
    paddingRight: 7,
  },

  transactionName: {
    fontSize: 12,
    fontWeight: '600',
    color:
      WARNA.teksGelap,
  },

  transactionType: {
    fontSize: 11,
    color:
      WARNA.teksLembut,
    marginTop: 3,
  },

  transactionAmountArea: {
    alignItems: 'flex-end',
  },

  transactionAmount: {
    fontSize: 12,
    fontWeight: '600',
  },

  transactionTime: {
    fontSize: 11,
    color:
      WARNA.teksLembut,
    marginTop: 3,
  },

  emptyTransaction: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  emptyText: {
    fontSize: 12,
    color:
      WARNA.teksLembut,
  },

  /* ============================================================
     MODAL
  ============================================================ */

  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: '22%',
    paddingHorizontal: '4%',
    paddingVertical: '4%',
  },

  modalDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 35, 31, 0.28)',
  },

  modalCard: {
    width: '100%',
    maxWidth: 520,
    height: '100%',
    maxHeight: '95%',
    backgroundColor: WARNA.background,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#0C2923',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },

  modalHeader: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WARNA.card,
    borderBottomWidth: 1,
    borderBottomColor: WARNA.garis,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARNA.teks,
  },

  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARNA.background,
  },

  modalScroll: {
    flexGrow: 0,
  },

  modalScrollContent: {
    paddingBottom: 8,
  },
});