import { DatabaseManager } from './manager';
import * as SQLite from 'expo-sqlite';

// Creating a type-safe mock that matches the expo-sqlite interface
const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  withTransactionAsync: jest.fn(async (callback) => {
    return await callback();
  }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  closeAsync: jest.fn().mockResolvedValue(undefined),
} as unknown as SQLite.SQLiteDatabase;

describe('DatabaseManager', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new DatabaseManager(mockDb);
  });

  describe('Initialization', () => {
    it('should initialize the schema using execAsync', async () => {
      await manager.initialize();
      expect(mockDb.execAsync).toHaveBeenCalled();
      const sql = (mockDb.execAsync as jest.Mock).mock.calls[0][0];
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS user_profile');
    });
  });

  describe('Symptom Operations', () => {
    it('should insert a symptom and return the ID', async () => {
      (mockDb.runAsync as jest.Mock).mockResolvedValueOnce({ lastInsertRowId: 42 });
      
      const id = await manager.insertSymptom('Back pain');
      
      expect(id).toBe('42');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO daily_symptoms'),
        'Back pain'
      );
    });
  });

  describe('Visit Operations', () => {
    it('should insert a full visit within a transaction', async () => {
      (mockDb.runAsync as jest.Mock).mockResolvedValue({ lastInsertRowId: 100 });
      
      const summary = { 
        english_transcript: 'Checkup', 
        summary_vector: new Array(1024).fill(0.1) 
      };
      const actionItems = [
        { action_type: 'medication' as any, action_description: { name: 'Advil' } }
      ];
      const translation = { 
        translated_language: 'Spanish', 
        translated_text: 'Chequeo' 
      };

      const summaryId = await manager.insertVisit(summary as any, actionItems as any, translation as any);

      expect(summaryId).toBe(100);
      expect(mockDb.withTransactionAsync).toHaveBeenCalled();
      // 1. summary, 2. vector, 3. action item, 4. translation
      expect(mockDb.runAsync).toHaveBeenCalledTimes(4);
    });
  });
});
