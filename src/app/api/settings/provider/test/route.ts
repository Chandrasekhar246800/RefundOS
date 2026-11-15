import { NextResponse } from 'next/server';
import { DecisionProviderFactory } from '@/services/decision-providers/factory';
import { JevDecisionProvider } from '@/services/decision-providers/jev-provider';
import { LocalDemoDecisionProvider } from '@/services/decision-providers/local-demo-provider';
import { z } from 'zod';

const TestSchema = z.object({
  provider: z.enum(['JEV', 'LOCAL_DEMO']).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const validated = TestSchema.parse(body);

    const startTime = Date.now();
    let result;

    if (validated.provider === 'JEV') {
      const jev = new JevDecisionProvider();
      result = await jev.checkConnection();
    } else if (validated.provider === 'LOCAL_DEMO') {
      const local = new LocalDemoDecisionProvider();
      result = await local.checkConnection();
    } else {
      const { provider } = await DecisionProviderFactory.getProvider();
      result = await provider.checkConnection();
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        durationMs,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
