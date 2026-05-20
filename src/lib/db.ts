import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CalculationRecord } from "./types";

const DB_NAME = "moneylender-calc";
const DB_VERSION = 2;
const STORE = "calculations";

interface MoneylenderDB extends DBSchema {
  calculations: {
    key: string;
    value: CalculationRecord;
    indexes: { "by-timestamp": string };
  };
}

let dbPromise: Promise<IDBPDatabase<MoneylenderDB>> | null = null;

function getDb(): Promise<IDBPDatabase<MoneylenderDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MoneylenderDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("by-timestamp", "timestampUtcIso");
        }
        if (oldVersion < 2) {
          // v1 -> v2: Stage 1 records have no `mode` field. Backfill them as
          // 'fullSettlement' so the discriminated union holds for all records.
          const store = tx.objectStore(STORE);
          let cursor = await store.openCursor();
          while (cursor) {
            const value = cursor.value as unknown as Record<string, unknown>;
            if (!value["mode"]) {
              value["mode"] = "fullSettlement";
              await cursor.update(value as unknown as CalculationRecord);
            }
            cursor = await cursor.continue();
          }
        }
      },
    });
  }
  return dbPromise;
}

function normaliseRecord(value: CalculationRecord): CalculationRecord {
  const v = value as unknown as Record<string, unknown>;
  if (!v["mode"]) {
    v["mode"] = "fullSettlement";
  }
  return v as unknown as CalculationRecord;
}

export async function saveCalculation(record: CalculationRecord): Promise<void> {
  const db = await getDb();
  await db.put(STORE, record);
}

export async function listCalculations(): Promise<CalculationRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE, "by-timestamp");
  return all.map(normaliseRecord).reverse();
}

export async function clearCalculations(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}
