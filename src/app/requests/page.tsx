'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { useSearchParams } from 'next/navigation';
import {
  Inbox,
  Search,
  Filter,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Eye,
  FileText,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  RotateCcw,
  Cpu,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function RequestsContent() {
  const { activeBrandId, addToast } = useApp();
  const searchParams = useSearchParams();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [reasonFilter, setReasonFilter] = useState<string>('');
  const [groundTruthFilter, setGroundTruthFilter] = useState<string>('');
  const [batchIdFilter, setBatchIdFilter] = useState<string>(searchParams.get('batchId') || '');

  // Sorting
  const [sortBy, setSortBy] = useState<'requestedAt' | 'requestedAmount' | 'status' | 'reason'>('requestedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Detail Drawer State
  const [activeRequest, setActiveRequest] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const hasActiveFilters = Boolean(
    searchTerm ||
    statusFilter ||
    reasonFilter ||
    groundTruthFilter ||
    batchIdFilter ||
    sortBy !== 'requestedAt' ||
    sortOrder !== 'desc'
  );

  const handleSort = (column: 'requestedAt' | 'requestedAmount' | 'status' | 'reason') => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setReasonFilter('');
    setGroundTruthFilter('');
    setBatchIdFilter('');
    setSortBy('requestedAt');
    setSortOrder('desc');
    setPage(1);
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        sortBy,
        sortOrder,
      });

      if (activeBrandId && activeBrandId !== 'all') params.set('brandId', activeBrandId);
      if (statusFilter) params.set('status', statusFilter);
      if (reasonFilter) params.set('reason', reasonFilter);
      if (groundTruthFilter) params.set('groundTruthLabel', groundTruthFilter);
      if (batchIdFilter) params.set('batchId', batchIdFilter);
      if (searchTerm) params.set('search', searchTerm);

      const res = await fetch(`/api/refund-requests?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRequests(data.data);
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
    fetchRequests();
  }, [page, activeBrandId, statusFilter, reasonFilter, groundTruthFilter, batchIdFilter, sortBy, sortOrder]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchRequests();
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(requests.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleProcessSelected = async () => {
    if (selectedIds.length === 0) {
      addToast('Select at least one request to process.', 'info');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/refund-requests/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestIds: selectedIds }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Initiated decision workflow for ${selectedIds.length} request(s).`, 'success');
        setSelectedIds([]);
        setTimeout(fetchRequests, 1500);
      } else {
        addToast(data.error || 'Failed to process selected requests', 'error');
      }
    } catch {
      addToast('Network error during processing', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const openDetailDrawer = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/refund-requests/${id}`);
      const data = await res.json();
      if (data.success) {
        setActiveRequest(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Refund Requests Inbox</h2>
          <p className="text-xs text-slate-500 mt-1">
            Review incoming claims, inspect customer history and carrier tracking signals, and run AI evaluations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {batchIdFilter && (
            <button
              onClick={() => {
                setBatchIdFilter('');
                setPage(1);
              }}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5"
            >
              <span>Batch Filter Active</span>
              <span className="font-bold text-slate-900">✕</span>
            </button>
          )}

          <button
            onClick={handleProcessSelected}
            disabled={isProcessing || selectedIds.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isProcessing ? 'Processing...' : `Process Selected (${selectedIds.length})`}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Request Ref, Order Ref, Customer Ref..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs px-2.5 py-2 border rounded-lg bg-white focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="MANUAL_REVIEW">Manual Review</option>
            <option value="FAILED">Failed</option>
          </select>

          {/* Reason filter */}
          <select
            value={reasonFilter}
            onChange={(e) => {
              setReasonFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs px-2.5 py-2 border rounded-lg bg-white focus:outline-none"
          >
            <option value="">All Reasons</option>
            <option value="DAMAGED_ITEM">Damaged Item</option>
            <option value="WRONG_ITEM">Wrong Item</option>
            <option value="NOT_RECEIVED">Not Received</option>
            <option value="DUPLICATE_CHARGE">Duplicate Charge</option>
            <option value="DEFECTIVE">Defective</option>
            <option value="CHANGED_MIND">Changed Mind</option>
            <option value="MISSING_ITEM">Missing Item</option>
            <option value="FRAUDULENT_CLAIM">Fraudulent Claim</option>
          </select>

          {/* Ground truth filter (Demo analysis only) */}
          <select
            value={groundTruthFilter}
            onChange={(e) => {
              setGroundTruthFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs px-2.5 py-2 border border-purple-200 rounded-lg bg-purple-50/50 text-purple-900 focus:outline-none font-medium"
            title="Ground-truth filter for demo evaluation only"
          >
            <option value="">Ground Truth: All</option>
            <option value="LEGITIMATE">Legitimate Only</option>
            <option value="NON_LEGITIMATE">Non-Legitimate Only</option>
          </select>

          {/* Inline Reset Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap"
              title="Reset all search queries, status filters, and custom column sorting"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading refund requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-4">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {hasActiveFilters ? 'No refund requests match your active filters' : 'Inbox is empty'}
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                {hasActiveFilters
                  ? 'Try clearing search terms or status constraints to view all stored requests.'
                  : 'Generate a 10+10 synthetic dataset to test AI decision evaluation.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear All Filters</span>
                </button>
              )}
              <Link
                href="/generator"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Open Dataset Generator</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 select-none">
                <tr>
                  <th className="py-3 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === requests.length && requests.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 accent-emerald-600"
                    />
                  </th>
                  <th className="py-3 px-3">Request Ref</th>
                  <th className="py-3 px-3">Product / SKU</th>
                  <th
                    onClick={() => handleSort('requestedAmount')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    title="Click to sort by amount"
                  >
                    <div className="flex items-center gap-1">
                      <span>Amount</span>
                      <span className="text-[10px] text-slate-400">
                        {sortBy === 'requestedAmount' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('reason')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    title="Click to sort by reason"
                  >
                    <div className="flex items-center gap-1">
                      <span>Reason</span>
                      <span className="text-[10px] text-slate-400">
                        {sortBy === 'reason' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('requestedAt')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    title="Click to sort by request date"
                  >
                    <div className="flex items-center gap-1">
                      <span>Request Date</span>
                      <span className="text-[10px] text-slate-400">
                        {sortBy === 'requestedAt' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    title="Click to sort by status"
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      <span className="text-[10px] text-slate-400">
                        {sortBy === 'status' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th className="py-3 px-3">AI Decision</th>
                  <th className="py-3 px-3">Risk</th>
                  <th className="py-3 px-3">Ground Truth</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const isSelected = selectedIds.includes(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(r.id)}
                          className="rounded border-slate-300 accent-emerald-600"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                        {r.requestRef}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{r.productName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.productSku}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                        ${(r.requestedAmount / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {r.reason.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        {new Date(r.requestedAt).toLocaleDateString()}
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
                              : r.status === 'PROCESSING'
                              ? 'bg-purple-100 text-purple-800 animate-pulse'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {r.decision ? (
                          <div>
                            <span
                              className={`font-semibold ${
                                r.decision === 'APPROVE'
                                  ? 'text-emerald-700'
                                  : r.decision === 'REJECT'
                                  ? 'text-rose-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {r.decision}
                            </span>
                            {r.layaUsage && (
                              <div
                                className="text-[9px] text-slate-400 font-mono mt-0.5"
                                title={`Tokens: ${r.layaUsage.totalTokens}, Latency: ${r.layaUsage.latencyMs}ms`}
                              >
                                {r.layaUsage.totalTokens} tok • {r.layaUsage.latencyMs}ms
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {r.riskScore !== null ? (
                          <span
                            className={`font-mono font-bold ${
                              r.riskScore >= 70
                                ? 'text-rose-600'
                                : r.riskScore >= 40
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {r.riskScore}/100
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                            r.groundTruthLabel === 'LEGITIMATE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                          title="Synthetic ground truth for evaluation only (excluded from AI model input)"
                        >
                          {r.groundTruthLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => openDetailDrawer(r.id)}
                          className="inline-flex items-center gap-1 text-slate-600 hover:text-emerald-600 font-medium text-xs p-1"
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
            Showing {requests.length} of {totalCount} total requests
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
      {activeRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-base text-slate-900">
                    {activeRequest.requestRef}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      activeRequest.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : activeRequest.status === 'REJECTED'
                        ? 'bg-rose-100 text-rose-800'
                        : activeRequest.status === 'MANUAL_REVIEW'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {activeRequest.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Product: {activeRequest.product.name} ({activeRequest.product.sku})
                </p>
              </div>
              <button
                onClick={() => setActiveRequest(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-6 flex-1 text-xs">
              {/* Ground Truth Banner */}
              <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">
                    Synthetic Ground Truth (Demo Answer Key)
                  </span>
                  <span className="font-bold text-sm text-purple-950">
                    {activeRequest.groundTruthLabel}
                  </span>
                </div>
                <span className="text-[10px] text-purple-700 max-w-xs text-right">
                  Strictly hidden from AI decision prompt. Used solely for post-evaluation metrics.
                </span>
              </div>

              {/* AI Decision Card (if decided) */}
              {activeRequest.decisionDetails ? (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">AI Decision Rationale</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 font-mono font-semibold">
                        {activeRequest.decisionDetails.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {activeRequest.decisionDetails.riskScore !== null && (
                        <span className="font-mono font-bold text-xs text-slate-700">
                          Risk: {activeRequest.decisionDetails.riskScore}/100
                        </span>
                      )}
                      {activeRequest.decisionDetails.confidence !== null && (
                        <span className="font-mono text-xs text-slate-500">
                          Conf: {(activeRequest.decisionDetails.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed font-medium bg-white p-3 rounded-lg border border-slate-200">
                    {activeRequest.decisionDetails.rationale}
                  </p>

                  {/* Policy checks */}
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Policy Rule Evaluations
                    </span>
                    {activeRequest.decisionDetails.policyChecks.map((pc: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between p-2 rounded bg-white border border-slate-100 text-[11px]"
                      >
                        <div>
                          <span className="font-semibold text-slate-800">{pc.rule}: </span>
                          <span className="text-slate-600">{pc.explanation}</span>
                        </div>
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded font-bold text-[9px] ${
                            pc.result === 'PASS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : pc.result === 'FAIL'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {pc.result}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Simulated Transaction Ref */}
                  {activeRequest.transaction && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">Simulated Refund Transaction</span>
                        <span className="font-mono text-[10px] bg-emerald-200 px-1.5 py-0.5 rounded font-bold">
                          {activeRequest.transaction.status}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono mt-1">
                        Ref: {activeRequest.transaction.reference} • Amount: $
                        {(activeRequest.transaction.amount / 100).toFixed(2)}
                      </p>
                    </div>
                  )}

                  {/* Laya API Telemetry Log */}
                  {activeRequest.layaUsage && activeRequest.layaUsage.length > 0 && (
                    <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg text-purple-950 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-purple-700" />
                          <span>Laya API System One Telemetry</span>
                        </span>
                        <span className="font-mono text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">
                          {activeRequest.layaUsage[0].latencyMs} ms
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono pt-1 text-purple-900">
                        <div>Input: {activeRequest.layaUsage[0].inputTokens} tok</div>
                        <div>State: {activeRequest.layaUsage[0].stateTokens} tok</div>
                        <div>Total: {activeRequest.layaUsage[0].totalTokens} tok</div>
                      </div>
                      {activeRequest.layaUsage[0].estimatedCostUsd !== null && (
                        <div className="text-[10px] text-purple-700 border-t border-purple-200/60 pt-1 flex justify-between">
                          <span>Estimated Cost:</span>
                          <span className="font-mono font-bold">
                            ${Number(activeRequest.layaUsage[0].estimatedCostUsd).toFixed(6)} USD
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-500">
                  <Clock className="w-5 h-5 mx-auto mb-1 text-slate-400" />
                  <p className="font-semibold">Pending AI Evaluation</p>
                  <p className="text-[11px] text-slate-400">
                    Click Process Refunds to run the decision engine against this request.
                  </p>
                </div>
              )}

              {/* Order & Request Summary */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Order Details
                  </span>
                  <p className="font-mono font-semibold text-slate-800">
                    {activeRequest.order.orderRef}
                  </p>
                  <p className="text-slate-600 mt-1">
                    Purchased: {new Date(activeRequest.order.purchasedAt).toLocaleDateString()}
                  </p>
                  <p className="text-slate-600">
                    Delivered: {activeRequest.order.deliveredAt ? new Date(activeRequest.order.deliveredAt).toLocaleDateString() : 'In Transit'}
                  </p>
                  <p className="text-slate-600">
                    Status: <span className="font-medium">{activeRequest.order.fulfilmentStatus}</span>
                  </p>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Customer Risk Profile
                  </span>
                  <p className="font-mono font-semibold text-slate-800">
                    {activeRequest.customer.syntheticCustomerRef}
                  </p>
                  <p className="text-slate-600 mt-1">
                    Total Orders: {activeRequest.customer.totalOrders}
                  </p>
                  <p className="text-slate-600">
                    Prior Refunds: {activeRequest.customer.priorRefundCount}
                  </p>
                  <p className="text-slate-600">
                    Prior Chargebacks: {activeRequest.customer.priorChargebackCount}
                  </p>
                </div>
              </div>

              {/* Customer Message & Claim Details */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Customer Message & Claim
                </span>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-800">
                  <p className="font-medium mb-1 text-slate-900">
                    Reason: {activeRequest.reason.replace(/_/g, ' ')}
                  </p>
                  <p className="text-slate-600 italic">"{activeRequest.customerMessage}"</p>
                </div>
              </div>

              {/* Evidence Items */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Evidence Submitted ({activeRequest.parsedEvidence.length})
                </span>
                {activeRequest.parsedEvidence.length === 0 ? (
                  <p className="text-slate-400 italic">No proof files or affidavits submitted.</p>
                ) : (
                  activeRequest.parsedEvidence.map((ev: any, i: number) => (
                    <div
                      key={i}
                      className="p-3 bg-white rounded-lg border border-slate-200 flex items-start gap-3"
                    >
                      <FileText className="w-4 h-4 text-slate-500 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{ev.type}</span>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                              ev.verified
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {ev.verified ? 'Verified' : 'Unverified'}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-0.5">{ev.description}</p>
                        {ev.metadata && (
                          <pre className="mt-1.5 p-1.5 bg-slate-50 rounded text-[10px] text-slate-600 font-mono">
                            {JSON.stringify(ev.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Carrier Tracking Signals */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Carrier Telemetry & Tracking
                </span>
                <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5 text-slate-700">
                  <p>
                    <span className="font-semibold">Carrier:</span>{' '}
                    {activeRequest.parsedDeliveryEvidence.carrier || 'N/A'} (Tracking #{' '}
                    {activeRequest.parsedDeliveryEvidence.trackingNumber || 'N/A'})
                  </p>
                  <p>
                    <span className="font-semibold">Status:</span>{' '}
                    {activeRequest.parsedDeliveryEvidence.status || 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold">GPS Dropoff Match:</span>{' '}
                    {activeRequest.parsedDeliveryEvidence.deliveryGpsMatch === true
                      ? 'Confirmed (Matches residence)'
                      : activeRequest.parsedDeliveryEvidence.deliveryGpsMatch === false
                      ? 'Discrepancy (Dropoff location deviates)'
                      : 'Not recorded'}
                  </p>
                  <p>
                    <span className="font-semibold">Signature:</span>{' '}
                    {activeRequest.parsedDeliveryEvidence.signatureObtained ? 'Yes' : 'No'}
                  </p>
                  {activeRequest.parsedDeliveryEvidence.carrierNotes && (
                    <p className="text-slate-500 italic">
                      Notes: {activeRequest.parsedDeliveryEvidence.carrierNotes}
                    </p>
                  )}
                </div>
              </div>

              {/* Audit Trail for this request */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Audit Events
                </span>
                <div className="space-y-1">
                  {activeRequest.auditEvents.map((ae: any) => (
                    <div key={ae.id} className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>
                        <span className="font-semibold text-slate-700">{ae.eventType}</span> by{' '}
                        {ae.actor}
                      </span>
                      <span className="font-mono text-[10px]">
                        {new Date(ae.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setActiveRequest(null)}
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

export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-500 animate-pulse">Loading inbox...</div>}>
      <RequestsContent />
    </Suspense>
  );
}

