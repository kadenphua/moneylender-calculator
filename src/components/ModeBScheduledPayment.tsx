import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { v4 as uuidv4 } from "uuid";
import { Printer, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import {
  calculateScheduledPayment,
  centsToDisplay,
  dollarsToCents,
} from "@/lib/calc";
import {
  formatEquivalentRate,
  parseYmdLocal,
  todayYmdLocal,
} from "@/lib/format";
import {
  scheduledPaymentFormSchema,
  type ScheduledPaymentFormParsed,
  type ScheduledPaymentFormValues,
} from "@/lib/schema";
import { saveCalculation } from "@/lib/db";
import type { ScheduledPaymentRecord } from "@/lib/types";

interface Props {
  officerName: string;
  companyName: string;
  onCalculation: (record: ScheduledPaymentRecord) => void;
}

const defaultValues: ScheduledPaymentFormValues = {
  borrowerRef: "",
  outstandingDollars: undefined,
  annualRatePercent: undefined,
  monthlyPaymentDollars: undefined,
  lastPaymentDate: "",
  payOnDate: todayYmdLocal(),
};

export function ModeBScheduledPayment({
  officerName,
  companyName,
  onCalculation,
}: Props) {
  const [result, setResult] = useState<ScheduledPaymentRecord | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ScheduledPaymentFormValues, unknown, ScheduledPaymentFormParsed>({
    resolver: zodResolver(scheduledPaymentFormSchema),
    defaultValues,
    mode: "onChange",
  });

  // Live equivalent rate beside the (always-annual) rate input, e.g.
  // 41 → "= 3.42% per month". Helps the officer sanity-check the figure.
  const watchedRate = watch("annualRatePercent");
  const equivalentRateHint = useMemo<string | null>(
    () => formatEquivalentRate(watchedRate, "annual"),
    [watchedRate],
  );

  async function onSubmit(values: ScheduledPaymentFormParsed) {
    const outstandingCents = dollarsToCents(values.outstandingDollars);
    const monthlyPaymentCents = dollarsToCents(values.monthlyPaymentDollars);

    const outputs = calculateScheduledPayment({
      outstandingCents,
      annualRatePercent: values.annualRatePercent,
      monthlyPaymentCents,
      lastPaymentDate: parseYmdLocal(values.lastPaymentDate),
      payOnDate: parseYmdLocal(values.payOnDate),
    });

    const record: ScheduledPaymentRecord = {
      mode: "scheduled",
      id: uuidv4(),
      timestampUtcIso: new Date().toISOString(),
      officerName,
      companyName,
      inputs: {
        borrowerRef: values.borrowerRef.trim(),
        outstandingCents,
        annualRatePercent: values.annualRatePercent,
        monthlyPaymentCents,
        lastPaymentDate: values.lastPaymentDate,
        payOnDate: values.payOnDate,
      },
      outputs,
    };

    await saveCalculation(record);
    setResult(record);
    onCalculation(record);
  }

  function handleNewCalculation() {
    setResult(null);
    reset(defaultValues);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Payment (Early / On-time)</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field
              label="Borrower reference (optional)"
              htmlFor="b-borrowerRef"
              error={errors.borrowerRef?.message}
            >
              <Input
                id="b-borrowerRef"
                maxLength={50}
                placeholder="e.g. Loan #1234 / Jane Tan"
                {...register("borrowerRef")}
              />
            </Field>

            <Field
              label="Current outstanding ($)"
              htmlFor="b-outstandingDollars"
              error={errors.outstandingDollars?.message}
            >
              <Input
                id="b-outstandingDollars"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register("outstandingDollars", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                The CRM's "principal left".
              </p>
            </Field>

            <Field
              label="Annual interest rate (%)"
              htmlFor="b-annualRatePercent"
              error={errors.annualRatePercent?.message}
            >
              <Input
                id="b-annualRatePercent"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="e.g. 41"
                {...register("annualRatePercent", { valueAsNumber: true })}
              />
              {equivalentRateHint ? (
                <p className="text-xs text-muted-foreground">
                  {equivalentRateHint}
                </p>
              ) : null}
            </Field>

            <Field
              label="Monthly payment amount ($)"
              htmlFor="b-monthlyPaymentDollars"
              error={errors.monthlyPaymentDollars?.message}
            >
              <Input
                id="b-monthlyPaymentDollars"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register("monthlyPaymentDollars", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                From the CRM or Note of Contract.
              </p>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Last payment date"
                htmlFor="b-lastPaymentDate"
                error={errors.lastPaymentDate?.message}
              >
                <Input
                  id="b-lastPaymentDate"
                  type="date"
                  {...register("lastPaymentDate")}
                />
              </Field>

              <Field
                label="Pay-on date (today, or a future date if quoting)"
                htmlFor="b-payOnDate"
                error={errors.payOnDate?.message}
              >
                <Input
                  id="b-payOnDate"
                  type="date"
                  {...register("payOnDate")}
                />
              </Field>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !isValid}
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

function formatRate(annualRatePercent: number): string {
  // "41% per year (= 3.42% per month)". The monthly equivalent reuses the
  // shared helper so it matches the live hint beside the input.
  const monthly = formatEquivalentRate(annualRatePercent, "annual");
  return `${annualRatePercent}% per year${monthly ? ` (${monthly})` : ""}`;
}

function ResultPanel({
  record,
  onPrint,
  onNew,
}: {
  record: ScheduledPaymentRecord;
  onPrint: () => void;
  onNew: () => void;
}) {
  const { inputs, outputs } = record;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Result</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ResultRow label="Days since last payment" value={String(outputs.days)} />
        <ResultRow
          label="Interest rate"
          value={formatRate(inputs.annualRatePercent)}
        />
        <Separator />
        <ResultRow
          label="Interest (this payment)"
          value={centsToDisplay(outputs.interestCents)}
        />
        <ResultRow
          label="Principal portion"
          value={centsToDisplay(outputs.principalCents)}
        />
        <Separator />
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold">TODAY'S AMOUNT</span>
          <span className="text-3xl font-bold tracking-tight">
            {centsToDisplay(outputs.todayAmountCents)}
          </span>
        </div>
        <Separator />
        <ResultRow
          label="New outstanding"
          value={centsToDisplay(outputs.newOutstandingCents)}
        />

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
