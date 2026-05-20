import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CalculationRecord } from "./types";

const DB_NAME = "moneylender-calc";
const DB_VERSION = 1;
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
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("by-timestamp", "timestampUtcIso");
        }
      },
    });
  }
  return dbPromise;
}

export async function saveCalculation(record: CalculationRecord): Promise<void> {
  const db = await getDb();
  await db.put(STORE, record);
}

export async function listCalculations(): Promise<CalculationRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE, "by-timestamp");
  return all.reverse();
}

export async function clearCalculations(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}
