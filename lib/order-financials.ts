export type OrderFinancialBucket = 'delivered' | 'pending' | 'excluded';

function normalizeOrderStatus(status: string | null | undefined) {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

const cancelledStatuses = new Set([
  'cancelled',
  'canceled',
  'rejected',
  'declined',
  'voided',
]);

const deliveredStatuses = new Set([
  'delivered',
  'completed',
  'complete',
  'paid',
  'done',
  'fulfilled',
]);

const pendingStatuses = new Set([
  'new',
  'preparing',
  'processing',
  'in_progress',
  'ready',
  'ready_for_pickup',
]);

export function getOrderFinancialBucket(
  status: string | null | undefined,
): OrderFinancialBucket {
  const normalized = normalizeOrderStatus(status);

  if (cancelledStatuses.has(normalized)) return 'excluded';
  if (deliveredStatuses.has(normalized)) return 'delivered';
  if (pendingStatuses.has(normalized)) return 'pending';
  return 'excluded';
}

export function isCancelledOrderStatus(status: string | null | undefined) {
  return cancelledStatuses.has(normalizeOrderStatus(status));
}

export function sumOrderAmounts<T extends {
  status: string | null | undefined;
  total: number | string | null | undefined;
}>(orders: readonly T[], bucket: 'delivered' | 'pending') {
  return orders.reduce((sum, order) => {
    if (getOrderFinancialBucket(order.status) !== bucket) return sum;
    const amount = Number(order.total || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}