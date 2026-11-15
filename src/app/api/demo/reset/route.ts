import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ResetSchema = z.object({
  confirmation: z.literal('RESET_DEMO_DATA'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    ResetSchema.parse(body);

    // Clean up demo transactions and requests
    await prisma.$transaction(async (tx) => {
      await tx.refundTransaction.deleteMany({});
      await tx.decision.deleteMany({});
      await tx.refundRequest.deleteMany({});
      await tx.order.deleteMany({});
      await tx.customer.deleteMany({});
      await tx.processingBatch.deleteMany({});

      await tx.auditEvent.create({
        data: {
          entityType: 'DEMO',
          entityId: 'reset_all',
          eventType: 'RESET',
          actor: 'demo_operator',
          details: JSON.stringify({ message: 'All demo batches and requests reset to clean state' }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Demo environment successfully reset. All demo batches, requests, and transactions cleared.',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Confirmation string "RESET_DEMO_DATA" is required to prevent accidental data loss.' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
