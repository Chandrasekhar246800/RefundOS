import { NextResponse } from 'next/server';
import { StorageService } from '@/services/storage/storage-service';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { buffer, record } = await StorageService.getEvidenceFileContent(params.id);

    // Return secure streaming response with protective headers
    // 1. Content-Type matching verified magic bytes
    // 2. nosniff to prevent MIME confusion attacks
    // 3. Sandboxed CSP preventing any script execution
    // 4. Inline content disposition with sanitized filename
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': record.mimeType,
        'Content-Length': String(buffer.length),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': `inline; filename="${encodeURIComponent(record.fileName)}"`,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ success: false, error: 'Evidence file not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
