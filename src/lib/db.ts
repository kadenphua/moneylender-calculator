import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CalculationRecord } from "./types";

const DB_NAME = "moneylender-calc";
const DB_VERSION = 5;
const STORE = "calculations";

// v5 rebuilt Mode B as a daily-interest model. Map any legacy scheduled record
// onto the new field shape, best-effort, so old records stay readable and the
// new UI never reads `undefined` for a field it renders. Legacy fields are left
// in place (harmless excess). Mutates `value` in place.
function backfillScheduledV5(value: Record<string, unknown>): void {
  if (value["mode"] !== "scheduled") return;
  const inputs = (value["inputs"] ?? {}) as Record<string, unknown>;
  const outputs = (value["outputs"] ?? {}) as Record<string, unknown>;

  // Rate is now always annual; derive from the legacy ratePercent + rateUnit.
  if (typeof inputs["annualRatePercent"] !== "number") {
    const ratePercent =
      typeof inputs["ratePercent"] === "number"
        ? (inputs["ratePercent"] as number)
        : 0;
    inputs["annualRatePercent"] =
      inputs["rateUnit"] === "monthly" ? ratePercent * 12 : ratePercent;
  }
  if (typeof inputs["monthlyPaymentCents"] !== "number") {
    inputs["monthlyPaymentCents"] = 0;
  }

  // Legacy records stored today's interest as interestPortionCents and the
  // principal as principalPortionCents.
  if (typeof outputs["interestCents"] !== "number") {
    outputs["interestCents"] =
      typeof outputs["interestPortionCents"] === "number"
        ? (outputs["interestPortionCents"] as number)
        : 0;
  }
  if (typeof outputs["principalCents"] !== "number") {
    outputs["principalCents"] =
      typeof outputs["principalPortionCents"] === "number"
        ? (outputs["principalPortionCents"] as number)
        : 0;
  }
  for (const key of [
    "days",
    "dailyRate",
    "todayAmountCents",
    "newOutstandingCents",
  ]) {
    if (typeof outputs[key] !== "number") outputs[key] = 0;
  }

  value["inputs"] = inputs;
  value["outputs"] = outputs;
}

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
        if (oldVersion < 3) {
          // v2 -> v3: scheduled records gain loanStartDate and originalSchedule.
          // Pre-v3 scheduled records (if any) fall back to lastPaymentDate as a
          // safe loan-start anchor and an empty original schedule.
          const store = tx.objectStore(STORE);
          let cursor = await store.openCursor();
          while (cursor) {
            const value = cursor.value as unknown as Record<string, unknown>;
            if (value["mode"] === "scheduled") {
              const inputs = (value["inputs"] ?? {}) as Record<string, unknown>;
              const outputs = (value["outputs"] ?? {}) as Record<string, unknown>;
              if (!inputs["loanStartDate"] && inputs["lastPaymentDate"]) {
                inputs["loanStartDate"] = inputs["lastPaymentDate"];
              }
              if (!Array.isArray(outputs["originalSchedule"])) {
                outputs["originalSchedule"] = [];
              }
              if (typeof outputs["monthlyRatePercent"] !== "number") {
                outputs["monthlyRatePercent"] = 0;
              }
              value["inputs"] = inputs;
              value["outputs"] = outputs;
              await cursor.update(value as unknown as CalculationRecord);
            }
            cursor = await cursor.continue();
          }
        }
        if (oldVersion < 4) {
          // v3 -> v4: Mode B rebuilt as annuity amortisation. The old
          // `principalPortionCents` input field becomes `monthlyPaymentCents`
          // (best-effort backfill: principalPortionCents + first-row scheduled
          // interest). Output gains daysInScheduledMonth, prorationFactor and
          // scheduledInterestCents — defaulted safely for legacy records.
          // originalSchedule is left as-is (empty for pre-v3 records per spec).
          const store = tx.objectStore(STORE);
          let cursor = await store.openCursor();
          while (cursor) {
            const value = cursor.value as unknown as Record<string, unknown>;
            if (value["mode"] === "scheduled") {
              const inputs = (value["inputs"] ?? {}) as Record<string, unknown>;
              const outputs = (value["outputs"] ?? {}) as Record<string, unknown>;
              if (typeof inputs["monthlyPaymentCents"] !== "number") {
                const principalPortion =
                  typeof inputs["principalPortionCents"] === "number"
                    ? (inputs["principalPortionCents"] as number)
                    : 0;
                const ratePercentRaw =
                  typeof inputs["ratePercent"] === "number"
                    ? (inputs["ratePercent"] as number)
                    : 0;
                const monthlyRate =
                  typeof outputs["monthlyRatePercent"] === "number" &&
                  (outputs["monthlyRatePercent"] as number) > 0
                    ? (outputs["monthlyRatePercent"] as number)
                    : inputs["rateUnit"] === "annual"
                      ? ratePercentRaw / 12
                      : ratePercentRaw;
                const originalPrincipal =
                  typeof inputs["originalPrincipalCents"] === "number"
                    ? (inputs["originalPrincipalCents"] as number)
                    : 0;
                const unroundedFirstInterest =
                  (originalPrincipal * monthlyRate) / 100;
                const firstRowScheduledInterest = Number.isFinite(
                  unroundedFirstInterest,
                )
                  ? Math.sign(unroundedFirstInterest) *
                    Math.floor(Math.abs(unroundedFirstInterest) + 0.5)
                  : 0;
                inputs["monthlyPaymentCents"] =
                  principalPortion + firstRowScheduledInterest;
              }
              if (typeof outputs["daysInScheduledMonth"] !== "number") {
                outputs["daysInScheduledMonth"] = 0;
              }
              if (typeof outputs["prorationFactor"] !== "number") {
                outputs["prorationFactor"] = 1;
              }
              if (typeof outputs["scheduledInterestCents"] !== "number") {
                outputs["scheduledInterestCents"] =
                  typeof outputs["interestPortionCents"] === "number"
                    ? (outputs["interestPortionCents"] as number)
                    : 0;
              }
              value["inputs"] = inputs;
              value["outputs"] = outputs;
              await cursor.update(value as unknown as CalculationRecord);
            }
            cursor = await cursor.continue();
          }
        }
        if (oldVersion < 5) {
          // v4 -> v5: Mode B rebuilt as a daily-interest model. Map legacy
          // scheduled records onto the new field shape (annualRatePercent,
          // interestCents, principalCents); legacy fields are left untouched.
          const store = tx.objectStore(STORE);
          let cursor = await store.openCursor();
          while (cursor) {
            const value = cursor.value as unknown as Record<string, unknown>;
            if (value["mode"] === "scheduled") {
              backfillScheduledV5(value);
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
  // Read-path safety net: ensure legacy scheduled records carry the v5 fields
  // the new UI renders, even if (somehow) they were never migrated in place.
  backfillScheduledV5(v);
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
