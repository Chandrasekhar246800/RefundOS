'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import Link from 'next/link';
import {
  ShieldCheck,
  XCircle,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Sparkles,
  Play,
  Layers,
  TrendingUp,
  DollarSign,
  PackageCheck,
  CheckCircle2,
} from 'lucide-react';

export default function DashboardPage() {
  const { activeBrandId, addToast } = useApp();
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const url =
        activeBrandId && activeBrandId !== 'all'
          ? `/api/dashboard/metrics?brandId=${activeBrandId}`
          : '/api/dashboard/metrics';
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setMetrics(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [activeBrandId]);

  const handleProcessAllPending = async () => {
    try {
      setIsProcessing(true);
      // Fetch pending requests first
      const reqRes = await fetch('/api/refund-requests?status=PENDING&limit=50');
      const reqData = await reqRes.json();
      if (!reqData.success || reqData.data.length === 0) {
        addToast('No pending refund requests found to process.', 'info');
        setIsProcessing(false);
        return;
      }

      const pendingIds = reqData.data.map((r: any) => r.id);
      const res = await fetch('/api/refund-requests/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestIds: pendingIds }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Processing started for ${pendingIds.length} requests.`, 'success');
        setTimeout(fetchMetrics, 1500);
      } else {
        addToast(data.error || 'Failed to start processing', 'error');
      }
    } catch {
      addToast('Network error during batch processing', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
        <div className="h-64 bg-slate-200 rounded-xl"></div>
      </div>
    );
  }

  const overview = metrics?.overview || {};
  const cm = metrics?.confusionMatrix || {};
  const batches = metrics?.recentBatches || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Refund Operations Command Center
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time live telemetry of AI-evaluated refund requests, policy guardrails, and simulated transaction volume.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/generator"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Generate 10+10 Dataset</span>
          </Link>
          <button
            onClick={handleProcessAllPending}
            disabled={isProcessing || overview.pendingCount === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isProcessing ? 'Processing...' : `Process All Pending (${overview.pendingCount || 0})`}</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Approved Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Approved Refunds
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{overview.approvedCount || 0}</span>
            <span className="text-xs font-medium text-emerald-600">
              ({overview.approvalRate || 0}%)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-slate-400" />
            <span>Simulated Value:</span>
            <span className="font-semibold text-slate-700">
              ${((overview.totalSimulatedApprovedAmount || 0) / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Rejected Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Rejected Claims
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{overview.rejectedCount || 0}</span>
            <span className="text-xs font-medium text-rose-600">
              ({overview.rejectionRate || 0}%)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-slate-400" />
            <span>Prevented Loss:</span>
            <span className="font-semibold text-slate-700">
              ${((overview.totalSimulatedRejectedAmount || 0) / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Manual Review Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Manual Review Queue
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{overview.manualReviewCount || 0}</span>
            <span className="text-xs font-medium text-amber-600">
              ({overview.manualReviewRate || 0}%)
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            High value or ambiguous evidence flagged for human check.
          </p>
        </div>

        {/* Pending & Processing */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Unprocessed Backlog
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{overview.pendingCount || 0}</span>
            <span className="text-xs text-slate-500">Pending</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>In Processing: {overview.processingCount || 0}</span>
            <span>Failed: {overview.failedCount || 0}</span>
          </div>
        </div>
      </div>

      {/* Middle Section: Ground Truth Evaluation Matrix & Accuracy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Confusion Matrix Card */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900">
                  Ground Truth Confusion Matrix
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded border border-purple-200">
                  DEMO EVALUATION METRIC
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluated against synthetic ground truth (isolated from the AI model during decisions).
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-600">{cm.accuracy || 0}%</span>
              <p className="text-[10px] text-slate-500 font-medium">Model Accuracy</p>
            </div>
          </div>

          {/* 2x2 Matrix Grid */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* True Positive */}
            <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                <span>True Positives (TP)</span>
                <span className="text-lg font-bold text-emerald-700">{cm.truePositives || 0}</span>
              </div>
              <p className="text-[11px] text-emerald-700 mt-1">
                Legitimate refund requests correctly <strong>APPROVED</strong>.
              </p>
            </div>

            {/* False Positive (Critical Risk Error) */}
            <div className="p-4 rounded-lg bg-rose-50/70 border border-rose-200">
              <div className="flex items-center justify-between text-xs font-semibold text-rose-900">
                <span>False Positives (FP)</span>
                <span className="text-lg font-bold text-rose-700">{cm.falsePositives || 0}</span>
              </div>
              <p className="text-[11px] text-rose-700 mt-1">
                Non-legitimate requests mistakenly <strong>APPROVED</strong> (Risk Error).
              </p>
            </div>

            {/* False Negative */}
            <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
                <span>False Negatives (FN)</span>
                <span className="text-lg font-bold text-amber-700">{cm.falseNegatives || 0}</span>
              </div>
              <p className="text-[11px] text-amber-700 mt-1">
                Legitimate requests incorrectly <strong>REJECTED</strong>.
              </p>
            </div>

            {/* True Negative */}
            <div className="p-4 rounded-lg bg-blue-50/70 border border-blue-200">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                <span>True Negatives (TN)</span>
                <span className="text-lg font-bold text-blue-700">{cm.trueNegatives || 0}</span>
              </div>
              <p className="text-[11px] text-blue-700 mt-1">
                Non-legitimate/fraudulent requests correctly <strong>REJECTED</strong>.
              </p>
            </div>
          </div>

          {/* Metric Bar Row: Precision, Recall, F1 */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-center">
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Precision</p>
              <p className="text-base font-bold text-slate-800">{cm.precision || 0}%</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Recall</p>
              <p className="text-base font-bold text-slate-800">{cm.recall || 0}%</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">F1 Score</p>
              <p className="text-base font-bold text-slate-800">{cm.f1Score || 0}%</p>
            </div>
          </div>
        </div>

        {/* Quick Operations & Overview Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-900">Catalog & System Metrics</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                <span className="text-slate-500">Configured Fictional Brands:</span>
                <span className="font-semibold text-slate-800">{overview.totalBrands || 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                <span className="text-slate-500">Active Products in Catalog:</span>
                <span className="font-semibold text-slate-800">{overview.totalProducts || 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                <span className="text-slate-500">Total Refund Requests:</span>
                <span className="font-semibold text-slate-800">{overview.totalRequests || 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                <span className="text-slate-500">Total Manual Reviews:</span>
                <span className="font-semibold text-amber-600">{cm.totalManualReviews || 0}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-2">
            <Link
              href="/requests"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <span>Explore All Requests Inbox</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/batches"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
            >
              <span>View Processing Batches</span>
              <Layers className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Processing Batches */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Recent Processing Batches</h3>
            <p className="text-xs text-slate-500">
              Traceability and outcome reports for recent bulk decision runs.
            </p>
          </div>
          <Link
            href="/batches"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            <span>View All Batches</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {batches.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No processing batches yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Use the Synthetic Generator to create a 10+10 request batch, then click Process Refunds.
            </p>
            <Link
              href="/generator"
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Go to Generator</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Batch ID</th>
                  <th className="py-2.5 px-3">Brand</th>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Progress</th>
                  <th className="py-2.5 px-3">Approved</th>
                  <th className="py-2.5 px-3">Rejected</th>
                  <th className="py-2.5 px-3">Review</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b: any) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                      {b.id.slice(0, 12)}...
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{b.brand?.name}</td>
                    <td className="py-2.5 px-3 text-slate-600">{b.product?.name || 'All'}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          b.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : b.status === 'PROCESSING'
                            ? 'bg-purple-100 text-purple-800 animate-pulse'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {b.processedCount} / {b.totalCount}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-600">
                      {b.approvedCount}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-rose-600">
                      {b.rejectedCount}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-amber-600">
                      {b.manualReviewCount}
                    </td>
                    <td className="py-2.5 px-3">
                      <Link
                        href={`/batches/${b.id}`}
                        className="text-emerald-600 hover:text-emerald-800 font-semibold inline-flex items-center gap-0.5"
                      >
                        <span>Report</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
