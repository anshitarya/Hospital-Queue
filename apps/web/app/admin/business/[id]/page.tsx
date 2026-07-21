'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useRequireRole } from '@/lib/useRequireRole';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { Toast, type ToastMessage } from '@/components/Toast';
import { formatDateTimeIst, formatDateIst } from '@/lib/datetime';

interface BusinessProfile {
  id: string;
  name: string;
  address: string | null;
  businessType: string;
  createdAt: string;
  activeLocationsCount: number;
  doctorsCount: number;
  receptionistsCount: number;
}

interface BillingInfo {
  id: string;
  planName: string;
  billingCycle: string;
  billingCycleStart: string;
  billingCycleEnd: string;
  customPricing: Record<string, number> | null;
  outstandingAmount: number;
  status: string;
  currentBill: number;
  itemsAccrued: { eventType: string; count: number; price: number; total: number }[];
}

interface UsageTrend {
  monthName: string;
  year: number;
  eventsCount: number;
  completedTokens: number;
}

export default function BusinessDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const businessId = params.id as string;

  const { ready } = useRequireRole(['ADMIN']);

  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [usageTrend, setUsageTrend] = useState<UsageTrend[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Modals/Forms State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);

  // Custom Invoice Modal
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceStart, setInvoiceStart] = useState('');
  const [invoiceEnd, setInvoiceEnd] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState('0');
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  // Search/Filter usage timeline
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL');
  const [timelineSearch, setTimelineSearch] = useState('');

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api<any>(`/billing/businesses/${businessId}/details`);
      setProfile(data.profile);
      setBilling(data.billing);
      setRecentEvents(data.recentEvents);
      setInvoices(data.invoices);
      setUsageTrend(data.usageTrend);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to load business details' });
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (ready && businessId) {
      loadDetails();
    }
  }, [ready, businessId, loadDetails]);

  const handlePayInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      setPaymentBusy(true);
      await api(`/billing/invoices/${selectedInvoice.id}/pay`, {
        method: 'POST',
        body: {
          amount: parseFloat(paymentAmount) || Number(selectedInvoice.total),
          paymentMethod,
          referenceId: paymentRef,
        },
      });
      setToast({ type: 'ok', msg: 'Payment settled successfully!' });
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentRef('');
      loadDetails();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to process payment' });
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleVoidInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete (void) this unpaid invoice? This will reduce the clinic outstanding balance accordingly.')) {
      return;
    }
    try {
      await api(`/billing/invoices/${invoiceId}/void`, {
        method: 'POST',
      });
      setToast({ type: 'ok', msg: 'Invoice successfully deleted / voided.' });
      loadDetails();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to void invoice' });
    }
  };

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceStart || !invoiceEnd) return;
    try {
      setInvoiceBusy(true);
      const res = await api<any>(`/billing/businesses/${businessId}/generate-invoice`, {
        method: 'POST',
        body: {
          startDate: new Date(invoiceStart).toISOString(),
          endDate: new Date(invoiceEnd).toISOString(),
          discount: parseFloat(invoiceDiscount) || 0,
        },
      });
      setToast({ type: 'ok', msg: `Invoice ${res.invoiceNumber} created!` });
      setShowInvoiceModal(false);
      loadDetails();
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to generate invoice' });
    } finally {
      setInvoiceBusy(false);
    }
  };

  if (!ready || loading) return <PageLoader label="Loading business dashboard..." />;
  if (!profile) return <div className="p-8 text-center text-red-500">Business not found.</div>;

  // Max events count for trend graph scaling
  const maxEvents = Math.max(...usageTrend.map((t) => t.eventsCount), 50);

  return (
    <>
      <Header title={`${profile.name} — Profile & Billing`} />
      <main className="mx-auto max-w-6xl px-4 py-5 space-y-6 animate-fade-in">
        
        {/* Back Button */}
        <button
          type="button"
          onClick={() => router.push('/admin?tab=billing')}
          className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5"
        >
          ← Back to Billing Dashboard
        </button>

        {/* Top summary section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Profile Details */}
          <div className="card p-5 space-y-4 lg:col-span-2">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase bg-brand-100 text-brand-700 px-2 py-0.5 rounded">
                  {profile.businessType}
                </span>
                <h1 className="text-2xl font-bold text-slate-800 mt-1.5">{profile.name}</h1>
                <p className="text-xs text-slate-500 mt-0.5">{profile.address || 'No address provided'}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Registered on</span>
                <span className="text-sm font-semibold text-slate-700">{formatDateIst(profile.createdAt)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4 text-center">
              <div>
                <span className="text-xl font-bold text-slate-800 block">{profile.activeLocationsCount}</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Branches</span>
              </div>
              <div>
                <span className="text-xl font-bold text-slate-800 block">{profile.doctorsCount}</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Professionals</span>
              </div>
              <div>
                <span className="text-xl font-bold text-slate-800 block">{profile.receptionistsCount}</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Staff</span>
              </div>
            </div>
          </div>

          {/* Billing Overview Card */}
          <div className="card p-5 bg-slate-900 text-white flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Current Plan</span>
                <h2 className="text-lg font-bold mt-0.5 text-brand-300">{billing?.planName || 'None'}</h2>
              </div>
              <span className="pill bg-emerald-500/20 text-emerald-300 ring-emerald-500/30 text-xs">
                {billing?.status}
              </span>
            </div>

            <div className="my-4 space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Accrued this cycle:</span>
                <span className="font-mono text-slate-200">₹{billing?.currentBill}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span>Outstanding Balance:</span>
                <span className="font-mono text-brand-400">₹{billing?.outstandingAmount}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(end.getDate() - 30);
                  setInvoiceStart(start.toISOString().slice(0, 10));
                  setInvoiceEnd(end.toISOString().slice(0, 10));
                  setInvoiceDiscount('0');
                  setShowInvoiceModal(true);
                }}
                className="btn-primary !bg-brand-500 hover:!bg-brand-600 !text-white flex-1 text-center py-1.5 text-xs rounded-lg"
              >
                Generate Invoice
              </button>
            </div>
          </div>
        </div>

        {/* Growth Trend and Pricing Overrides */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Custom SVG line graph */}
          <div className="card p-5 lg:col-span-2 space-y-4">
            <h3 className="section-title">Platform usage trend (Last 6 Months)</h3>
            <div className="relative h-44 w-full flex items-end justify-between gap-1 pt-4 px-2">
              {usageTrend.map((t, idx) => {
                const heightPct = (t.eventsCount / maxEvents) * 80;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div className="w-full bg-slate-100 rounded-t-lg relative group transition-all hover:bg-brand-100" style={{ height: `${heightPct}%` }}>
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 font-mono">
                        {t.eventsCount} ev
                      </div>
                      <div className="w-full bg-brand-500 rounded-t-lg absolute bottom-0" style={{ height: `${t.completedTokens > 0 ? (t.completedTokens / t.eventsCount) * 100 : 0}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500 font-semibold mt-1.5">{t.monthName}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 text-[10px] justify-center pt-2 text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-slate-300 rounded" /> Total Events</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-brand-500 rounded" /> Completed Tokens</span>
            </div>
          </div>

          {/* Pricing breakdown rules */}
          <div className="card p-5 space-y-3">
            <h3 className="section-title">Pricing Breakdown</h3>
            <div className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-600">Cycle Period</span>
                <span className="font-semibold text-slate-800 uppercase text-xs">{billing?.billingCycle || 'MONTHLY'}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-600">Price per Completed Token</span>
                <span className="font-semibold text-slate-800">₹{billing ? billing.itemsAccrued.find(i => i.eventType === 'TOKEN_COMPLETED')?.price || 5.00 : 5.00}</span>
              </div>
              <div className="py-2.5">
                <span className="text-xs text-slate-400 block uppercase tracking-wider mb-2 font-semibold">Active Accrued Items</span>
                {billing && billing.itemsAccrued.length > 0 ? (
                  <div className="space-y-1.5">
                    {billing.itemsAccrued.map((item) => (
                      <div key={item.eventType} className="flex justify-between text-xs bg-slate-50 p-1.5 rounded border border-slate-100 font-mono">
                        <span className="text-slate-500">{item.eventType}</span>
                        <span className="text-slate-700">{item.count} × ₹{item.price} = ₹{item.total}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">No usage recorded yet in this cycle.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Invoice and usage timeline tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Invoice History */}
          <div className="card lg:col-span-2 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <h3 className="section-title">Invoice History</h3>
            </div>
            {invoices.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400 italic">No invoices generated yet.</div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {invoices.map((inv) => (
                  <div key={inv.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50">
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-800 block text-xs">{inv.invoiceNumber}</span>
                      <span className="text-[10px] text-slate-400 block">
                        {formatDateIst(inv.startDate)} — {formatDateIst(inv.endDate)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-slate-700">₹{Number(inv.total)}</span>
                      <span className={`pill text-[10px] uppercase font-bold ${
                        inv.status === 'PAID' 
                          ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' 
                          : inv.status === 'VOID'
                          ? 'bg-slate-100 text-slate-500 ring-slate-200 line-through'
                          : 'bg-rose-100 text-rose-800 ring-rose-200'
                      }`}>
                        {inv.status}
                      </span>
                      {inv.status === 'UNPAID' && (
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setPaymentAmount(String(inv.total));
                              setPaymentRef('');
                              setShowPaymentModal(true);
                            }}
                            className="btn-primary !py-1 !px-2.5 text-[10px]"
                          >
                            Settle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVoidInvoice(inv.id)}
                            className="btn-secondary !py-1 !px-2.5 text-[10px] !text-rose-600 hover:!bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Usage Timeline */}
          <div className="card lg:col-span-3 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
              <h3 className="section-title">Telemetry Events Log</h3>
              <select
                className="input py-1 px-2 text-xs w-auto"
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
              >
                <option value="ALL">All Events</option>
                {Array.from(new Set(recentEvents.map((e) => e.eventType))).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            
            <div className="p-2 bg-slate-50 border-b border-slate-100">
              <input
                type="text"
                placeholder="Quick search timeline by ID or Reference..."
                className="input py-1 px-2 text-xs"
                value={timelineSearch}
                onChange={(e) => setTimelineSearch(e.target.value)}
              />
            </div>

            {recentEvents.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400 italic">No events recorded.</div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto font-mono text-[10px]">
                {recentEvents
                  .filter((e) => {
                    const matchesType = eventTypeFilter === 'ALL' || e.eventType === eventTypeFilter;
                    const matchesSearch = timelineSearch === '' || 
                      e.id.includes(timelineSearch) || 
                      (e.referenceId && e.referenceId.toLowerCase().includes(timelineSearch.toLowerCase()));
                    return matchesType && matchesSearch;
                  })
                  .map((e) => (
                    <div key={e.id} className="p-3 flex items-start justify-between hover:bg-slate-50/50 gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            e.billingStatus === 'UNPROCESSED' 
                              ? 'bg-amber-100 text-amber-800' 
                              : e.billingStatus === 'BILLED' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {e.billingStatus}
                          </span>
                          <span className="font-bold text-slate-700">{e.eventType}</span>
                        </div>
                        <div className="text-slate-400 truncate text-[9px] mt-0.5">
                          Ref: {e.referenceId || 'N/A'} · Cust: {e.customerId || 'None'}
                        </div>
                      </div>
                      <span className="text-slate-400 whitespace-nowrap">{formatDateTimeIst(e.timestamp)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal: Settle Payment */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 animate-scale-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800">Settle Invoice {selectedInvoice.invoiceNumber}</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>
            <form onSubmit={handlePayInvoice} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Payment Amount (₹)</label>
                <input
                  type="number"
                  className="input font-mono"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Payment Method</label>
                <select
                  className="input"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="CARD">Debit / Credit Card</option>
                  <option value="UPI">UPI Payment</option>
                  <option value="NETBANKING">Net Banking</option>
                  <option value="CASH">Cash Settle</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Transaction Reference ID</label>
                <input
                  type="text"
                  placeholder="e.g. TXN9876543210"
                  className="input font-mono"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary" disabled={paymentBusy}>
                  {paymentBusy ? 'Processing...' : 'Confirm Settle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Generate Custom Invoice */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 animate-scale-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800">Generate Custom Range Invoice</h3>
              <button onClick={() => setShowInvoiceModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>
            <form onSubmit={handleGenerateInvoice} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
                  <input
                    type="date"
                    className="input"
                    value={invoiceStart}
                    onChange={(e) => setInvoiceStart(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
                  <input
                    type="date"
                    className="input"
                    value={invoiceEnd}
                    onChange={(e) => setInvoiceEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Flat Discount (₹)</label>
                <input
                  type="number"
                  className="input"
                  value={invoiceDiscount}
                  onChange={(e) => setInvoiceDiscount(e.target.value)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowInvoiceModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary" disabled={invoiceBusy}>
                  {invoiceBusy ? 'Generating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
