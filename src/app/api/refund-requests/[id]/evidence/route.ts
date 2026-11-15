import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { StorageService } from '@/services/storage/storage-service';
import { ImageIntelligenceService } from '@/services/intelligence/image-intelligence';
import { DocumentIntelligenceService } from '@/services/intelligence/document-intelligence';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const files = await StorageService.listEvidenceFiles(params.id);
    return NextResponse.json({ success: true, data: files });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const refundRequest = await prisma.refundRequest.findUnique({
      where: { id: params.id },
      include: {
        order: true,
        product: true,
      },
    });

    if (!refundRequest) {
      return NextResponse.json(
        { success: false, error: `Refund request '${params.id}' not found.` },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const uploadedFiles = formData.getAll('file') as File[];
    const actor = (formData.get('actor') as string) || 'demo_operator';
    const forceDocOcr = formData.get('runOcr') === 'true';

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided in upload request.' },
        { status: 400 }
      );
    }

    const results = [];
    const errors = [];
    const imageService = new ImageIntelligenceService();
    const documentService = new DocumentIntelligenceService();

    for (const file of uploadedFiles) {
      if (typeof file === 'string') continue;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const storeResult = await StorageService.storeEvidenceFile(
        params.id,
        file.name,
        buffer,
        actor
      );

      if (!storeResult.success || !storeResult.file) {
        errors.push({ fileName: file.name, error: storeResult.error || 'Failed to store file.' });
        continue;
      }

      const fileRecord = storeResult.file;
      let imageInspection = null;
      let documentInspection = null;

      // 1. Genuine Image Inspection Pipeline
      if (fileRecord.fileType === 'IMAGE') {
        try {
          imageInspection = await imageService.inspectImage({
            evidenceFileId: fileRecord.id,
            buffer,
            mimeType: fileRecord.mimeType,
            claimedReason: refundRequest.reason,
            orderDeliveredAt: refundRequest.order?.deliveredAt,
            requestId: params.id,
          });
        } catch (imgErr: any) {
          console.error(`Image analysis error for ${fileRecord.fileName}:`, imgErr);
        }

        // Check if image is an invoice / receipt / label for Document OCR
        const lowerName = file.name.toLowerCase();
        const isLikelyDoc =
          forceDocOcr ||
          lowerName.includes('receipt') ||
          lowerName.includes('invoice') ||
          lowerName.includes('label') ||
          lowerName.includes('bill') ||
          lowerName.includes('slip') ||
          lowerName.includes('doc');

        if (isLikelyDoc) {
          try {
            documentInspection = await documentService.inspectDocument({
              evidenceFileId: fileRecord.id,
              requestId: params.id,
            });
          } catch (docErr: any) {
            console.error(`Document OCR error on image ${fileRecord.fileName}:`, docErr);
          }
        }
      }

      // 2. Genuine Document Inspection Pipeline (PDF or OCR document)
      if (fileRecord.fileType === 'DOCUMENT') {
        try {
          documentInspection = await documentService.inspectDocument({
            evidenceFileId: fileRecord.id,
            requestId: params.id,
          });
        } catch (docErr: any) {
          console.error(`Document OCR error for ${fileRecord.fileName}:`, docErr);
        }
      }

      results.push({
        ...storeResult,
        imageInspection,
        documentInspection,
      });
    }

    if (results.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: errors[0].error,
          errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully processed and inspected ${results.length} file(s).`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
