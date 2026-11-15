'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import {
  Settings,
  Cpu,
  Shield,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Zap,
  Save,
  Clock,
  Sliders,
} from 'lucide-react';

export default function SettingsPage() {
  const { providerStatus, refreshProviderStatus, addToast } = useApp();

  // Provider configuration state
  const [activeProvider, setActiveProvider] = useState<'JEV' | 'LOCAL_DEMO'>('LOCAL_DEMO');
  const [jevApiKey, setJevApiKey] = useState('');
  const [jevBaseUrl, setJevBaseUrl] = useState('https://api.typesafe.ai/v1');
  const [jevModel, setJevModel] = useState('jev-latest');
  const [concurrencyLimit, setConcurrencyLimit] = useState(3);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(15000);
  const [savingProvider, setSavingProvider] = useState(false);

  // Connection test state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Policy configuration state
  const [policy, setPolicy] = useState<any>(null);
  const [policyHistory, setPolicyHistory] = useState<any[]>([]);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Fetch Settings & Policy
  const fetchSettings = async () => {
    try {
      const [provRes, polRes] = await Promise.all([
        fetch('/api/settings/provider'),
        fetch('/api/settings/refund-policy'),
      ]);
      const provData = await provRes.json();
      const polData = await polRes.json();

      if (provData.success) {
        setActiveProvider(provData.data.activeProvider);
        setJevBaseUrl(provData.data.jevBaseUrl);
        setJevModel(provData.data.jevModel);
        setConcurrencyLimit(provData.data.concurrencyLimit);
        setRequestTimeoutMs(provData.data.requestTimeoutMs);
      }

      if (polData.success) {
        setPolicy(polData.data.activePolicy);
        setPolicyHistory(polData.data.history);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveProviderSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider(true);
    try {
      const payload: any = {
        activeProvider,
        jevBaseUrl,
        jevModel,
        concurrencyLimit,
        requestTimeoutMs,
      };
      if (jevApiKey.trim().length > 0) {
        payload.jevApiKey = jevApiKey.trim();
      }

      const res = await fetch('/api/settings/provider', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        addToast(data.message, 'success');
        setJevApiKey(''); // Clear client field after sending to server
        await refreshProviderStatus();
        fetchSettings();
      } else {
        addToast(data.error || 'Failed to update provider settings', 'error');
      }
    } catch {
      addToast('Network error while saving settings', 'error');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleTestConnection = async (targetProvider: 'JEV' | 'LOCAL_DEMO') => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/provider/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: targetProvider }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(data.data);
        if (data.data.connected) {
          addToast(`Connection check succeeded (${data.data.durationMs}ms)`, 'success');
        } else {
          addToast(`Connection test failed: ${data.data.message}`, 'error');
        }
      }
    } catch {
      addToast('Network error during connection test', 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policy) return;
    setSavingPolicy(true);
    try {
      const res = await fetch('/api/settings/refund-policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyWindowDays: policy.configuration.policyWindowDays,
          maxInstantApprovalAmount: policy.configuration.maxInstantApprovalAmount,
          highValueManualReviewThreshold: policy.configuration.highValueManualReviewThreshold,
          maxPriorRefundsBeforeReview: policy.configuration.maxPriorRefundsBeforeReview,
          maxPriorChargebacksBeforeReject: policy.configuration.maxPriorChargebacksBeforeReject,
          requireDeliveryProofForNonReceipt: policy.configuration.requireDeliveryProofForNonReceipt,
          requireImageForDamaged: policy.configuration.requireImageForDamaged,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(data.message, 'success');
        fetchSettings();
      } else {
        addToast(data.error || 'Failed to save policy', 'error');
      }
    } catch {
      addToast('Network error while saving policy', 'error');
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Settings & Configuration</h2>
        <p className="text-xs text-slate-500 mt-1">
          Configure AI decision providers, credentials, timeout thresholds, and versioned refund policy guardrails.
        </p>
      </div>

      {/* Provider Selector & Credentials Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">AI Decision Provider Selection</h3>
              <p className="text-xs text-slate-500">
                Primary decision provider: TypeSafe AI Jev System One or Local Deterministic Engine.
              </p>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              providerStatus?.isFallback
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            {providerStatus?.statusMessage}
          </span>
        </div>

        <form onSubmit={handleSaveProviderSettings} className="space-y-4">
          {/* Active provider radio */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Active Evaluation Engine
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-4 rounded-xl border cursor-pointer transition-colors flex items-start gap-3 ${
                  activeProvider === 'LOCAL_DEMO'
                    ? 'border-emerald-500 bg-emerald-50/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value="LOCAL_DEMO"
                  checked={activeProvider === 'LOCAL_DEMO'}
                  onChange={() => setActiveProvider('LOCAL_DEMO')}
                  className="mt-1 accent-emerald-600"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 block">
                    Local Demo Decision Engine (Deterministic)
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block leading-relaxed">
                    Zero-dependency instant local evaluation engine using deterministic rules, photo metadata inspection, and carrier telemetry.
                  </span>
                </div>
              </label>

              <label
                className={`p-4 rounded-xl border cursor-pointer transition-colors flex items-start gap-3 ${
                  activeProvider === 'JEV'
                    ? 'border-emerald-500 bg-emerald-50/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value="JEV"
                  checked={activeProvider === 'JEV'}
                  onChange={() => setActiveProvider('JEV')}
                  className="mt-1 accent-emerald-600"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 block">
                    TypeSafe AI Jev Decision API (System One)
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block leading-relaxed">
                    Official discriminative System One decision model evaluating structured context payloads.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Jev API Configuration fields */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <h4 className="font-semibold text-xs text-slate-800">
              TypeSafe AI Jev Endpoint & Secret Settings
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Jev API Base URL
                </label>
                <input
                  type="text"
                  value={jevBaseUrl}
                  onChange={(e) => setJevBaseUrl(e.target.value)}
                  className="w-full text-xs px-3 py-2 border rounded-md bg-white font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Model / Deployment
                </label>
                <input
                  type="text"
                  value={jevModel}
                  onChange={(e) => setJevModel(e.target.value)}
                  className="w-full text-xs px-3 py-2 border rounded-md bg-white font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Jev API Key (Stored Server-Side Only)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={
                      providerStatus?.jevConfigured
                        ? '•••••••••••••••••••••••• (API key configured)'
                        : 'Enter jv_live_... API key'
                    }
                    value={jevApiKey}
                    onChange={(e) => setJevApiKey(e.target.value)}
                    className="flex-1 text-xs px-3 py-2 border rounded-md bg-white font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestConnection('JEV')}
                    disabled={testingConnection}
                    className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md shadow-sm"
                  >
                    {testingConnection ? 'Testing...' : 'Test Jev Connection'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestConnection('LOCAL_DEMO')}
                    className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md"
                  >
                    Test Local Demo Engine
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Never rendered back to the browser. Redacted from logs and client telemetry.
                </p>
              </div>
            </div>

            {/* Test result output */}
            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs ${
                  testResult.connected
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    {testResult.connected ? '✓ Connection Verified' : '✗ Connection Failed'}
                  </span>
                  <span className="font-mono text-[10px]">{testResult.durationMs}ms</span>
                </div>
                <p className="mt-1">{testResult.message}</p>
              </div>
            )}
          </div>

          {/* Operational parameters */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batch Concurrency Limit
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={concurrencyLimit}
                onChange={(e) => setConcurrencyLimit(parseInt(e.target.value, 10))}
                className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Provider Timeout (ms)
              </label>
              <input
                type="number"
                min="1000"
                max="60000"
                step="1000"
                value={requestTimeoutMs}
                onChange={(e) => setRequestTimeoutMs(parseInt(e.target.value, 10))}
                className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProvider}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingProvider ? 'Saving...' : 'Save Provider Settings'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Versioned Refund Policy Editor */}
      {policy && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-900">Versioned Refund Policy</h3>
                  <span className="font-mono text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    Active: {policy.version}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rules passed into the AI decision packet and used for state transition guardrails.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSavePolicy} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Policy Return Window (Days from Delivery)
                </label>
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={policy.configuration.policyWindowDays}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      configuration: {
                        ...policy.configuration,
                        policyWindowDays: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  High-Value Manual Review Threshold ($ USD)
                </label>
                <input
                  type="number"
                  min="10"
                  step="1"
                  value={policy.configuration.highValueManualReviewThreshold / 100}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      configuration: {
                        ...policy.configuration,
                        highValueManualReviewThreshold: Math.round(parseFloat(e.target.value) * 100),
                      },
                    })
                  }
                  className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Max Prior Refunds Before Mandatory Review
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={policy.configuration.maxPriorRefundsBeforeReview}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      configuration: {
                        ...policy.configuration,
                        maxPriorRefundsBeforeReview: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Max Prior Chargebacks Before Automatic Reject
                </label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={policy.configuration.maxPriorChargebacksBeforeReject}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      configuration: {
                        ...policy.configuration,
                        maxPriorChargebacksBeforeReject: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policy.configuration.requireImageForDamaged}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      configuration: {
                        ...policy.configuration,
                        requireImageForDamaged: e.target.checked,
                      },
                    })
                  }
                  className="accent-emerald-600 rounded"
                />
                <span>Require verified photo evidence for damaged/defective claims</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policy.configuration.requireDeliveryProofForNonReceipt}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      configuration: {
                        ...policy.configuration,
                        requireDeliveryProofForNonReceipt: e.target.checked,
                      },
                    })
                  }
                  className="accent-emerald-600 rounded"
                />
                <span>Require carrier telemetry GPS check for non-receipt disputes</span>
              </label>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-[11px] text-slate-500">
                Saving will increment and persist a new policy version timestamped in the audit log.
              </div>
              <button
                type="submit"
                disabled={savingPolicy}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingPolicy ? 'Saving Version...' : 'Save & Publish New Version'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
