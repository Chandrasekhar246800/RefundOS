'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface ProviderStatus {
  activeProvider: string;
  isFallback: boolean;
  statusMessage: string;
  layaConfigured: boolean;
  layaModel?: string;
  jevConfigured?: boolean;
  environment: string;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  activeBrandId: string;
  setActiveBrandId: (id: string) => void;
  providerStatus: ProviderStatus | null;
  refreshProviderStatus: () => Promise<void>;
  toasts: ToastMessage[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [activeBrandId, setActiveBrandId] = useState<string>('all');
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const refreshProviderStatus = async () => {
    try {
      const res = await fetch('/api/settings/provider');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setProviderStatus(json.data);
        }
      }
    } catch (e) {
      console.error('Failed to load provider status', e);
    }
  };

  useEffect(() => {
    refreshProviderStatus();
  }, []);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <AppContext.Provider
      value={{
        activeBrandId,
        setActiveBrandId,
        providerStatus,
        refreshProviderStatus,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
      {/* Toast notifications container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm flex items-center justify-between border ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-slate-800 border-slate-700 text-white'
            }`}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-3 text-xs opacity-70 hover:opacity-100 font-bold"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
