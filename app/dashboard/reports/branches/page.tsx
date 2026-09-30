'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Download, LockKeyhole, TrendingUp } from 'lucide-react';
import { DashboardLoader } from '@/app/dashboard/components/dashboard-loader';
import { PlanRequired } from '@/app/dashboard/components/plan-required';
import { supabase } from '@/lib/supabase';
import {
  getOrderFinancialBucket,
  sumOrderAmounts,
} from '@/lib/order-financials';
import {
  getReportPeriodRange,
  getReportsData,
  type ReportsData,
} from '@/lib/reports/data';
import {
  subscriptionAllows,
  type BillingPlan,
  type SubscriptionStatus,
} from '@/lib/billing/plans';

type Period = '7d' | '30d' | '90d' | '12m';

const periods: { key: Period; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: '12m', label: '12 months' },
];

export default function BranchReportsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [branchAccess, setBranchAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const checkBranchAccess = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        if (active) {
          setBranchAccess(false);
          setCheckingAccess(false);
          setLoading(false);
        }
        return;
      }

      const { data: membership } = await supabase
        .from('restaurant_members')
        .select('restaurant_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      const { data: subscription } = membership?.restaurant_id
        ? await supabase
            .from('restaurant_subscriptions')
            .select('plan_code, status, trial_ends_at')
            .eq('restaurant_id', membership.restaurant_id)
            .maybeSingle()
        : { data: null };

      const allowed = subscriptionAllows(
        subscription as {
          plan_code: BillingPlan;
          status: SubscriptionStatus;
          trial_ends_at: string;
        } | null,
        'branches',
      );

      if (active) {
        setBranchAccess(allowed);
        setCheckingAccess(false);
        if (!allowed) setLoading(false);
      }
    };

    void checkBranchAccess();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!branchAccess) return;
    let active = true;

    const loadReport = async () => {
      try {
        const report = await getReportsData(
          getReportPeriodRange(period),
        );
        if (active) setData(report);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Could not load branch report.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadReport();
    return () => {
      active = false;
    };
  }, [branchAccess, period]);

  const branchRows = useMemo(() => {
    if (!data) return [];

    const rows = data.branches.map((branch) => {
      const orders = data.orders.filter(
        (order) => order.branch_id === branch.id,
      );
      const delivered = orders.filter(
        (order) => getOrderFinancialBucket(order.status) === 'delivered',
      );
      const pending = orders.filter(
        (order) => getOrderFinancialBucket(order.status) === 'pending',
      );
      const cancelled = orders.filter(
        (order) => getOrderFinancialBucket(order.status) === 'excluded',
      );
      const revenue = sumOrderAmounts(orders, 'delivered');

      return {
        id: branch.id,
        name: branch.name,
        code: branch.code || '—',
        main: branch.is_main,
        active: branch.is_active,
        orderCount: orders.length,
        delivered: delivered.length,
        pending: pending.length,
        cancelled: cancelled.length,
        revenue,
        average: delivered.length ? revenue / delivered.length : 0,
      };
    });

    const unassignedOrders = data.orders.filter((order) => !order.branch_id);
    if (unassignedOrders.length) {
      const delivered = unassignedOrders.filter(
        (order) => getOrderFinancialBucket(order.status) === 'delivered',
      );
      const revenue = sumOrderAmounts(unassignedOrders, 'delivered');
      rows.push({
        id: 'unassigned',
        name: 'Unassigned',
        code: '—',
        main: false,
        active: false,
        orderCount: unassignedOrders.length,
        delivered: delivered.length,
        pending: unassignedOrders.filter(
          (order) => getOrderFinancialBucket(order.status) === 'pending',
        ).length,
        cancelled: unassignedOrders.filter(
          (order) => getOrderFinancialBucket(order.status) === 'excluded',
        ).length,
        revenue,
        average: delivered.length ? revenue / delivered.length : 0,
      });
    }

    return rows.sort((first, second) => second.revenue - first.revenue);
  }, [data]);

  const totals = useMemo(() => branchRows.reduce((result, branch) => ({
    orders: result.orders + branch.orderCount,
    delivered: result.delivered + branch.delivered,
    pending: result.pending + branch.pending,
    revenue: result.revenue + branch.revenue,
  }), { orders: 0, delivered: 0, pending: 0, revenue: 0 }), [branchRows]);

  const metrics = [
    {
      label: 'Branches',
      value: branchRows.filter((branch) => branch.id !== 'unassigned').length.toLocaleString(),
      detail: 'Configured locations',
      icon: Building2,
    },
    {
      label: 'Orders',
      value: totals.orders.toLocaleString(),
      detail: 'In selected period',
      icon: TrendingUp,
    },
    {
      label: 'Delivered revenue',
      value: formatMoney(totals.revenue),
      detail: `${totals.delivered.toLocaleString()} delivered orders`,
      icon: TrendingUp,
    },
    {
      label: 'Awaiting payment',
      value: totals.pending.toLocaleString(),
      detail: 'New, preparing or ready',
      icon: LockKeyhole,
    },
  ];

  function formatMoney(value: number) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: data?.restaurant.currency || 'USD',
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${data?.restaurant.currency || 'USD'} ${value.toFixed(2)}`;
    }
  }

  if (checkingAccess || loading && branchAccess) return <DashboardLoader />;
  if (!branchAccess) {
    return <PlanRequired featureName="Branch Management Reports" requiredPlan="Enterprise" />;
  }

  return (
    <div className="px-4 pb-8 sm:px-6 sm:pb-10 lg:px-8 lg:pb-12">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--portal-accent)' }}>
              Enterprise Analytics
            </p>
            <h2 className="mt-1 text-2xl font-black">Branch Management Report</h2>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              Compare branch activity, completed revenue, outstanding orders and average order value for the selected period.
            </p>
          </div>
          <Link
            href="/dashboard/reports/exports?report=branches"
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black"
            style={{ background: 'var(--portal-accent)', color: '#fff' }}
          >
            <Download className="h-4 w-4" /> Export branch report
          </Link>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--portal-border)' }}>
          <div className="flex flex-wrap gap-2" aria-label="Reporting period">
            {periods.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={period === item.key}
                onClick={() => {
                  setLoading(true);
                  setError('');
                  setPeriod(item.key);
                }}
                className="rounded-lg border px-3 py-2 text-xs font-bold"
                style={{
                  borderColor: period === item.key ? 'var(--portal-accent)' : 'var(--portal-border)',
                  background: period === item.key ? 'var(--portal-accent-soft)' : 'var(--portal-surface)',
                  color: 'var(--portal-text)',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
            {loading ? 'Loading branch data…' : `${branchRows.length} branches · ${totals.orders.toLocaleString()} orders`}
          </p>
        </section>

        {error && (
          <div className="rounded-xl border px-4 py-3 text-sm text-red-600" style={{ borderColor: 'var(--portal-border)' }}>
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, detail, icon: MetricIcon }) => {
            return (
              <article key={label} className="border-b p-4" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--portal-text-muted)' }}>{label}</p>
                  <MetricIcon className="h-4 w-4" style={{ color: 'var(--portal-accent)' }} />
                </div>
                <p className="mt-3 text-xl font-black">{value}</p>
                <p className="mt-1 text-[10px]" style={{ color: 'var(--portal-text-muted)' }}>{detail}</p>
              </article>
            );
          })}
        </section>

        <section className="overflow-x-auto border-y" style={{ borderColor: 'var(--portal-border)', background: 'var(--portal-surface)' }}>
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b text-[10px] font-black uppercase tracking-[0.1em]" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Delivered</th>
                <th className="px-4 py-3 text-right">Pending</th>
                <th className="px-4 py-3 text-right">Cancelled / Other</th>
                <th className="px-4 py-3 text-right">Delivered Revenue</th>
                <th className="px-4 py-3 text-right">Avg. Delivered Order</th>
              </tr>
            </thead>
            <tbody>
              {branchRows.map((branch) => (
                <tr key={branch.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--portal-border)' }}>
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold">{branch.name}{branch.main ? ' · Main' : ''}</p>
                    <p className="mt-0.5 text-[10px]" style={{ color: 'var(--portal-text-muted)' }}>{branch.code}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{branch.id === 'unassigned' ? 'Unassigned' : branch.active ? 'Active' : 'Inactive'}</td>
                  <td className="px-4 py-3 text-right text-xs">{branch.orderCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs">{branch.delivered.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs">{branch.pending.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs">{branch.cancelled.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold">{formatMoney(branch.revenue)}</td>
                  <td className="px-4 py-3 text-right text-xs">{formatMoney(branch.average)}</td>
                </tr>
              ))}
              {!branchRows.length && !loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--portal-text-muted)' }}>No branch or order data is available for this period.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
