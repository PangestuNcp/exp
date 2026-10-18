import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';


import Audit from '../../fitur/profil/Audit';
import HutangPiutang from '../../fitur/profil/HutangPiutang';
import KoreksiTransaksi from '../../fitur/profil/KoreksiTransaksi';
import LaporanBulanan from '../../fitur/profil/LaporanBulanan';
import Settlement from '../../fitur/profil/Settlement';

import SetModal from '../../fitur/profil/SetModal';
import Target from '../../fitur/profil/Target';
import TentangTertata from '../../fitur/profil/TentangTertata';

type Menu =
  | 'hutang'
  | 'audit'
  | 'settlement'
  | 'laporan'
  | 'koreksi'
  | 'target'
  | 'modal'
  | 'tentang'
  | null;

export default function ProfilScreen() {
  const [menuAktif, setMenuAktif] = useState<Menu>(null);

  const bukaMenu = (menu: Exclude<Menu, null>) => {
    setMenuAktif(menu);
  };

  const tutupMenu = () => {
    setMenuAktif(null);
  };

  const judulMenu = () => {
    switch (menuAktif) {
      case 'hutang':
        return 'Hutang & Piutang';

      case 'audit':
        return 'Audit / Rekonsiliasi';

      case 'settlement':
        return 'Settlement';

      case 'laporan':
        return 'Laporan Bulanan';

      case 'koreksi':
        return 'Koreksi Transaksi';

      case 'target':
        return 'Target';

      case 'modal':
        return 'Set Modal';

      case 'tentang':
        return 'Tentang Tertata';

      default:
        return '';
    }
  };

  const renderFitur = () => {
    switch (menuAktif) {
      case 'hutang':
        return (
          <HutangPiutang
            onSelesai={() => {
              tutupMenu();
            }}
          />
        );

      case 'audit':
        return <Audit />;

      case 'settlement':
        return <Settlement />;

      case 'laporan':
        return <LaporanBulanan />;

      case 'koreksi':
        return <KoreksiTransaksi />;

      case 'target':
        return <Target />;

      case 'modal':
        return <SetModal />;

      case 'tentang':
        return <TentangTertata />;

      default:
        return null;
    }
  };

  const MenuItem = ({
    title,
    subtitle,
    menu,
  }: {
    title: string;
    subtitle: string;
    menu: Exclude<Menu, null>;
  }) => {
    return (
      <TouchableOpacity
        onPress={() => bukaMenu(menu)}
        activeOpacity={0.7}
        style={{
          paddingVertical: 16,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#eeeeee',
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: '#111111',
          }}
        >
          {title}
        </Text>

        <Text
          style={{
            marginTop: 5,
            fontSize: 13,
            color: '#777777',
          }}
        >
          {subtitle}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 40,
        }}
      >
        <Text
          style={{
            fontSize: 30,
            fontWeight: 'bold',
            color: '#111111',
            marginBottom: 6,
          }}
        >
          Profil
        </Text>

        <Text
          style={{
            fontSize: 14,
            color: '#777777',
            marginBottom: 28,
          }}
        >
          Pengaturan dan pengelolaan data Tertata
        </Text>

        {/* KEUANGAN */}
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: '#777777',
            marginBottom: 8,
          }}
        >
          KEUANGAN
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#eeeeee',
            borderRadius: 14,
            overflow: 'hidden',
            marginBottom: 26,
          }}
        >
          <MenuItem
            title="Settlement"
            subtitle="Kelola periode dan penutupan keuangan"
            menu="settlement"
          />

          <MenuItem
            title="Laporan Bulanan"
            subtitle="Lihat pendapatan dan pengeluaran berdasarkan bulan"
            menu="laporan"
          />

          <MenuItem
            title="Audit / Rekonsiliasi"
            subtitle="Periksa kesesuaian saldo aplikasi dengan kondisi sebenarnya"
            menu="audit"
          />

          <MenuItem
            title="Koreksi Transaksi"
            subtitle="Edit dan perbaiki transaksi yang salah"
            menu="koreksi"
          />

          <MenuItem
            title="Hutang & Piutang"
            subtitle="Kelola hutang, piutang, dan pembayarannya"
            menu="hutang"
          />
        </View>

        {/* PENGATURAN */}
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: '#777777',
            marginBottom: 8,
          }}
        >
          PENGATURAN
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#eeeeee',
            borderRadius: 14,
            overflow: 'hidden',
            marginBottom: 26,
          }}
        >
          <MenuItem
            title="Target"
            subtitle="Atur target pendapatan harian"
            menu="target"
          />

          <MenuItem
            title="Set Modal"
            subtitle="Atur saldo awal setiap aset"
            menu="modal"
          />
        </View>

        {/* LAINNYA */}
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: '#777777',
            marginBottom: 8,
          }}
        >
          LAINNYA
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#eeeeee',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <MenuItem
            title="Tentang Tertata"
            subtitle="Informasi mengenai aplikasi Tertata"
            menu="tentang"
          />
        </View>
      </ScrollView>

      <Modal
        visible={menuAktif !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={tutupMenu}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#ffffff',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: '#eeeeee',
            }}
          >
            <Pressable
              onPress={tutupMenu}
              style={{
                paddingVertical: 6,
                paddingRight: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  color: '#333333',
                }}
              >
                Kembali
              </Text>
            </Pressable>

            <Text
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 17,
                fontWeight: '700',
                color: '#111111',
              }}
            >
              {judulMenu()}
            </Text>

            <View style={{ width: 64 }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom: 40,
            }}
          >
            {renderFitur()}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}