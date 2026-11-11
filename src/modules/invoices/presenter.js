import { PAYMENT_METHOD } from '../../utils/enums.js';

export function presentInvoice(invoice) {
  if (!invoice) return null;

  return {
    id: String(invoice._id),
    invoiceNumber: invoice.invoiceNumber,
    visitId: invoice.visit ? String(invoice.visit._id ?? invoice.visit) : null,
    type: invoice.type,
    playerName: invoice.playerName ?? '',
    lines: (invoice.lines ?? []).map((line) => ({
      kind: line.kind,
      refId: line.refId ? String(line.refId) : null,
      description: line.description,
      qty: line.qty,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: line.lineTotalMinor,
      costMinor: line.costMinor ?? 0,
      meta: line.meta ?? {},
    })),
    subtotalMinor: invoice.subtotalMinor,
    adjustmentMinor: invoice.adjustmentMinor ?? 0,
    adjustmentNote: invoice.adjustmentNote ?? '',
    totalMinor: invoice.totalMinor,
    costTotalMinor: invoice.costTotalMinor ?? 0,
    issuedAt: invoice.issuedAt,
    paidAt: invoice.paidAt,
    paymentMethod: invoice.paymentMethod ?? PAYMENT_METHOD.CASH,
    status: invoice.status,
    currency: invoice.currency ?? 'EGP',
    storeSnapshot: invoice.storeSnapshot ?? {},
    openedAt: invoice.openedAt ?? null,
    closedAt: invoice.closedAt ?? null,
  };
}
