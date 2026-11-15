'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import {
  Layers,
  ArrowLeft,
  Download,
  RotateCcw,
  ShieldCheck,
  XCircle,
  AlertCircle,
  Clock,
  DollarSign,
  Cpu,
} from 'lucide-react';
import Link from 'next/link';

export default function BatchReportPage({ params }: { params: { id: string } }) {
  const { addToast } = useApp();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/batches/${params.id}/report`);
      const data = await res.json();
      if (data.success) {
        setReport(data.data);
      } else {
        addToast(data.error || 'Failed to load report', 'error');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [params.id]);

  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/batches/${params.id}/retry-failed`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        addToast(data.data.message, 'success');
        fetchReport();
      } else {
        addToast(data.error || 'Failed to retry', 'error');
      }
    } catch {
      addToast('Network error during retry', 'error');
    } finally {
      setRetrying(false);
    }
  };

  const handleDownloadCsv = () => {
    window.open(`/api/batches/${params.id}/report?format=csv`, '_blank');
  };

  if (loading && !report) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/4"></div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
        <div className="h-64 bg-slate-200 rounded-xl"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-7xl mx-auto text-center py-16">
        <p className="text-slate-600 font-semibold">Batch report not found.</p>
        <Link href="/batches" className="text-emerald-600 font-semibold text-xs mt-2 inline-block">
          Return to Batches
        </Link>
      </div>
    );
  }

  const { batch, confusionMatrix: cm, requests } = report;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/batches"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Batches</span>
          </Link>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Batch Decision Report: {batch.id}
            </h2>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                batch.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-purple-100 text-purple-800'
              }`}
            >
              {batch.status}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Brand: <span className="font-semibold text-slate-700">{batch.brandName}</span> •
            Product: <span className="font-semibold text-slate-700">{batch.productName}</span> •
            Provider: <span className="font-semibold text-slate-700">{batch.provider}</span> •
            Duration: {batch.durationSeconds !== null ? `${batch.durationSeconds}s` : 'In progress'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {batch.failedCount > 0 && (
            <button
              onClick={handleRetryFailed}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Failed ({batch.failedCount})</span>
            </button>
          )}

          <button
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV Report</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Approved */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Approved Requests
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{batch.approvedCount}</span>
            <span className="text-xs font-semibold text-emerald-600">
              ({batch.totalCount > 0 ? ((batch.approvedCount / batch.totalCount) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-slate-400" />
            <span>Simulated Credit:</span>
            <span className="font-semibold text-slate-700">
              ${(batch.totalSimulatedApprovedAmount / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Rejected */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Rejected Claims
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{batch.rejectedCount}</span>
            <span className="text-xs font-semibold text-rose-600">
              ({batch.totalCount > 0 ? ((batch.rejectedCount / batch.totalCount) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-slate-400" />
            <span>Loss Prevented:</span>
            <span className="font-semibold text-slate-700">
              ${(batch.totalSimulatedRejectedAmount / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Manual Review */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Manual Review
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{batch.manualReviewCount}</span>
            <span className="text-xs font-semibold text-amber-600">
              ({batch.totalCount > 0 ? ((batch.manualReviewCount / batch.totalCount) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Ambiguous evidence or high monetary value.
          </p>
        </div>

        {/* Total Processed */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Batch Completion
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {batch.processedCount} / {batch.totalCount}
            </span>
            <span className="text-xs text-slate-500">requests</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 font-mono">
            Provider: {batch.provider}
          </p>
        </div>
      </div>

      {/* Confusion Matrix & Accuracy Metrics Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-900">
                Ground Truth Evaluation & Confusion Matrix
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded border border-purple-200">
                SYNTHETIC BENCHMARK
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Performance metrics computed strictly post-decision against synthetic ground truth.
              Ground truth was never supplied to the decision provider.
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-black text-emerald-600">{cm.accuracy}%</span>
            <p className="text-[10px] text-slate-400 font-semibold uppercase">Overall Accuracy</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* TP */}
          <div className="p-4 rounded-lg bg-emerald-50/80 border border-emerald-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-900">True Positives (TP)</span>
              <span className="text-xl font-bold text-emerald-700">{cm.truePositives}</span>
            </div>
            <p className="text-[11px] text-emerald-700 mt-1">Legitimate claims correctly approved.</p>
          </div>

          {/* FP (Critical) */}
          <div className="p-4 rounded-lg bg-rose-50/80 border border-rose-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-900">False Positives (FP)</span>
              <span className="text-xl font-bold text-rose-700">{cm.falsePositives}</span>
            </div>
            <p className="text-[11px] text-rose-700 mt-1">Non-legitimate claims mistakenly approved.</p>
          </div>

          {/* TN */}
          <div className="p-4 rounded-lg bg-blue-50/80 border border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900">True Negatives (TN)</span>
              <span className="text-xl font-bold text-blue-700">{cm.trueNegatives}</span>
            </div>
            <p className="text-[11px] text-blue-700 mt-1">Non-legitimate claims correctly rejected.</p>
          </div>

          {/* FN */}
          <div className="p-4 rounded-lg bg-amber-50/80 border border-amber-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900">False Negatives (FN)</span>
              <span className="text-xl font-bold text-amber-700">{cm.falseNegatives}</span>
            </div>
            <p className="text-[11px] text-amber-700 mt-1">Legitimate claims incorrectly rejected.</p>
          </div>
        </div>

        {/* Statistical Scores */}
        <div className="grid grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-center">
          <div className="p-2 bg-slate-50 rounded-lg">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Precision</span>
            <span className="text-base font-bold text-slate-800">{cm.precision}%</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Recall</span>
            <span className="text-base font-bold text-slate-800">{cm.recall}%</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">F1 Score</span>
            <span className="text-base font-bold text-slate-800">{cm.f1Score}%</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">Manual Reviews</span>
            <span className="text-base font-bold text-amber-600">{cm.totalManualReviews}</span>
          </div>
        </div>
      </div>

      {/* Per-Request Decision Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
        <h3 className="font-bold text-sm text-slate-900">
          Per-Request Decisions & Rationale ({requests.length})
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Request Ref</th>
                <th className="py-2.5 px-3">Amount</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3">AI Decision</th>
                <th className="py-2.5 px-3">Ground Truth</th>
                <th className="py-2.5 px-3">Risk</th>
                <th className="py-2.5 px-3">AI Rationale</th>
                <th className="py-2.5 px-3">Simulated Txn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                    {r.requestRef}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                    ${(r.requestedAmount / 100).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 font-medium">
                    {r.reason.replace(/_/g, ' ')}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : r.status === 'MANUAL_REVIEW'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {r.decision || r.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        r.groundTruthLabel === 'LEGITIMATE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      {r.groundTruthLabel}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {r.riskScore !== null ? `${r.riskScore}/100` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-sm truncate" title={r.rationale}>
                    {r.rationale || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[10px] text-slate-600">
                    {r.transactionReference || 'NONE'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
