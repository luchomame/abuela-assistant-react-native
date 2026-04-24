import * as SQLite from 'expo-sqlite';
import { DatabaseManager } from '@/lib/database/manager';

let dbManager: DatabaseManager | null = null;

export async function getDbManager(): Promise<DatabaseManager> {
  if (dbManager) {
    return dbManager;
  }

  const db = await SQLite.openDatabaseAsync('abuela.db');
  dbManager = new DatabaseManager(db);
  await dbManager.initialize();
  return dbManager;
}
