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

type Props = {
  onSelesai?: () => void;
};

function parseNominal(value: string): number {
  const angka = value.replace(/\D/g, '');
  return angka ? Number(angka) : 0;
}

function formatRupiah(value: number): string {
  return value.toLocaleString('id-ID');
}

export default function CashOut({ onSelesai }: Props) {
  const db = useSQLiteContext();

  const [nominal, setNominal] = useState('');
  const [pakaiAdmin, setPakaiAdmin] = useState(false);
  const [biayaAdmin, setBiayaAdmin] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);

  const nilai = parseNominal(nominal);
  const admin = pakaiAdmin ? parseNominal(biayaAdmin) : 0;
  const totalDibutuhkan = nilai + admin;

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

  const simpanCashOut = async () => {
    if (menyimpan) return;

    if (!Number.isSafeInteger(nilai) || nilai <= 0) {
      Alert.alert(
        'Nominal tidak valid',
        'Masukkan nominal Cash Out yang lebih besar dari nol.'
      );
      return;
    }

    if (
      pakaiAdmin &&
      (!Number.isSafeInteger(admin) || admin <= 0)
    ) {
      Alert.alert(
        'Biaya admin tidak valid',
        'Masukkan biaya admin yang lebih besar dari nol, atau nonaktifkan checkbox biaya admin.'
      );
      return;
    }

    try {
      setMenyimpan(true);

      const periode = await ambilPeriodeAktif();

      if (!periode) {
        Alert.alert(
          'Periode belum aktif',
          'Selesaikan Set Modal terlebih dahulu sebelum melakukan Cash Out.'
        );
        return;
      }

      const sumber = await db.getFirstAsync<{
        id: number;
        saldo: number;
      }>(
        `
        SELECT
          a.id,
          COALESCE((
            SELECT SUM(ma.nominal)
            FROM modal_awal ma
            WHERE ma.aset_id = a.id
              AND ma.periode_id = ?
          ), 0)
          +
          COALESCE((
            SELECT SUM(ps.jumlah)
            FROM perubahan_saldo ps
            INNER JOIN transaksi t
              ON t.id = ps.transaksi_id
            WHERE ps.aset_id = a.id
              AND t.periode_id = ?
          ), 0) AS saldo
        FROM aset a
        WHERE a.nama = ?
        `,
        periode.id,
        periode.id,
        'SeaBank'
      );

      const tujuan = await db.getFirstAsync<{ id: number }>(
        `
        SELECT id
        FROM aset
        WHERE nama = ?
        `,
        'Tunai'
      );

      if (!sumber || !tujuan) {
        Alert.alert(
          'Gagal',
          'Aset SeaBank atau Tunai tidak ditemukan.'
        );
        return;
      }

      if (sumber.saldo < totalDibutuhkan) {
        Alert.alert(
          'Saldo tidak cukup',
          `Saldo SeaBank tidak cukup.\n\n` +
            `Saldo tersedia: Rp ${formatRupiah(sumber.saldo)}\n` +
            `Nominal Cash Out: Rp ${formatRupiah(nilai)}\n` +
            `Biaya admin: Rp ${formatRupiah(admin)}\n` +
            `Total dibutuhkan: Rp ${formatRupiah(totalDibutuhkan)}`
        );
        return;
      }

      const tanggal = new Date().toISOString();

      await db.withTransactionAsync(async () => {
        // Transaksi utama Cash Out.
        // Pokok perpindahan saldo bukan pengeluaran.
        const hasil = await db.runAsync(
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
          'CASH_OUT',
          nilai,
          tanggal,
          'Cash Out',
          'SeaBank → Tunai',
          periode.id
        );

        const transaksiId = hasil.lastInsertRowId;

        // SeaBank berkurang sebesar nominal Cash Out.
        await db.runAsync(
          `
          INSERT INTO perubahan_saldo
            (transaksi_id, aset_id, jumlah, tanggal)
          VALUES (?, ?, ?, ?)
          `,
          transaksiId,
          sumber.id,
          -nilai,
          tanggal
        );

        // Tunai bertambah sebesar nominal Cash Out.
        await db.runAsync(
          `
          INSERT INTO perubahan_saldo
            (transaksi_id, aset_id, jumlah, tanggal)
          VALUES (?, ?, ?, ?)
          `,
          transaksiId,
          tujuan.id,
          nilai,
          tanggal
        );

        // Biaya admin dicatat sebagai pengeluaran terpisah.
        if (pakaiAdmin && admin > 0) {
          const hasilAdmin = await db.runAsync(
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
            'Admin Cash Out SeaBank ke Tunai',
            'Biaya admin Cash Out',
            periode.id
          );

          // Biaya admin mengurangi saldo SeaBank.
          await db.runAsync(
            `
            INSERT INTO perubahan_saldo
              (transaksi_id, aset_id, jumlah, tanggal)
            VALUES (?, ?, ?, ?)
            `,
            hasilAdmin.lastInsertRowId,
            sumber.id,
            -admin,
            tanggal
          );
        }
      });

      setNominal('');
      setPakaiAdmin(false);
      setBiayaAdmin('');

      onSelesai?.();

      Alert.alert(
        'Berhasil',
        `Cash Out Rp ${formatRupiah(nilai)} berhasil.` +
          (pakaiAdmin
            ? `\nBiaya admin: Rp ${formatRupiah(admin)}`
            : '') +
          `\nTotal pengurangan SeaBank: Rp ${formatRupiah(totalDibutuhkan)}`
      );
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Cash Out gagal disimpan.'
      );
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Perpindahan Saldo
        </Text>
        <Text style={styles.description}>
          Pindahkan saldo dari rekening SeaBank ke uang tunai.
        </Text>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.routeSummary}>
          <View style={styles.assetColumn}>
            <Text style={styles.mutedLabel}>DARI</Text>
            <Text style={styles.assetName}>SeaBank</Text>
          </View>

          <View style={[styles.assetColumn, styles.assetColumnRight]}>
            <Text style={styles.mutedLabel}>KE</Text>
            <Text style={styles.assetName}>Tunai</Text>
          </View>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.feeRow}>
          <Text style={styles.feeLabel}>Nominal Cash Out</Text>
          <Text style={styles.feeValue}>
            Rp {formatRupiah(nilai)}
          </Text>
        </View>

        <View style={styles.feeRow}>
          <Text style={styles.feeLabel}>Biaya admin</Text>
          <Text style={styles.feeValue}>
            Rp {formatRupiah(admin)}
          </Text>
        </View>

        <View style={styles.feeRow}>
          <Text style={styles.totalLabel}>
            Total pengurangan SeaBank
          </Text>
          <Text style={styles.totalValue}>
            Rp {formatRupiah(totalDibutuhkan)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Nominal Cash Out
        </Text>

        <Text style={styles.fieldLabel}>
          Nominal yang diterima Tunai
        </Text>

        <View style={styles.inputWrap}>
          <Text style={styles.currencyPrefix}>Rp</Text>
          <TextInput
            value={nominal}
            onChangeText={setNominal}
            placeholder="Contoh: 100000"
            placeholderTextColor="#9BAEAE"
            keyboardType="numeric"
            editable={!menyimpan}
            style={styles.input}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          disabled={menyimpan}
          onPress={() => {
            const aktif = !pakaiAdmin;

            setPakaiAdmin(aktif);

            if (!aktif) {
              setBiayaAdmin('');
            }
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

          <View style={styles.checkboxTextWrap}>
            <Text style={styles.checkboxTitle}>
              Tambahkan biaya admin
            </Text>
            <Text style={styles.checkboxDescription}>
              Aktifkan jika Cash Out dikenakan biaya admin.
            </Text>
          </View>
        </TouchableOpacity>

        {pakaiAdmin && (
          <View style={styles.adminInputSection}>
            <Text style={styles.fieldLabel}>
              Nominal biaya admin
            </Text>

            <View style={styles.inputWrap}>
              <Text style={styles.currencyPrefix}>Rp</Text>
              <TextInput
                value={biayaAdmin}
                onChangeText={setBiayaAdmin}
                placeholder="Contoh: 2500"
                placeholderTextColor="#9BAEAE"
                keyboardType="numeric"
                editable={!menyimpan}
                style={styles.input}
              />
            </View>
          </View>
        )}

        <Text style={styles.helperText}>
          {pakaiAdmin
            ? `SeaBank akan berkurang Rp ${formatRupiah(totalDibutuhkan)}. Biaya admin dicatat sebagai pengeluaran terpisah.`
            : `SeaBank berkurang dan Tunai bertambah sebesar Rp ${formatRupiah(nilai)}.`}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={simpanCashOut}
        disabled={menyimpan}
        style={[
          styles.saveButton,
          menyimpan && styles.saveButtonDisabled,
        ]}
      >
        <Text style={styles.saveButtonText}>
          {menyimpan ? 'Menyimpan...' : 'Simpan Cash Out'}
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
  section: {
    gap: 10,
  },
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
  summaryCard: {
    padding: 14,
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4EBE7',
  },
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assetColumn: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 5,
  },
  assetColumnRight: {
    alignItems: 'flex-end',
  },
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
  summaryDivider: {
    height: 1,
    backgroundColor: '#EAF0ED',
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  feeLabel: {
    fontSize: 12,
    color: '#63818A',
  },
  feeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#277B67',
  },
  totalLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#164B57',
  },
  totalValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#277B67',
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCE7E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 5,
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
  checkboxTextWrap: {
    flex: 1,
    gap: 3,
  },
  checkboxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#164B57',
  },
  checkboxDescription: {
    fontSize: 11,
    lineHeight: 16,
    color: '#63818A',
  },
  adminInputSection: {
    gap: 10,
  },
  helperText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#63818A',
    marginTop: -3,
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
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
