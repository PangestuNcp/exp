import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import Bensin from '../../fitur/motor/Bensin';
import Oli from '../../fitur/motor/Oli';
import RiwayatMotor from '../../fitur/motor/RiwayatMotor';
import Servis from '../../fitur/motor/Servis';
import Sparepart from '../../fitur/motor/Sparepart';

type MenuMotor =
  | 'utama'
  | 'bensin'
  | 'oli'
  | 'servis'
  | 'sparepart';

export default function MotorScreen() {
  const db = useSQLiteContext();

  const [kmSaatIni, setKmSaatIni] = useState(0);
  const [menu, setMenu] = useState<MenuMotor>('utama');
  const [refreshKey, setRefreshKey] = useState(0);

  const ambilKmMotor = useCallback(async () => {
    const hasil = await db.getFirstAsync<{
      motor_km: number | null;
    }>(`
      SELECT motor_km
      FROM transaksi
      WHERE jenis IN ('BENSIN', 'OLI', 'SERVIS')
        AND motor_km IS NOT NULL
      ORDER BY motor_km DESC
      LIMIT 1
    `);

    setKmSaatIni(hasil?.motor_km ?? 0);
  }, [db]);

  useEffect(() => {
    ambilKmMotor();
  }, [ambilKmMotor, refreshKey]);

  const selesaiTransaksiMotor = async () => {
    await ambilKmMotor();
    setRefreshKey((nilai) => nilai + 1);
    setMenu('utama');
  };

  if (menu === 'bensin') {
    return (
      <ScrollView>
        <View style={{ padding: 16 }}>
          <TouchableOpacity
            onPress={() => setMenu('utama')}
            style={{ marginBottom: 20 }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: 'bold',
              }}
            >
              ← Kembali
            </Text>
          </TouchableOpacity>

          <Bensin onSelesai={selesaiTransaksiMotor} />
        </View>
      </ScrollView>
    );
  }

  if (menu === 'oli') {
    return (
      <ScrollView>
        <View style={{ padding: 16 }}>
          <TouchableOpacity
            onPress={() => setMenu('utama')}
            style={{ marginBottom: 20 }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: 'bold',
              }}
            >
              ← Kembali
            </Text>
          </TouchableOpacity>

          <Oli onSelesai={selesaiTransaksiMotor} />
        </View>
      </ScrollView>
    );
  }

  if (menu === 'servis') {
    return (
      <ScrollView>
        <View style={{ padding: 16 }}>
          <TouchableOpacity
            onPress={() => setMenu('utama')}
            style={{ marginBottom: 20 }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: 'bold',
              }}
            >
              ← Kembali
            </Text>
          </TouchableOpacity>

          <Servis onSelesai={selesaiTransaksiMotor} />
        </View>
      </ScrollView>
    );
  }

  if (menu === 'sparepart') {
    return (
      <ScrollView>
        <View style={{ padding: 16 }}>
          <TouchableOpacity
            onPress={() => setMenu('utama')}
            style={{ marginBottom: 20 }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: 'bold',
              }}
            >
              ← Kembali
            </Text>
          </TouchableOpacity>

          <Sparepart onSelesai={selesaiTransaksiMotor} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView>
      <View style={{ padding: 16 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: 'bold',
            marginBottom: 20,
          }}
        >
          MOTOR
        </Text>

        {/* TOTAL KM */}
        <View
          style={{
            borderWidth: 1,
            borderColor: '#ddd',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              marginBottom: 6,
            }}
          >
            Total KM Saat Ini
          </Text>

          <Text
            style={{
              fontSize: 28,
              fontWeight: 'bold',
            }}
          >
            {kmSaatIni.toLocaleString('id-ID')} KM
          </Text>
        </View>

        {/* MENU MOTOR */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <TouchableOpacity
            onPress={() => setMenu('bensin')}
            style={{
              width: '48%',
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 12,
              padding: 20,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: 'bold',
              }}
            >
              ⛽ Bensin
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMenu('oli')}
            style={{
              width: '48%',
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 12,
              padding: 20,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: 'bold',
              }}
            >
              🛢 Oli
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMenu('servis')}
            style={{
              width: '48%',
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 12,
              padding: 20,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: 'bold',
              }}
            >
              🔧 Servis
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMenu('sparepart')}
            style={{
              width: '48%',
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 12,
              padding: 20,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: 'bold',
              }}
            >
              🔩 Sparepart
            </Text>
          </TouchableOpacity>
        </View>

        {/* RIWAYAT MOTOR */}
        <RiwayatMotor refreshKey={refreshKey} />
      </View>
    </ScrollView>
  );
}