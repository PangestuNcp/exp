import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type TujuanTransfer =
  | 'dompet_ovo'
  | 'ovo_seabank'
  | 'seabank_ovo';

type Props = {
  onSelesai?: () => void;
};

export default function Transfer({ onSelesai }: Props) {
  const db = useSQLiteContext();

  const [tujuan, setTujuan] =
    useState<TujuanTransfer>('dompet_ovo');
  const [jumlah, setJumlah] = useState('');
  const [pakaiAdmin, setPakaiAdmin] = useState(false);
  const [biayaAdmin, setBiayaAdmin] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);

  function getAset() {
    if (tujuan === 'dompet_ovo') {
      return { dari: 'Dompet Grab', ke: 'OVO' };
    }

    if (tujuan === 'ovo_seabank') {
      return { dari: 'OVO', ke: 'SeaBank' };
    }

    return { dari: 'SeaBank', ke: 'OVO' };
  }

  function parseNominal(teks: string) {
    // Mendukung input angka biasa maupun pemisah ribuan.
    const bersih = teks.replace(/[^\d]/g, '');
    return Number(bersih);
  }

  async function ambilPeriodeAktif() {
    return await db.getFirstAsync<{ id: number }>(
      `
      SELECT id
      FROM periode
      WHERE status = 'AKTIF'
      ORDER BY id DESC
      LIMIT 1
      `
    );
  }

  async function simpanTransfer() {
    if (menyimpan) return;

    const nilai = parseNominal(jumlah);
    const admin = pakaiAdmin
      ? parseNominal(biayaAdmin)
      : 0;

    if (!Number.isSafeInteger(nilai) || nilai <= 0) {
      Alert.alert(
        'Periksa lagi',
        'Masukkan nominal transfer yang valid.'
      );
      return;
    }

    if (
      pakaiAdmin &&
      (!Number.isSafeInteger(admin) || admin <= 0)
    ) {
      Alert.alert(
        'Periksa lagi',
        'Masukkan biaya admin lebih dari Rp0.'
      );
      return;
    }

    const periode = await ambilPeriodeAktif();

    if (!periode) {
      Alert.alert(
        'Periode belum aktif',
        'Selesaikan Set Modal terlebih dahulu sebelum melakukan transfer.'
      );
      return;
    }

    const { dari, ke } = getAset();
    const tanggal = new Date().toISOString();
    const totalKeluar = nilai + admin;

    if (!Number.isSafeInteger(totalKeluar)) {
      Alert.alert(
        'Nominal tidak valid',
        'Total transfer dan biaya admin terlalu besar.'
      );
      return;
    }

    setMenyimpan(true);

    try {
      await db.withTransactionAsync(async () => {
        const asetDari = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM aset WHERE nama = ?`,
          dari
        );

        const asetKe = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM aset WHERE nama = ?`,
          ke
        );

        if (!asetDari) {
          throw new Error(`${dari} tidak ditemukan.`);
        }

        if (!asetKe) {
          throw new Error(`${ke} tidak ditemukan.`);
        }

        const hasilSaldo = await db.getFirstAsync<{
          saldo: number;
        }>(
          `
          SELECT
            COALESCE((
              SELECT SUM(ma.nominal)
              FROM modal_awal ma
              WHERE ma.aset_id = ?
                AND ma.periode_id = ?
            ), 0)
            +
            COALESCE((
              SELECT SUM(ps.jumlah)
              FROM perubahan_saldo ps
              INNER JOIN transaksi t
                ON t.id = ps.transaksi_id
              WHERE ps.aset_id = ?
                AND t.periode_id = ?
            ), 0) AS saldo
          `,
          asetDari.id,
          periode.id,
          asetDari.id,
          periode.id
        );

        const saldoSaatIni = hasilSaldo?.saldo ?? 0;

        if (totalKeluar > saldoSaatIni) {
          throw new Error(
            `Saldo ${dari} tidak mencukupi. ` +
              `Dibutuhkan Rp${totalKeluar.toLocaleString('id-ID')}, ` +
              `saldo tersedia Rp${saldoSaatIni.toLocaleString('id-ID')}.`
          );
        }

        // 1. Simpan transaksi transfer utama.
        const transaksi = await db.runAsync(
          `
          INSERT INTO transaksi
            (
              jenis,
              jumlah,
              tanggal,
              deskripsi,
              catatan,
              periode_id
            )
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          'TRANSFER',
          nilai,
          tanggal,
          'Transfer',
          `${dari} → ${ke}`,
          periode.id
        );

        // Saldo sumber berkurang sebesar nominal transfer.
        await db.runAsync(
          `
          INSERT INTO perubahan_saldo
            (transaksi_id, aset_id, jumlah, tanggal)
          VALUES (?, ?, ?, ?)
          `,
          transaksi.lastInsertRowId,
          asetDari.id,
          -nilai,
          tanggal
        );

        // Saldo tujuan bertambah sebesar nominal transfer.
        await db.runAsync(
          `
          INSERT INTO perubahan_saldo
            (transaksi_id, aset_id, jumlah, tanggal)
          VALUES (?, ?, ?, ?)
          `,
          transaksi.lastInsertRowId,
          asetKe.id,
          nilai,
          tanggal
        );

        // 2. Jika checkbox aktif, simpan biaya admin
        // sebagai transaksi pengeluaran yang terpisah.
        if (pakaiAdmin && admin > 0) {
          const transaksiAdmin = await db.runAsync(
            `
            INSERT INTO transaksi
              (
                jenis,
                jumlah,
                tanggal,
                deskripsi,
                catatan,
                periode_id
              )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            'PENGELUARAN',
            admin,
            tanggal,
            `Admin Transfer ${dari} ke ${ke}`,
            `${dari} → ${ke}`,
            periode.id
          );

          // Biaya admin mengurangi saldo aset sumber.
          await db.runAsync(
            `
            INSERT INTO perubahan_saldo
              (transaksi_id, aset_id, jumlah, tanggal)
            VALUES (?, ?, ?, ?)
            `,
            transaksiAdmin.lastInsertRowId,
            asetDari.id,
            -admin,
            tanggal
          );
        }
      });

      setJumlah('');
      setBiayaAdmin('');
      setPakaiAdmin(false);

      onSelesai?.();

      Alert.alert(
        'Berhasil',
        pakaiAdmin
          ? `Transfer Rp${nilai.toLocaleString('id-ID')} dari ${dari} ke ${ke} berhasil.\n\n` +
              `Biaya admin: Rp${admin.toLocaleString('id-ID')}\n` +
              `Total saldo ${dari} berkurang: Rp${totalKeluar.toLocaleString('id-ID')}.`
          : `Rp${nilai.toLocaleString('id-ID')} berhasil ditransfer dari ${dari} ke ${ke}.`
      );
    } catch (error) {
      console.error('Gagal menyimpan transfer:', error);

      Alert.alert(
        'Gagal',
        error instanceof Error
          ? error.message
          : 'Transfer belum berhasil disimpan.'
      );
    } finally {
      setMenyimpan(false);
    }
  }

  const { dari, ke } = getAset();
  const admin = pakaiAdmin ? parseNominal(biayaAdmin) || 0 : 0;
  const nominal = parseNominal(jumlah) || 0;
  const totalKeluar = nominal + admin;

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pilih Transfer</Text>
        <Text style={styles.description}>
          Pilih sumber saldo dan aset tujuan.
        </Text>

        <View style={styles.routeContainer}>
          {([
            {
              value: 'dompet_ovo' as TujuanTransfer,
              label: 'Dompet Grab Ke OVO',
            },
            {
              value: 'ovo_seabank' as TujuanTransfer,
              label: 'OVO Ke SeaBank',
            },
            {
              value: 'seabank_ovo' as TujuanTransfer,
              label: 'SeaBank Ke OVO',
            },
          ]).map((item) => {
            const aktif = tujuan === item.value;

            return (
              <TouchableOpacity
                key={item.value}
                activeOpacity={0.8}
                disabled={menyimpan}
                onPress={() => setTujuan(item.value)}
                style={[
                  styles.routeButton,
                  aktif && styles.routeButtonActive,
                ]}
              >
                <View
                  style={[
                    styles.radioOuter,
                    aktif && styles.radioOuterActive,
                  ]}
                >
                  {aktif && <View style={styles.radioInner} />}
                </View>

                <Text
                  style={[
                    styles.routeText,
                    aktif && styles.routeTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.routeSummary}>
          <View style={styles.assetColumn}>
            <Text style={styles.mutedLabel}>DARI</Text>
            <Text style={styles.assetName}>{dari}</Text>
          </View>

          <View style={[styles.assetColumn, styles.assetColumnRight]}>
            <Text style={styles.mutedLabel}>KE</Text>
            <Text style={styles.assetName}>{ke}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nominal Transfer</Text>
        <Text style={styles.fieldLabel}>
          Nominal yang akan dipindahkan
        </Text>

        <View style={styles.inputWrap}>
          <Text style={styles.currencyPrefix}>Rp</Text>
          <TextInput
            value={jumlah}
            onChangeText={setJumlah}
            placeholder="100000"
            placeholderTextColor="#9BAEAE"
            keyboardType="numeric"
            editable={!menyimpan}
            style={styles.input}
          />
        </View>

        <Text style={styles.helperText}>
          Pastikan saldo aset sumber mencukupi sebelum menyimpan transfer.
        </Text>
      </View>

      {/* BIAYA ADMIN */}
      <View style={styles.adminCard}>
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={menyimpan}
          onPress={() => {
            setPakaiAdmin((aktif) => {
              if (aktif) {
                setBiayaAdmin('');
              }
              return !aktif;
            });
          }}
          style={styles.checkboxRow}
        >
          <View
            style={[
              styles.checkbox,
              pakaiAdmin && styles.checkboxActive,
            ]}
          >
            {pakaiAdmin && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </View>

          <View style={styles.checkboxTextArea}>
            <Text style={styles.adminTitle}>
              Tambahkan biaya admin
            </Text>
            <Text style={styles.adminDescription}>
              Biaya dicatat sebagai pengeluaran terpisah.
            </Text>
          </View>
        </TouchableOpacity>

        {pakaiAdmin && (
          <View style={styles.adminInputArea}>
            <Text style={styles.fieldLabel}>
              Nominal biaya admin
            </Text>

            <View style={styles.inputWrap}>
              <Text style={styles.currencyPrefix}>Rp</Text>
              <TextInput
                value={biayaAdmin}
                onChangeText={setBiayaAdmin}
                placeholder="2500"
                placeholderTextColor="#9BAEAE"
                keyboardType="numeric"
                editable={!menyimpan}
                style={styles.input}
              />
            </View>
          </View>
        )}

        {nominal > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Total saldo keluar
            </Text>
            <Text style={styles.totalValue}>
              Rp{totalKeluar.toLocaleString('id-ID')}
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={menyimpan}
        onPress={simpanTransfer}
        style={[
          styles.saveButton,
          menyimpan && styles.saveButtonDisabled,
        ]}
      >
        <Text style={styles.saveButtonText}>
          {menyimpan ? 'Menyimpan...' : 'Simpan Transfer'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 18,
    backgroundColor: '#F7F8F4',
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#164B57',
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    color: '#63818A',
    marginTop: -4,
  },
  routeContainer: { gap: 8 },
  routeButton: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4EBE7',
    backgroundColor: '#FFFFFF',
  },
  routeButtonActive: {
    backgroundColor: '#E5F1EA',
    borderColor: '#55A982',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#B6C9C2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: '#277B67' },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#277B67',
  },
  routeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#63818A',
  },
  routeTextActive: { color: '#277B67' },
  summaryCard: { padding: 14, gap: 13 },
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assetColumn: { flex: 1, gap: 5 },
  assetColumnRight: { alignItems: 'flex-end' },
  mutedLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#8AA0A3',
  },
  assetName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#164B57',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#63818A',
  },
  inputWrap: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCE7E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: '#277B67',
    marginRight: 9,
  },
  input: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 10,
    fontSize: 14,
    color: '#164B57',
  },
  helperText: {
    fontSize: 11,
    color: '#63818A',
    marginTop: -3,
  },
  adminCard: {
    padding: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E4EBE7',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#B6C9C2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#277B67',
    borderColor: '#277B67',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 17,
  },
  checkboxTextArea: { flex: 1, gap: 3 },
  adminTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#164B57',
  },
  adminDescription: {
    fontSize: 11,
    lineHeight: 16,
    color: '#63818A',
  },
  adminInputArea: { gap: 9 },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E4EBE7',
    paddingTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  totalLabel: {
    fontSize: 12,
    color: '#63818A',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#164B57',
  },
  saveButton: {
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: '#277B67',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});