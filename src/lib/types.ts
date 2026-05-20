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
  originalPrincipalCents: number;
  totalInstalments: number;
  instalmentsAlreadyPaid: number;
  outstandingCents: number;
  rateUnit: RateUnit;
  ratePercent: number;
  loanStartDate: string;
  lastPaymentDate: string;
  payOnDate: string;
  principalPortionCents: number;
}

export interface ScheduleRowStored {
  rowNumber: number;
  dueDate: string;
  daysInPeriod: number;
  principalCents: number;
  interestCents: number;
  totalCents: number;
  outstandingAfterRowCents: number;
}

export interface ScheduledPaymentOutputsStored {
  days: number;
  dailyRate: number;
  monthlyRatePercent: number;
  principalPortionCents: number;
  interestPortionCents: number;
  todayAmountCents: number;
  newOutstandingCents: number;
  nextDueDate: string;
  daysFromPayOnToNextDue: number;
  remainingSchedule: ScheduleRowStored[];
  originalSchedule: ScheduleRowStored[];
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
