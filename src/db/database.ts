import type { SQLiteDatabase } from 'expo-sqlite';

export async function buatDatabase(db: SQLiteDatabase) {
  /*
   * ============================================================
   * TABEL DASAR
   * ============================================================
   */

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS aset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL UNIQUE,
      boleh_untuk_pengeluaran INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transaksi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jenis TEXT NOT NULL,
      jumlah INTEGER NOT NULL,
      tanggal TEXT NOT NULL,
      deskripsi TEXT,
      catatan TEXT,
      motor_km INTEGER,
      motor_liter REAL,
      motor_interval INTEGER,
      periode_id INTEGER,
      FOREIGN KEY (periode_id)
        REFERENCES periode(id)
    );

    CREATE TABLE IF NOT EXISTS perubahan_saldo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaksi_id INTEGER,
      aset_id INTEGER NOT NULL,
      jumlah INTEGER NOT NULL,
      tanggal TEXT NOT NULL,
      FOREIGN KEY (transaksi_id)
        REFERENCES transaksi(id),
      FOREIGN KEY (aset_id)
        REFERENCES aset(id)
    );

    CREATE TABLE IF NOT EXISTS target (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT NOT NULL,
      jumlah INTEGER NOT NULL,
      manual INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pengaturan (
      nama TEXT PRIMARY KEY,
      nilai TEXT
    );

    /*
     * ============================================================
     * HUTANG & PIUTANG
     * ============================================================
     */

    CREATE TABLE IF NOT EXISTS hutang_piutang (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipe TEXT NOT NULL,
      nama TEXT NOT NULL,
      nominal INTEGER NOT NULL,
      sisa INTEGER NOT NULL,
      tanggal TEXT NOT NULL,
      catatan TEXT,
      periode_id INTEGER,
      FOREIGN KEY (periode_id)
        REFERENCES periode(id)
    );

    CREATE TABLE IF NOT EXISTS pembayaran_hutang_piutang (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hutang_piutang_id INTEGER NOT NULL,
      nominal INTEGER NOT NULL,
      aset_id INTEGER NOT NULL,
      tanggal TEXT NOT NULL,
      catatan TEXT,
      periode_id INTEGER,
      FOREIGN KEY (hutang_piutang_id)
        REFERENCES hutang_piutang(id),
      FOREIGN KEY (aset_id)
        REFERENCES aset(id),
      FOREIGN KEY (periode_id)
        REFERENCES periode(id)
    );

    /*
     * ============================================================
     * PERIODE
     *
     * AKTIF            = periode sedang berjalan
     * MENUNGGU_MODAL   = periode sudah dibuat tetapi
     *                    belum memiliki Set Modal
     * SELESAI          = periode sudah Settlement
     * ============================================================
     */

    CREATE TABLE IF NOT EXISTS periode (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal_mulai TEXT NOT NULL,
      tanggal_tutup TEXT,
      status TEXT NOT NULL DEFAULT 'MENUNGGU_MODAL'
    );

    /*
     * ============================================================
     * SETTLEMENT
     * ============================================================
     */

    CREATE TABLE IF NOT EXISTS settlement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periode_id INTEGER NOT NULL,
      tanggal_tutup TEXT NOT NULL,
      catatan TEXT,
      FOREIGN KEY (periode_id)
        REFERENCES periode(id)
    );

    CREATE TABLE IF NOT EXISTS settlement_saldo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER NOT NULL,
      aset_id INTEGER NOT NULL,
      saldo INTEGER NOT NULL,
      FOREIGN KEY (settlement_id)
        REFERENCES settlement(id),
      FOREIGN KEY (aset_id)
        REFERENCES aset(id)
    );

    /*
     * ============================================================
     * AUDIT
     * ============================================================
     */

    CREATE TABLE IF NOT EXISTS audit_saldo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aset_id INTEGER NOT NULL,
      periode_id INTEGER,
      saldo_aplikasi INTEGER NOT NULL,
      saldo_sebenarnya INTEGER NOT NULL,
      selisih INTEGER NOT NULL,
      alasan TEXT,
      tanggal TEXT NOT NULL,
      FOREIGN KEY (aset_id)
        REFERENCES aset(id),
      FOREIGN KEY (periode_id)
        REFERENCES periode(id)
    );

    /*
     * ============================================================
     * KOREKSI TRANSAKSI
     * ============================================================
     */

    CREATE TABLE IF NOT EXISTS koreksi_transaksi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaksi_id INTEGER NOT NULL,
      periode_id INTEGER,
      jumlah_sebelum INTEGER NOT NULL,
      jumlah_sesudah INTEGER NOT NULL,
      deskripsi_sebelum TEXT,
      deskripsi_sesudah TEXT,
      catatan_sebelum TEXT,
      catatan_sesudah TEXT,
      alasan TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      FOREIGN KEY (transaksi_id)
        REFERENCES transaksi(id),
      FOREIGN KEY (periode_id)
        REFERENCES periode(id)
    );

    /*
     * ============================================================
     * SET MODAL
     *
     * Satu baris = modal sebuah aset pada sebuah periode.
     * Set Modal BUKAN transaksi pendapatan.
     * ============================================================
     */

    CREATE TABLE IF NOT EXISTS modal_awal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periode_id INTEGER NOT NULL,
      aset_id INTEGER NOT NULL,
      nominal INTEGER NOT NULL,
      tanggal TEXT NOT NULL,
      FOREIGN KEY (periode_id)
        REFERENCES periode(id),
      FOREIGN KEY (aset_id)
        REFERENCES aset(id)
    );

    /*
     * ============================================================
     * DEFAULT ASET
     * ============================================================
     */

    INSERT OR IGNORE INTO aset
      (nama, boleh_untuk_pengeluaran)
    VALUES
      ('Tunai', 1);

    INSERT OR IGNORE INTO aset
      (nama, boleh_untuk_pengeluaran)
    VALUES
      ('OVO', 1);

    INSERT OR IGNORE INTO aset
      (nama, boleh_untuk_pengeluaran)
    VALUES
      ('SeaBank', 1);

    INSERT OR IGNORE INTO aset
      (nama, boleh_untuk_pengeluaran)
    VALUES
      ('Dompet Grab', 0);

    INSERT OR IGNORE INTO aset
      (nama, boleh_untuk_pengeluaran)
    VALUES
      ('Kredit Grab', 0);
  `);

  /*
   * ============================================================
   * MIGRASI DATABASE LAMA
   * ============================================================
   */

  const kolomTransaksi = await db.getAllAsync<{
    name: string;
  }>('PRAGMA table_info(transaksi)');

  const punyaPeriodeTransaksi = kolomTransaksi.some(
    (kolom) => kolom.name === 'periode_id'
  );

  if (!punyaPeriodeTransaksi) {
    await db.execAsync(`
      ALTER TABLE transaksi
      ADD COLUMN periode_id INTEGER;
    `);
  }

  const kolomHutangPiutang = await db.getAllAsync<{
    name: string;
  }>('PRAGMA table_info(hutang_piutang)');

  const punyaPeriodeHutangPiutang =
    kolomHutangPiutang.some(
      (kolom) => kolom.name === 'periode_id'
    );

  if (!punyaPeriodeHutangPiutang) {
    await db.execAsync(`
      ALTER TABLE hutang_piutang
      ADD COLUMN periode_id INTEGER;
    `);
  }

  const kolomPembayaran =
    await db.getAllAsync<{
      name: string;
    }>(
      'PRAGMA table_info(pembayaran_hutang_piutang)'
    );

  const punyaPeriodePembayaran =
    kolomPembayaran.some(
      (kolom) => kolom.name === 'periode_id'
    );

  if (!punyaPeriodePembayaran) {
    await db.execAsync(`
      ALTER TABLE pembayaran_hutang_piutang
      ADD COLUMN periode_id INTEGER;
    `);
  }

  /*
   * ============================================================
   * PENGATURAN DEFAULT
   * ============================================================
   */

  await db.runAsync(`
    INSERT OR IGNORE INTO pengaturan
      (nama, nilai)
    VALUES
      ('modal_sudah_diatur', '0')
  `);

  await db.runAsync(`
    INSERT OR IGNORE INTO pengaturan
      (nama, nilai)
    VALUES
      ('periode_sudah_ditutup', '0')
  `);

  /*
   * ============================================================
   * MIGRASI STATUS PERIODE
   *
   * Database lama sebelumnya otomatis membuat periode AKTIF.
   * Sekarang periode harus menunggu Set Modal jika modal
   * belum pernah diatur.
   *
   * Jika modal sudah pernah diatur, periode AKTIF tetap
   * dipertahankan agar data lama tidak rusak.
   * ============================================================
   */

  const pengaturanModal =
    await db.getFirstAsync<{
      nilai: string | null;
    }>(`
      SELECT nilai
      FROM pengaturan
      WHERE nama = 'modal_sudah_diatur'
    `);

  const adaPeriode = await db.getFirstAsync<{
    id: number;
    status: string;
  }>(`
    SELECT id, status
    FROM periode
    ORDER BY id DESC
    LIMIT 1
  `);

  if (!adaPeriode) {
    await db.runAsync(`
      INSERT INTO periode (
        tanggal_mulai,
        tanggal_tutup,
        status
      )
      VALUES (
        date('now', 'localtime'),
        NULL,
        'MENUNGGU_MODAL'
      )
    `);
  } else if (
    pengaturanModal?.nilai !== '1' &&
    adaPeriode.status === 'AKTIF'
  ) {
    await db.runAsync(
      `
        UPDATE periode
        SET status = 'MENUNGGU_MODAL'
        WHERE id = ?
      `,
      adaPeriode.id
    );
  }

  /*
   * ============================================================
   * INDEX
   * ============================================================
   */

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_transaksi_tanggal
      ON transaksi(tanggal);

    CREATE INDEX IF NOT EXISTS idx_transaksi_periode
      ON transaksi(periode_id);

    CREATE INDEX IF NOT EXISTS idx_perubahan_saldo_transaksi
      ON perubahan_saldo(transaksi_id);

    CREATE INDEX IF NOT EXISTS idx_perubahan_saldo_aset
      ON perubahan_saldo(aset_id);

    CREATE INDEX IF NOT EXISTS idx_target_tanggal
      ON target(tanggal);

    CREATE INDEX IF NOT EXISTS idx_hutang_piutang_tipe
      ON hutang_piutang(tipe);

    CREATE INDEX IF NOT EXISTS idx_hutang_piutang_periode
      ON hutang_piutang(periode_id);

    CREATE INDEX IF NOT EXISTS idx_pembayaran_hutang
      ON pembayaran_hutang_piutang(hutang_piutang_id);

    CREATE INDEX IF NOT EXISTS idx_periode_status
      ON periode(status);

    CREATE INDEX IF NOT EXISTS idx_settlement_periode
      ON settlement(periode_id);

    CREATE INDEX IF NOT EXISTS idx_audit_saldo_aset
      ON audit_saldo(aset_id);

    CREATE INDEX IF NOT EXISTS idx_audit_saldo_periode
      ON audit_saldo(periode_id);

    CREATE INDEX IF NOT EXISTS idx_koreksi_transaksi
      ON koreksi_transaksi(transaksi_id);

    CREATE INDEX IF NOT EXISTS idx_modal_awal_periode
      ON modal_awal(periode_id);
  `);
}