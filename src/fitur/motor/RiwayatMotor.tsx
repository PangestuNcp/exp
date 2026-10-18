import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

type Props = {
  refreshKey?: number;
};

type RiwayatData = {
  id: number;
  jenis: string;
  tanggal: string;
  deskripsi: string | null;
  jumlah: number;
};

export default function RiwayatMotor({
  refreshKey = 0,
}: Props) {
  const db = useSQLiteContext();

  const [data, setData] =
    useState<RiwayatData[]>([]);

  const ambilRiwayat = useCallback(async () => {
    /*
     * Riwayat motor bersifat lintas periode.
     * Settlement tidak menghapus atau menyembunyikan
     * riwayat motor lama.
     */
    const hasil =
      await db.getAllAsync<RiwayatData>(
        `
        SELECT
          id,
          jenis,
          tanggal,
          deskripsi,
          jumlah
        FROM transaksi
        WHERE jenis IN (
          'BENSIN',
          'OLI',
          'SERVIS',
          'SPAREPART'
        )
        ORDER BY tanggal DESC, id DESC
        `
      );

    setData(hasil);
  }, [db]);

  useEffect(() => {
    ambilRiwayat();
  }, [ambilRiwayat, refreshKey]);

  const formatTanggal = (
    tanggal: string
  ) => {
    return new Date(tanggal).toLocaleDateString(
      'id-ID',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }
    );
  };

  const namaJenis = (
    jenis: string
  ) => {
    switch (jenis) {
      case 'BENSIN':
        return '⛽ Bensin';

      case 'OLI':
        return '🛢 Oli';

      case 'SERVIS':
        return '🔧 Servis';

      case 'SPAREPART':
        return '🔩 Sparepart';

      default:
        return 'Aktivitas Motor';
    }
  };

  return (
    <View style={{ marginTop: 24 }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: 'bold',
          marginBottom: 12,
        }}
      >
        Riwayat Motor
      </Text>

      {data.length === 0 ? (
        <Text>
          Belum ada riwayat motor.
        </Text>
      ) : (
        data.map((item) => (
          <View
            key={item.id}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: '#ddd',
              paddingVertical: 12,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent:
                  'space-between',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  flex: 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    marginBottom: 3,
                  }}
                >
                  {namaJenis(item.jenis)}
                </Text>

                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: 'bold',
                  }}
                >
                  {item.deskripsi ||
                    'Aktivitas Motor'}
                </Text>

                <Text
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                  }}
                >
                  {formatTanggal(
                    item.tanggal
                  )}
                </Text>
              </View>

              <Text
                style={{
                  fontWeight: 'bold',
                  marginLeft: 12,
                }}
              >
                Rp{' '}
                {Math.abs(
                  item.jumlah
                ).toLocaleString('id-ID')}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}