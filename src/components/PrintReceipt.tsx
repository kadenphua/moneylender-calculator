import { CalculationBreakdown } from "@/components/CalculationBreakdown";
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
        <Row label="Days elapsed" value={`${outputs.days} days (30/360)`} />
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

      <CalculationBreakdown record={record} variant="receipt" />

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

  return (
    <>
      <div className="text-center mb-6">
        <div className="text-xl font-bold">{record.companyName || "—"}</div>
        <div className="text-lg mt-2 tracking-wider">
          SCHEDULED PAYMENT QUOTATION
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
          label="Current outstanding"
          value={centsToReceiptDisplay(inputs.outstandingCents)}
        />
        <Row
          label="Interest rate"
          value={`${inputs.annualRatePercent}% per year`}
        />
        <Row
          label="Monthly payment"
          value={centsToReceiptDisplay(inputs.monthlyPaymentCents)}
        />
        <Row
          label="Last payment date"
          value={formatYmdReceipt(inputs.lastPaymentDate)}
        />
        <Row label="Pay-on date" value={formatYmdReceipt(inputs.payOnDate)} />
        <Row
          label="Days since last payment"
          value={`${outputs.days} days (30/360)`}
        />
      </div>

      <hr className="border-t border-black my-3" />

      <div className="space-y-1 text-sm">
        <Row
          label="Interest (this payment)"
          value={centsToReceiptDisplay(outputs.interestCents)}
        />
        <Row
          label="Principal portion"
          value={centsToReceiptDisplay(outputs.principalCents)}
        />
      </div>

      <hr className="border-t border-black my-3" />

      <div className="flex justify-between items-baseline text-base font-bold">
        <span>TODAY'S AMOUNT:</span>
        <span>{centsToReceiptDisplay(outputs.todayAmountCents)}</span>
      </div>

      <div className="space-y-1 text-sm mt-1">
        <Row
          label="New outstanding"
          value={centsToReceiptDisplay(outputs.newOutstandingCents)}
        />
      </div>

      <CalculationBreakdown record={record} variant="receipt" />

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
