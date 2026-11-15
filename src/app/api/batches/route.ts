import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId') || undefined;
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    const batches = await prisma.processingBatch.findMany({
      where: brandId ? { brandId } : undefined,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        brand: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, sku: true } },
      },
    });

    return NextResponse.json({ success: true, data: batches });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
