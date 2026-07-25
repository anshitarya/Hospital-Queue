'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Toast, type ToastMessage } from '@/components/Toast';
import { TableSkeleton } from '@/components/Skeleton';
import { formatTimeIst, formatDateIst } from '@/lib/datetime';

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

interface BillingTabProps {
  setToast: (msg: ToastMessage | null) => void;
  user: any;
}

export function BillingTab({ setToast, user }: BillingTabProps) {
  const [billingDetails, setBillingDetails] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);

  const fetchBillingData = useCallback(async () => {
    setLoading(true);
    try {
      const [details, availablePlans] = await Promise.all([
        api<any>('/billing/my-business'),
        api<any[]>('/billing/plans'),
      ]);
      setBillingDetails(details);
      setPlans(availablePlans || []);
    } catch (err) {
      setToast({
        type: 'err',
        msg: err instanceof ApiError ? err.message : 'Failed to load billing details',
      });
    } finally {
      setLoading(false);
    }
  }, [setToast]);

  useEffect(() => {
    void fetchBillingData();
  }, [fetchBillingData]);

  const handleSubscribe = async (planId: string) => {
    try {
      setSubmittingPlanId(planId);
      
      // 1. Create order on NestJS backend
      const response = await api<any>('/billing/subscriptions/create-order', {
        method: 'POST',
        body: { planId },
      });

      if (!response.requiresPayment) {
        setToast({ type: 'ok', msg: 'Successfully subscribed to the free plan!' });
        void fetchBillingData();
        return;
      }

      // 2. Load Razorpay script dynamically
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setToast({ type: 'err', msg: 'Failed to load Razorpay SDK. Check your internet connection.' });
        return;
      }

      // 3. Launch Razorpay checkout
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_5Wq99F12AaaBcD',
        amount: response.amount,
        currency: response.currency,
        name: 'Turnos Queue System',
        description: `Upgrade to ${plans.find((p) => p.id === planId)?.name || 'Plan'}`,
        order_id: response.orderId,
        handler: async function (paymentResponse: any) {
          try {
            setLoading(true);
            // Verify payment on backend
            await api('/billing/subscriptions/verify', {
              method: 'POST',
              body: {
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              },
            });

            setToast({ type: 'ok', msg: 'Payment verified! Subscription activated successfully.' });
            void fetchBillingData();
          } catch (verifyErr) {
            setToast({
              type: 'err',
              msg: verifyErr instanceof ApiError ? verifyErr.message : 'Payment verification failed.',
            });
          } finally {
            setLoading(false);
          }
        },
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        theme: {
          color: '#0ea5e9',
        },
        modal: {
          ondismiss: function () {
            setToast({ type: 'err', msg: 'Subscription payment cancelled' });
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err) {
      setToast({
        type: 'err',
        msg: err instanceof ApiError ? err.message : 'Failed to initialize subscription purchase',
      });
    } finally {
      setSubmittingPlanId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="card p-6 h-40 animate-pulse bg-slate-100 dark:bg-slate-800" />
        <TableSkeleton rows={5} cols={4} />
      </div>
    );
  }

  const activePlanId = billingDetails?.billing?.planId || null;
  const currentPlan = billingDetails?.billing;

  return (
    <div className="space-y-8">
      {/* Overview Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Plan Card */}
        <div className="lg:col-span-2 card relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-850 text-white p-6 shadow-xl">
          <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Current Plan</span>
                <h3 className="text-2xl font-bold mt-1 text-white">{currentPlan?.planName || 'No Active Plan'}</h3>
                <p className="text-sm text-slate-300 mt-1.5 max-w-md">
                  Status:{' '}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      currentPlan?.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30'
                    }`}
                  >
                    {currentPlan?.status || 'INACTIVE'}
                  </span>
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 shadow-lg">
                <svg className="w-8 h-8 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
              <div>
                <p className="text-xs text-slate-400">Billing Cycle Start</p>
                <p className="text-sm font-medium mt-1">
                  {currentPlan?.billingCycleStart ? formatDateIst(currentPlan.billingCycleStart) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Next Renewal Date</p>
                <p className="text-sm font-medium mt-1">
                  {currentPlan?.billingCycleEnd ? formatDateIst(currentPlan.billingCycleEnd) : '—'}
                </p>
              </div>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-12 translate-y-12">
            <svg className="w-64 h-64 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z" />
            </svg>
          </div>
        </div>

        {/* Current Balance / Bill Accrued Card */}
        <div className="card p-6 flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Accrued Usage Charges</span>
              <span className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">Uninvoiced</span>
            </div>
            <h3 className="text-4xl font-bold mt-3 text-slate-900 dark:text-white">
              ₹{billingDetails?.billing?.currentBill != null ? billingDetails.billing.currentBill.toFixed(2) : '0.00'}
            </h3>
            <p className="text-xs text-slate-400 mt-2">
              Based on completed events during this billing period.
            </p>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Outstanding Balance:</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              ₹{billingDetails?.billing?.outstandingAmount != null ? billingDetails.billing.outstandingAmount.toFixed(2) : '0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Current Cycle Usage Details */}
      {billingDetails?.billing?.itemsAccrued && billingDetails.billing.itemsAccrued.length > 0 && (
        <div className="card p-6 shadow-sm space-y-4">
          <h4 className="text-sm font-semibold text-slate-950 dark:text-white">Active Cycle Usage Telemetry</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="py-2.5">Event Type</th>
                  <th className="py-2.5 text-center">Unit Price</th>
                  <th className="py-2.5 text-center">Count</th>
                  <th className="py-2.5 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {billingDetails.billing.itemsAccrued.map((item: any, idx: number) => (
                  <tr key={idx} className="text-slate-700 dark:text-slate-300">
                    <td className="py-3 font-medium font-mono text-xs">{item.eventType}</td>
                    <td className="py-3 text-center">₹{item.price.toFixed(2)}</td>
                    <td className="py-3 text-center">{item.count}</td>
                    <td className="py-3 text-right font-medium">₹{item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pricing / Plan Catalog Selection */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-950 dark:text-white">Subscription Plans</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Upgrade or downgrade your Turnos queue billing plan instantly.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = plan.id === activePlanId;
            const flatRateRule = plan.rules?.find((r: any) => r.ruleType === 'FLAT_RATE');
            const tokenRule = plan.rules?.find((r: any) => r.eventType === 'TOKEN_COMPLETED');
            const priceMonthly = flatRateRule ? Number(flatRateRule.price) : 0;
            const pricePerToken = tokenRule ? Number(tokenRule.price) : 0;

            return (
              <div
                key={plan.id}
                className={`card flex flex-col justify-between p-6 transition-all relative overflow-hidden ${
                  isCurrent
                    ? 'ring-2 ring-sky-500 shadow-lg scale-102 dark:bg-slate-900'
                    : 'hover:shadow-md dark:hover:bg-slate-900/60'
                }`}
              >
                {isCurrent && (
                  <span className="absolute top-0 right-0 bg-sky-500 text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-bl-xl">
                    Active
                  </span>
                )}

                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">{plan.name}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 h-8 line-clamp-2">
                      {plan.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="py-2 border-t border-b border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                        ₹{priceMonthly}
                      </span>
                      <span className="text-xs text-slate-400">/ month</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0" />
                      Token price: <strong className="text-slate-850 dark:text-white">₹{pricePerToken}</strong> per completed queue visit
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="w-full btn-secondary text-center justify-center cursor-default bg-slate-100 text-slate-400 dark:bg-slate-800"
                    >
                      Currently Subscribed
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submittingPlanId != null}
                      onClick={() => void handleSubscribe(plan.id)}
                      className={`w-full text-center justify-center font-semibold rounded-xl text-sm py-2.5 transition-all ${
                        priceMonthly > 0
                          ? 'btn-primary'
                          : 'btn-secondary'
                      }`}
                    >
                      {submittingPlanId === plan.id ? 'Connecting...' : priceMonthly > 0 ? 'Upgrade Now' : 'Select Free Plan'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoice & Payment History */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-950 dark:text-white">Invoice & Payment History</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">View and track all your platform invoices and payment cycles.</p>
        </div>

        <div className="card shadow-sm overflow-hidden">
          {billingDetails?.invoices && billingDetails.invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Invoice ID</th>
                    <th className="px-6 py-4">Billing Period</th>
                    <th className="px-6 py-4 text-center">Amount</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Generated At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {billingDetails.invoices.map((inv: any) => (
                    <tr key={inv.id} className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                      <td className="px-6 py-4 font-semibold font-mono text-xs text-sky-600 dark:text-sky-400">{inv.invoiceNumber}</td>
                      <td className="px-6 py-4 text-xs whitespace-nowrap">
                        {formatDateIst(inv.startDate)} — {formatDateIst(inv.endDate)}
                      </td>
                      <td className="px-6 py-4 text-center font-medium text-slate-900 dark:text-white">
                        ₹{Number(inv.total).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            inv.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : inv.status === 'UNPAID'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-950/40 dark:text-slate-400'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs text-slate-400 whitespace-nowrap">
                        {formatDateIst(inv.generatedDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">No transaction invoice records found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
