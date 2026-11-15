'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Layers, ArrowUpRight, Play, RefreshCw, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function BatchesPage() {
  const { activeBrandId, addToast } = useApp();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const url =
        activeBrandId && activeBrandId !== 'all'
          ? `/api/batches?brandId=${activeBrandId}`
          : '/api/batches';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setBatches(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
    // Auto refresh every 3 seconds if any batch is processing
    const interval = setInterval(() => {
      if (batches.some((b) => b.status === 'PROCESSING')) {
        fetchBatches();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [activeBrandId]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Processing Batches</h2>
          <p className="text-xs text-slate-500 mt-1">
            Track background refund evaluation batch executions, progress telemetry, and audit summaries.
          </p>
        </div>
        <button
          onClick={fetchBatches}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Batches</span>
        </button>
      </div>

      {loading && batches.length === 0 ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white p-12 text-center text-slate-500 rounded-xl border border-slate-200 space-y-3">
          <Layers className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No processing batches found</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Use the Generator to create a batch, or select requests in the Inbox and click Process.
          </p>
          <Link
            href="/generator"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
          >
            <span>Open Generator</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const progress = b.totalCount > 0 ? Math.round((b.processedCount / b.totalCount) * 100) : 0;
            return (
              <div
                key={b.id}
                className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {b.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        b.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : b.status === 'PROCESSING'
                          ? 'bg-purple-100 text-purple-800 animate-pulse'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {b.status}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      Provider: {b.provider}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{b.brand?.name}</span>
                    <span>•</span>
                    <span>{b.product?.name || 'All Catalog'}</span>
                    <span>•</span>
                    <span>Created: {new Date(b.createdAt).toLocaleTimeString()}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-64 pt-1">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                      <span>Progress</span>
                      <span>
                        {b.processedCount} / {b.totalCount} ({progress}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          b.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-purple-600'
                        }`}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Counts and Outcomes */}
                <div className="flex items-center gap-6 text-xs">
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase block">
                      Approved
                    </span>
                    <span className="font-bold text-base text-slate-800">{b.approvedCount}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-rose-600 uppercase block">
                      Rejected
                    </span>
                    <span className="font-bold text-base text-slate-800">{b.rejectedCount}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-amber-600 uppercase block">
                      Review
                    </span>
                    <span className="font-bold text-base text-slate-800">{b.manualReviewCount}</span>
                  </div>
                  {b.failedCount > 0 && (
                    <div className="text-center">
                      <span className="text-[10px] font-bold text-red-600 uppercase block">
                        Failed
                      </span>
                      <span className="font-bold text-base text-red-600">{b.failedCount}</span>
                    </div>
                  )}

                  <Link
                    href={`/batches/${b.id}`}
                    className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors ml-2"
                  >
                    <span>View Report</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
