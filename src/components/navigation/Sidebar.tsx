'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Package,
  Sparkles,
  Inbox,
  Layers,
  Settings,
  History,
  ShieldAlert,
  Users,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Overview', href: '/', icon: LayoutDashboard },
    { label: 'Brands', href: '/brands', icon: Building2 },
    { label: 'Products', href: '/products', icon: Package },
    { label: 'Synthetic Generator', href: '/generator', icon: Sparkles, highlight: true },
    { label: 'Refund Requests', href: '/requests', icon: Inbox },
    { label: 'Customer Intelligence', href: '/customers', icon: Users },
    { label: 'Processing Batches', href: '/batches', icon: Layers },
    { label: 'Settings & Policy', href: '/settings', icon: Settings },
    { label: 'Audit Trail', href: '/audit', icon: History },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col flex-shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-white text-base tracking-tight leading-tight flex items-center gap-1.5">
            <span>REFUND</span>
            <span className="text-emerald-400 font-extrabold">OS</span>
          </h1>
          <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
            Decision Automation
          </p>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 p-3 space-y-1">
        <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Operations Console
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="flex-1">{item.label}</span>
              {item.highlight && (
                <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  10+10
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Indicator Footer */}
      <div className="p-4 border-t border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold text-slate-300">DEMO ENVIRONMENT</span>
        </div>
        <p className="text-slate-400 leading-relaxed text-[10px]">
          Simulated decisions & transactions only. Real money is never transferred.
        </p>
      </div>
    </aside>
  );
}
