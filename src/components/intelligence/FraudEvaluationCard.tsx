'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  FileSearch,
  CheckCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';

interface FraudEvaluationCardProps {
  requestId: string;
  fraudEvaluation: any;
  onRefresh?: () => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function FraudEvaluationCard({
  requestId,
  fraudEvaluation,
  onRefresh,
  addToast,
}: FraudEvaluationCardProps) {
  const [evaluating, setEvaluating] = useState(false);

  const handleEvaluate = async () => {
    try {
      setEvaluating(true);
      const res = await fetch(`/api/refund-requests/${requestId}/fraud-evaluation/evaluate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        addToast?.('Fraud evaluation completed successfully', 'success');
        onRefresh?.();
      } else {
        addToast?.(data.error || 'Failed to evaluate fraud signals', 'error');
      }
    } catch (err: any) {
      addToast?.(err.message || 'Error running fraud evaluation', 'error');
    } finally {
      setEvaluating(false);
    }
  };

  if (!fraudEvaluation) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-slate-500">
        <FileSearch className="w-5 h-5 mx-auto mb-1 text-slate-400" />
        <p className="font-semibold text-xs">Multi-Signal Fraud Evaluation Pending</p>
        <p className="text-[11px] text-slate-400 mb-2">
          Evaluate claim against evidence anomalies, duplicate media hashes, delivery records, and order contradictions.
        </p>
        <button
          onClick={handleEvaluate}
          disabled={evaluating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
          <span>{evaluating ? 'Evaluating...' : 'Run Fraud Evaluation'}</span>
        </button>
      </div>
    );
  }

  const score = fraudEvaluation.fraudScore ?? 0;
  const disposition = fraudEvaluation.dispositionProposal || 'REVIEW';
  const action = fraudEvaluation.recommendedAction || 'MANUAL_REVIEW';

  const getDispositionColor = (d: string) => {
    switch (d) {
      case 'PASS':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'REJECT':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  const getActionBadge = (act: string) => {
    switch (act) {
      case 'APPROVE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            APPROVE
          </span>
        );
      case 'REJECT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3 h-3 text-rose-600" />
            REJECT
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            MANUAL REVIEW
          </span>
        );
    }
  };

  const getScoreBarColor = (s: number) => {
    if (s >= 75) return 'bg-rose-500';
    if (s >= 50) return 'bg-amber-500';
    if (s >= 25) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  const patterns = Array.isArray(fraudEvaluation.detectedPatterns)
    ? fraudEvaluation.detectedPatterns
    : [];

  const anomalies = Array.isArray(fraudEvaluation.anomalyDetails)
    ? fraudEvaluation.anomalyDetails
    : [];

  const missingInfo = Array.isArray(fraudEvaluation.missingInformation)
    ? fraudEvaluation.missingInformation
    : [];

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-500">
              Multi-Signal Fraud Evaluation
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getDispositionColor(disposition)}`}>
              {disposition}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-slate-500">Recommended Next Step:</span>
            {getActionBadge(action)}
          </div>
        </div>

        <button
          onClick={handleEvaluate}
          disabled={evaluating}
          title="Re-run multi-signal fraud evaluation"
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Fraud Risk Score */}
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[11px] font-medium text-slate-600">Cross-Signal Fraud Score</span>
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
          <span>100 (Hard Contradiction)</span>
        </div>
      </div>

      {/* Detected Patterns */}
      {patterns.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">
            Detected Fraud Patterns ({patterns.length})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {patterns.map((pat: string, idx: number) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200"
              >
                {pat.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Anomalies List */}
      {anomalies.length > 0 ? (
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">
            Anomaly Details ({anomalies.length})
          </span>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {anomalies.map((anom: any, idx: number) => (
              <div
                key={idx}
                className="p-2 rounded text-[11px] bg-slate-50 border border-slate-200 text-slate-700 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{anom.type}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      anom.severity === 'CRITICAL' || anom.severity === 'HIGH'
                        ? 'bg-rose-100 text-rose-800'
                        : anom.severity === 'MEDIUM'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {anom.severity}
                  </span>
                </div>
                <p className="text-[10px] text-slate-600">{anom.description}</p>
                {anom.evidence && (
                  <p className="text-[10px] font-mono text-slate-500 bg-white p-1 rounded border border-slate-100 truncate">
                    Ref: {anom.evidence}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-100">
          No cross-evidence anomalies detected.
        </div>
      )}

      {/* Missing Information Notice */}
      {missingInfo.length > 0 && (
        <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-amber-900 text-[11px] space-y-1">
          <span className="font-semibold flex items-center gap-1 text-[10px] uppercase">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
            Missing Investigation Information
          </span>
          <ul className="list-disc list-inside text-[10px] opacity-90 pl-1">
            {missingInfo.map((info: string, idx: number) => (
              <li key={idx}>{info}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
