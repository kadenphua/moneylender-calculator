import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { centsToDisplay } from "@/lib/calc";
import {
  formatPercent,
  formatSgDateTime,
  formatYmdShort,
} from "@/lib/format";
import type {
  CalculationRecord,
  FullSettlementRecord,
  ScheduledPaymentRecord,
} from "@/lib/types";

interface Props {
  records: CalculationRecord[];
}

const modeLabel: Record<CalculationRecord["mode"], string> = {
  fullSettlement: "Full Settlement",
  scheduled: "Scheduled",
};

function rowAmount(record: CalculationRecord): number {
  return record.mode === "fullSettlement"
    ? record.outputs.totalCents
    : record.outputs.todayAmountCents;
}

export function History({ records }: Props) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<CalculationRecord | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (q && !r.inputs.borrowerRef.toLowerCase().includes(q)) return false;
      const ymd = r.timestampUtcIso.slice(0, 10);
      if (from && ymd < from) return false;
      if (to && ymd > to) return false;
      return true;
    });
  }, [records, search, from, to]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="search">Search by borrower ref</Label>
            <Input
              id="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to filter"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date &amp; time (SGT)</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Borrower ref</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No calculations match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="font-mono text-xs">
                      {formatSgDateTime(new Date(r.timestampUtcIso))}
                    </TableCell>
                    <TableCell>{modeLabel[r.mode]}</TableCell>
                    <TableCell>{r.inputs.borrowerRef || "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {centsToDisplay(r.inputs.outstandingCents)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.outputs.days}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {centsToDisplay(rowAmount(r))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selected ? <RecordDetail record={selected} /> : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RecordDetail({ record }: { record: CalculationRecord }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {modeLabel[record.mode]} — calculation detail
        </DialogTitle>
        <DialogDescription className="font-mono text-xs">
          ID {record.id.slice(0, 8)} ·{" "}
          {formatSgDateTime(new Date(record.timestampUtcIso))} SGT
        </DialogDescription>
      </DialogHeader>
      {record.mode === "fullSettlement" ? (
        <FullSettlementDetail record={record} />
      ) : (
        <ScheduledPaymentDetail record={record} />
      )}
    </>
  );
}

function FullSettlementDetail({ record }: { record: FullSettlementRecord }) {
  const { inputs, outputs } = record;
  return (
    <div className="space-y-2 text-sm">
      <DetailRow label="Officer" value={record.officerName} />
      <DetailRow label="Company" value={record.companyName || "—"} />
      <DetailRow label="Borrower ref" value={inputs.borrowerRef || "—"} />
      <Separator />
      <DetailRow
        label="Outstanding principal"
        value={centsToDisplay(inputs.outstandingCents)}
      />
      <DetailRow
        label="Interest rate"
        value={`${inputs.ratePercent}% ${
          inputs.rateUnit === "annual" ? "per year" : "per month"
        }`}
      />
      <DetailRow
        label="Last payment"
        value={formatYmdShort(inputs.lastPaymentDate)}
      />
      <DetailRow
        label="Pay-on date"
        value={formatYmdShort(inputs.payOnDate)}
      />
      <DetailRow
        label="Outstanding late fee"
        value={centsToDisplay(inputs.outstandingLateFeeCents)}
      />
      <Separator />
      <DetailRow label="Days" value={String(outputs.days)} />
      <DetailRow
        label="Daily rate"
        value={formatPercent(outputs.dailyRate, 6)}
      />
      <DetailRow
        label="Interest accrued"
        value={centsToDisplay(outputs.interestCents)}
      />
      <Separator />
      <div className="flex justify-between items-baseline pt-2">
        <span className="font-semibold">TOTAL</span>
        <span className="font-mono font-bold text-lg">
          {centsToDisplay(outputs.totalCents)}
        </span>
      </div>
    </div>
  );
}

function ScheduledPaymentDetail({
  record,
}: {
  record: ScheduledPaymentRecord;
}) {
  const { inputs, outputs } = record;
  return (
    <div className="space-y-2 text-sm">
      <DetailRow label="Officer" value={record.officerName} />
      <DetailRow label="Company" value={record.companyName || "—"} />
      <DetailRow label="Borrower ref" value={inputs.borrowerRef || "—"} />
      <Separator />
      <DetailRow
        label="Original principal"
        value={centsToDisplay(inputs.originalPrincipalCents)}
      />
      <DetailRow
        label="Total instalments"
        value={String(inputs.totalInstalments)}
      />
      <DetailRow
        label="Already paid"
        value={String(inputs.instalmentsAlreadyPaid)}
      />
      <DetailRow
        label="Outstanding principal"
        value={centsToDisplay(inputs.outstandingCents)}
      />
      <DetailRow
        label="Interest rate"
        value={`${inputs.ratePercent}% ${
          inputs.rateUnit === "annual" ? "per year" : "per month"
        }`}
      />
      <DetailRow
        label="Last payment"
        value={formatYmdShort(inputs.lastPaymentDate)}
      />
      <DetailRow
        label="Pay-on date"
        value={formatYmdShort(inputs.payOnDate)}
      />
      <Separator />
      <DetailRow label="Days" value={String(outputs.days)} />
      <DetailRow
        label="Daily rate"
        value={formatPercent(outputs.dailyRate, 6)}
      />
      <DetailRow
        label="Principal portion"
        value={centsToDisplay(outputs.principalPortionCents)}
      />
      <DetailRow
        label="Interest portion"
        value={centsToDisplay(outputs.interestPortionCents)}
      />
      <Separator />
      <div className="flex justify-between items-baseline pt-2">
        <span className="font-semibold">TODAY'S AMOUNT</span>
        <span className="font-mono font-bold text-lg">
          {centsToDisplay(outputs.todayAmountCents)}
        </span>
      </div>
      <DetailRow
        label="New outstanding"
        value={centsToDisplay(outputs.newOutstandingCents)}
      />
      <DetailRow
        label="Next due date"
        value={formatYmdShort(outputs.nextDueDate)}
      />
      <DetailRow
        label="Days to next due"
        value={`${outputs.daysFromPayOnToNextDue} days`}
      />

      {outputs.remainingSchedule.length > 0 ? (
        <>
          <Separator />
          <p className="text-sm font-semibold">
            Remaining schedule ({outputs.remainingSchedule.length})
          </p>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outputs.remainingSchedule.map((r) => (
                  <TableRow key={r.rowNumber}>
                    <TableCell className="font-mono text-xs">
                      {formatYmdShort(r.dueDate)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.daysInPeriod}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {centsToDisplay(r.principalCents)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {centsToDisplay(r.interestCents)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {centsToDisplay(r.totalCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
