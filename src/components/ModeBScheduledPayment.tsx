import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { v4 as uuidv4 } from "uuid";
import { AlertCircle, Printer, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScheduleComparison } from "@/components/ScheduleComparison";

import {
  AllInstalmentsPaidError,
  calculateScheduledPayment,
  centsToDisplay,
  dollarsToCents,
  generateOriginalSchedule,
  LatePaymentError,
  type RateUnit,
  type ScheduleRow,
} from "@/lib/calc";
import {
  dateToYmdLocal,
  formatEquivalentRate,
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

const LS_RATE_PERCENT = "lastUsedRatePercent";
const LS_RATE_UNIT = "lastUsedRateUnit";

const TAB = {
  borrowerRef: 1,
  originalPrincipal: 2,
  loanStartDate: 3,
  totalInstalments: 4,
  instalmentsAlreadyPaid: 5,
  outstandingPrincipal: 6,
  ratePercent: 7,
  rateUnit: 8,
  monthlyPayment: 9,
  lastPaymentDate: 10,
  payOnDate: 11,
  calculate: 12,
} as const;

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

  // Snapshot the localStorage rate hint at mount time so the (remembered)
  // marker only appears for the loaded value, not for anything the officer
  // subsequently types.
  const initialRateRef = useRef<{
    percent: number | undefined;
    unit: RateUnit;
  }>(readRememberedRate());
  const [rateIsRemembered, setRateIsRemembered] = useState(
    initialRateRef.current.percent !== undefined,
  );

  // Side-channel for any lastPaymentDate the officer typed. Lets us swap
  // lastPaymentDate <-> loanStartDate when instalmentsAlreadyPaid toggles
  // between 0 and >=1 without losing their typed value.
  const [storedLastPaymentDate, setStoredLastPaymentDate] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ScheduledPaymentFormValues, unknown, ScheduledPaymentFormParsed>({
    resolver: zodResolver(scheduledPaymentFormSchema),
    defaultValues: defaultMobBValues(initialRateRef.current),
    mode: "onChange",
  });

  const watchedInstalmentsPaid = watch("instalmentsAlreadyPaid");
  const watchedLoanStart = watch("loanStartDate");
  const watchedOriginal = watch("originalPrincipalDollars");
  const watchedTotal = watch("totalInstalments");
  const watchedOutstanding = watch("outstandingDollars");
  const watchedRatePercent = watch("ratePercent");
  const watchedRateUnit = watch("rateUnit");
  const watchedMonthlyPayment = watch("monthlyPaymentDollars");

  const isFirstPayment = watchedInstalmentsPaid === 0;

  // When the officer marks this as the first payment, mirror loanStartDate
  // into lastPaymentDate so submission has a valid value. When they switch
  // back to >=1, restore the date they had previously typed (if any). We
  // re-trigger validation so the Calculate button updates immediately.
  useEffect(() => {
    if (isFirstPayment) {
      if (watchedLoanStart) {
        setValue("lastPaymentDate", watchedLoanStart, {
          shouldValidate: true,
          shouldDirty: false,
        });
      }
    } else {
      setValue("lastPaymentDate", storedLastPaymentDate, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
  }, [isFirstPayment, watchedLoanStart, storedLastPaymentDate, setValue]);

  // When this is the first payment, the outstanding always equals the loan
  // amount — auto-track it so the officer doesn't have to type it twice.
  // When they switch back to paid>=1, leave whatever value is there so the
  // officer can edit (we don't want to nuke a previously-typed outstanding).
  useEffect(() => {
    if (!isFirstPayment) return;
    if (
      typeof watchedOriginal === "number" &&
      Number.isFinite(watchedOriginal)
    ) {
      setValue("outstandingDollars", watchedOriginal, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
  }, [isFirstPayment, watchedOriginal, setValue]);

  // Schedule-derived outstanding hint: amortise instalmentsAlreadyPaid rows
  // forward and read the post-row outstanding. Hidden when any prereq is
  // blank or when the amortisation throws.
  const scheduleDerivedHint = useMemo(() => {
    const orig =
      typeof watchedOriginal === "number" && Number.isFinite(watchedOriginal)
        ? watchedOriginal
        : null;
    const total =
      typeof watchedTotal === "number" &&
      Number.isInteger(watchedTotal) &&
      watchedTotal > 0
        ? watchedTotal
        : null;
    const paid =
      typeof watchedInstalmentsPaid === "number" &&
      Number.isInteger(watchedInstalmentsPaid) &&
      watchedInstalmentsPaid >= 0
        ? watchedInstalmentsPaid
        : null;
    const rate =
      typeof watchedRatePercent === "number" &&
      Number.isFinite(watchedRatePercent) &&
      watchedRatePercent > 0
        ? watchedRatePercent
        : null;
    const mp =
      typeof watchedMonthlyPayment === "number" &&
      Number.isFinite(watchedMonthlyPayment) &&
      watchedMonthlyPayment > 0
        ? watchedMonthlyPayment
        : null;
    if (
      orig === null ||
      total === null ||
      paid === null ||
      rate === null ||
      mp === null
    )
      return null;
    if (paid >= total) return null;

    try {
      const monthlyRate = watchedRateUnit === "annual" ? rate / 12 : rate;
      const originalPrincipalCents = dollarsToCents(orig);
      const monthlyPaymentCents = dollarsToCents(mp);
      // Calling generateOriginalSchedule with 0-paid is fine; we just read
      // the original principal back as the "derived outstanding".
      if (paid === 0) {
        return { cents: originalPrincipalCents };
      }
      const schedule = generateOriginalSchedule(
        originalPrincipalCents,
        total,
        monthlyPaymentCents,
        monthlyRate,
        // dueDate isn't used for the outstanding lookup — any date works.
        new Date(2026, 0, 1),
      );
      const row = schedule[paid - 1];
      if (!row) return null;
      return { cents: row.outstandingAfterRowCents };
    } catch {
      return null;
    }
  }, [
    watchedOriginal,
    watchedTotal,
    watchedInstalmentsPaid,
    watchedRatePercent,
    watchedRateUnit,
    watchedMonthlyPayment,
  ]);

  // Reciprocal rate hint: when "Per year" + 39 is entered, show
  // "= 3.25% per month"; when "Per month" + 3.25, show "= 39% per year".
  // Shared with Mode A via formatEquivalentRate so both behave identically.
  const reciprocalRateHint = useMemo<string | null>(
    () => formatEquivalentRate(watchedRatePercent, watchedRateUnit),
    [watchedRatePercent, watchedRateUnit],
  );

  // Amber when the typed outstanding differs from the schedule-derived value
  // by strictly more than $1.00 (100 cents). $1.00 exactly is still neutral.
  const scheduleHintIsWarning = useMemo(() => {
    if (!scheduleDerivedHint) return false;
    if (
      typeof watchedOutstanding !== "number" ||
      !Number.isFinite(watchedOutstanding)
    )
      return false;
    const typedCents = dollarsToCents(watchedOutstanding);
    return Math.abs(typedCents - scheduleDerivedHint.cents) > 100;
  }, [scheduleDerivedHint, watchedOutstanding]);

  async function onSubmit(values: ScheduledPaymentFormParsed) {
    setSubmitError(null);

    const outstandingCents = dollarsToCents(values.outstandingDollars);
    const originalPrincipalCents = dollarsToCents(values.originalPrincipalDollars);
    const monthlyPaymentCents = dollarsToCents(values.monthlyPaymentDollars);
    // When this is the first payment, lastPaymentDate is hidden in the UI;
    // its value is mirrored from loanStartDate so the audit log stays
    // complete and consistent.
    const effectiveLastPaymentDate =
      values.instalmentsAlreadyPaid === 0
        ? values.loanStartDate
        : values.lastPaymentDate;

    try {
      const outputs = calculateScheduledPayment({
        outstandingCents,
        originalPrincipalCents,
        totalInstalments: values.totalInstalments,
        instalmentsAlreadyPaid: values.instalmentsAlreadyPaid,
        rateUnit: values.rateUnit,
        ratePercent: values.ratePercent,
        monthlyPaymentCents,
        loanStartDate: parseYmdLocal(values.loanStartDate),
        lastPaymentDate: parseYmdLocal(effectiveLastPaymentDate),
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
          originalPrincipalCents,
          totalInstalments: values.totalInstalments,
          instalmentsAlreadyPaid: values.instalmentsAlreadyPaid,
          outstandingCents,
          rateUnit: values.rateUnit,
          ratePercent: values.ratePercent,
          monthlyPaymentCents,
          loanStartDate: values.loanStartDate,
          lastPaymentDate: effectiveLastPaymentDate,
          payOnDate: values.payOnDate,
        },
        outputs: {
          days: outputs.days,
          dailyRate: outputs.dailyRate,
          monthlyRatePercent: outputs.monthlyRatePercent,
          daysInScheduledMonth: outputs.daysInScheduledMonth,
          prorationFactor: outputs.prorationFactor,
          scheduledInterestCents: outputs.scheduledInterestCents,
          principalPortionCents: outputs.principalPortionCents,
          interestPortionCents: outputs.interestPortionCents,
          todayAmountCents: outputs.todayAmountCents,
          newOutstandingCents: outputs.newOutstandingCents,
          nextDueDate: dateToYmdLocal(outputs.nextDueDate),
          daysFromPayOnToNextDue: outputs.daysFromPayOnToNextDue,
          remainingSchedule: outputs.remainingSchedule.map(serialiseRow),
          originalSchedule: outputs.originalSchedule.map(serialiseRow),
        },
      };

      await saveCalculation(record);
      writeRememberedRate(values.ratePercent, values.rateUnit);
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
    setStoredLastPaymentDate("");
    setRateIsRemembered(initialRateRef.current.percent !== undefined);
    reset(defaultMobBValues(initialRateRef.current));
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
                tabIndex={TAB.borrowerRef}
                {...register("borrowerRef")}
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Loan amount ($)"
                htmlFor="originalPrincipalDollars"
                error={errors.originalPrincipalDollars?.message}
              >
                <Controller
                  control={control}
                  name="originalPrincipalDollars"
                  render={({ field }) => (
                    <CurrencyInput
                      id="originalPrincipalDollars"
                      tabIndex={TAB.originalPrincipal}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </Field>
              <Field
                label="Loan start date"
                htmlFor="loanStartDate"
                error={errors.loanStartDate?.message}
              >
                <Input
                  id="loanStartDate"
                  type="date"
                  tabIndex={TAB.loanStartDate}
                  {...register("loanStartDate")}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  tabIndex={TAB.totalInstalments}
                  {...register("totalInstalments", { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Instalments paid so far"
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
                  tabIndex={TAB.instalmentsAlreadyPaid}
                  {...register("instalmentsAlreadyPaid", {
                    valueAsNumber: true,
                  })}
                />
                {isFirstPayment ? (
                  <p className="text-xs text-muted-foreground">
                    First payment for this loan — interest calculated from
                    the loan start date.
                  </p>
                ) : null}
              </Field>
            </div>

            <Field
              label="Current outstanding ($)"
              htmlFor="b-outstandingDollars"
              error={errors.outstandingDollars?.message}
            >
              {isFirstPayment ? (
                <ReadOnlyAmountDisplay
                  id="b-outstandingDollars"
                  value={
                    typeof watchedOriginal === "number" &&
                    Number.isFinite(watchedOriginal)
                      ? watchedOriginal
                      : undefined
                  }
                />
              ) : (
                <Controller
                  control={control}
                  name="outstandingDollars"
                  render={({ field }) => (
                    <CurrencyInput
                      id="b-outstandingDollars"
                      tabIndex={TAB.outstandingPrincipal}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              )}
              {isFirstPayment ? (
                <p className="text-xs text-muted-foreground">
                  Auto-filled — no payments made yet.
                </p>
              ) : scheduleDerivedHint ? (
                <p
                  className={
                    "text-xs " +
                    (scheduleHintIsWarning
                      ? "text-amber-600 dark:text-amber-500"
                      : "text-muted-foreground")
                  }
                >
                  Schedule says: {centsToDisplay(scheduleDerivedHint.cents)}.
                  If your CRM shows a different number, use the CRM value.
                </p>
              ) : null}
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
                  placeholder="e.g. 3.25"
                  tabIndex={TAB.ratePercent}
                  {...register("ratePercent", {
                    valueAsNumber: true,
                    onChange: () => {
                      if (rateIsRemembered) setRateIsRemembered(false);
                    },
                  })}
                />
                {rateIsRemembered ? (
                  <p className="text-xs text-muted-foreground italic">
                    (remembered)
                  </p>
                ) : null}
                {reciprocalRateHint ? (
                  <p className="text-xs text-muted-foreground">
                    {reciprocalRateHint}
                  </p>
                ) : null}
              </Field>
              <Controller
                control={control}
                name="rateUnit"
                render={({ field }) => (
                  <RateUnitToggle
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      if (rateIsRemembered) setRateIsRemembered(false);
                    }}
                    tabIndex={TAB.rateUnit}
                  />
                )}
              />
            </div>

            <Field
              label="Monthly payment (from CRM) ($)"
              htmlFor="monthlyPaymentDollars"
              error={errors.monthlyPaymentDollars?.message}
            >
              <Controller
                control={control}
                name="monthlyPaymentDollars"
                render={({ field }) => (
                  <CurrencyInput
                    id="monthlyPaymentDollars"
                    tabIndex={TAB.monthlyPayment}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                From the CRM or Note of Contract.
              </p>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!isFirstPayment ? (
                <Field
                  label="Last payment date"
                  htmlFor="b-lastPaymentDate"
                  error={errors.lastPaymentDate?.message}
                >
                  <Input
                    id="b-lastPaymentDate"
                    type="date"
                    tabIndex={TAB.lastPaymentDate}
                    {...register("lastPaymentDate", {
                      onChange: (e) => setStoredLastPaymentDate(e.target.value),
                    })}
                  />
                </Field>
              ) : null}
              <Field
                label="Today's date (or future date if quoting)"
                htmlFor="b-payOnDate"
                error={errors.payOnDate?.message}
              >
                <Input
                  id="b-payOnDate"
                  type="date"
                  tabIndex={TAB.payOnDate}
                  {...register("payOnDate")}
                />
              </Field>
            </div>

            {submitError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 flex gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{submitError}</p>
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={isSubmitting || !isValid}
              tabIndex={TAB.calculate}
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

function readRememberedRate(): {
  percent: number | undefined;
  unit: RateUnit;
} {
  if (typeof window === "undefined") {
    return { percent: undefined, unit: "monthly" };
  }
  let percent: number | undefined;
  const rawPercent = window.localStorage.getItem(LS_RATE_PERCENT);
  if (rawPercent !== null) {
    const parsed = Number(rawPercent);
    if (Number.isFinite(parsed) && parsed > 0) percent = parsed;
  }
  const rawUnit = window.localStorage.getItem(LS_RATE_UNIT);
  const unit: RateUnit =
    rawUnit === "annual" || rawUnit === "monthly" ? rawUnit : "monthly";
  return { percent, unit };
}

function writeRememberedRate(percent: number, unit: RateUnit): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_RATE_PERCENT, String(percent));
  window.localStorage.setItem(LS_RATE_UNIT, unit);
}

function defaultMobBValues(remembered: {
  percent: number | undefined;
  unit: RateUnit;
}): ScheduledPaymentFormValues {
  return {
    borrowerRef: "",
    originalPrincipalDollars: undefined,
    loanStartDate: "",
    totalInstalments: undefined,
    instalmentsAlreadyPaid: undefined,
    outstandingDollars: undefined,
    rateUnit: remembered.unit,
    ratePercent: remembered.percent,
    lastPaymentDate: "",
    payOnDate: todayYmdLocal(),
    monthlyPaymentDollars: undefined,
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

function formatCurrency(v: number | undefined | null): string {
  if (v === null || v === undefined) return "";
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function coerceToNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function ReadOnlyAmountDisplay(props: {
  id: string;
  value: number | undefined;
}) {
  return (
    <div
      id={props.id}
      role="textbox"
      aria-readonly="true"
      className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground"
    >
      <span className="font-mono">
        {props.value !== undefined ? `$${formatCurrency(props.value)}` : "—"}
      </span>
    </div>
  );
}

function CurrencyInput(props: {
  id: string;
  tabIndex: number;
  placeholder?: string;
  // Accepts whatever the Controller emits (preprocess wraps the schema's
  // input type as unknown); coerced to number internally.
  value: unknown;
  onChange: (n: number | undefined) => void;
  onBlur: () => void;
}) {
  const numericValue = coerceToNumber(props.value);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>(formatCurrency(numericValue));

  // Keep draft in sync with external value changes (form reset, auto-fill,
  // etc.) but only while the field isn't being edited.
  useEffect(() => {
    if (focused) return;
    setDraft(formatCurrency(numericValue));
  }, [numericValue, focused]);

  return (
    <Input
      id={props.id}
      tabIndex={props.tabIndex}
      type="text"
      inputMode="decimal"
      placeholder={props.placeholder ?? "0.00"}
      value={draft}
      onFocus={() => {
        setFocused(true);
        // Strip formatting so the officer can edit the raw number.
        setDraft(numericValue !== undefined ? String(numericValue) : "");
      }}
      onBlur={() => {
        setFocused(false);
        props.onBlur();
        setDraft(formatCurrency(numericValue));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const cleaned = raw.replace(/,/g, "").trim();
        if (cleaned === "") {
          props.onChange(undefined);
          return;
        }
        const parsed = Number(cleaned);
        if (Number.isFinite(parsed)) {
          props.onChange(parsed);
        }
      }}
    />
  );
}

function RateUnitToggle({
  value,
  onChange,
  tabIndex,
}: {
  value: RateUnit;
  onChange: (v: RateUnit) => void;
  tabIndex: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Unit</Label>
      <div
        role="radiogroup"
        aria-label="Interest rate unit"
        className="inline-flex rounded-md border bg-background p-0.5"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            onChange(value === "monthly" ? "annual" : "monthly");
          }
        }}
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === "monthly"}
          tabIndex={value === "monthly" ? tabIndex : -1}
          className={toggleClass(value === "monthly")}
          onClick={() => onChange("monthly")}
        >
          Per month
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === "annual"}
          tabIndex={value === "annual" ? tabIndex : -1}
          className={toggleClass(value === "annual")}
          onClick={() => onChange("annual")}
        >
          Per year
        </button>
      </div>
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

function formatProrationFactor(
  daysSinceLastPayment: number,
  daysInScheduledMonth: number,
  factor: number,
): string {
  if (daysInScheduledMonth <= 0) return `${(factor * 100).toFixed(2)}%`;
  return `${daysSinceLastPayment}/${daysInScheduledMonth} = ${(factor * 100).toFixed(2)}%`;
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
          label="Days since last payment"
          value={`${outputs.days} of ${outputs.daysInScheduledMonth}`}
        />
        <ResultRow
          label="Monthly rate"
          value={`${outputs.monthlyRatePercent.toFixed(4)}%`}
        />
        <Separator />
        <ResultRow
          label="Scheduled monthly interest"
          value={centsToDisplay(outputs.scheduledInterestCents)}
        />
        <ResultRow
          label="Proration factor"
          value={formatProrationFactor(
            outputs.days,
            outputs.daysInScheduledMonth,
            outputs.prorationFactor,
          )}
        />
        <ResultRow
          label="Prorated interest (today)"
          value={centsToDisplay(outputs.interestPortionCents)}
        />
        <ResultRow
          label="Principal portion"
          value={centsToDisplay(outputs.principalPortionCents)}
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

        {outputs.originalSchedule.length > 0 ||
        outputs.remainingSchedule.length > 0 ? (
          <>
            <Separator />
            <ScheduleComparison
              originalSchedule={outputs.originalSchedule}
              remainingSchedule={outputs.remainingSchedule}
              instalmentsAlreadyPaid={inputs.instalmentsAlreadyPaid}
            />
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
