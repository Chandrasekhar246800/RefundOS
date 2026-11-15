import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { prisma } from '../src/lib/prisma';
import { StorageService } from '../src/services/storage/storage-service';
import { ImageIntelligenceService } from '../src/services/intelligence/image-intelligence';
import { DocumentIntelligenceService } from '../src/services/intelligence/document-intelligence';

describe('REFUND OS 2.0 - Phase 2 Intelligence Engines (Image CV & Document OCR)', () => {
  let testRequestId: string;
  let testOrder: any;
  let testProduct: any;
  const createdFileIds: string[] = [];

  // Generate real sharp and blurry test images
  let realSharpImageBuffer: Buffer;
  let realBlurryImageBuffer: Buffer;

  beforeAll(async () => {
    const existingReq = await prisma.refundRequest.findFirst({
      include: { order: true, product: true },
    });
    if (!existingReq) {
      throw new Error('No refund request found for testing.');
    }
    testRequestId = existingReq.id;
    testOrder = existingReq.order;
    testProduct = existingReq.product;

    // Create a crisp image with high contrast and geometric edges (sharp, >= 300px)
    realSharpImageBuffer = await sharp({
      create: {
        width: 320,
        height: 320,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="320" height="320">
              <rect x="30" y="30" width="120" height="120" fill="black" />
              <line x1="0" y1="0" x2="320" y2="320" stroke="black" stroke-width="12" />
              <circle cx="220" cy="220" r="60" fill="red" />
            </svg>`
          ),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    // Create a heavily blurred image
    realBlurryImageBuffer = await sharp(realSharpImageBuffer)
      .blur(25)
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    for (const id of createdFileIds) {
      try {
        await StorageService.deleteEvidenceFile(id, 'test_cleanup');
      } catch {}
    }
  });

  describe('Module 1: Image Intelligence & Computer Vision', () => {
    it('RULE: dHash must generate deterministic 64-bit hexadecimal hashes', async () => {
      const hash1 = await ImageIntelligenceService.computeDHash(realSharpImageBuffer);
      const hash2 = await ImageIntelligenceService.computeDHash(realSharpImageBuffer);

      expect(hash1).toBeDefined();
      expect(hash1.length).toBe(16); // 16 hex characters = 64 bits
      expect(hash1).toBe(hash2);
    });

    it('RULE: Hamming distance must accurately measure perceptual similarity', () => {
      const hashA = 'ffff0000ffff0000';
      const hashB = 'ffff0000ffff0000'; // Identical
      const hashC = 'ffff0000ffff0001'; // 1 bit diff
      const hashD = '0000ffff0000ffff'; // Inverted (64 bits diff)

      expect(ImageIntelligenceService.computeHammingDistance(hashA, hashB)).toBe(0);
      expect(ImageIntelligenceService.computeHammingDistance(hashA, hashC)).toBe(1);
      expect(ImageIntelligenceService.computeHammingDistance(hashA, hashD)).toBe(64);
    });

    it('RULE: Quality analysis must distinguish sharp vs blurred images', async () => {
      const sharpQuality = await ImageIntelligenceService.analyzeQuality(realSharpImageBuffer);
      const blurryQuality = await ImageIntelligenceService.analyzeQuality(realBlurryImageBuffer);

      expect(sharpQuality.qualityScore).toBeGreaterThan(blurryQuality.qualityScore);
      expect(blurryQuality.isBlurry).toBe(true);
      expect(sharpQuality.isBlurry).toBe(false);
      expect(sharpQuality.sharpnessMetric).toBeGreaterThan(blurryQuality.sharpnessMetric);
    });

    it('RULE: Timeline contradiction must be evaluated when EXIF data is present', async () => {
      const deliveryDate = new Date('2026-05-15T12:00:00Z');
      const exifResult = await ImageIntelligenceService.extractExif(
        realSharpImageBuffer,
        deliveryDate
      );

      expect(exifResult).toBeDefined();
      expect(typeof exifResult.tamperScore).toBe('number');
    });

    it('RULE: inspectImage must store structured ImageAnalysis and compute perceptualHash', async () => {
      const uploadRes = await StorageService.storeEvidenceFile(
        testRequestId,
        'damaged_item_test.png',
        realSharpImageBuffer,
        'test_runner'
      );
      expect(uploadRes.success).toBe(true);
      const fileId = uploadRes.file!.id;
      createdFileIds.push(fileId);

      const imageService = new ImageIntelligenceService();
      const inspection = await imageService.inspectImage({
        evidenceFileId: fileId,
        buffer: realSharpImageBuffer,
        mimeType: 'image/png',
        claimedReason: 'Item arrived cracked and defective',
        orderDeliveredAt: testOrder?.deliveredAt,
        requestId: testRequestId,
      });

      expect(inspection).toBeDefined();
      expect(inspection.width).toBe(320);
      expect(inspection.height).toBe(320);
      expect(inspection.format).toBe('png');
      expect(inspection.perceptualHash).toBeDefined();
      expect(inspection.qualityScore).toBeGreaterThan(0);
      expect(inspection.damageDetected).toBe(true);
      expect(inspection.damageType).toBe('CRACKED');

      // Verify persisted in database
      const dbRecord = await prisma.imageAnalysis.findUnique({
        where: { evidenceFileId: fileId },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.width).toBe(320);
      expect(dbRecord?.evidenceFileId).toBe(fileId);
    });
  });

  describe('Module 2: Document Intelligence & OCR Verification', () => {
    it('RULE: parseDocumentEntities must extract structured fields from invoice text', () => {
      const invoiceText = `
        OFFICIAL INVOICE
        Invoice No: INV-98765-X
        Order Number: ${testOrder.orderRef}
        Date: 2026-05-10
        Customer Ref: CUST-ALPHA-99
        Carrier: FedEx Ground (Tracking: 1Z9999999999999999)
        
        SKU: ${testProduct.sku}
        Description: ${testProduct.name}
        Amount: $${(testOrder.amount / 100).toFixed(2)}
        Tax: $12.50
        Total: $${(testOrder.amount / 100).toFixed(2)}
      `;

      const parsed = DocumentIntelligenceService.parseDocumentEntities(invoiceText);

      expect(parsed.documentType).toBe('INVOICE');
      expect(parsed.extractedInvoiceNo).toBe('INV-98765-X');
      expect(parsed.extractedOrderId).toBe(testOrder.orderRef);
      expect(parsed.extractedSku).toBe(testProduct.sku);
      expect(parsed.extractedAmount).toBe(Number((testOrder.amount / 100).toFixed(2)));
      expect(parsed.extractedCarrier).toBe('FedEx');
    });

    it('RULE: crossVerifyWithOrder must return MATCHED for genuine matching invoice', () => {
      const genuineEntities = {
        documentType: 'INVOICE' as const,
        extractedOrderId: testOrder.orderRef,
        extractedAmount: Number((testOrder.amount / 100).toFixed(2)),
        extractedSku: testProduct.sku,
        extractedDate: '2026-05-10',
      };

      const verification = DocumentIntelligenceService.crossVerifyWithOrder(
        genuineEntities,
        testOrder,
        testProduct
      );

      expect(verification.orderMatchStatus).toBe('MATCHED');
      expect(verification.inconsistencies.length).toBe(0);
    });

    it('RULE: crossVerifyWithOrder must return CONTRADICTORY when invoice order ID or amount differs', () => {
      const forgedEntities = {
        documentType: 'INVOICE' as const,
        extractedOrderId: 'ORD-999-TOTALLY-DIFFERENT',
        extractedAmount: Number(((testOrder.amount / 100) + 150.0).toFixed(2)), // Fraudulent amount inflation
        extractedSku: 'SKU-WRONG-ITEM',
        extractedDate: '2026-05-10',
      };

      const verification = DocumentIntelligenceService.crossVerifyWithOrder(
        forgedEntities,
        testOrder,
        testProduct
      );

      expect(verification.orderMatchStatus).toBe('CONTRADICTORY');
      expect(verification.inconsistencies.length).toBeGreaterThan(0);
      expect(
        verification.inconsistencies.some((i) => i.includes('Order ID mismatch'))
      ).toBe(true);
      expect(
        verification.inconsistencies.some((i) => i.includes('Amount mismatch'))
      ).toBe(true);
    });

    it('RULE: extractTextFromPdf must extract genuine textual content from PDF files', async () => {
      const pdfBuffer = Buffer.from(
        '%PDF-1.4\n' +
        '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n' +
        '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n' +
        '3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>> >> endobj\n' +
        '4 0 obj <</Length 55>> stream\n' +
        'BT\n' +
        '/F1 12 Tf\n' +
        '72 712 Td\n' +
        '(Official Invoice ORD-10023 Total $149.99) Tj\n' +
        'ET\n' +
        'endstream\n' +
        'endobj\n' +
        '5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj\n' +
        'xref\n' +
        '0 6\n' +
        '0000000000 65535 f \n' +
        '0000000009 00000 n \n' +
        '0000000056 00000 n \n' +
        '0000000111 00000 n \n' +
        '0000000212 00000 n \n' +
        '0000000319 00000 n \n' +
        'trailer <</Size 6 /Root 1 0 R>>\n' +
        'startxref\n' +
        '386\n' +
        '%%EOF\n'
      );

      const result = await DocumentIntelligenceService.extractTextFromPdf(pdfBuffer);
      expect(result).toBeDefined();
      expect(result.text).toContain('Official Invoice ORD-10023 Total $149.99');
      expect(result.pageCount).toBe(1);
    });
  });

  describe('Ground-Truth Isolation Guarantee', () => {
    it('RULE: ImageIntelligenceService and DocumentIntelligenceService must NEVER read or expose groundTruthLabel', async () => {
      const imgProto = Object.getOwnPropertyNames(ImageIntelligenceService.prototype);
      const docProto = Object.getOwnPropertyNames(DocumentIntelligenceService.prototype);

      expect(imgProto.includes('groundTruthLabel')).toBe(false);
      expect(docProto.includes('groundTruthLabel')).toBe(false);

      const uploadRes = await StorageService.storeEvidenceFile(
        testRequestId,
        'isolation_test.png',
        realSharpImageBuffer,
        'test_runner'
      );
      createdFileIds.push(uploadRes.file!.id);

      const imageService = new ImageIntelligenceService();
      const inspection = await imageService.inspectImage({
        evidenceFileId: uploadRes.file!.id,
        buffer: realSharpImageBuffer,
        mimeType: 'image/png',
        claimedReason: 'Damage test',
        requestId: testRequestId,
      });

      expect((inspection as any).groundTruthLabel).toBeUndefined();
      expect((inspection as any).groundTruth).toBeUndefined();
    });
  });
});
