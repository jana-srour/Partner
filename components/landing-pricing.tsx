'use client';

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import {
  billingFeatureLabels,
  billingPlans,
  type BillingPlan,
} from '@/lib/billing/plans';

type BillingInterval = 'monthly' | 'yearly';

const plans: BillingPlan[] = ['starter', 'pro', 'enterprise'];

export default function LandingPricing() {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  return (
    <section id="pricing" className="relative z-10 border-y border-white/[0.07] bg-[#0D0E12]">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:py-28">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#C9A76A]">
              Straightforward plans
            </p>
            <h2 className="mt-4 text-3xl font-black sm:text-5xl">
              Start with what you need.
              <br />
              <span className="text-white/45">Scale when you’re ready.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/50">
              Every new restaurant gets seven days of full platform access. Try the workspace, then choose a plan from Billing.
            </p>
          </div>

          <div className="flex w-fit items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1" aria-label="Billing interval">
            {(['monthly', 'yearly'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={interval === option}
                onClick={() => setInterval(option)}
                className={`rounded-md px-4 py-2.5 text-xs font-bold capitalize transition ${interval === option ? 'bg-[#C9A76A] text-[#0B0B0A]' : 'text-white/55 hover:text-white'}`}
              >
                {option === 'yearly' ? 'Yearly · save up to 3 months' : 'Monthly'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const details = billingPlans[plan];
            const price = interval === 'monthly' ? details.monthlyPrice : details.yearlyPrice;
            const isPro = plan === 'pro';
            const memberAllowance = details.teamMemberLimit === null
              ? 'Unlimited workspace accounts'
              : `${details.teamMemberLimit} workspace ${details.teamMemberLimit === 1 ? 'account' : 'accounts'}${details.teamMemberLimit > 1 ? ', including the owner' : ''}`;

            return (
              <article
                key={plan}
                className={`relative flex flex-col rounded-lg border p-5 sm:p-6 ${isPro ? 'border-[#C9A76A]/60 bg-[#171510]' : 'border-white/10 bg-white/[0.025]'}`}
              >
                {isPro && (
                  <span className="absolute right-4 top-4 rounded-sm bg-[#C9A76A] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#0B0B0A]">
                    Most chosen
                  </span>
                )}

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C9A76A]">
                    {details.name}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-white/55">{details.description}</p>
                </div>

                <div className="mt-6 flex items-end gap-2">
                  <span className="text-4xl font-black">${price}</span>
                  <span className="pb-1 text-xs text-white/45">/{interval === 'monthly' ? 'month' : 'year'}</span>
                </div>
                {interval === 'yearly' ? (
                  <p className="mt-1 text-xs text-white/45">
                    ${details.effectiveMonthlyRate.replace('$', '')} per month, billed annually · ${details.yearlyPrice} total
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-white/45">${details.yearlyPrice} when billed annually · {details.discount}</p>
                )}

                <div className="mt-5 border-y border-white/10 py-3 text-xs font-semibold text-white/70">
                  {memberAllowance}
                </div>

                <ul className="mt-5 flex-1 space-y-3">
                  {details.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-xs leading-5 text-white/75">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C9A76A]" />
                      {billingFeatureLabels[feature]}
                    </li>
                  ))}
                </ul>

                {plan === 'enterprise' && (
                  <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-white/45">
                    Includes branch-aware menus and orders, multi-location reporting, and advanced pricing tools.
                  </p>
                )}

                <Link
                  href="/signup"
                  className={`mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-3 text-xs font-black transition ${isPro ? 'bg-[#C9A76A] text-[#0B0B0A] hover:bg-[#D8B878]' : 'border border-white/15 text-white/80 hover:border-white/30 hover:text-white'}`}
                >
                  Start 7-day trial
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            );
          })}
        </div>

        <p className="mt-5 text-center text-[11px] leading-5 text-white/35">
          No plan is charged when you create your account. The trial starts at signup; choose or change your paid plan in workspace Billing.
        </p>
      </div>
    </section>
  );
}
