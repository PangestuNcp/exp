import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Aset = {
  id: number;
  nama: string;
  saldo: number;
};

type Props = {
  refreshKey?: number;
};

const WARNA = {
  background: '#F7F8F4',
  card: '#FFFFFF',
  hijau: '#55A982',
  hijauMuda: '#DDF5EA',
  hijauGelap: '#164B57',
  biru: '#58A8F5',
  biruMuda: '#E1F1FF',
  kuning: '#F0C66E',
  kuningMuda: '#FFF1D3',
  ungu: '#9A82F5',
  unguMuda: '#EEE8FF',
  merah: '#EF626B',
  merahMuda: '#fbe7e8d0',
  teks: '#164B57',
  teksGelap: '#123F4A',
  teksLembut: '#63818A',
  garis: '#E4EBE7',
  infoMuda: '#E5EFFD',
  info: '#4B91E8',
};

const formatRupiah = (nilai: number) =>
  `Rp ${Math.round(nilai).toLocaleString('id-ID')}`;

const formatTanggalHeader = () =>
  new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const normalisasiNama = (nama: string) =>
  nama.toLowerCase().replace(/[^a-z0-9]/g, '');

const KONFIGURASI_ASET = [
  {
    key: 'dompetgrab',
    nama: 'Dompet Grab',
    warna: WARNA.hijau,
    latar: WARNA.hijauMuda,
  },
  {
    key: 'tunai',
    nama: 'Tunai',
    warna: WARNA.biru,
    latar: WARNA.biruMuda,
  },
  {
    key: 'seabank',
    nama: 'SeaBank',
    warna: WARNA.kuning,
    latar: WARNA.kuningMuda,
  },
  {
    key: 'ovo',
    nama: 'OVO',
    warna: WARNA.ungu,
    latar: WARNA.unguMuda,
  },
  {
    key: 'dompetkredit',
    nama: 'Dompet Kredit',
    warna: WARNA.merah,
    latar: WARNA.merahMuda,
  },
];

function buatPathBusur(
  cx: number,
  cy: number,
  radius: number,
  tebal: number,
  sudutMulai: number,
  sudutAkhir: number
) {
  const titik = (r: number, sudut: number) => {
    const rad = (sudut * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  const luarAwal = titik(radius, sudutMulai);
  const luarAkhir = titik(radius, sudutAkhir);
  const dalamAkhir = titik(radius - tebal, sudutAkhir);
  const dalamAwal = titik(radius - tebal, sudutMulai);
  const besar = sudutAkhir - sudutMulai > 180 ? 1 : 0;

  return [
    `M ${luarAwal.x} ${luarAwal.y}`,
    `A ${radius} ${radius} 0 ${besar} 1 ${luarAkhir.x} ${luarAkhir.y}`,
    `L ${dalamAkhir.x} ${dalamAkhir.y}`,
    `A ${radius - tebal} ${radius - tebal} 0 ${besar} 0 ${dalamAwal.x} ${dalamAwal.y}`,
    'Z',
  ].join(' ');
}

export default function TotalAset({ refreshKey = 0 }: Props) {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const [aset, setAset] = useState<Aset[]>([]);
  const [total, setTotal] = useState(0);

  const ambilAset = useCallback(async () => {
    const periodeAktif = await db.getFirstAsync<{ id: number }>(
      `
      SELECT id
      FROM periode
      WHERE status = 'AKTIF'
      ORDER BY id DESC
      LIMIT 1
      `
    );

    if (!periodeAktif) {
      const semuaAset = await db.getAllAsync<Aset>(
        `
        SELECT id, nama, 0 AS saldo
        FROM aset
        ORDER BY id
        `
      );
      setAset(semuaAset);
      setTotal(0);
      return;
    }

    const hasil = await db.getAllAsync<Aset>(
      `
      SELECT
        a.id,
        a.nama,
        COALESCE(
          (
            SELECT SUM(ma.nominal)
            FROM modal_awal ma
            WHERE ma.aset_id = a.id
              AND ma.periode_id = ?
          ),
          0
        )
        +
        COALESCE(
          (
            SELECT SUM(ps.jumlah)
            FROM perubahan_saldo ps
            INNER JOIN transaksi t ON t.id = ps.transaksi_id
            WHERE ps.aset_id = a.id
              AND t.periode_id = ?
          ),
          0
        ) AS saldo
      FROM aset a
      ORDER BY a.id
      `,
      periodeAktif.id,
      periodeAktif.id
    );

    setAset(hasil);
    setTotal(hasil.reduce((jumlah, item) => jumlah + item.saldo, 0));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void ambilAset();
    }, [ambilAset, refreshKey])
  );

  const asetTertata = useMemo(() => {
    return KONFIGURASI_ASET.map((konfig) => {
      const data = aset.find((item) => {
        const nama = normalisasiNama(item.nama);
        if (konfig.key === 'tunai') {
          return nama === 'tunai' || nama === 'cash';
        }
        return nama === konfig.key ||
          (konfig.key === 'dompetgrab' && nama.includes('grab')) ||
          (konfig.key === 'dompetkredit' && nama.includes('kredit'));
      });

      return {
        ...konfig,
        id: data?.id ?? konfig.key,
        saldo: data?.saldo ?? 0,
      };
    });
  }, [aset]);

  const chartWidth = Math.max(260, width - 44);
  const chartHeight = chartWidth * 0.48;
  const radius = chartWidth * 0.39;
  const tebal = Math.max(15, chartWidth * 0.085);
  const cx = chartWidth / 2;
  const cy = radius + 7;

  // Segmen membagi setengah lingkaran secara proporsional berdasarkan saldo.
  const totalChart = asetTertata.reduce((sum, item) => sum + item.saldo, 0);
  const segmen = asetTertata.map((item) => ({
    ...item,
    proporsi: totalChart > 0 ? item.saldo / totalChart : 1 / asetTertata.length,
  }));

  let sudutBerjalan = 180;
  const busur = segmen.map((item) => {
    const panjang = 180 * item.proporsi;
    const start = sudutBerjalan + 2.2;
    const end = sudutBerjalan + panjang - 2.2;
    sudutBerjalan += panjang;
    return {
      ...item,
      path: end > start
        ? buatPathBusur(cx, cy, radius, tebal, start, end)
        : '',
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.scrollContent}>
        {/* Header mengikuti gaya halaman Transaksi */}
        <View style={styles.header}>
          <View style={styles.brandArea}>
            <View style={styles.logo}>
              <Ionicons name="leaf" size={23} color={WARNA.hijauGelap} />
            </View>
            <View>
              <Text style={styles.logoText}>Tertata</Text>
              <Text style={styles.tanggalText}>{formatTanggalHeader()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.chartCard}>
          <Svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
            {busur.map((item) =>
              item.path ? (
                <Path
                  key={String(item.id)}
                  d={item.path}
                  fill={item.warna}
                  stroke={item.warna}
                  strokeWidth={1}
                  strokeLinejoin="round"
                />
              ) : null
            )}
          </Svg>
          <View style={styles.totalDiTengah}>
            <Text style={styles.totalLabel}>Total Aset</Text>
            <Text style={styles.totalNominal} numberOfLines={1} adjustsFontSizeToFit>
              {formatRupiah(total)}
            </Text>
            <Text style={styles.infoChartText}>
              Total aset merupakan gabungan dari seluruh saldo
            </Text>
          </View>
        </View>

        <View style={styles.gridAset}>
          {asetTertata.slice(0, 4).map((item) => (
            <View
              key={String(item.id)}
              style={[styles.kartuAset, { backgroundColor: item.latar }]}
            >
              <Text style={styles.namaAset}>{item.nama}</Text>
              <Text style={styles.nominalAset} numberOfLines={1} adjustsFontSizeToFit>
                {formatRupiah(item.saldo)}
              </Text>
            </View>
          ))}
        </View>

        {asetTertata[4] && (
          <View style={[styles.kartuKredit, { backgroundColor: WARNA.merahMuda }]}>
            <Text style={styles.namaKredit}>Dompet Kredit</Text>
            <Text style={styles.nominalKredit} numberOfLines={1} adjustsFontSizeToFit>
              {formatRupiah(asetTertata[4].saldo)}
            </Text>
          </View>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WARNA.background,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 40,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
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
    color: WARNA.teksLembut,
    marginTop: 1,
  },
  chartCard: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginHorizontal: -6,
    marginTop: 10,
    marginBottom: 0,
    position: 'relative',
     minHeight: 0,
    borderRadius: 104,
  },
  totalDiTengah: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: [{ translateY: -4 }],
  },
  totalLabel: {
    color: WARNA.teksLembut,
    fontSize: 13,
    fontWeight: '600',
  },
  totalNominal: {
    marginTop: 4,
    color: WARNA.teksGelap,
    fontSize: 30,
    fontWeight: '800',
    maxWidth: '90%',
  },
  gridAset: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginTop: 0,
  },
  kartuAset: {
    width: '48.5%',
    minHeight: 60,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  namaAset: {
    fontSize: 12,
    color: WARNA.teksGelap,
    fontWeight: '600',
  },
  nominalAset: {
    marginTop: 5,
    fontSize: 14,
    color: WARNA.teksGelap,
    fontWeight: '800',
  },
  kartuKredit: {
    marginTop: 8,
    minHeight: 36,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  namaKredit: {
    color: '#b52d3bb0',
    fontSize: 11,
    fontWeight: '700',
  },
  nominalKredit: {
    color: '#b52d3bb0',
    fontSize: 11,
    fontWeight: '800',
    flexShrink: 1,
  },
  infoChartText: {
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 11,
    color: WARNA.teksLembut,
    marginTop: 0,
  },
});
