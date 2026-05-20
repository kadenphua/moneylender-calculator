import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { v4 as uuidv4 } from "uuid";
import { Printer, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import {
  calculateFullSettlement,
  centsToDisplay,
  dollarsToCents,
} from "@/lib/calc";
import { formatPercent, parseYmdLocal, todayYmdLocal } from "@/lib/format";
import {
  calculatorFormSchema,
  type CalculatorFormParsed,
  type CalculatorFormValues,
} from "@/lib/schema";
import { saveCalculation } from "@/lib/db";
import type { FullSettlementRecord } from "@/lib/types";

interface Props {
  officerName: string;
  companyName: string;
  onCalculation: (record: FullSettlementRecord) => void;
}

export function ModeAFullSettlement({
  officerName,
  companyName,
  onCalculation,
}: Props) {
  const [result, setResult] = useState<FullSettlementRecord | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CalculatorFormValues, unknown, CalculatorFormParsed>({
    resolver: zodResolver(calculatorFormSchema),
    defaultValues: {
      borrowerRef: "",
      outstandingDollars: undefined,
      rateUnit: "annual",
      ratePercent: undefined,
      lastPaymentDate: "",
      payOnDate: todayYmdLocal(),
      outstandingLateFeeDollars: 0,
    },
  });

  async function onSubmit(values: CalculatorFormParsed) {
    const outstandingCents = dollarsToCents(values.outstandingDollars);
    const outstandingLateFeeCents = dollarsToCents(
      values.outstandingLateFeeDollars,
    );

    const outputs = calculateFullSettlement({
      outstandingCents,
      rateUnit: values.rateUnit,
      ratePercent: values.ratePercent,
      lastPaymentDate: parseYmdLocal(values.lastPaymentDate),
      payOnDate: parseYmdLocal(values.payOnDate),
      outstandingLateFeeCents,
    });

    const record: FullSettlementRecord = {
      mode: "fullSettlement",
      id: uuidv4(),
      timestampUtcIso: new Date().toISOString(),
      officerName,
      companyName,
      inputs: {
        borrowerRef: values.borrowerRef.trim(),
        outstandingCents,
        rateUnit: values.rateUnit,
        ratePercent: values.ratePercent,
        lastPaymentDate: values.lastPaymentDate,
        payOnDate: values.payOnDate,
        outstandingLateFeeCents,
      },
      outputs,
    };

    await saveCalculation(record);
    setResult(record);
    onCalculation(record);
  }

  function handleNewCalculation() {
    setResult(null);
    reset({
      borrowerRef: "",
      outstandingDollars: undefined,
      rateUnit: "annual",
      ratePercent: undefined,
      lastPaymentDate: "",
      payOnDate: todayYmdLocal(),
      outstandingLateFeeDollars: 0,
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Full Settlement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field
              label="Borrower reference (optional)"
              htmlFor="borrowerRef"
              error={errors.borrowerRef?.message}
            >
              <Input
                id="borrowerRef"
                maxLength={50}
                placeholder="e.g. Loan #1234 / Jane Tan"
                {...register("borrowerRef")}
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Outstanding principal ($)"
                htmlFor="outstandingDollars"
                error={errors.outstandingDollars?.message}
              >
                <Input
                  id="outstandingDollars"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register("outstandingDollars", { valueAsNumber: true })}
                />
              </Field>

              <Field
                label="Outstanding late fee ($, optional)"
                htmlFor="outstandingLateFeeDollars"
                error={errors.outstandingLateFeeDollars?.message}
              >
                <Input
                  id="outstandingLateFeeDollars"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register("outstandingLateFeeDollars", {
                    valueAsNumber: true,
                  })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
              <Field
                label="Interest rate (%)"
                htmlFor="ratePercent"
                error={errors.ratePercent?.message}
              >
                <Input
                  id="ratePercent"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 48"
                  {...register("ratePercent", { valueAsNumber: true })}
                />
              </Field>

              <Controller
                control={control}
                name="rateUnit"
                render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <Label>Unit</Label>
                    <div
                      role="group"
                      className="inline-flex rounded-md border bg-background p-0.5"
                    >
                      <button
                        type="button"
                        className={toggleClass(field.value === "monthly")}
                        onClick={() => field.onChange("monthly")}
                      >
                        Per month
                      </button>
                      <button
                        type="button"
                        className={toggleClass(field.value === "annual")}
                        onClick={() => field.onChange("annual")}
                      >
                        Per year
                      </button>
                    </div>
                  </div>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Last payment date"
                htmlFor="lastPaymentDate"
                error={errors.lastPaymentDate?.message}
              >
                <Input
                  id="lastPaymentDate"
                  type="date"
                  {...register("lastPaymentDate")}
                />
              </Field>

              <Field
                label="Pay-on date"
                htmlFor="payOnDate"
                error={errors.payOnDate?.message}
              >
                <Input
                  id="payOnDate"
                  type="date"
                  {...register("payOnDate")}
                />
              </Field>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 text-base font-semibold"
            >
              Calculate
            </Button>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <ResultPanel
          record={result}
          onPrint={() => window.print()}
          onNew={handleNewCalculation}
        />
      ) : null}
    </div>
  );
}

function toggleClass(active: boolean): string {
  return [
    "px-3 py-1.5 text-sm rounded transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted",
  ].join(" ");
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function ResultPanel({
  record,
  onPrint,
  onNew,
}: {
  record: FullSettlementRecord;
  onPrint: () => void;
  onNew: () => void;
}) {
  const { inputs, outputs } = record;
  const hasLateFee = outputs.outstandingLateFeeCents > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Result</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ResultRow label="Days" value={String(outputs.days)} />
        <ResultRow
          label="Daily rate"
          value={formatPercent(outputs.dailyRate, 6)}
        />
        <ResultRow
          label="Interest accrued"
          value={centsToDisplay(outputs.interestCents)}
        />
        {hasLateFee ? (
          <ResultRow
            label="Outstanding late fee"
            value={centsToDisplay(outputs.outstandingLateFeeCents)}
          />
        ) : null}
        <Separator />
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold">TOTAL TO PAY</span>
          <span className="text-3xl font-bold tracking-tight">
            {centsToDisplay(outputs.totalCents)}
          </span>
        </div>
        {inputs.borrowerRef ? (
          <p className="text-sm text-muted-foreground">
            Borrower: {inputs.borrowerRef}
          </p>
        ) : null}
        <Separator />
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button onClick={onPrint} variant="default" className="flex-1">
            <Printer className="mr-2 h-4 w-4" />
            Print Receipt
          </Button>
          <Button onClick={onNew} variant="outline" className="flex-1">
            <RotateCcw className="mr-2 h-4 w-4" />
            New Calculation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
