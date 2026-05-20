import { ScheduleComparison } from "@/components/ScheduleComparison";
import {
  centsToReceiptDisplay,
  formatPercent,
  formatSgDateTime,
  formatYmdReceipt,
} from "@/lib/format";
import type {
  CalculationRecord,
  FullSettlementRecord,
  ScheduledPaymentRecord,
} from "@/lib/types";

interface Props {
  record: CalculationRecord;
}

export function PrintReceipt({ record }: Props) {
  return (
    <div className="print-receipt hidden print:block">
      {record.mode === "fullSettlement" ? (
        <FullSettlementReceipt record={record} />
      ) : (
        <ScheduledPaymentReceipt record={record} />
      )}
    </div>
  );
}

function FullSettlementReceipt({ record }: { record: FullSettlementRecord }) {
  const { inputs, outputs } = record;
  const receiptIdShort = record.id.slice(0, 8);
  const printedAt = formatSgDateTime(new Date(record.timestampUtcIso));
  const rateLabel = inputs.rateUnit === "annual" ? "per year" : "per month";

  return (
    <>
      <div className="text-center mb-6">
        <div className="text-xl font-bold">{record.companyName || "—"}</div>
        <div className="text-lg mt-2 tracking-wider">SETTLEMENT QUOTATION</div>
      </div>

      <div className="space-y-1 text-sm mb-4">
        <Row label="Date" value={printedAt} />
        <Row label="Officer" value={record.officerName || "—"} />
        <Row label="Borrower ref" value={inputs.borrowerRef || "—"} />
        <Row label="Receipt ID" value={receiptIdShort} />
      </div>

      <hr className="border-t border-black my-3" />

      <div className="space-y-1 text-sm">
        <Row
          label="Outstanding principal"
          value={centsToReceiptDisplay(inputs.outstandingCents)}
        />
        <Row
          label="Last payment date"
          value={formatYmdReceipt(inputs.lastPaymentDate)}
        />
        <Row
          label="Settlement date"
          value={formatYmdReceipt(inputs.payOnDate)}
        />
        <Row label="Days elapsed" value={String(outputs.days)} />
        <Row
          label="Interest rate"
          value={`${inputs.ratePercent.toFixed(2)}% ${rateLabel}`}
        />
        <Row
          label=""
          value={`(${formatPercent(outputs.dailyRate, 6)} per day)`}
        />
        <Row
          label="Interest accrued"
          value={centsToReceiptDisplay(outputs.interestCents)}
        />
        {outputs.outstandingLateFeeCents > 0 ? (
          <Row
            label="Outstanding late fee"
            value={centsToReceiptDisplay(outputs.outstandingLateFeeCents)}
          />
        ) : null}
      </div>

      <hr className="border-t border-black my-3" />

      <div className="flex justify-between items-baseline text-base font-bold">
        <span>TOTAL TO PAY:</span>
        <span>{centsToReceiptDisplay(outputs.totalCents)}</span>
      </div>

      <hr className="border-t border-black my-3" />

      <div className="mt-12 text-sm">Signature: ______________________</div>
    </>
  );
}

function ScheduledPaymentReceipt({
  record,
}: {
  record: ScheduledPaymentRecord;
}) {
  const { inputs, outputs } = record;
  const receiptIdShort = record.id.slice(0, 8);
  const printedAt = formatSgDateTime(new Date(record.timestampUtcIso));
  const rateLabel = inputs.rateUnit === "annual" ? "per year" : "per month";

  return (
    <>
      <div className="text-center mb-6">
        <div className="text-xl font-bold">{record.companyName || "—"}</div>
        <div className="text-lg mt-2 tracking-wider">
          SCHEDULED PAYMENT QUOTATION (Early/On-time)
        </div>
      </div>

      <div className="space-y-1 text-sm mb-4">
        <Row label="Date" value={printedAt} />
        <Row label="Officer" value={record.officerName || "—"} />
        <Row label="Borrower ref" value={inputs.borrowerRef || "—"} />
        <Row label="Receipt ID" value={receiptIdShort} />
      </div>

      <hr className="border-t border-black my-3" />

      <div className="space-y-1 text-sm">
        <Row
          label="Original loan principal"
          value={centsToReceiptDisplay(inputs.originalPrincipalCents)}
        />
        <Row
          label="Loan start date"
          value={formatYmdReceipt(inputs.loanStartDate)}
        />
        <Row label="Total instalments" value={String(inputs.totalInstalments)} />
        <Row
          label="Instalments already paid"
          value={String(inputs.instalmentsAlreadyPaid)}
        />
        <Row
          label="Outstanding principal"
          value={centsToReceiptDisplay(inputs.outstandingCents)}
        />
        <Row
          label="Last payment date (or loan start date if no payments made yet)"
          value={formatYmdReceipt(inputs.lastPaymentDate)}
        />
        <Row
          label="Pay-on date (today)"
          value={formatYmdReceipt(inputs.payOnDate)}
        />
        <Row
          label="Interest rate"
          value={`${inputs.ratePercent.toFixed(2)}% ${rateLabel}`}
        />
        <Row
          label=""
          value={`(${formatPercent(outputs.dailyRate, 6)} per day)`}
        />
        <Row label="Days since last payment" value={String(outputs.days)} />
      </div>

      <hr className="border-t border-black my-3" />

      <div className="space-y-1 text-sm">
        <Row
          label="Principal portion"
          value={centsToReceiptDisplay(outputs.principalPortionCents)}
        />
        <Row
          label="Interest portion"
          value={centsToReceiptDisplay(outputs.interestPortionCents)}
        />
      </div>

      <hr className="border-t border-black my-3" />

      <div className="flex justify-between items-baseline text-base font-bold">
        <span>TODAY'S AMOUNT:</span>
        <span>{centsToReceiptDisplay(outputs.todayAmountCents)}</span>
      </div>

      <hr className="border-t border-black my-3" />

      <div className="space-y-1 text-sm">
        <Row
          label="Outstanding after this payment"
          value={centsToReceiptDisplay(outputs.newOutstandingCents)}
        />
      </div>

      {outputs.originalSchedule.length > 0 ||
      outputs.remainingSchedule.length > 0 ? (
        <>
          <div className="mt-4">
            <ScheduleComparison
              originalSchedule={outputs.originalSchedule}
              remainingSchedule={outputs.remainingSchedule}
              instalmentsAlreadyPaid={inputs.instalmentsAlreadyPaid}
              variant="receipt"
            />
          </div>

          <p className="mt-3 text-xs italic">
            Note: Schedule recalculated based on actual payment date.
          </p>
        </>
      ) : null}

      <hr className="border-t border-black my-3" />

      <div className="mt-12 text-sm">Signature: ______________________</div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
