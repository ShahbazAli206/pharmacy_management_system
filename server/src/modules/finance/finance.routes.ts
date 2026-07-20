import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { asyncHandler, badRequest, unauthorized } from '../../utils/httpError';
import { recordAudit } from '../../services/audit';
import { toCsv, centsToDollars } from '../../utils/csv';
import { expensesPdfBuffer, plStatementPdfBuffer } from '../../utils/pdf';
import * as expenses from './expenses.service';
import * as finance from './finance.service';
import { runCraRemittanceEscalation } from '../../services/craRemittance';

const router = Router();
router.use(authenticate);

const s = (v: unknown) => (typeof v === 'string' ? v : undefined);

const CATEGORIES = [
  'RENT_OCCUPANCY', 'PAYROLL', 'UTILITIES', 'BANK_FINANCING', 'INSURANCE',
  'PROFESSIONAL_FEES', 'MARKETING', 'IT_TECHNOLOGY', 'INVENTORY_PURCHASES',
  'REPAIRS_MAINTENANCE', 'MISCELLANEOUS',
] as const;

const expenseSchema = z.object({
  pharmacyId: z.string().uuid().optional(),
  category: z.enum(CATEGORIES),
  subType: z.string().optional(),
  description: z.string().min(1),
  amountCents: z.number().int().min(0),
  taxCents: z.number().int().min(0).optional(),
  vendor: z.string().optional(),
  incurredOn: z.string(),
  dueDate: z.string().optional(),
  recurring: z.boolean().optional(),
  renewalDate: z.string().optional(),
  attachmentPath: z.string().optional(),
});

// ---- Expenses ----
router.get(
  '/expenses',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const list = await expenses.listExpenses(req.auth, {
      requestedPharmacyId: s(req.query.pharmacyId),
      status: s(req.query.status) as never,
      category: s(req.query.category) as never,
      from: s(req.query.from),
      to: s(req.query.to),
    });

    // CSV/PDF export — audited as an EXPORT event.
    if (req.query.format === 'csv') {
      await recordAudit({ action: 'EXPORT', entity: 'Expense', metadata: { count: list.length }, req });
      const rows = list.map((e) => ({
        date: e.incurredOn.toISOString().slice(0, 10),
        location: e.pharmacy.code,
        category: e.category,
        description: e.description,
        vendor: e.vendor ?? '',
        amount: centsToDollars(e.amountCents),
        tax: centsToDollars(e.taxCents),
        status: e.status,
      }));
      res.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="expenses.csv"');
      res.send(toCsv(rows));
      return;
    }
    if (req.query.format === 'pdf') {
      await recordAudit({ action: 'EXPORT', entity: 'Expense', metadata: { count: list.length, format: 'pdf' }, req });
      const pdf = await expensesPdfBuffer(
        list.map((e) => ({
          incurredOn: e.incurredOn,
          location: e.pharmacy.code,
          category: e.category,
          description: e.description,
          vendor: e.vendor,
          amountCents: e.amountCents,
          taxCents: e.taxCents,
          status: e.status,
        })),
      );
      res.header('Content-Type', 'application/pdf').header('Content-Disposition', 'attachment; filename="expenses.pdf"');
      res.send(pdf);
      return;
    }
    res.json(list);
  }),
);

router.post(
  '/expenses',
  requirePermission(PERMISSIONS.FINANCE_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const expense = await expenses.createExpense(req.auth, expenseSchema.parse(req.body));
    await recordAudit({ action: 'CREATE', entity: 'Expense', entityId: expense.id, req });
    res.status(201).json(expense);
  }),
);

router.post(
  '/expenses/:id/decision',
  requirePermission(PERMISSIONS.EXPENSE_APPROVE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { decision } = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) }).parse(req.body);
    const expense = await expenses.decideExpense(req.auth, req.params.id, decision);
    await recordAudit({ action: 'UPDATE', entity: 'Expense', entityId: expense.id, metadata: { decision }, req });
    res.json(expense);
  }),
);

router.post(
  '/expenses/:id/paid',
  requirePermission(PERMISSIONS.FINANCE_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await expenses.markPaid(req.auth, req.params.id));
  }),
);

router.get(
  '/expenses/renewals',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await expenses.renewalAlerts(req.auth, s(req.query.pharmacyId)));
  }),
);

// ---- Reports ----
router.get(
  '/pl',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = s(req.query.pharmacyId) ?? req.auth.locationId;
    if (!pharmacyId) throw badRequest('pharmacyId is required');
    const pl = await finance.profitAndLoss(req.auth, pharmacyId, s(req.query.from), s(req.query.to));

    if (req.query.format === 'pdf') {
      await recordAudit({ action: 'EXPORT', entity: 'PLReport', entityId: pharmacyId, metadata: { format: 'pdf' }, req });
      const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { name: true } });
      const pdf = await plStatementPdfBuffer({ pharmacyName: pharmacy?.name ?? pharmacyId, ...pl });
      res.header('Content-Type', 'application/pdf').header('Content-Disposition', 'attachment; filename="profit-loss.pdf"');
      res.send(pdf);
      return;
    }
    res.json(pl);
  }),
);

router.get(
  '/pl/consolidated',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await finance.consolidatedPL(req.auth, s(req.query.from), s(req.query.to)));
  }),
);

router.get(
  '/profit-distribution',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = s(req.query.pharmacyId) ?? req.auth.locationId;
    if (!pharmacyId) throw badRequest('pharmacyId is required');
    res.json(await finance.profitDistribution(req.auth, pharmacyId, s(req.query.from), s(req.query.to)));
  }),
);

router.put(
  '/ownership',
  requirePermission(PERMISSIONS.FINANCE_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const body = z
      .object({
        pharmacyId: z.string().uuid(),
        entries: z.array(z.object({ userId: z.string().uuid(), partnerName: z.string(), basisPoints: z.number().int().min(0).max(10000) })),
      })
      .parse(req.body);
    res.json(await finance.setOwnership(req.auth, body.pharmacyId, body.entries));
  }),
);

router.get(
  '/tax-summary',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await finance.taxSummary(req.auth, s(req.query.pharmacyId), s(req.query.from), s(req.query.to)));
  }),
);

// Accounts-payable aging (approved-but-unpaid expenses, bucketed by overdue days).
router.get(
  '/ap-aging',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await finance.apAging(req.auth, s(req.query.pharmacyId)));
  }),
);

// ---- CPP/EI (CRA) remittance tracking ----
router.get(
  '/cra-remittances',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await finance.craRemittances(req.auth, s(req.query.pharmacyId)));
  }),
);

// Manual trigger for the CRA-remittance escalation sweep — the scheduler
// runs this automatically once a day; exposed for testing.
router.post(
  '/cra-remittances/escalate',
  requirePermission(PERMISSIONS.SYSTEM_MONITOR),
  asyncHandler(async (req, res) => {
    const result = await runCraRemittanceEscalation();
    await recordAudit({ action: 'CREATE', entity: 'CraRemittanceEscalation', metadata: result, req });
    res.status(201).json(result);
  }),
);

// ---- Budgets & variance ----
const budgetSchema = z.object({
  pharmacyId: z.string().uuid(),
  category: z.enum(CATEGORIES),
  month: z.string(),
  amountCents: z.number().int().min(0),
});

router.put(
  '/budgets',
  requirePermission(PERMISSIONS.FINANCE_WRITE),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = budgetSchema.parse(req.body);
    const budget = await finance.setBudget(req.auth, input.pharmacyId, input.category, input.month, input.amountCents);
    await recordAudit({ action: 'UPDATE', entity: 'Budget', entityId: budget.id, req });
    res.json(budget);
  }),
);

router.get(
  '/budgets',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = s(req.query.pharmacyId) ?? req.auth.locationId;
    if (!pharmacyId) throw badRequest('pharmacyId is required');
    res.json(await finance.listBudgets(req.auth, pharmacyId, s(req.query.from), s(req.query.to)));
  }),
);

router.get(
  '/budget-variance',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = s(req.query.pharmacyId) ?? req.auth.locationId;
    if (!pharmacyId) throw badRequest('pharmacyId is required');
    res.json(await finance.budgetVariance(req.auth, pharmacyId, s(req.query.month)));
  }),
);

// ---- Cash-flow forecast ----
router.get(
  '/cash-flow-forecast',
  requirePermission(PERMISSIONS.FINANCE_READ),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    const pharmacyId = s(req.query.pharmacyId) ?? req.auth.locationId;
    if (!pharmacyId) throw badRequest('pharmacyId is required');
    res.json(await finance.cashFlowForecast(req.auth, pharmacyId));
  }),
);

export default router;
