import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { v4 as uuidv4 } from "uuid";
import { AlertCircle, Printer, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  AllInstalmentsPaidError,
  autoPrincipalPortionCents,
  calculateScheduledPayment,
  centsToDisplay,
  dollarsToCents,
  LatePaymentError,
  type ScheduleRow,
} from "@/lib/calc";
import {
  dateToYmdLocal,
  formatPercent,
  formatYmdShort,
  parseYmdLocal,
  todayYmdLocal,
} from "@/lib/format";
import {
  scheduledPaymentFormSchema,
  type ScheduledPaymentFormParsed,
  type ScheduledPaymentFormValues,
} from "@/lib/schema";
import { saveCalculation } from "@/lib/db";
import type {
  ScheduledPaymentRecord,
  ScheduleRowStored,
} from "@/lib/types";

interface Props {
  officerName: string;
  companyName: string;
  onCalculation: (record: ScheduledPaymentRecord) => void;
}

export function ModeBScheduledPayment({
  officerName,
  companyName,
  onCalculation,
}: Props) {
  const [result, setResult] = useState<ScheduledPaymentRecord | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<ScheduledPaymentFormValues, unknown, ScheduledPaymentFormParsed>({
    resolver: zodResolver(scheduledPaymentFormSchema),
    defaultValues: defaultMobBValues(),
  });

  const watchedOriginal = watch("originalPrincipalDollars");
  const watchedTotal = watch("totalInstalments");

  const autoPrincipalDollars = useMemo(() => {
    const o =
      typeof watchedOriginal === "number" && Number.isFinite(watchedOriginal)
        ? watchedOriginal
        : null;
    const t =
      typeof watchedTotal === "number" &&
      Number.isInteger(watchedTotal) &&
      watchedTotal > 0
        ? watchedTotal
        : null;
    if (o === null || o <= 0 || t === null) return null;
    return autoPrincipalPortionCents(dollarsToCents(o), t) / 100;
  }, [watchedOriginal, watchedTotal]);

  // Auto-fill principal portion unless the officer has manually edited it.
  useEffect(() => {
    if (autoPrincipalDollars === null) return;
    if (dirtyFields.principalPortionDollars) return;
    setValue("principalPortionDollars", autoPrincipalDollars, {
      shouldDirty: false,
      shouldValidate: false,
    });
  }, [autoPrincipalDollars, dirtyFields.principalPortionDollars, setValue]);

  async function onSubmit(values: ScheduledPaymentFormParsed) {
    setSubmitError(null);

    const outstandingCents = dollarsToCents(values.outstandingDollars);
    const originalPrincipalCents = dollarsToCents(values.originalPrincipalDollars);
    const principalPortionCents = dollarsToCents(values.principalPortionDollars);

    try {
      const outputs = calculateScheduledPayment({
        outstandingCents,
        originalPrincipalCents,
        totalInstalments: values.totalInstalments,
        instalmentsAlreadyPaid: values.instalmentsAlreadyPaid,
        rateUnit: values.rateUnit,
        ratePercent: values.ratePercent,
        lastPaymentDate: parseYmdLocal(values.lastPaymentDate),
        payOnDate: parseYmdLocal(values.payOnDate),
        principalPortionCents,
      });

      const record: ScheduledPaymentRecord = {
        mode: "scheduled",
        id: uuidv4(),
        timestampUtcIso: new Date().toISOString(),
        officerName,
        companyName,
        inputs: {
          borrowerRef: values.borrowerRef.trim(),
          originalPrincipalCents,
          totalInstalments: values.totalInstalments,
          instalmentsAlreadyPaid: values.instalmentsAlreadyPaid,
          outstandingCents,
          rateUnit: values.rateUnit,
          ratePercent: values.ratePercent,
          lastPaymentDate: values.lastPaymentDate,
          payOnDate: values.payOnDate,
          principalPortionCents,
        },
        outputs: {
          days: outputs.days,
          dailyRate: outputs.dailyRate,
          principalPortionCents: outputs.principalPortionCents,
          interestPortionCents: outputs.interestPortionCents,
          todayAmountCents: outputs.todayAmountCents,
          newOutstandingCents: outputs.newOutstandingCents,
          nextDueDate: dateToYmdLocal(outputs.nextDueDate),
          daysFromPayOnToNextDue: outputs.daysFromPayOnToNextDue,
          remainingSchedule: outputs.remainingSchedule.map(serialiseRow),
        },
      };

      await saveCalculation(record);
      setResult(record);
      onCalculation(record);
    } catch (err) {
      if (
        err instanceof LatePaymentError ||
        err instanceof AllInstalmentsPaidError
      ) {
        setSubmitError(err.message);
        setResult(null);
      } else {
        setSubmitError(
          err instanceof Error ? err.message : "Calculation failed.",
        );
      }
    }
  }

  function handleNewCalculation() {
    setResult(null);
    setSubmitError(null);
    reset(defaultMobBValues());
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field
                label="Original loan principal ($)"
                htmlFor="originalPrincipalDollars"
                error={errors.originalPrincipalDollars?.message}
              >
                <Input
                  id="originalPrincipalDollars"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register("originalPrincipalDollars", {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Field
                label="Total instalments"
                htmlFor="totalInstalments"
                error={errors.totalInstalments?.message}
              >
                <Input
                  id="totalInstalments"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  placeholder="e.g. 6"
                  {...register("totalInstalments", { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Instalments already paid"
                htmlFor="instalmentsAlreadyPaid"
                error={errors.instalmentsAlreadyPaid?.message}
              >
                <Input
                  id="instalmentsAlreadyPaid"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  placeholder="e.g. 2"
                  {...register("instalmentsAlreadyPaid", {
                    valueAsNumber: true,
                  })}
                />
              </Field>
            </div>

            <Field
              label="Outstanding principal as of last payment ($)"
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
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
              <Field
                label="Interest rate (%)"
                htmlFor="b-ratePercent"
                error={errors.ratePercent?.message}
              >
                <Input
                  id="b-ratePercent"
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
                label="Pay-on date"
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

            <Field
              label="Principal portion per instalment ($)"
              htmlFor="principalPortionDollars"
              error={errors.principalPortionDollars?.message}
            >
              <Input
                id="principalPortionDollars"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register("principalPortionDollars", {
                  valueAsNumber: true,
                })}
              />
              {autoPrincipalDollars !== null ? (
                <p className="text-xs text-muted-foreground">
                  (auto: ${autoPrincipalDollars.toFixed(2)} — change if rounding
                  differs)
                </p>
              ) : null}
            </Field>

            {submitError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 flex gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{submitError}</p>
              </div>
            ) : null}

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

function defaultMobBValues(): ScheduledPaymentFormValues {
  return {
    borrowerRef: "",
    originalPrincipalDollars: undefined,
    totalInstalments: undefined,
    instalmentsAlreadyPaid: undefined,
    outstandingDollars: undefined,
    rateUnit: "annual",
    ratePercent: undefined,
    lastPaymentDate: "",
    payOnDate: todayYmdLocal(),
    principalPortionDollars: undefined,
  };
}

function serialiseRow(row: ScheduleRow): ScheduleRowStored {
  return {
    rowNumber: row.rowNumber,
    dueDate: dateToYmdLocal(row.dueDate),
    daysInPeriod: row.daysInPeriod,
    principalCents: row.principalCents,
    interestCents: row.interestCents,
    totalCents: row.totalCents,
    outstandingAfterRowCents: row.outstandingAfterRowCents,
  };
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
        <ResultRow
          label="Days elapsed (since last payment)"
          value={String(outputs.days)}
        />
        <ResultRow
          label="Daily rate"
          value={formatPercent(outputs.dailyRate, 6)}
        />
        <Separator />
        <ResultRow
          label="Principal portion"
          value={centsToDisplay(outputs.principalPortionCents)}
        />
        <ResultRow
          label="Interest portion"
          value={centsToDisplay(outputs.interestPortionCents)}
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
          label="New outstanding after this payment"
          value={centsToDisplay(outputs.newOutstandingCents)}
        />
        <ResultRow
          label="Next due date"
          value={formatYmdShort(outputs.nextDueDate)}
        />
        <ResultRow
          label="Days from today to next due date"
          value={`${outputs.daysFromPayOnToNextDue} days`}
        />

        {outputs.remainingSchedule.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-semibold">
              Remaining schedule ({outputs.remainingSchedule.length}{" "}
              instalment{outputs.remainingSchedule.length === 1 ? "" : "s"})
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
