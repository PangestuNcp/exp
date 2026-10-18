import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Tab = 'pendapatan' | 'tips';
type JenisPembayaran = 'non_cash' | 'cash';

export default function Pendapatan() {
  const db = useSQLiteContext();

  const [tab, setTab] = useState<Tab>('pendapatan');
  const [jenisPembayaran, setJenisPembayaran] =
    useState<JenisPembayaran>('non_cash');

  const [jumlah, setJumlah] = useState('');
  const [dibayarCustomer, setDibayarCustomer] = useState('');

  const [saldoGrab, setSaldoGrab] = useState(0);
  const [saldoTunai, setSaldoTunai] = useState(0);
  const [saldoKredit, setSaldoKredit] = useState(0);

  async function ambilPeriodeAktif() {
    return await db.getFirstAsync<{
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
  }

  async function ambilSaldo() {
    const periode = await ambilPeriodeAktif();

    if (!periode) {
      setSaldoGrab(0);
      setSaldoTunai(0);
      setSaldoKredit(0);
      return;
    }

    const hasil = await db.getAllAsync<{
      nama: string;
      saldo: number;
    }>(
      `
      SELECT
        a.nama,
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
      WHERE a.nama IN (
        'Dompet Grab',
        'Tunai',
        'Kredit Grab'
      )
      `,
      periode.id,
      periode.id
    );

    const grab = hasil.find(
      (item) => item.nama === 'Dompet Grab'
    );

    const tunai = hasil.find(
      (item) => item.nama === 'Tunai'
    );

    const kredit = hasil.find(
      (item) => item.nama === 'Kredit Grab'
    );

    setSaldoGrab(grab?.saldo ?? 0);
    setSaldoTunai(tunai?.saldo ?? 0);
    setSaldoKredit(kredit?.saldo ?? 0);
  }

  useEffect(() => {
    ambilSaldo();
  }, []);

  function pilihTab(tabBaru: Tab) {
    setTab(tabBaru);
    setJumlah('');
    setDibayarCustomer('');
    setJenisPembayaran('non_cash');
  }

  async function simpanPendapatan() {
    const nilaiPendapatan = Number(jumlah);

    if (!nilaiPendapatan || nilaiPendapatan <= 0) {
      Alert.alert(
        'Periksa lagi',
        'Masukkan jumlah pendapatan.'
      );
      return;
    }

    const periode = await ambilPeriodeAktif();

    if (!periode) {
      Alert.alert(
        'Periode belum aktif',
        'Selesaikan Set Modal terlebih dahulu sebelum mencatat pendapatan.'
      );
      return;
    }

    /*
     * NON-CASH
     * Pendapatan langsung masuk ke Dompet Grab.
     */
    if (jenisPembayaran === 'non_cash') {
      const tanggal = new Date().toISOString();

      try {
        await db.withTransactionAsync(async () => {
          const asetGrab = await db.getFirstAsync<{ id: number }>(
            `SELECT id FROM aset WHERE nama = ?`,
            'Dompet Grab'
          );

          if (!asetGrab) {
            throw new Error(
              'Dompet Grab tidak ditemukan.'
            );
          }

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
            'PENDAPATAN',
            nilaiPendapatan,
            tanggal,
            'Pendapatan',
            null,
            periode.id
          );

          await db.runAsync(
            `
            INSERT INTO perubahan_saldo
              (transaksi_id, aset_id, jumlah, tanggal)
            VALUES (?, ?, ?, ?)
            `,
            transaksi.lastInsertRowId,
            asetGrab.id,
            nilaiPendapatan,
            tanggal
          );
        });

        setJumlah('');

        await ambilSaldo();

        Alert.alert(
          'Berhasil',
          `Pendapatan Rp${nilaiPendapatan.toLocaleString(
            'id-ID'
          )} ditambahkan ke Dompet Grab.`
        );
      } catch (error) {
        console.error(error);

        Alert.alert(
          'Gagal',
          'Pendapatan belum berhasil disimpan.'
        );
      }

      return;
    }

    /*
     * CASH
     */
    const nilaiCustomer = Number(dibayarCustomer);

    if (!nilaiCustomer || nilaiCustomer <= 0) {
      Alert.alert(
        'Periksa lagi',
        'Masukkan jumlah yang dibayar customer.'
      );
      return;
    }

    const tanggal = new Date().toISOString();

    try {
      await db.withTransactionAsync(async () => {
        const asetGrab = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM aset WHERE nama = ?`,
          'Dompet Grab'
        );

        const asetKredit = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM aset WHERE nama = ?`,
          'Kredit Grab'
        );

        const asetTunai = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM aset WHERE nama = ?`,
          'Tunai'
        );

        if (!asetGrab) {
          throw new Error(
            'Dompet Grab tidak ditemukan.'
          );
        }

        if (!asetKredit) {
          throw new Error(
            'Kredit Grab tidak ditemukan.'
          );
        }

        if (!asetTunai) {
          throw new Error(
            'Tunai tidak ditemukan.'
          );
        }

        /*
         * Ambil saldo Kredit Grab
         * dari periode aktif saja.
         */
        const hasilKredit =
          await db.getFirstAsync<{ saldo: number }>(
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
            asetKredit.id,
            periode.id,
            asetKredit.id,
            periode.id
          );

        const kreditSaatIni = hasilKredit?.saldo ?? 0;

        /*
         * Kredit Grab digunakan terlebih dahulu.
         */
        const pengurangKredit = Math.min(
          kreditSaatIni,
          nilaiCustomer
        );

        /*
         * Jika pembayaran customer lebih besar
         * daripada Kredit Grab, selisihnya diambil
         * dari Dompet Grab.
         */
        const kekurangan =
          nilaiCustomer - pengurangKredit;

        /*
         * Satu transaksi untuk seluruh order Cash.
         */
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
          'PENDAPATAN_CASH',
          nilaiPendapatan,
          tanggal,
          'Pendapatan',
          `Customer bayar Rp${nilaiCustomer.toLocaleString(
            'id-ID'
          )}`,
          periode.id
        );

        /*
         * 1. Pendapatan masuk ke Dompet Grab.
         */
        await db.runAsync(
          `
          INSERT INTO perubahan_saldo
            (transaksi_id, aset_id, jumlah, tanggal)
          VALUES (?, ?, ?, ?)
          `,
          transaksi.lastInsertRowId,
          asetGrab.id,
          nilaiPendapatan,
          tanggal
        );

        /*
         * 2. Customer memberikan uang cash.
         * Uang masuk ke Tunai.
         */
        await db.runAsync(
          `
          INSERT INTO perubahan_saldo
            (transaksi_id, aset_id, jumlah, tanggal)
          VALUES (?, ?, ?, ?)
          `,
          transaksi.lastInsertRowId,
          asetTunai.id,
          nilaiCustomer,
          tanggal
        );

        /*
         * 3. Kredit Grab berkurang.
         */
        if (pengurangKredit > 0) {
          await db.runAsync(
            `
            INSERT INTO perubahan_saldo
              (transaksi_id, aset_id, jumlah, tanggal)
            VALUES (?, ?, ?, ?)
            `,
            transaksi.lastInsertRowId,
            asetKredit.id,
            -pengurangKredit,
            tanggal
          );
        }

        /*
         * 4. Jika Kredit Grab tidak cukup,
         * kekurangannya diambil dari Dompet Grab.
         */
        if (kekurangan > 0) {
          await db.runAsync(
            `
            INSERT INTO perubahan_saldo
              (transaksi_id, aset_id, jumlah, tanggal)
            VALUES (?, ?, ?, ?)
            `,
            transaksi.lastInsertRowId,
            asetGrab.id,
            -kekurangan,
            tanggal
          );
        }
      });

      setJumlah('');
      setDibayarCustomer('');

      await ambilSaldo();

      Alert.alert(
        'Berhasil',
        `Order Cash Rp${nilaiPendapatan.toLocaleString(
          'id-ID'
        )} berhasil disimpan.`
      );
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Order Cash belum berhasil disimpan.'
      );
    }
  }

  async function simpanTips() {
    const nilai = Number(jumlah);

    if (!nilai || nilai <= 0) {
      Alert.alert(
        'Periksa lagi',
        'Masukkan jumlah tips.'
      );
      return;
    }

    const periode = await ambilPeriodeAktif();

    if (!periode) {
      Alert.alert(
        'Periode belum aktif',
        'Selesaikan Set Modal terlebih dahulu sebelum mencatat tips.'
      );
      return;
    }

    const tanggal = new Date().toISOString();

    try {
      await db.withTransactionAsync(async () => {
        const namaAset =
          jenisPembayaran === 'cash'
            ? 'Tunai'
            : 'Dompet Grab';

        const aset = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM aset WHERE nama = ?`,
          namaAset
        );

        if (!aset) {
          throw new Error(
            `${namaAset} tidak ditemukan.`
          );
        }

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
          'TIPS',
          nilai,
          tanggal,
          'Tips',
          null,
          periode.id
        );

        await db.runAsync(
          `
          INSERT INTO perubahan_saldo
            (transaksi_id, aset_id, jumlah, tanggal)
          VALUES (?, ?, ?, ?)
          `,
          transaksi.lastInsertRowId,
          aset.id,
          nilai,
          tanggal
        );
      });

      setJumlah('');

      await ambilSaldo();

      const tujuan =
        jenisPembayaran === 'cash'
          ? 'Tunai'
          : 'Dompet Grab';

      Alert.alert(
        'Berhasil',
        `Tips Rp${nilai.toLocaleString(
          'id-ID'
        )} ditambahkan ke ${tujuan}.`
      );
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Gagal',
        'Tips belum berhasil disimpan.'
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.choiceRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => pilihTab('pendapatan')}
          style={[styles.choiceButton, tab === 'pendapatan' && styles.choiceButtonActive]}
        >
          <Text style={[styles.choiceText, tab === 'pendapatan' && styles.choiceTextActive]}>
            Orderan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => pilihTab('tips')}
          style={[styles.choiceButton, tab === 'tips' && styles.choiceButtonActive]}
        >
          <Text style={[styles.choiceText, tab === 'tips' && styles.choiceTextActive]}>
            Tips
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'tips' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tips</Text>

          <View style={styles.choiceRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setJenisPembayaran('non_cash')}
              style={[styles.choiceButton, jenisPembayaran === 'non_cash' && styles.choiceButtonActive]}
            >
              <Text style={[styles.choiceText, jenisPembayaran === 'non_cash' && styles.choiceTextActive]}>
                Tips Non Tunai
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setJenisPembayaran('cash')}
              style={[styles.choiceButton, jenisPembayaran === 'cash' && styles.choiceButtonActive]}
            >
              <Text style={[styles.choiceText, jenisPembayaran === 'cash' && styles.choiceTextActive]}>
                Tips Tunai
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Rp"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            value={jumlah}
            onChangeText={setJumlah}
          />

          <Text style={styles.note}>
            {jenisPembayaran === 'cash'
              ? 'Tips tunai masuk ke Tunai.'
              : 'Tips non tunai masuk ke Dompet Grab.'}
          </Text>

          <TouchableOpacity activeOpacity={0.8} onPress={simpanTips} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Simpan</Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === 'pendapatan' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Orderan</Text>

          <View style={styles.choiceRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setJenisPembayaran('non_cash')}
              style={[styles.choiceButton, jenisPembayaran === 'non_cash' && styles.choiceButtonActive]}
            >
              <Text style={[styles.choiceText, jenisPembayaran === 'non_cash' && styles.choiceTextActive]}>
                Orderan Non Tunai
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setJenisPembayaran('cash')}
              style={[styles.choiceButton, jenisPembayaran === 'cash' && styles.choiceButtonActive]}
            >
              <Text style={[styles.choiceText, jenisPembayaran === 'cash' && styles.choiceTextActive]}>
                Orderan Tunai
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Rp"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            value={jumlah}
            onChangeText={setJumlah}
          />

          {jenisPembayaran === 'cash' && (
            <>
              <Text style={styles.note}>Masukkan pendapatan orderan.</Text>

              <TextInput
                style={styles.input}
                placeholder="Rp"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={dibayarCustomer}
                onChangeText={setDibayarCustomer}
              />

              <Text style={styles.note}>Masukkan tagih tunai / COD dari customer.</Text>
            </>
          )}

          <TouchableOpacity activeOpacity={0.8} onPress={simpanPendapatan} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Simpan</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 16,
    backgroundColor: '#F7F8F4',
  },
  section: {
    gap: 11,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#164B57',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  choiceButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4EBE7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceButtonActive: {
    backgroundColor: '#E5F1EA',
    borderColor: '#55A982',
  },
  choiceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#63818A',
    textAlign: 'center',
  },
  choiceTextActive: {
    color: '#277B67',
    fontWeight: '700',
  },
  input: {
    width: '100%',
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#E4EBE7',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#164B57',
    backgroundColor: '#FFFFFF',
  },
  note: {
    fontSize: 11,
    lineHeight: 16,
    color: '#63818A',
    marginTop: -4,
  },
  saveButton: {
    width: '100%',
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: '#277B67',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
