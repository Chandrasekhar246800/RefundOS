import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ImageIntelligenceService } from '@/services/intelligence/image-intelligence';
import { DocumentIntelligenceService } from '@/services/intelligence/document-intelligence';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const evidenceFile = await prisma.evidenceFile.findUnique({
      where: { id: params.id },
      include: {
        refundRequest: {
          include: {
            order: true,
            product: true,
          },
        },
      },
    });

    if (!evidenceFile) {
      return NextResponse.json(
        { success: false, error: `Evidence file '${params.id}' not found.` },
        { status: 404 }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine
    }

    const mode = body.mode || 'AUTO'; // 'AUTO' | 'IMAGE' | 'DOCUMENT' | 'ALL'
    const imageService = new ImageIntelligenceService();
    const documentService = new DocumentIntelligenceService();

    let imageResult = null;
    let documentResult = null;

    const shouldRunImage =
      mode === 'IMAGE' ||
      mode === 'ALL' ||
      (mode === 'AUTO' && evidenceFile.fileType === 'IMAGE');

    const shouldRunDoc =
      mode === 'DOCUMENT' ||
      mode === 'ALL' ||
      (mode === 'AUTO' && evidenceFile.fileType === 'DOCUMENT');

    if (shouldRunImage) {
      imageResult = await imageService.inspectImage({
        evidenceFileId: evidenceFile.id,
        mimeType: evidenceFile.mimeType,
        claimedReason: evidenceFile.refundRequest.reason,
        orderDeliveredAt: evidenceFile.refundRequest.order?.deliveredAt,
        requestId: evidenceFile.refundRequestId,
      });
    }

    if (shouldRunDoc) {
      documentResult = await documentService.inspectDocument({
        evidenceFileId: evidenceFile.id,
        requestId: evidenceFile.refundRequestId,
      });
    }

    // Return the refreshed record
    const updated = await prisma.evidenceFile.findUnique({
      where: { id: params.id },
      include: {
        imageAnalysis: true,
        documentAnalysis: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        file: updated,
        imageResult,
        documentResult,
      },
      message: 'Analysis successfully completed.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
