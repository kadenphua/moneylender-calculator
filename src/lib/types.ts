import type { RateUnit } from "./calc";

export interface CalculationInputs {
  borrowerRef: string;
  outstandingCents: number;
  rateUnit: RateUnit;
  ratePercent: number;
  lastPaymentDate: string;
  payOnDate: string;
  outstandingLateFeeCents: number;
}

export interface CalculationOutputs {
  days: number;
  dailyRate: number;
  interestCents: number;
  outstandingLateFeeCents: number;
  totalCents: number;
}

export interface CalculationRecord {
  id: string;
  timestampUtcIso: string;
  officerName: string;
  companyName: string;
  inputs: CalculationInputs;
  outputs: CalculationOutputs;
}
