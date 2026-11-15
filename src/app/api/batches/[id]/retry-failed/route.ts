import { NextResponse } from 'next/server';
import { BatchProcessingService } from '@/services/batch-processing-service';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await BatchProcessingService.retryFailedRequests(
      params.id,
      body.forcedProvider
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
