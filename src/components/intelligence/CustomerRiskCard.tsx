'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Info,
  Clock,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

interface CustomerRiskCardProps {
  customerId: string;
  customerRef: string;
  riskProfile: any;
  onRefresh?: () => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function CustomerRiskCard({
  customerId,
  customerRef,
  riskProfile,
  onRefresh,
  addToast,
}: CustomerRiskCardProps) {
  const [recalculating, setRecalculating] = useState(false);

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      const res = await fetch(`/api/customers/${customerId}/risk/recalculate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        addToast?.('Customer risk profile updated successfully', 'success');
        onRefresh?.();
      } else {
        addToast?.(data.error || 'Failed to recalculate risk profile', 'error');
      }
    } catch (err: any) {
      addToast?.(err.message || 'Error updating risk profile', 'error');
    } finally {
      setRecalculating(false);
    }
  };

  if (!riskProfile) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-slate-500">
        <Info className="w-5 h-5 mx-auto mb-1 text-slate-400" />
        <p className="font-semibold text-xs">Customer Risk Profile Pending</p>
        <p className="text-[11px] text-slate-400 mb-2">
          Calculate risk profile to assess historical refund velocity and claim behavior.
        </p>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
          <span>{recalculating ? 'Analyzing...' : 'Generate Profile'}</span>
        </button>
      </div>
    );
  }

  const score = riskProfile.compositeScore ?? 0;
  const tier = riskProfile.riskTier || 'LOW';

  const getTierColor = (t: string) => {
    switch (t) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-700 border-red-300';
      case 'HIGH':
        return 'bg-amber-500/10 text-amber-700 border-amber-300';
      case 'MODERATE':
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-300';
      default:
        return 'bg-emerald-500/10 text-emerald-700 border-emerald-300';
    }
  };

  const getScoreBarColor = (s: number) => {
    if (s >= 75) return 'bg-red-500';
    if (s >= 50) return 'bg-amber-500';
    if (s >= 25) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'ACCELERATING':
        return <TrendingUp className="w-3.5 h-3.5 text-red-500" />;
      case 'DECELERATING':
        return <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <Minus className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-500">
              Customer Risk Intelligence
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getTierColor(tier)}`}>
              {tier} RISK
            </span>
          </div>
          <Link
            href={`/customers?id=${customerId}`}
            className="text-[11px] text-slate-700 hover:text-emerald-600 font-mono font-medium flex items-center gap-1 mt-0.5"
          >
            <span>{customerRef}</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          title="Recalculate customer risk score"
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Score gauge */}
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[11px] font-medium text-slate-600">Composite Risk Score</span>
          <span className="font-mono text-sm font-bold text-slate-900">{score}/100</span>
        </div>
        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full ${getScoreBarColor(score)} transition-all duration-300`}
            style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>0 (Low Risk)</span>
          <span>100 (Critical)</span>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-slate-400 text-[10px] block">Refund-to-Spend Ratio</span>
          <span className="font-mono font-semibold text-slate-800">
            {((riskProfile.refundToSpendRatio || 0) * 100).toFixed(1)}%
          </span>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-slate-400 text-[10px] block">Refund-to-Order Ratio</span>
          <span className="font-mono font-semibold text-slate-800">
            {((riskProfile.refundToOrderRatio || 0) * 100).toFixed(1)}%
          </span>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-slate-400 text-[10px] block">Claim Velocity (7d / 30d / 90d)</span>
          <span className="font-mono font-semibold text-slate-800">
            {riskProfile.claimsLast7Days || 0} / {riskProfile.claimsLast30Days || 0} / {riskProfile.claimsLast90Days || 0}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-slate-400 text-[10px] block">Behavior Trend</span>
          <div className="flex items-center gap-1 font-semibold text-slate-800">
            {getTrendIcon(riskProfile.behaviourChangeTrend)}
            <span>{riskProfile.behaviourChangeTrend || 'STABLE'}</span>
          </div>
        </div>
      </div>

      {/* Repeated orders & chargebacks notice */}
      <div className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded bg-slate-50 border border-slate-100 text-slate-600">
        <span>Repeated Claims on Same Order:</span>
        <span className="font-mono font-bold text-slate-800">
          {riskProfile.repeatedRefundCount || 0}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded bg-slate-50 border border-slate-100 text-slate-600">
        <span>Historical Chargebacks:</span>
        <span className="font-mono font-bold text-slate-800">
          {riskProfile.previousChargebacks || 0}
        </span>
      </div>

      {/* Contributing Signals */}
      {riskProfile.signals && riskProfile.signals.length > 0 ? (
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">
            Contributing Signals ({riskProfile.signals.length})
          </span>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {riskProfile.signals.map((sig: any, idx: number) => (
              <div
                key={sig.id || idx}
                className={`p-2 rounded text-[11px] border flex items-start gap-2 ${
                  sig.severity === 'HIGH' || sig.severity === 'CRITICAL'
                    ? 'bg-rose-50/50 border-rose-200 text-rose-900'
                    : sig.severity === 'MEDIUM'
                    ? 'bg-amber-50/50 border-amber-200 text-amber-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{sig.name}</span>
                    <span className="font-mono font-bold text-[10px]">
                      {sig.scoreImpact > 0 ? `+${sig.scoreImpact}` : sig.scoreImpact} pts
                    </span>
                  </div>
                  <p className="text-[10px] opacity-80 mt-0.5">{sig.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-100">
          No anomalous behavioral signals detected for this customer.
        </div>
      )}
    </div>
  );
}
