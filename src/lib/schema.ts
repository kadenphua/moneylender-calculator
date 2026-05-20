import { z } from "zod";

const ymd = z
  .string()
  .min(1, "Required")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const requiredNumber = (msg = "Required") =>
  z.preprocess(
    (v) => (typeof v === "number" && Number.isNaN(v) ? undefined : v),
    z.number({ message: msg }),
  );

export const calculatorFormSchema = z
  .object({
    borrowerRef: z.string().max(50, "Max 50 characters"),
    outstandingDollars: requiredNumber().pipe(
      z.number().positive("Must be greater than 0"),
    ),
    rateUnit: z.enum(["annual", "monthly"]),
    ratePercent: requiredNumber().pipe(
      z
        .number()
        .positive("Must be greater than 0")
        .lt(1000, "Must be less than 1000"),
    ),
    lastPaymentDate: ymd,
    payOnDate: ymd,
    outstandingLateFeeDollars: z.preprocess(
      (v) =>
        v === undefined || v === null || (typeof v === "number" && Number.isNaN(v))
          ? 0
          : v,
      z.number().min(0, "Must be 0 or more"),
    ),
  })
  .refine((d) => d.payOnDate >= d.lastPaymentDate, {
    message: "Pay-on date must be on or after last payment date",
    path: ["payOnDate"],
  });

export type CalculatorFormValues = z.input<typeof calculatorFormSchema>;
export type CalculatorFormParsed = z.output<typeof calculatorFormSchema>;

const requiredInt = (msg = "Required") =>
  z.preprocess(
    (v) => (typeof v === "number" && Number.isNaN(v) ? undefined : v),
    z.number({ message: msg }).int("Must be a whole number"),
  );

export const scheduledPaymentFormSchema = z
  .object({
    borrowerRef: z.string().max(50, "Max 50 characters"),
    originalPrincipalDollars: requiredNumber().pipe(
      z.number().positive("Must be greater than 0"),
    ),
    totalInstalments: requiredInt().pipe(
      z.number().int().min(1, "Must be at least 1"),
    ),
    instalmentsAlreadyPaid: requiredInt("Required").pipe(
      z.number().int().min(0, "Must be 0 or more"),
    ),
    loanStartDate: ymd,
    outstandingDollars: requiredNumber().pipe(
      z.number().positive("Must be greater than 0"),
    ),
    rateUnit: z.enum(["annual", "monthly"]),
    ratePercent: requiredNumber().pipe(
      z
        .number()
        .positive("Must be greater than 0")
        .lt(1000, "Must be less than 1000"),
    ),
    // lastPaymentDate is conditionally required: optional when
    // instalmentsAlreadyPaid === 0 (the UI hides the field and the submit
    // handler substitutes loanStartDate), required when >= 1. superRefine
    // below enforces both branches.
    lastPaymentDate: z.string(),
    payOnDate: ymd,
    monthlyPaymentDollars: requiredNumber().pipe(
      z.number().positive("Must be greater than 0"),
    ),
  })
  .refine((d) => d.instalmentsAlreadyPaid < d.totalInstalments, {
    message: "Must be less than total instalments",
    path: ["instalmentsAlreadyPaid"],
  })
  .superRefine((d, ctx) => {
    if (typeof d.instalmentsAlreadyPaid !== "number") return;
    if (d.instalmentsAlreadyPaid >= 1) {
      if (!d.lastPaymentDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required",
          path: ["lastPaymentDate"],
        });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.lastPaymentDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid date",
          path: ["lastPaymentDate"],
        });
        return;
      }
      if (d.lastPaymentDate < d.loanStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Last payment date cannot be before loan start date.",
          path: ["lastPaymentDate"],
        });
      }
      if (d.payOnDate < d.lastPaymentDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pay-on date must be on or after last payment date",
          path: ["payOnDate"],
        });
      }
    } else {
      // paid === 0: lastPaymentDate is hidden; the submit handler
      // substitutes loanStartDate, so validate payOnDate against that.
      if (d.payOnDate < d.loanStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pay-on date must be on or after loan start date",
          path: ["payOnDate"],
        });
      }
    }
  });

export type ScheduledPaymentFormValues = z.input<typeof scheduledPaymentFormSchema>;
export type ScheduledPaymentFormParsed = z.output<typeof scheduledPaymentFormSchema>;
