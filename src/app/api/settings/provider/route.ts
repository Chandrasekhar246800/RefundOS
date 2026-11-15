import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DecisionProviderFactory } from '@/services/decision-providers/factory';
import { JevDecisionProvider } from '@/services/decision-providers/jev-provider';
import { z } from 'zod';

const ProviderSettingsSchema = z.object({
  activeProvider: z.enum(['JEV', 'LOCAL_DEMO']).optional(),
  jevApiKey: z.string().optional(),
  jevBaseUrl: z.string().url().optional(),
  jevModel: z.string().optional(),
  concurrencyLimit: z.number().int().min(1).max(10).optional(),
  requestTimeoutMs: z.number().int().min(1000).max(60000).optional(),
});

export async function GET() {
  try {
    const status = await DecisionProviderFactory.getProviderStatus();

    const [modelSetting, baseUrlSetting, concurrencySetting, timeoutSetting] =
      await Promise.all([
        prisma.systemSetting.findUnique({ where: { key: 'JEV_MODEL' } }),
        prisma.systemSetting.findUnique({ where: { key: 'JEV_API_BASE_URL' } }),
        prisma.systemSetting.findUnique({ where: { key: 'CONCURRENCY_LIMIT' } }),
        prisma.systemSetting.findUnique({ where: { key: 'REQUEST_TIMEOUT_MS' } }),
      ]);

    const jev = new JevDecisionProvider();

    // Redacted view: NEVER expose API key to client
    return NextResponse.json({
      success: true,
      data: {
        activeProvider: status.activeProvider,
        isFallback: status.isFallback,
        statusMessage: status.statusMessage,
        jevConfigured: jev.isConfigured(),
        jevModel: modelSetting?.value || process.env.JEV_MODEL || 'jev-latest',
        jevBaseUrl: baseUrlSetting?.value || process.env.JEV_API_BASE_URL || 'https://api.typesafe.ai/v1',
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

    if (validated.jevModel) {
      await prisma.systemSetting.upsert({
        where: { key: 'JEV_MODEL' },
        update: { value: validated.jevModel },
        create: { key: 'JEV_MODEL', value: validated.jevModel },
      });
    }

    if (validated.jevBaseUrl) {
      await prisma.systemSetting.upsert({
        where: { key: 'JEV_API_BASE_URL' },
        update: { value: validated.jevBaseUrl },
        create: { key: 'JEV_API_BASE_URL', value: validated.jevBaseUrl },
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

    // If API key is updated, update server environment or encrypted store
    if (validated.jevApiKey !== undefined && validated.jevApiKey.trim().length > 0) {
      process.env.JEV_API_KEY = validated.jevApiKey.trim();
      await prisma.systemSetting.upsert({
        where: { key: 'JEV_API_KEY_CONFIGURED' },
        update: { value: 'true' },
        create: { key: 'JEV_API_KEY_CONFIGURED', value: 'true' },
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
          jevModel: validated.jevModel,
          apiKeyUpdated: Boolean(validated.jevApiKey),
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
