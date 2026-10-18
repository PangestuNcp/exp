import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { buatDatabase } from '../db/database';

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="tertata_06.db"
      onInit={buatDatabase}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </SQLiteProvider>
  );
}