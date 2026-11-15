import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { BatchProcessingService } from '@/services/batch-processing-service';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Optionally trigger a fresh count sync before returning
    await BatchProcessingService.refreshBatchCounts(params.id).catch(() => {});

    const batch = await prisma.processingBatch.findUnique({
      where: { id: params.id },
      include: {
        brand: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, sku: true } },
        _count: { select: { requests: true } },
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    }

    const progressPercentage =
      batch.totalCount > 0
        ? Math.min(100, Math.round((batch.processedCount / batch.totalCount) * 100))
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        ...batch,
        progressPercentage,
        isCompleted: batch.status === 'COMPLETED' || batch.processedCount >= batch.totalCount,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
