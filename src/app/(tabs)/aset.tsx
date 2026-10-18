import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import CashOut from '../../fitur/aset/perpindahanSaldo/CashOut';
import TopUp from '../../fitur/aset/perpindahanSaldo/TopUp';
import Transfer from '../../fitur/aset/perpindahanSaldo/Transfer';
import Riwayat from '../../fitur/aset/Riwayat';
import TotalAset from '../../fitur/aset/TotalAset';

type MenuPerpindahan = 'transfer' | 'topup' | 'cashout';

export default function AsetScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] =
    useState<MenuPerpindahan | null>(null);

  const refreshAset = () => {
    setRefreshKey((nilai) => nilai + 1);
  };

  const tutupModal = () => {
    setModal(null);
    setTimeout(() => {
      setRefreshKey((nilai) => nilai + 1);
    }, 250);
  };

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((nilai) => nilai + 1);
    }, [])
  );


  return (
    <View style={styles.screen}>
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <TotalAset refreshKey={refreshKey} />

      <View style={styles.menuContainer}>
        <TouchableOpacity
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: modal === 'transfer' }}
          onPress={() => setModal('transfer')}
          style={[
            styles.menuButton,
            modal === 'transfer' && styles.menuButtonAktif,
          ]}
        >
          <Text
            style={[
              styles.menuText,
              modal === 'transfer' && styles.menuTextAktif,
            ]}
          >
            Transfer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: modal === 'topup' }}
          onPress={() => setModal('topup')}
          style={[
            styles.menuButton,
            modal === 'topup' && styles.menuButtonAktif,
          ]}
        >
          <Text
            style={[
              styles.menuText,
              modal === 'topup' && styles.menuTextAktif,
            ]}
          >
            TopUp
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: modal === 'cashout' }}
          onPress={() => setModal('cashout')}
          style={[
            styles.menuButton,
            modal === 'cashout' && styles.menuButtonAktif,
          ]}
        >
          <Text
            style={[
              styles.menuText,
              modal === 'cashout' && styles.menuTextAktif,
            ]}
          >
            CashOut
          </Text>
        </TouchableOpacity>
      </View>

      <Riwayat refreshKey={refreshKey} />
    </ScrollView>

    <Modal
      visible={modal !== null}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={tutupModal}
    >
      <View style={styles.modalOverlay}>
        <BlurView
          intensity={100}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          style={styles.modalDim}
          onPress={tutupModal}
        />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {modal === 'transfer'
                ? 'Transfer'
                : modal === 'topup'
                ? 'Top Up'
                : 'Cash Out'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tutup formulir"
              hitSlop={10}
              onPress={tutupModal}
              style={styles.modalCloseButton}
            >
              <Ionicons
                name="close"
                size={22}
                color="#63818A"
              />
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {modal === 'transfer' && (
              <Transfer onSelesai={tutupModal} />
            )}
            {modal === 'topup' && (
              <TopUp onSelesai={tutupModal} />
            )}
            {modal === 'cashout' && (
              <CashOut onSelesai={tutupModal} />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F9F8',
  },
  content: {
    paddingBottom: 24,
  },
  menuContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  menuButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4EBE7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonAktif: {
    backgroundColor: '#E5F1EA',
    borderColor: '#55A982',
  },
  menuText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#63818A',
    textAlign: 'center',
  },
  menuTextAktif: {
    color: '#277B67',
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: '22%',
    paddingHorizontal: '4%',
    paddingVertical: '4%',
  },
  modalDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 35, 31, 0.28)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    height: '100%',
    maxHeight: '95%',
    backgroundColor: '#F7F8F4',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#0C2923',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  modalHeader: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4EBE7',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#164B57',
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8F4',
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
});
