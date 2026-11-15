import { NextResponse } from 'next/server';
import { StorageService } from '@/services/storage/storage-service';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const actor = searchParams.get('actor') || 'demo_operator';

    const result = await StorageService.deleteEvidenceFile(params.id, actor);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ success: false, error: 'Evidence file not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
