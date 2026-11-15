import { RefundDecisionProvider } from '@/types';
import { LayaDecisionProvider } from './laya-provider';
import { LocalDemoDecisionProvider } from './local-demo-provider';
import { prisma } from '@/lib/prisma';

export class DecisionProviderFactory {
  static async getProvider(forcedProvider?: string): Promise<{
    provider: RefundDecisionProvider;
    isFallback: boolean;
    providerName: 'LAYA' | 'LOCAL_DEMO';
    statusMessage: string;
  }> {
    // Read configured provider from database system settings if available
    let requestedProvider = forcedProvider;
    if (!requestedProvider) {
      try {
        const setting = await prisma.systemSetting.findUnique({
          where: { key: 'ACTIVE_PROVIDER' },
        });
        if (setting?.value) {
          requestedProvider = setting.value;
        }
      } catch (e) {
        // Fallback to env
        requestedProvider = process.env.DEFAULT_DECISION_PROVIDER || 'LAYA';
      }
    }

    if (requestedProvider === 'LAYA') {
      const laya = new LayaDecisionProvider();
      if (laya.isConfigured()) {
        return {
          provider: laya,
          isFallback: false,
          providerName: 'LAYA',
          statusMessage: 'Laya API (System One) Active',
        };
      } else {
        // Laya requested but not configured -> clean fallback to LocalDemo
        const local = new LocalDemoDecisionProvider();
        return {
          provider: local,
          isFallback: true,
          providerName: 'LOCAL_DEMO',
          statusMessage: 'Laya not configured — using Demo Decision Engine',
        };
      }
    }

    // Explicit Local Demo Engine
    const local = new LocalDemoDecisionProvider();
    return {
      provider: local,
      isFallback: false,
      providerName: 'LOCAL_DEMO',
      statusMessage: 'Local Demo Decision Engine Active (Deterministic)',
    };
  }

  static async getProviderStatus(): Promise<{
    activeProvider: string;
    isFallback: boolean;
    statusMessage: string;
    layaConfigured: boolean;
    localDemoReady: boolean;
  }> {
    const laya = new LayaDecisionProvider();
    const local = new LocalDemoDecisionProvider();

    let configuredProvider = 'LAYA';
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'ACTIVE_PROVIDER' },
      });
      if (setting?.value) configuredProvider = setting.value;
    } catch {}

    const isFallback = configuredProvider === 'LAYA' && !laya.isConfigured();
    const activeProvider = isFallback ? 'LOCAL_DEMO' : configuredProvider;

    return {
      activeProvider,
      isFallback,
      statusMessage: isFallback
        ? 'Laya not configured — using Demo Decision Engine'
        : activeProvider === 'LAYA'
        ? 'Laya API Active'
        : 'Demo Decision Engine Active',
      layaConfigured: laya.isConfigured(),
      localDemoReady: true,
    };
  }
}
