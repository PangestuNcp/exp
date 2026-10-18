import { ScrollView, Text, View } from 'react-native';

export default function TentangTertata() {
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          marginBottom: 30,
        }}
      >
        <Text
          style={{
            fontSize: 32,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Tertata
        </Text>

        <Text
          style={{
            fontSize: 16,
          }}
        >
          Versi 1.0.0
        </Text>
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Tentang Tertata
        </Text>

        <Text style={{ lineHeight: 24 }}>
          Tertata adalah aplikasi untuk membantu mengatur
          keuangan, pendapatan, pengeluaran, aset, dan
          pengelolaan motor dalam satu tempat.
        </Text>
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Fitur
        </Text>

        <Text style={{ lineHeight: 26 }}>
          • Pendapatan dan pengeluaran{'\n'}
          • Target pendapatan{'\n'}
          • Pengelolaan aset{'\n'}
          • Transfer dan perpindahan saldo{'\n'}
          • Pengelolaan motor{'\n'}
          • Hutang dan piutang{'\n'}
          • Audit saldo{'\n'}
          • Koreksi transaksi{'\n'}
          • Settlement / tutup periode
        </Text>
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            marginBottom: 8,
          }}
        >
          Penyimpanan Data
        </Text>

        <Text style={{ lineHeight: 24 }}>
          Data Tertata disimpan secara lokal pada perangkat.
          Aplikasi dirancang agar fungsi utama dapat digunakan
          tanpa bergantung pada layanan berbayar.
        </Text>
      </View>

      <View
        style={{
          alignItems: 'center',
          marginTop: 20,
        }}
      >
        <Text style={{ textAlign: 'center' }}>
          Tertata
        </Text>

        <Text
          style={{
            textAlign: 'center',
            marginTop: 6,
          }}
        >
          Mengatur keuangan dengan lebih tertata.
        </Text>
      </View>
    </ScrollView>
  );
}