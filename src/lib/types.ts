import type { CalculationMode, RateUnit } from "./calc";

export interface FullSettlementInputsStored {
  borrowerRef: string;
  outstandingCents: number;
  rateUnit: RateUnit;
  ratePercent: number;
  lastPaymentDate: string;
  payOnDate: string;
  outstandingLateFeeCents: number;
}

export interface FullSettlementOutputsStored {
  days: number;
  dailyRate: number;
  interestCents: number;
  outstandingLateFeeCents: number;
  totalCents: number;
}

export interface ScheduledPaymentInputsStored {
  borrowerRef: string;
  outstandingCents: number;
  annualRatePercent: number;
  monthlyPaymentCents: number;
  lastPaymentDate: string;
  payOnDate: string;
}

export interface ScheduledPaymentOutputsStored {
  days: number;
  dailyRate: number;
  interestCents: number;
  principalCents: number;
  todayAmountCents: number;
  newOutstandingCents: number;
}

interface RecordBase {
  id: string;
  timestampUtcIso: string;
  officerName: string;
  companyName: string;
}

export interface FullSettlementRecord extends RecordBase {
  mode: "fullSettlement";
  inputs: FullSettlementInputsStored;
  outputs: FullSettlementOutputsStored;
}

export interface ScheduledPaymentRecord extends RecordBase {
  mode: "scheduled";
  inputs: ScheduledPaymentInputsStored;
  outputs: ScheduledPaymentOutputsStored;
}

export type CalculationRecord = FullSettlementRecord | ScheduledPaymentRecord;

export type { CalculationMode };
