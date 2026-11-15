'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/components/providers/AppProvider';
import {
  Users,
  Search,
  Filter,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  ShoppingBag,
  Clock,
  ArrowUpRight,
  CheckCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function CustomersContent() {
  const { addToast } = useApp();
  const searchParams = useSearchParams();
  const initialCustomerId = searchParams.get('id');

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState('');

  // Selected customer for detail drawer
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomerId);
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (searchTerm) params.set('search', searchTerm);
      if (tierFilter) params.set('tier', tierFilter);

      const res = await fetch(`/api/customers?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data);
        setTotalCount(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [page, tierFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCustomers();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setTierFilter('');
    setPage(1);
  };

  const openCustomerDetail = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    try {
      setLoadingDetail(true);
      const res = await fetch(`/api/customers/${customerId}/risk`);
      const data = await res.json();
      if (data.success) {
        setCustomerDetail(data.data);
      } else {
        addToast(data.error || 'Failed to load customer profile', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Error fetching customer profile', 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (initialCustomerId) {
      openCustomerDetail(initialCustomerId);
    }
  }, [initialCustomerId]);

  const handleRecalculate = async () => {
    if (!selectedCustomerId) return;
    try {
      setRecalculating(true);
      const res = await fetch(`/api/customers/${selectedCustomerId}/risk/recalculate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        addToast('Customer risk profile updated', 'success');
        openCustomerDetail(selectedCustomerId);
        fetchCustomers();
      } else {
        addToast(data.error || 'Failed to recalculate profile', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Error recalculating profile', 'error');
    } finally {
      setRecalculating(false);
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            CRITICAL
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            HIGH
          </span>
        );
      case 'MODERATE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-50 text-yellow-700 border border-yellow-200">
            MODERATE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            LOW
          </span>
        );
    }
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 75) return 'bg-rose-500';
    if (score >= 50) return 'bg-amber-500';
    if (score >= 25) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'ACCELERATING':
        return <TrendingUp className="w-3.5 h-3.5 text-rose-500" />;
      case 'DECELERATING':
        return <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <Minus className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>Customer Risk Intelligence</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Historical refund velocity, spend ratios, behavioral trend metrics, and explainable risk scores.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search form */}
          <form onSubmit={handleSearch} className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer reference (e.g. CUST-)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </form>

          {/* Tier buttons */}
          <div className="flex items-center gap-1.5 self-start md:self-auto overflow-x-auto w-full md:w-auto">
            {['', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTierFilter(t);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tierFilter === t
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t === '' ? 'All Tiers' : t}
              </button>
            ))}

            {(searchTerm || tierFilter) && (
              <button
                onClick={handleResetFilters}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                title="Reset filters"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Loading customer risk records...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Users className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No customers found</p>
            <p className="text-xs text-slate-400">
              Generate synthetic refund claims or adjust your filter query.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Customer Ref</th>
                  <th className="py-3 px-3">Risk Tier</th>
                  <th className="py-3 px-3">Risk Score</th>
                  <th className="py-3 px-3">Lifetime Orders</th>
                  <th className="py-3 px-3">Refund Velocity (7d / 30d / 90d)</th>
                  <th className="py-3 px-3">Refund-to-Spend</th>
                  <th className="py-3 px-3">Behavior Trend</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => {
                  const prof = c.riskProfile;
                  const score = prof?.compositeScore ?? 10;
                  const tier = prof?.riskTier ?? 'LOW';
                  const trend = prof?.behaviourChangeTrend ?? 'INSUFFICIENT_HISTORY';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold text-slate-900 block">
                          {c.syntheticCustomerRef}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Joined {new Date(c.createdAt || c.accountCreatedAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="py-3 px-3">{getTierBadge(tier)}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800 w-10">
                            {score}/100
                          </span>
                          <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${getScoreBarColor(score)}`}
                              style={{ width: `${Math.min(score, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-slate-800">
                          {prof?.totalOrders ?? c.totalOrders ?? 0} orders
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          ${((prof?.totalPurchaseAmount ?? 0) / 100).toFixed(2)} lifetime
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">
                        {prof?.claimsLast7Days ?? 0} / {prof?.claimsLast30Days ?? 0} / {prof?.claimsLast90Days ?? 0}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono font-semibold text-slate-800">
                          {((prof?.refundToSpendRatio ?? 0) * 100).toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {prof?.totalRefundRequests ?? c.priorRefundCount ?? 0} claims
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 font-medium text-slate-700">
                          {getTrendIcon(trend)}
                          <span className="text-[11px]">{trend}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openCustomerDetail(c.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 text-xs font-medium transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50">
          <span>
            Showing {customers.length} of {totalCount} customers
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-700">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Drawer Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-base text-slate-900">
                    {customerDetail?.customer?.syntheticCustomerRef || 'Customer Profile'}
                  </span>
                  {customerDetail?.riskProfile && getTierBadge(customerDetail.riskProfile.riskTier)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  ID: {selectedCustomerId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRecalculate}
                  disabled={recalculating}
                  title="Recalculate Risk Profile"
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-6 flex-1 text-xs">
              {loadingDetail ? (
                <div className="p-12 text-center text-slate-500 space-y-2">
                  <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Loading customer profile intelligence...</p>
                </div>
              ) : customerDetail?.riskProfile ? (
                <>
                  {/* Score & Calculation Explanation Banner */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Composite Risk Assessment
                      </span>
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {customerDetail.riskProfile.compositeScore}/100
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getScoreBarColor(customerDetail.riskProfile.compositeScore)}`}
                        style={{ width: `${Math.min(customerDetail.riskProfile.compositeScore, 100)}%` }}
                      />
                    </div>

                    <p className="text-slate-700 text-xs leading-relaxed">
                      {customerDetail.riskProfile.calculationExplanation}
                    </p>

                    {customerDetail.riskProfile.scoreBreakdown && (
                      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-center text-[10px]">
                        <div className="p-1.5 rounded bg-white border border-slate-200">
                          <span className="text-slate-400 block">Baseline</span>
                          <span className="font-mono font-bold text-slate-800">
                            {customerDetail.riskProfile.scoreBreakdown.baselineScore} pts
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-white border border-slate-200">
                          <span className="text-slate-400 block">Penalties</span>
                          <span className="font-mono font-bold text-rose-600">
                            +{customerDetail.riskProfile.scoreBreakdown.penaltyPoints} pts
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-white border border-slate-200">
                          <span className="text-slate-400 block">Spend Credit</span>
                          <span className="font-mono font-bold text-emerald-600">
                            -{customerDetail.riskProfile.scoreBreakdown.creditPoints} pts
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-white border border-slate-200">
                          <span className="text-slate-400 block">Final Score</span>
                          <span className="font-mono font-bold text-slate-900">
                            {customerDetail.riskProfile.scoreBreakdown.finalScore}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 14 Historical Metrics Grid */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      14 Customer Historical Risk Metrics
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">1. Total Orders</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {customerDetail.riskProfile.totalOrders}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">2. Refund Requests</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {customerDetail.riskProfile.totalRefundRequests}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">3. Approved Refunds</span>
                        <span className="font-mono font-bold text-emerald-700 text-sm">
                          {customerDetail.riskProfile.approvedRefunds}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">4. Rejected Refunds</span>
                        <span className="font-mono font-bold text-rose-700 text-sm">
                          {customerDetail.riskProfile.rejectedRefunds}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">5. Manual Reviews</span>
                        <span className="font-mono font-bold text-amber-700 text-sm">
                          {customerDetail.riskProfile.manualReviews}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">6. Total Refund Amount</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          ${((customerDetail.riskProfile.totalRefundAmount || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">7. Total Purchase Spend</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          ${((customerDetail.riskProfile.totalPurchaseAmount || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">8. Refund-to-Order Ratio</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {((customerDetail.riskProfile.refundToOrderRatio || 0) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">9. Refund-to-Spend Ratio</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {((customerDetail.riskProfile.refundToSpendRatio || 0) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">10. Velocity (7d / 30d / 90d)</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {customerDetail.riskProfile.claimsLast7Days} / {customerDetail.riskProfile.claimsLast30Days} / {customerDetail.riskProfile.claimsLast90Days}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">11. Repeated Order Claims</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {customerDetail.riskProfile.repeatedRefundCount || 0}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">12. Prior Chargebacks</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {customerDetail.riskProfile.previousChargebacks || 0}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">13. Avg Days to Refund</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {customerDetail.riskProfile.avgDaysToRefund !== null
                            ? `${customerDetail.riskProfile.avgDaysToRefund.toFixed(1)} days`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">14. Behavior Trend</span>
                        <div className="flex items-center gap-1 font-bold text-slate-800 text-sm mt-0.5">
                          {getTrendIcon(customerDetail.riskProfile.behaviourChangeTrend)}
                          <span>{customerDetail.riskProfile.behaviourChangeTrend}</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-400 text-[10px] block">Data Completeness</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {customerDetail.riskProfile.dataCompleteness}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Signals List */}
                  {customerDetail.riskProfile.signals && customerDetail.riskProfile.signals.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">
                        Detected Behavioral Signals ({customerDetail.riskProfile.signals.length})
                      </span>
                      <div className="space-y-1.5">
                        {customerDetail.riskProfile.signals.map((sig: any, idx: number) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border text-xs space-y-1 ${
                              sig.severity === 'HIGH' || sig.severity === 'CRITICAL'
                                ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                                : sig.severity === 'MEDIUM'
                                ? 'bg-amber-50/60 border-amber-200 text-amber-950'
                                : 'bg-slate-50 border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{sig.name}</span>
                              <span className="font-mono font-bold text-[11px]">
                                {sig.scoreImpact > 0 ? `+${sig.scoreImpact}` : sig.scoreImpact} pts
                              </span>
                            </div>
                            <p className="text-[11px] opacity-90">{sig.description}</p>
                            {sig.evidence && (
                              <p className="text-[10px] font-mono text-slate-500">
                                Ref: {sig.evidence}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Refund Claims Timeline */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Refund Requests History ({customerDetail.refundRequests?.length || 0})
                    </span>
                    {customerDetail.refundRequests?.length > 0 ? (
                      <div className="space-y-1.5">
                        {customerDetail.refundRequests.map((req: any) => (
                          <div
                            key={req.id}
                            className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">
                                  {req.requestRef}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                    req.status === 'APPROVED'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : req.status === 'REJECTED'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {req.status}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Stated Reason: {req.reason.replace(/_/g, ' ')} •{' '}
                                {new Date(req.requestedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-slate-800 block">
                                ${(req.requestedAmount / 100).toFixed(2)}
                              </span>
                              <Link
                                href={`/requests?search=${req.requestRef}`}
                                className="text-[10px] text-emerald-600 font-semibold hover:underline inline-flex items-center gap-0.5"
                              >
                                <span>Inspect</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 italic text-xs">No refund claims on record.</p>
                    )}
                  </div>

                  {/* Orders Timeline */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Lifetime Orders ({customerDetail.orders?.length || 0})
                    </span>
                    {customerDetail.orders?.length > 0 ? (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {customerDetail.orders.map((ord: any) => (
                          <div
                            key={ord.id}
                            className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between"
                          >
                            <div>
                              <span className="font-mono font-semibold text-slate-800">
                                {ord.orderRef}
                              </span>
                              <p className="text-[10px] text-slate-500">
                                {ord.product?.name || 'Product'} •{' '}
                                {new Date(ord.purchasedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-slate-800 block">
                                ${(ord.totalAmount / 100).toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {ord.fulfilmentStatus}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 italic text-xs">No orders recorded.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-slate-500">
                  <p>Customer profile not available.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-500 animate-pulse">Loading Customer Intelligence...</div>}>
      <CustomersContent />
    </Suspense>
  );
}
