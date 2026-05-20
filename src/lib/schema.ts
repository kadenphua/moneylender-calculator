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
