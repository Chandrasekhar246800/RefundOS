import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DecisionProviderFactory } from '@/services/decision-providers/factory';
import { LayaDecisionProvider } from '@/services/decision-providers/laya-provider';
import { z } from 'zod';

const ProviderSettingsSchema = z.object({
  activeProvider: z.enum(['LAYA', 'LOCAL_DEMO']).optional(),
  layaApiKey: z.string().optional(),
  layaBaseUrl: z.string().url().optional(),
  layaModel: z.string().optional(),
  concurrencyLimit: z.number().int().min(1).max(10).optional(),
  requestTimeoutMs: z.number().int().min(1000).max(60000).optional(),
});

export async function GET() {
  try {
    const status = await DecisionProviderFactory.getProviderStatus();

    const [modelSetting, baseUrlSetting, concurrencySetting, timeoutSetting] =
      await Promise.all([
        prisma.systemSetting.findUnique({ where: { key: 'LAYA_MODEL' } }),
        prisma.systemSetting.findUnique({ where: { key: 'LAYA_API_BASE_URL' } }),
        prisma.systemSetting.findUnique({ where: { key: 'CONCURRENCY_LIMIT' } }),
        prisma.systemSetting.findUnique({ where: { key: 'REQUEST_TIMEOUT_MS' } }),
      ]);

    const laya = new LayaDecisionProvider();

    // Redacted view: NEVER expose API key to client
    return NextResponse.json({
      success: true,
      data: {
        activeProvider: status.activeProvider,
        isFallback: status.isFallback,
        statusMessage: status.statusMessage,
        layaConfigured: laya.isConfigured(),
        layaModel: modelSetting?.value || process.env.LAYA_MODEL || 'typed-decisions',
        layaBaseUrl: baseUrlSetting?.value || process.env.LAYA_API_BASE_URL || 'https://api.laya-ai.com',
        concurrencyLimit: parseInt(concurrencySetting?.value || '3', 10),
        requestTimeoutMs: parseInt(timeoutSetting?.value || '15000', 10),
        environment: 'DEMO / SIMULATED',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const validated = ProviderSettingsSchema.parse(body);

    if (validated.activeProvider) {
      await prisma.systemSetting.upsert({
        where: { key: 'ACTIVE_PROVIDER' },
        update: { value: validated.activeProvider },
        create: { key: 'ACTIVE_PROVIDER', value: validated.activeProvider },
      });
    }

    if (validated.layaModel) {
      await prisma.systemSetting.upsert({
        where: { key: 'LAYA_MODEL' },
        update: { value: validated.layaModel },
        create: { key: 'LAYA_MODEL', value: validated.layaModel },
      });
    }

    if (validated.layaBaseUrl) {
      await prisma.systemSetting.upsert({
        where: { key: 'LAYA_API_BASE_URL' },
        update: { value: validated.layaBaseUrl },
        create: { key: 'LAYA_API_BASE_URL', value: validated.layaBaseUrl },
      });
    }

    if (validated.concurrencyLimit) {
      await prisma.systemSetting.upsert({
        where: { key: 'CONCURRENCY_LIMIT' },
        update: { value: String(validated.concurrencyLimit) },
        create: { key: 'CONCURRENCY_LIMIT', value: String(validated.concurrencyLimit) },
      });
    }

    if (validated.requestTimeoutMs) {
      await prisma.systemSetting.upsert({
        where: { key: 'REQUEST_TIMEOUT_MS' },
        update: { value: String(validated.requestTimeoutMs) },
        create: { key: 'REQUEST_TIMEOUT_MS', value: String(validated.requestTimeoutMs) },
      });
    }

    // Securely update API key server-side only
    if (validated.layaApiKey !== undefined && validated.layaApiKey.trim().length > 0) {
      process.env.LAYA_API_KEY = validated.layaApiKey.trim();
      await prisma.systemSetting.upsert({
        where: { key: 'LAYA_API_KEY_CONFIGURED' },
        update: { value: 'true' },
        create: { key: 'LAYA_API_KEY_CONFIGURED', value: 'true' },
      });
    }

    await prisma.auditEvent.create({
      data: {
        entityType: 'SETTING',
        entityId: 'provider_config',
        eventType: 'UPDATED',
        actor: 'demo_operator',
        details: JSON.stringify({
          activeProvider: validated.activeProvider,
          layaModel: validated.layaModel,
          apiKeyUpdated: Boolean(validated.layaApiKey),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Provider settings updated successfully.',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
