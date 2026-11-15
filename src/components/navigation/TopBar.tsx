'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Cpu, AlertTriangle, RefreshCw, Building2 } from 'lucide-react';
import Link from 'next/link';

export function TopBar() {
  const { activeBrandId, setActiveBrandId, providerStatus, addToast } = useApp();
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    fetch('/api/brands')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setBrands(json.data);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'RESET_DEMO_DATA' }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('Demo environment reset successfully.', 'success');
        setShowResetModal(false);
        window.location.reload();
      } else {
        addToast(data.error || 'Failed to reset demo data.', 'error');
      }
    } catch {
      addToast('Network error during reset.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand Workspace Selector */}
      <div className="flex items-center gap-3">
        <Building2 className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          Workspace Brand:
        </span>
        <select
          value={activeBrandId}
          onChange={(e) => setActiveBrandId(e.target.value)}
          className="text-xs font-medium bg-slate-50 border border-slate-300 text-slate-800 rounded-md px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
        >
          <option value="all">All Brands (Aggregate)</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Right Controls: Provider Status & Badges */}
      <div className="flex items-center gap-3">
        {/* Provider Status Pill */}
        <Link
          href="/settings"
          title="Click to view AI Provider settings"
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            providerStatus?.isFallback
              ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
              : providerStatus?.activeProvider === 'JEV'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
              : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{providerStatus?.statusMessage || 'Loading Provider...'}</span>
          {providerStatus?.isFallback && (
            <span className="ml-1 text-[10px] bg-amber-200 text-amber-900 px-1 rounded font-bold">
              FALLBACK
            </span>
          )}
        </Link>

        {/* Demo Mode Badge */}
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          DEMO MODE
        </span>

        {/* Reset Demo Data Button */}
        <button
          onClick={() => setShowResetModal(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-md transition-colors"
          title="Reset demo batches and requests"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Demo</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-lg">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg text-slate-900">Reset Demo Data</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              This will clear all generated synthetic batches, refund requests, and simulated
              transactions, returning the demo platform to a fresh baseline. Brand definitions
              and default policies will be preserved.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleReset}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                {isResetting ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
