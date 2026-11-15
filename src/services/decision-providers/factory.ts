import { RefundDecisionProvider } from '@/types';
import { JevDecisionProvider } from './jev-provider';
import { LocalDemoDecisionProvider } from './local-demo-provider';
import { prisma } from '@/lib/prisma';

export class DecisionProviderFactory {
  static async getProvider(forcedProvider?: string): Promise<{
    provider: RefundDecisionProvider;
    isFallback: boolean;
    providerName: 'JEV' | 'LOCAL_DEMO';
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
        requestedProvider = process.env.DEFAULT_DECISION_PROVIDER || 'LOCAL_DEMO';
      }
    }

    if (requestedProvider === 'JEV') {
      const jev = new JevDecisionProvider();
      if (jev.isConfigured()) {
        return {
          provider: jev,
          isFallback: false,
          providerName: 'JEV',
          statusMessage: 'Jev AI (TypeSafe System One) Active',
        };
      } else {
        // Jev requested but not configured -> clean fallback to LocalDemo
        const local = new LocalDemoDecisionProvider();
        return {
          provider: local,
          isFallback: true,
          providerName: 'LOCAL_DEMO',
          statusMessage: 'Jev not configured — using Demo Decision Engine',
        };
      }
    }

    // Default Local Demo Engine
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
    jevConfigured: boolean;
    localDemoReady: boolean;
  }> {
    const jev = new JevDecisionProvider();
    const local = new LocalDemoDecisionProvider();

    let configuredProvider = 'LOCAL_DEMO';
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'ACTIVE_PROVIDER' },
      });
      if (setting?.value) configuredProvider = setting.value;
    } catch {}

    const isFallback = configuredProvider === 'JEV' && !jev.isConfigured();
    const activeProvider = isFallback ? 'LOCAL_DEMO' : configuredProvider;

    return {
      activeProvider,
      isFallback,
      statusMessage: isFallback
        ? 'Jev not configured — using Demo Decision Engine'
        : activeProvider === 'JEV'
        ? 'Jev AI Active'
        : 'Demo Decision Engine Active',
      jevConfigured: jev.isConfigured(),
      localDemoReady: true,
    };
  }
}
