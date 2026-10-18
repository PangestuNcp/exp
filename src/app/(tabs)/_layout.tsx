import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="transaksi"
        options={{
          title: 'Transaksi',
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="aset"
        options={{
          title: 'Aset',
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="motor"
        options={{
          title: 'Motor',
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          headerShown: false,
        }}
      />
    </Tabs>
  );
}