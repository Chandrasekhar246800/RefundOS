'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Sparkles, Eye, CheckCircle2, Play, RefreshCw, ArrowRight, ShieldCheck, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

function GeneratorContent() {
  const { addToast } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  const [mode, setMode] = useState<'balanced' | 'custom'>('balanced');
  const [legitimateCount, setLegitimateCount] = useState<number>(10);
  const [nonLegitimateCount, setNonLegitimateCount] = useState<number>(10);
  const [seed, setSeed] = useState<string>('refund-os-42');

  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Initialize brands and products
  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data.length > 0) {
          setBrands(json.data);
          const initialBrandId = searchParams.get('brandId') || json.data[0].id;
          setSelectedBrandId(initialBrandId);
        }
      });
  }, []);

  // Fetch products when selectedBrandId changes
  useEffect(() => {
    if (!selectedBrandId) return;
    fetch(`/api/products?brandId=${selectedBrandId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setProducts(json.data);
          const paramProdId = searchParams.get('productId');
          if (paramProdId && json.data.some((p: any) => p.id === paramProdId)) {
            setSelectedProductId(paramProdId);
          } else if (json.data.length > 0) {
            setSelectedProductId(json.data[0].id);
          } else {
            setSelectedProductId('');
          }
        }
      });
  }, [selectedBrandId]);

  const handlePreview = async () => {
    if (!selectedBrandId || !selectedProductId) {
      addToast('Please select both a brand and product first.', 'error');
      return;
    }

    setLoadingPreview(true);
    try {
      const res = await fetch('/api/demo/generate-refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrandId,
          productId: selectedProductId,
          legitimateCount: mode === 'balanced' ? 10 : legitimateCount,
          nonLegitimateCount: mode === 'balanced' ? 10 : nonLegitimateCount,
          seed,
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPreviewData(data.data);
        addToast('Synthetic dataset preview generated.', 'info');
      } else {
        addToast(data.error || 'Failed to preview dataset', 'error');
      }
    } catch {
      addToast('Network error during preview', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSaveAndGenerate = async () => {
    if (!selectedBrandId || !selectedProductId) {
      addToast('Please select both a brand and product first.', 'error');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/demo/generate-refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrandId,
          productId: selectedProductId,
          legitimateCount: mode === 'balanced' ? 10 : legitimateCount,
          nonLegitimateCount: mode === 'balanced' ? 10 : nonLegitimateCount,
          seed,
          dryRun: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(data.message, 'success');
        router.push(`/requests?batchId=${data.data.batchId}`);
      } else {
        addToast(data.error || 'Failed to generate dataset', 'error');
      }
    } catch {
      addToast('Network error during generation', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Synthetic Refund Dataset Generator
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Create realistic synthetic refund datasets with balanced 10 legitimate + 10 non-legitimate ground-truth distributions.
        </p>
      </div>

      {/* Configuration Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Brand select */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Brand *
            </label>
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.category})
                </option>
              ))}
            </select>
          </div>

          {/* Product select */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Product *
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              disabled={products.length === 0}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (${(p.unitPrice / 100).toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          {/* Mode select */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Split Mode
            </label>
            <div className="flex rounded-md border p-1 bg-slate-50 gap-1">
              <button
                type="button"
                onClick={() => setMode('balanced')}
                className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${
                  mode === 'balanced'
                    ? 'bg-white shadow text-emerald-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                10+10 Balanced
              </button>
              <button
                type="button"
                onClick={() => setMode('custom')}
                className={`flex-1 text-xs py-1 rounded font-semibold transition-colors ${
                  mode === 'custom'
                    ? 'bg-white shadow text-emerald-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom Split
              </button>
            </div>
          </div>

          {/* Reproducibility Seed */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Random Seed (Reproducible)
            </label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. 42 or my-seed"
              className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Custom split sliders if custom mode */}
        {mode === 'custom' && (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Legitimate Requests</span>
                <span className="text-emerald-700 font-bold">{legitimateCount}</span>
              </label>
              <input
                type="range"
                min="1"
                max="30"
                value={legitimateCount}
                onChange={(e) => setLegitimateCount(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-600"
              />
            </div>
            <div>
              <label className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Non-Legitimate Requests</span>
                <span className="text-rose-700 font-bold">{nonLegitimateCount}</span>
              </label>
              <input
                type="range"
                min="1"
                max="30"
                value={nonLegitimateCount}
                onChange={(e) => setNonLegitimateCount(parseInt(e.target.value, 10))}
                className="w-full accent-rose-600"
              />
            </div>
          </div>
        )}

        {/* Actions bar */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            Total to generate:{' '}
            <span className="font-bold text-slate-900">
              {mode === 'balanced' ? 20 : legitimateCount + nonLegitimateCount} requests
            </span>{' '}
            ({mode === 'balanced' ? '10 Legitimate + 10 Non-Legitimate' : `${legitimateCount} Legit + ${nonLegitimateCount} Non-Legit`})
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePreview}
              disabled={loadingPreview}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{loadingPreview ? 'Generating Preview...' : 'Preview Records'}</span>
            </button>

            <button
              onClick={handleSaveAndGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>{generating ? 'Persisting Batch...' : 'Generate & Persist Batch'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      {previewData && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-900">
                Preview Generated Records ({previewData.totalCount})
              </h3>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                Seed: {previewData.seed}
              </span>
            </div>
            <button
              onClick={handleSaveAndGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md"
            >
              <span>Confirm & Save Batch</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Order Ref</th>
                  <th className="py-2.5 px-3">Customer Ref</th>
                  <th className="py-2.5 px-3">Ground Truth</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Customer Message</th>
                  <th className="py-2.5 px-3">Carrier Signals</th>
                  <th className="py-2.5 px-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {previewData.items.map((it: any) => (
                  <tr key={it.itemIndex} className="hover:bg-slate-50/80">
                    <td className="py-2 px-3 font-mono text-slate-500">{it.itemIndex}</td>
                    <td className="py-2 px-3 font-mono text-slate-800">{it.orderRef}</td>
                    <td className="py-2 px-3 font-mono text-slate-600">{it.customerRef}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                          it.groundTruthLabel === 'LEGITIMATE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {it.groundTruthLabel === 'LEGITIMATE' ? (
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-600" />
                        )}
                        <span>{it.groundTruthLabel}</span>
                      </span>
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-700">{it.reason}</td>
                    <td className="py-2 px-3 text-slate-600 max-w-xs truncate" title={it.customerMessage}>
                      {it.customerMessage}
                    </td>
                    <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                      {it.trackingSignals.carrier} • {it.trackingSignals.status}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-800">
                      ${(it.requestedAmount / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GeneratorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-500 animate-pulse">Loading generator...</div>}>
      <GeneratorContent />
    </Suspense>
  );
}

