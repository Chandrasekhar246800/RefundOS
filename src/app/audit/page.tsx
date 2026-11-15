'use client';

import React, { useEffect, useState } from 'react';
import { History, Shield, RefreshCw } from 'lucide-react';

export default function AuditPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const url = entityFilter ? `/api/audit-events?entityType=${entityFilter}` : '/api/audit-events';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setEvents(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [entityFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Audit Trail</h2>
          <p className="text-xs text-slate-500 mt-1">
            Immutable chronological record of decisions, transactions, policy revisions, and demo state mutations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="text-xs px-3 py-1.5 border rounded-lg bg-white focus:outline-none"
          >
            <option value="">All Entities</option>
            <option value="BATCH">Batch</option>
            <option value="REFUND_REQUEST">Refund Request</option>
            <option value="BRAND">Brand</option>
            <option value="PRODUCT">Product</option>
            <option value="SETTING">Settings & Policy</option>
            <option value="DEMO">Demo Initialization/Reset</option>
          </select>
          <button
            onClick={fetchEvents}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading audit events...
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <History className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No audit events recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Entity Type</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Entity ID</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800 text-[11px]">
                      {e.entityType}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {e.eventType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 max-w-xs truncate">
                      {e.entityId}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">{e.actor}</td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px] max-w-md truncate" title={JSON.stringify(e.details)}>
                      {typeof e.details === 'object' ? JSON.stringify(e.details) : e.details || '—'}
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
