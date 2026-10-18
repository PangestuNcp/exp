import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Aset = {
  nama: string;
  saldo: number;
};

export default function TotalAset() {
  const db = useSQLiteContext();

  const [aset, setAset] = useState<Aset[]>([]);
  const [total, setTotal] = useState(0);

  const ambilAset = useCallback(async () => {
    const hasil = await db.getAllAsync<Aset>(
      `
      SELECT
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

    const jumlahTotal = hasil.reduce(
      (jumlah, item) => jumlah + item.saldo,
      0
    );

    setTotal(jumlahTotal);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      ambilAset();
    }, [ambilAset])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Total Aset</Text>

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Total seluruh aset</Text>

        <Text style={styles.total}>
          Rp{total.toLocaleString('id-ID')}
        </Text>
      </View>

      {aset.map((item) => (
        <View key={item.nama} style={styles.item}>
          <Text style={styles.nama}>{item.nama}</Text>

          <Text style={styles.saldo}>
            Rp{item.saldo.toLocaleString('id-ID')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
  },

  totalBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
  },

  totalLabel: {
    fontSize: 14,
  },

  total: {
    marginTop: 4,
    fontSize: 26,
    fontWeight: '700',
  },

  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },

  nama: {
    fontSize: 16,
  },

  saldo: {
    fontSize: 16,
    fontWeight: '600',
  },
});