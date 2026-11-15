import { NextResponse } from 'next/server';
import { BatchProcessingService } from '@/services/batch-processing-service';
import { DecisionEngine } from '@/services/decision-engine';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ProcessSchema = z.object({
  batchId: z.string().optional(),
  requestIds: z.array(z.string()).optional(),
  requestId: z.string().optional(),
  forcedProvider: z.enum(['LAYA', 'LOCAL_DEMO', 'JEV']).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = ProcessSchema.parse(body);

    // If single requestId provided
    if (validated.requestId) {
      const result = await DecisionEngine.processSingleRequest(
        validated.requestId,
        validated.forcedProvider
      );
      return NextResponse.json({ success: true, data: result });
    }

    // If batchId provided
    if (validated.batchId) {
      const result = await BatchProcessingService.processBatch(
        validated.batchId,
        validated.requestIds,
        validated.forcedProvider
      );
      return NextResponse.json({
        success: true,
        data: result,
        message: `Processing initiated for ${result.totalQueued} refund request(s).`,
      });
    }

    // If only requestIds array provided without an existing batch
    if (validated.requestIds && validated.requestIds.length > 0) {
      // Find the first request to determine brand
      const firstReq = await prisma.refundRequest.findUnique({
        where: { id: validated.requestIds[0] },
        include: { product: true },
      });

      if (!firstReq) {
        return NextResponse.json({ success: false, error: 'Requests not found' }, { status: 404 });
      }

      // Create an ad-hoc batch
      const newBatch = await prisma.processingBatch.create({
        data: {
          brandId: firstReq.product.brandId,
          productId: firstReq.productId,
          status: 'PENDING',
          totalCount: validated.requestIds.length,
          provider: validated.forcedProvider || 'LOCAL_DEMO',
        },
      });

      // Associate requests with this batch
      await prisma.refundRequest.updateMany({
        where: { id: { in: validated.requestIds } },
        data: { batchId: newBatch.id },
      });

      const result = await BatchProcessingService.processBatch(
        newBatch.id,
        validated.requestIds,
        validated.forcedProvider
      );

      return NextResponse.json({
        success: true,
        data: result,
        message: `Processing initiated for ${result.totalQueued} refund request(s).`,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Either batchId, requestIds, or requestId must be provided.' },
      { status: 400 }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
