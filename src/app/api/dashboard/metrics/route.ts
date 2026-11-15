import { NextResponse } from 'next/server';
import { MetricsService } from '@/services/metrics-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId') || undefined;
    const productId = searchParams.get('productId') || undefined;
    const batchId = searchParams.get('batchId') || undefined;

    const metrics = await MetricsService.getDashboardMetrics({
      brandId,
      productId,
      batchId,
    });

    return NextResponse.json({ success: true, data: metrics });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
