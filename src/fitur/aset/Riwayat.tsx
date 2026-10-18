import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  refreshKey?: number;
};

type RiwayatData = {
  id: number;
  transaksi_id: number;
  tanggal: string;
  jenis: string;
  deskripsi: string | null;
  catatan: string | null;
  nama_aset: string;
  aset_id: number;
  jumlah: number;
  jumlah_transaksi: number;
  periode_id: number | null;
  jumlah_perubahan: number;
};

type PeriodeAktif = { id: number };

type FilterWaktu = 'SEMUA' | 'HARI_INI' | 'MINGGU' | 'BULAN';
type FilterJenis =
  | 'SEMUA'
  | 'PENGELUARAN'
  | 'PENDAPATAN'
  | 'PERPINDAHAN';
type Urutan = 'DEFAULT' | 'TERBESAR' | 'TERKECIL';
type DropdownAktif = 'PERIODE' | 'JENIS' | 'URUTAN' | null;

const formatRupiah = (nilai: number) =>
  `Rp ${Math.abs(nilai).toLocaleString('id-ID')}`;

const formatTanggal = (tanggal: string) => {
  const normalized = tanggal.includes('T')
    ? tanggal
    : tanggal.replace(' ', 'T');

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return tanggal;

  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const labelJenis = (jenis: string) => {
  const map: Record<string, string> = {
    PENDAPATAN: 'Pendapatan',
    PENGELUARAN: 'Pengeluaran',
    TRANSFER: 'Transfer',
    TOP_UP: 'Top Up',
    CASH_OUT: 'Cash Out',
    SET_MODAL: 'Set Modal',
  };

  return map[jenis] ?? jenis.replace(/_/g, ' ');
};

const warnaJenis = (jenis: string) => {
  if (jenis === 'PENGELUARAN') return '#D94B4B';
  if (jenis === 'PENDAPATAN') return '#277B67';

  if (['TRANSFER', 'TOP_UP', 'CASH_OUT'].includes(jenis)) {
    return '#277B67';
  }

  return '#164B57';
};

const tanggalLokalSql = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
};

const normalisasiTanggal = (tanggal: string) =>
  tanggal.includes('T') ? tanggal : tanggal.replace(' ', 'T');

const waktuTanggal = (tanggal: string) => {
  const hasil = new Date(normalisasiTanggal(tanggal)).getTime();
  return Number.isNaN(hasil) ? 0 : hasil;
};

export default function Riwayat({ refreshKey = 0 }: Props) {
  const db = useSQLiteContext();

  const [data, setData] = useState<RiwayatData[]>([]);

  // Filter default menampilkan semua transaksi.
  const [waktu, setWaktu] = useState<FilterWaktu>('SEMUA');
  const [jenis, setJenis] = useState<FilterJenis>('SEMUA');
  const [urutan, setUrutan] = useState<Urutan>('DEFAULT');

  const [dropdownAktif, setDropdownAktif] =
    useState<DropdownAktif>(null);

  const [pilihan, setPilihan] = useState<RiwayatData | null>(null);
  const [editAktif, setEditAktif] = useState(false);
  const [nominal, setNominal] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [catatan, setCatatan] = useState('');
  const [alasan, setAlasan] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [periodeAktifId, setPeriodeAktifId] =
    useState<number | null>(null);

  const ambilData = useCallback(async () => {
    try {
      const periode = await db.getFirstAsync<PeriodeAktif>(
        `SELECT id
         FROM periode
         WHERE status = 'AKTIF'
         ORDER BY id DESC
         LIMIT 1`
      );

      setPeriodeAktifId(periode?.id ?? null);

      // Satu baris untuk setiap transaksi.
      const hasil = await db.getAllAsync<RiwayatData>(`
        SELECT
          MIN(ps.id) AS id,
          t.id AS transaksi_id,
          MAX(ps.tanggal) AS tanggal,
          t.jenis,
          t.deskripsi,
          t.catatan,
          COALESCE(MIN(a.nama), 'Aset') AS nama_aset,
          COALESCE(MIN(a.id), 0) AS aset_id,
          COALESCE(
            SUM(
              CASE
                WHEN ps.id = (
                  SELECT MIN(ps2.id)
                  FROM perubahan_saldo ps2
                  WHERE ps2.transaksi_id = t.id
                )
                THEN ps.jumlah
                ELSE 0
              END
            ),
            0
          ) AS jumlah,
          t.jumlah AS jumlah_transaksi,
          t.periode_id,
          COUNT(ps.id) AS jumlah_perubahan
        FROM transaksi t
        LEFT JOIN perubahan_saldo ps
          ON ps.transaksi_id = t.id
        LEFT JOIN aset a
          ON a.id = ps.aset_id
        GROUP BY t.id
        ORDER BY MAX(ps.tanggal) DESC, t.id DESC
      `);

      setData(hasil);
    } catch (error) {
      console.error('Gagal mengambil Riwayat:', error);
      Alert.alert('Gagal', 'Data riwayat tidak dapat dimuat.');
    }
  }, [db]);

  useEffect(() => {
    ambilData();
  }, [ambilData, refreshKey]);

  const dataTampil = useMemo(() => {
    const hariIni = tanggalLokalSql();
    const sekarang = new Date();

    const batasMinggu = new Date(sekarang);
    batasMinggu.setDate(batasMinggu.getDate() - 7);

    const batasBulan = new Date(sekarang);
    batasBulan.setMonth(batasBulan.getMonth() - 1);

    const hasil = data.filter((item) => {
      const waktuItem = waktuTanggal(item.tanggal);

      if (
        waktu === 'HARI_INI' &&
        !item.tanggal.startsWith(hariIni)
      ) {
        return false;
      }

      if (
        waktu === 'MINGGU' &&
        waktuItem < batasMinggu.getTime()
      ) {
        return false;
      }

      if (
        waktu === 'BULAN' &&
        waktuItem < batasBulan.getTime()
      ) {
        return false;
      }

      if (jenis === 'PENGELUARAN') {
        return item.jenis === 'PENGELUARAN';
      }

      if (jenis === 'PENDAPATAN') {
        return item.jenis === 'PENDAPATAN';
      }

      if (jenis === 'PERPINDAHAN') {
        return ['TRANSFER', 'TOP_UP', 'CASH_OUT'].includes(
          item.jenis
        );
      }

      return true;
    });

    if (urutan === 'TERBESAR') {
      return hasil.sort(
        (a, b) =>
          Math.abs(b.jumlah_transaksi) -
          Math.abs(a.jumlah_transaksi)
      );
    }

    if (urutan === 'TERKECIL') {
      return hasil.sort(
        (a, b) =>
          Math.abs(a.jumlah_transaksi) -
          Math.abs(b.jumlah_transaksi)
      );
    }

    // Default: transaksi terbaru di bagian atas.
    return hasil.sort(
      (a, b) =>
        waktuTanggal(b.tanggal) - waktuTanggal(a.tanggal) ||
        b.transaksi_id - a.transaksi_id
    );
  }, [data, waktu, jenis, urutan]);

  const labelPeriode = () => {
    const map: Record<FilterWaktu, string> = {
      SEMUA: 'Semua',
      HARI_INI: 'Hari ini',
      MINGGU: '1 minggu',
      BULAN: '1 bulan',
    };

    return map[waktu];
  };

  const labelFilterJenis = () => {
    const map: Record<FilterJenis, string> = {
      SEMUA: 'Semua',
      PENGELUARAN: 'Pengeluaran',
      PENDAPATAN: 'Pendapatan',
      PERPINDAHAN: 'Perpindahan saldo',
    };

    return map[jenis];
  };

  const labelUrutan = () => {
    const map: Record<Urutan, string> = {
      DEFAULT: 'Default',
      TERBESAR: 'Terbesar ke Terkecil',
      TERKECIL: 'Terkecil ke Terbesar',
    };

    return map[urutan];
  };

  const bukaDetail = (item: RiwayatData) => {
    setPilihan(item);
    setEditAktif(false);
    setNominal(String(Math.abs(item.jumlah_transaksi)));
    setDeskripsi(item.deskripsi ?? '');
    setCatatan(item.catatan ?? '');
    setAlasan('');
  };

  const tutupDetail = () => {
    setPilihan(null);
    setEditAktif(false);
  };

  const simpanEdit = async () => {
    if (!pilihan || menyimpan) return;

    if (
      !periodeAktifId ||
      pilihan.periode_id !== periodeAktifId
    ) {
      Alert.alert(
        'Edit tidak tersedia',
        'Saat ini edit hanya tersedia untuk transaksi pada periode aktif.'
      );
      return;
    }

    const nominalBaru = Number(nominal.replace(/\D/g, ''));

    if (!nominalBaru || nominalBaru <= 0) {
      Alert.alert(
        'Nominal tidak valid',
        'Masukkan nominal yang lebih besar dari nol.'
      );
      return;
    }

    if (!deskripsi.trim()) {
      Alert.alert(
        'Deskripsi belum diisi',
        'Masukkan deskripsi transaksi.'
      );
      return;
    }

    if (!alasan.trim()) {
      Alert.alert(
        'Alasan diperlukan',
        'Tuliskan alasan perubahan transaksi.'
      );
      return;
    }

    try {
      setMenyimpan(true);

      const perubahan = await db.getAllAsync<{
        id: number;
        jumlah: number;
        aset_id: number;
      }>(
        `SELECT id, jumlah, aset_id
         FROM perubahan_saldo
         WHERE transaksi_id = ?
         ORDER BY id`,
        pilihan.transaksi_id
      );

      // Transaksi multi-aset tidak diedit agar saldo tetap aman.
      if (perubahan.length !== 1) {
        Alert.alert(
          'Edit khusus diperlukan',
          'Transaksi ini memengaruhi beberapa aset. Untuk menjaga saldo tetap akurat, edit transaksi ini belum dapat dilakukan sampai aturan saldo sumber dan tujuan dikonfirmasi.'
        );
        return;
      }

      const perubahanLama = perubahan[0];
      const jumlahLama = pilihan.jumlah_transaksi;

      const jumlahBaru =
        jumlahLama < 0 ? -nominalBaru : nominalBaru;

      const saldoBaru =
        perubahanLama.jumlah < 0
          ? -nominalBaru
          : nominalBaru;

      const sekarang = new Date();

      const tanggal =
        `${sekarang.getFullYear()}-${String(
          sekarang.getMonth() + 1
        ).padStart(2, '0')}-${String(
          sekarang.getDate()
        ).padStart(2, '0')} ` +
        `${String(sekarang.getHours()).padStart(
          2,
          '0'
        )}:${String(sekarang.getMinutes()).padStart(
          2,
          '0'
        )}:${String(sekarang.getSeconds()).padStart(2, '0')}`;

      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO koreksi_transaksi (
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          pilihan.transaksi_id,
          periodeAktifId,
          jumlahLama,
          jumlahBaru,
          pilihan.deskripsi,
          deskripsi.trim(),
          pilihan.catatan,
          catatan.trim() || null,
          alasan.trim(),
          tanggal
        );

        await db.runAsync(
          `UPDATE transaksi
           SET jumlah = ?, deskripsi = ?, catatan = ?
           WHERE id = ? AND periode_id = ?`,
          jumlahBaru,
          deskripsi.trim(),
          catatan.trim() || null,
          pilihan.transaksi_id,
          periodeAktifId
        );

        await db.runAsync(
          `UPDATE perubahan_saldo
           SET jumlah = ?, tanggal = ?
           WHERE id = ? AND transaksi_id = ?`,
          saldoBaru,
          tanggal,
          perubahanLama.id,
          pilihan.transaksi_id
        );
      });

      Alert.alert(
        'Berhasil',
        'Transaksi berhasil diperbarui.'
      );

      tutupDetail();
      await ambilData();
    } catch (error) {
      console.error('Gagal mengedit transaksi:', error);
      Alert.alert(
        'Gagal',
        'Transaksi tidak berhasil diperbarui.'
      );
    } finally {
      setMenyimpan(false);
    }
  };

  const opsiDropdown = () => {
    if (dropdownAktif === 'PERIODE') {
      return [
        { label: 'Semua', value: 'SEMUA' },
        { label: 'Hari ini', value: 'HARI_INI' },
        { label: '1 minggu', value: 'MINGGU' },
        { label: '1 bulan', value: 'BULAN' },
      ];
    }

    if (dropdownAktif === 'JENIS') {
      return [
        { label: 'Semua', value: 'SEMUA' },
        {
          label: 'Pengeluaran',
          value: 'PENGELUARAN',
        },
        {
          label: 'Pendapatan',
          value: 'PENDAPATAN',
        },
        {
          label: 'Perpindahan saldo',
          value: 'PERPINDAHAN',
        },
      ];
    }

    if (dropdownAktif === 'URUTAN') {
      return [
        { label: 'Default', value: 'DEFAULT' },
        {
          label: 'Terbesar ke Terkecil',
          value: 'TERBESAR',
        },
        {
          label: 'Terkecil ke Terbesar',
          value: 'TERKECIL',
        },
      ];
    }

    return [];
  };

  const nilaiDropdownAktif = () => {
    if (dropdownAktif === 'PERIODE') return waktu;
    if (dropdownAktif === 'JENIS') return jenis;
    if (dropdownAktif === 'URUTAN') return urutan;

    return '';
  };

  const pilihOpsiDropdown = (nilai: string) => {
    if (dropdownAktif === 'PERIODE') {
      setWaktu(nilai as FilterWaktu);
    } else if (dropdownAktif === 'JENIS') {
      setJenis(nilai as FilterJenis);
    } else if (dropdownAktif === 'URUTAN') {
      setUrutan(nilai as Urutan);
    }

    setDropdownAktif(null);
  };

  const renderDropdown = (
    judul: string,
    nilai: string,
    buka: () => void
  ) => (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={buka}
      style={styles.dropdownButton}
    >
      <Text style={styles.dropdownLabel}>{judul}</Text>

      <View style={styles.dropdownValueRow}>
        <Text
          style={styles.dropdownValue}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {nilai}
        </Text>

        <Text style={styles.dropdownArrow}>⌄</Text>
      </View>
    </TouchableOpacity>
  );

  const itemTanda = (item: RiwayatData) => {
    if (item.jenis === 'PENGELUARAN') return '−';
    if (item.jenis === 'PENDAPATAN') return '+';

    return '';
  };

  const itemWarna = (item: RiwayatData) => {
    if (item.jenis === 'PENGELUARAN') return '#D94B4B';
    if (item.jenis === 'PENDAPATAN') return '#277B67';

    return warnaJenis(item.jenis);
  };

  const itemIkon = (item: RiwayatData) => {
    if (item.jenis === 'PENGELUARAN') return '↓';
    if (item.jenis === 'TRANSFER') return '↔';
    if (item.jenis === 'TOP_UP') return '＋';
    if (item.jenis === 'CASH_OUT') return '↗';

    return '↑';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.judul}>Riwayat</Text>

      <Text style={styles.subjudul}>
        Lihat dan periksa aktivitas keuanganmu.
      </Text>

      {/* Tiga dropdown dalam satu baris */}
      <View style={styles.filterRow}>
        {renderDropdown('Periode', labelPeriode(), () =>
          setDropdownAktif('PERIODE')
        )}

        {renderDropdown('Jenis', labelFilterJenis(), () =>
          setDropdownAktif('JENIS')
        )}

        {renderDropdown('Urutan', labelUrutan(), () =>
          setDropdownAktif('URUTAN')
        )}
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {dataTampil.length} transaksi
        </Text>

        <TouchableOpacity
          onPress={() => {
            setWaktu('SEMUA');
            setJenis('SEMUA');
            setUrutan('DEFAULT');
          }}
        >
          <Text style={styles.resetText}>Reset filter</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
      >
        {dataTampil.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              Belum ada riwayat
            </Text>

            <Text style={styles.emptyText}>
              Coba ubah periode atau jenis transaksi.
            </Text>
          </View>
        ) : (
          dataTampil.map((item) => {
            const warna = itemWarna(item);
            const tanda = itemTanda(item);
            const pengeluaran =
              item.jenis === 'PENGELUARAN';

            return (
              <TouchableOpacity
                key={item.transaksi_id}
                activeOpacity={0.8}
                onPress={() => bukaDetail(item)}
                style={styles.itemCard}
              >
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: pengeluaran
                        ? '#FCE9E8'
                        : '#E3F2E8',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.iconText,
                      {
                        color: pengeluaran
                          ? '#D94B4B'
                          : '#277B67',
                      },
                    ]}
                  >
                    {itemIkon(item)}
                  </Text>
                </View>

                <View style={styles.itemInfo}>
                  <Text
                    style={styles.itemTitle}
                    numberOfLines={2}
                  >
                    {item.deskripsi ||
                      labelJenis(item.jenis)}
                  </Text>

                  <Text
                    style={styles.itemSub}
                    numberOfLines={2}
                  >
                    {labelJenis(item.jenis)} · {item.nama_aset}
                    {item.jumlah_perubahan > 1
                      ? ` · ${item.jumlah_perubahan} aset`
                      : ''}
                  </Text>

                  <Text style={styles.itemDate}>
                    {formatTanggal(item.tanggal)}
                  </Text>
                </View>

                <View style={styles.amountWrap}>
                  <Text
                    style={[styles.amount, { color: warna }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {tanda}
                    {formatRupiah(item.jumlah_transaksi)}
                  </Text>

                  <Text style={styles.detailHint}>
                    Detail ›
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Modal pilihan dropdown */}
      <Modal
        visible={dropdownAktif !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownAktif(null)}
      >
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.dropdownBackdrop}
            onPress={() => setDropdownAktif(null)}
          />

          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>
              {dropdownAktif === 'PERIODE'
                ? 'Pilih Periode'
                : dropdownAktif === 'JENIS'
                ? 'Pilih Jenis Transaksi'
                : 'Pilih Urutan'}
            </Text>

            {opsiDropdown().map((opsi) => {
              const aktif =
                nilaiDropdownAktif() === opsi.value;

              return (
                <TouchableOpacity
                  key={opsi.value}
                  style={[
                    styles.dropdownOption,
                    aktif && styles.dropdownOptionAktif,
                  ]}
                  onPress={() =>
                    pilihOpsiDropdown(opsi.value)
                  }
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      aktif &&
                        styles.dropdownOptionTextAktif,
                    ]}
                  >
                    {opsi.label}
                  </Text>

                  {aktif ? (
                    <Text style={styles.checkmark}>✓</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.dropdownCloseButton}
              onPress={() => setDropdownAktif(null)}
            >
              <Text style={styles.dropdownCloseText}>
                Tutup
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal detail dan edit transaksi */}
      <Modal
        visible={!!pilihan}
        transparent
        animationType="slide"
        onRequestClose={tutupDetail}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.overlayTouch}
            activeOpacity={1}
            onPress={tutupDetail}
          />

          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {editAktif
                    ? 'Edit Transaksi'
                    : 'Detail Transaksi'}
                </Text>

                <Text style={styles.modalSub}>
                  Transaksi #{pilihan?.transaksi_id}
                </Text>
              </View>

              <TouchableOpacity
                onPress={tutupDetail}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            {pilihan && !editAktif ? (
              <ScrollView
                contentContainerStyle={styles.detailContent}
              >
                <View style={styles.detailHero}>
                  <Text style={styles.detailJenis}>
                    {labelJenis(pilihan.jenis)}
                  </Text>

                  <Text
                    style={[
                      styles.detailNominal,
                      { color: itemWarna(pilihan) },
                    ]}
                  >
                    {itemTanda(pilihan)}
                    {formatRupiah(
                      pilihan.jumlah_transaksi
                    )}
                  </Text>

                  <Text style={styles.detailTanggal}>
                    {formatTanggal(pilihan.tanggal)}
                  </Text>
                </View>

                {[
                  [
                    'Aset terdampak',
                    pilihan.jumlah_perubahan > 1
                      ? `${pilihan.nama_aset} dan aset lainnya (${pilihan.jumlah_perubahan} aset)`
                      : pilihan.nama_aset,
                  ],
                  [
                    'Deskripsi',
                    pilihan.deskripsi || '-',
                  ],
                  ['Catatan', pilihan.catatan || '-'],
                  [
                    'ID transaksi',
                    String(pilihan.transaksi_id),
                  ],
                ].map(([label, value]) => (
                  <View
                    key={label}
                    style={styles.detailRow}
                  >
                    <Text style={styles.detailLabel}>
                      {label}
                    </Text>

                    <Text style={styles.detailValue}>
                      {value}
                    </Text>
                  </View>
                ))}

                <Text style={styles.noticeText}>
                  Transaksi yang melibatkan beberapa aset
                  dapat dilihat detailnya, tetapi pengeditan
                  belum diizinkan agar saldo sumber dan tujuan
                  tidak berubah secara keliru.
                </Text>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setEditAktif(true)}
                >
                  <Text style={styles.primaryButtonText}>
                    Edit transaksi
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            ) : pilihan ? (
              <ScrollView
                contentContainerStyle={styles.detailContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.fieldLabel}>
                  Nominal
                </Text>

                <TextInput
                  value={nominal}
                  onChangeText={(v) =>
                    setNominal(v.replace(/\D/g, ''))
                  }
                  keyboardType="numeric"
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>
                  Deskripsi
                </Text>

                <TextInput
                  value={deskripsi}
                  onChangeText={setDeskripsi}
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>
                  Catatan
                </Text>

                <TextInput
                  value={catatan}
                  onChangeText={setCatatan}
                  style={[styles.input, styles.multiline]}
                  multiline
                />

                <Text style={styles.fieldLabel}>
                  Alasan perubahan *
                </Text>

                <TextInput
                  value={alasan}
                  onChangeText={setAlasan}
                  placeholder="Contoh: salah memasukkan nominal"
                  style={[styles.input, styles.multiline]}
                  multiline
                />

                <Text style={styles.noticeText}>
                  Edit hanya dapat disimpan untuk transaksi
                  pada periode aktif yang memengaruhi satu
                  aset. Transaksi multi-aset akan ditolak
                  demi keamanan saldo.
                </Text>

                <TouchableOpacity
                  disabled={menyimpan}
                  style={[
                    styles.primaryButton,
                    menyimpan && { opacity: 0.6 },
                  ]}
                  onPress={simpanEdit}
                >
                  <Text style={styles.primaryButtonText}>
                    {menyimpan
                      ? 'Menyimpan...'
                      : 'Simpan perubahan'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setEditAktif(false)}
                >
                  <Text style={styles.secondaryButtonText}>
                    Kembali ke detail
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F7F8F4',
  },

  judul: {
    fontSize: 22,
    fontWeight: '800',
    color: '#164B57',
  },

  subjudul: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 12,
    color: '#63818A',
  },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 7,
    marginBottom: 4,
  },

  dropdownButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE7E1',
    backgroundColor: '#FFFFFF',
  },

  dropdownLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8AA0A3',
    marginBottom: 5,
  },

  dropdownValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 3,
  },

  dropdownValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '700',
    color: '#164B57',
  },

  dropdownArrow: {
    fontSize: 15,
    color: '#277B67',
    fontWeight: '800',
  },

  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 8,
  },

  countText: {
    fontSize: 11,
    color: '#8AA0A3',
  },

  resetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#277B67',
  },

  listScroll: {
    flex: 1,
  },

  listContent: {
    paddingBottom: 30,
    gap: 8,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#164B57',
  },

  emptyText: {
    marginTop: 6,
    fontSize: 12,
    color: '#63818A',
    textAlign: 'center',
  },

  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EDF1ED',
  },

  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconText: {
    fontSize: 21,
    fontWeight: '700',
  },

  itemInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },

  itemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#164B57',
  },

  itemSub: {
    fontSize: 10,
    color: '#63818A',
  },

  itemDate: {
    fontSize: 10,
    color: '#8AA0A3',
  },

  amountWrap: {
    alignItems: 'flex-end',
    maxWidth: '42%',
  },

  amount: {
    fontSize: 11,
    fontWeight: '800',
  },

  detailHint: {
    marginTop: 5,
    fontSize: 10,
    color: '#8AA0A3',
  },

  dropdownOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(12, 32, 30, 0.4)',
  },

  dropdownBackdrop: {
    ...StyleSheet.absoluteFill,
  },

  dropdownModal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#F7F8F4',
    borderRadius: 20,
    padding: 16,
  },

  dropdownModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#164B57',
    marginBottom: 12,
  },

  dropdownOption: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: 11,
    marginBottom: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDF1ED',
  },

  dropdownOptionAktif: {
    backgroundColor: '#E3F2E8',
    borderColor: '#277B67',
  },

  dropdownOptionText: {
    fontSize: 13,
    color: '#164B57',
    fontWeight: '500',
  },

  dropdownOptionTextAktif: {
    color: '#277B67',
    fontWeight: '800',
  },

  checkmark: {
    fontSize: 17,
    fontWeight: '800',
    color: '#277B67',
  },

  dropdownCloseButton: {
    minHeight: 42,
    marginTop: 8,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#277B67',
  },

  dropdownCloseText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(12, 32, 30, 0.38)',
  },

  overlayTouch: {
    flex: 1,
  },

  modalCard: {
    maxHeight: '88%',
    minHeight: '45%',
    backgroundColor: '#F7F8F4',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
  },

  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C8D5CF',
    marginBottom: 14,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#164B57',
  },

  modalSub: {
    marginTop: 3,
    fontSize: 11,
    color: '#8AA0A3',
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5EEE8',
  },

  closeText: {
    fontSize: 25,
    lineHeight: 28,
    color: '#164B57',
  },

  detailContent: {
    paddingBottom: 20,
    gap: 10,
  },

  detailHero: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 4,
  },

  detailJenis: {
    fontSize: 12,
    fontWeight: '700',
    color: '#63818A',
  },

  detailNominal: {
    marginTop: 7,
    fontSize: 24,
    fontWeight: '800',
  },

  detailTanggal: {
    marginTop: 6,
    fontSize: 11,
    color: '#8AA0A3',
  },

  detailRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 5,
  },

  detailLabel: {
    fontSize: 10,
    color: '#8AA0A3',
  },

  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#164B57',
  },

  noticeText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#63818A',
    padding: 10,
    backgroundColor: '#EAF2EC',
    borderRadius: 10,
  },

  primaryButton: {
    marginTop: 6,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: '#277B67',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },

  primaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  secondaryButton: {
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#C9D9D0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },

  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#277B67',
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#164B57',
    marginTop: 4,
  },

  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#DCE7E1',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#164B57',
  },

  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
});