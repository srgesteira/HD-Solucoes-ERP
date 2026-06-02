import { z } from "zod";

export const payableStatusEnum = z.enum([
  "pending",
  "paid",
  "overdue",
  "cancelled",
]);

export const accountsPayableCreateSchema = z.object({
  description: z.string().min(1).max(2000),
  category: z.string().min(1).max(200),
  supplier_id: z.string().uuid().nullable().optional(),
  original_amount: z.coerce.number().positive().max(1e12),
  current_amount: z.coerce.number().positive().max(1e12).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(5000).nullable().optional(),
});

export const accountsPayableUpdateSchema = z
  .object({
    description: z.string().min(1).max(2000).optional(),
    category: z.string().min(1).max(200).optional(),
    supplier_id: z.string().uuid().nullable().optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(5000).nullable().optional(),
    status: payableStatusEnum.optional(),
    current_amount: z.coerce.number().min(0).max(1e12).optional(),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    pay_amount: z.coerce.number().positive().max(1e12).optional(),
    /** Ajuste manual de saldo; define amount_locked e acrescenta nota automática. */
    adjust_amount: z.coerce.number().positive().max(1e12).optional(),
  });

export const cashFlowEntryCreateSchema = z.object({
  type: z.enum(["in", "out"]),
  description: z.string().min(1).max(2000),
  amount: z.coerce.number().positive().max(1e12),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().max(200).nullable().optional(),
  reference_id: z.string().uuid().nullable().optional(),
});

export const employeeStatusEnum = z.enum([
  "active",
  "inactive",
  "vacation",
  "terminated",
]);

export const employeeCreateSchema = z.object({
  name: z.string().min(1).max(500),
  document: z.string().max(64).nullable().optional(),
  email: z.string().max(320).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  position: z.string().max(200).nullable().optional(),
  monthly_salary: z.coerce.number().min(0).max(1e9).nullable().optional(),
  work_center_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  allocation_percentage: z.coerce.number().min(0).max(100).optional(),
  admission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: employeeStatusEnum.optional(),
  notes: z.string().max(8000).nullable().optional(),
});

export const employeeUpdateSchema = employeeCreateSchema.partial();
