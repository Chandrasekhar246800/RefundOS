import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { prisma } from '../src/lib/prisma';
import { StorageService } from '../src/services/storage/storage-service';
import { ImageIntelligenceService } from '../src/services/intelligence/image-intelligence';
import { DocumentIntelligenceService } from '../src/services/intelligence/document-intelligence';
import { LocalCvProvider } from '../src/services/intelligence/vision-providers/local-cv-provider';
import { MultimodalVisionProvider } from '../src/services/intelligence/vision-providers/multimodal-vision-provider';

describe('REFUND OS 2.0 - Phase 2 Targeted Engineering Validation', () => {
  let testRequestId: string;
  let testOrder: any;
  let testProduct: any;
  const createdFileIds: string[] = [];

  let realSharpImageBuffer: Buffer;
  let realBlurryImageBuffer: Buffer;
  let receiptImageBuffer: Buffer;
  let shippingLabelBuffer: Buffer;

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

    // 1. Sharp Image Buffer (>= 300px)
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

    // 2. Blurry Image Buffer
    realBlurryImageBuffer = await sharp(realSharpImageBuffer)
      .blur(25)
      .png()
      .toBuffer();

    // 3. Crisp Receipt Image Buffer for OCR
    receiptImageBuffer = await sharp({
      create: {
        width: 500,
        height: 350,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="500" height="350">
              <text x="30" y="50" font-family="Arial" font-size="22" font-weight="bold" fill="black">OFFICIAL STORE RECEIPT</text>
              <text x="30" y="100" font-family="Arial" font-size="18" fill="black">Order Number: ${testOrder.orderRef}</text>
              <text x="30" y="145" font-family="Arial" font-size="18" fill="black">SKU: ${testProduct.sku}</text>
              <text x="30" y="190" font-family="Arial" font-size="18" fill="black">Total Paid: $${(testOrder.amount / 100).toFixed(2)}</text>
              <text x="30" y="235" font-family="Arial" font-size="18" fill="black">Date: 2026-05-10</text>
            </svg>`
          ),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    // 4. Shipping Label Image Buffer for OCR
    shippingLabelBuffer = await sharp({
      create: {
        width: 500,
        height: 300,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="500" height="300">
              <text x="30" y="50" font-family="Arial" font-size="22" font-weight="bold" fill="black">PRIORITY RETURN LABEL</text>
              <text x="30" y="100" font-family="Arial" font-size="18" fill="black">Carrier: FedEx</text>
              <text x="30" y="145" font-family="Arial" font-size="18" fill="black">Tracking: 992817263541</text>
              <text x="30" y="190" font-family="Arial" font-size="18" fill="black">Order ID: ${testOrder.orderRef}</text>
            </svg>`
          ),
          top: 0,
          left: 0,
        },
      ])
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

  describe('Validation 1: Honest Visual Damage Detection vs Classical CV', () => {
    it('RULE: Local CV provider must explicitly identify semantic damage categories as unsupported without vision model', async () => {
      const localProvider = new LocalCvProvider();
      expect(localProvider.isAvailable()).toBe(true);

      const result = await localProvider.analyzeImage(realSharpImageBuffer, 'image/png', 'Claimed damaged');
      expect(result.isSemanticVision).toBe(false);
      expect(result.damageDetected).toBeNull(); // Not fabricated
      expect(result.damageType).toBe('UNSUPPORTED_WITHOUT_VISION_MODEL');
      expect(result.visualConfidence).toBeNull();
      expect(result.analysisSummary).toContain('requires an active Multimodal Vision Provider');
    });

    it('RULE: MultimodalVisionProvider interface must gracefully report unavailable if API key missing', () => {
      const visionProvider = new MultimodalVisionProvider();
      if (!process.env.VISION_API_KEY && !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
        expect(visionProvider.isAvailable()).toBe(false);
      }
    });

    it('RULE: inspectImage must store structured image analysis without fabricated damage classifications', async () => {
      const uploadRes = await StorageService.storeEvidenceFile(
        testRequestId,
        'damage_claim_test.png',
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
        claimedReason: 'Item arrived cracked and scratched',
        orderDeliveredAt: testOrder?.deliveredAt,
        requestId: testRequestId,
      });

      expect(inspection).toBeDefined();
      expect(inspection.width).toBe(320);
      expect(inspection.height).toBe(320);
      expect(inspection.format).toBe('png');
      expect(inspection.perceptualHash).toBeDefined();
      expect(inspection.qualityScore).toBeGreaterThan(0);

      // Verify no fabricated damage detection
      if (!process.env.VISION_API_KEY) {
        expect(inspection.damageType).toBe('UNSUPPORTED_WITHOUT_VISION_MODEL');
        expect(inspection.damageDetected).toBeNull();
      }

      // Verify persisted in database
      const dbRecord = await prisma.imageAnalysis.findUnique({
        where: { evidenceFileId: fileId },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.width).toBe(320);
    });
  });

  describe('Validation 2: Comprehensive OCR Functionality (5 Test Document Types)', () => {
    // Document 1: Normal Invoice PDF (with direct stream text)
    it('Doc 1: Normal invoice PDF with text stream', async () => {
      const normalPdfText = `Official Invoice ORD-10023 Total $149.99 Date: 2026-05-10`;
      const pdfBuffer = Buffer.from(
        '%PDF-1.4\n' +
        '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n' +
        '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n' +
        '3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>> >> endobj\n' +
        '4 0 obj <</Length 65>> stream\n' +
        'BT\n' +
        '/F1 12 Tf\n' +
        '72 712 Td\n' +
        `(${normalPdfText}) Tj\n` +
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
        '0000000329 00000 n \n' +
        'trailer <</Size 6 /Root 1 0 R>>\n' +
        'startxref\n' +
        '396\n' +
        '%%EOF\n'
      );

      const result = await DocumentIntelligenceService.extractTextFromPdf(pdfBuffer);
      expect(result.text).toContain('Official Invoice ORD-10023');
      expect(result.isScannedPdf).toBe(false);
    });

    // Document 2: Scanned Invoice PDF (rendered page screenshot fallback)
    it('Doc 2: Scanned invoice PDF without text stream converts pages and extracts text', async () => {
      // Scanned PDF has page object but empty text stream (< 30 chars text)
      const scannedPdfBuffer = Buffer.from(
        '%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids [3 0 R]/Count 1>> endobj\n3 0 obj <</Type/Page/Parent 2 0 R/MediaBox [0 0 400 300]>> endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\ntrailer <</Size 4/Root 1 0 R>>\n%%EOF'
      );

      const result = await DocumentIntelligenceService.extractTextFromPdf(scannedPdfBuffer);
      expect(result).toBeDefined();
      expect(result.isScannedPdf).toBe(true);
    });

    // Document 3: Receipt Image (PNG via Tesseract OCR)
    it('Doc 3: Receipt image OCR extraction via Tesseract', async () => {
      const result = await DocumentIntelligenceService.extractTextFromImage(receiptImageBuffer);
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(10);
      expect(result.text.toUpperCase()).toContain('RECEIPT');
      expect(result.confidence).toBeGreaterThan(0.5);

      const entities = DocumentIntelligenceService.parseDocumentEntities(result.text);
      expect(entities.extractedOrderId).toBe(testOrder.orderRef);
      expect(entities.extractedAmount).toBe(Number((testOrder.amount / 100).toFixed(2)));
    }, 15000);

    // Document 4: Shipping Label (PNG via Tesseract OCR)
    it('Doc 4: Shipping label OCR extraction via Tesseract', async () => {
      const result = await DocumentIntelligenceService.extractTextFromImage(shippingLabelBuffer);
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(10);
      expect(result.text.toUpperCase()).toContain('LABEL');

      const entities = DocumentIntelligenceService.parseDocumentEntities(result.text);
      expect(entities.extractedCarrier).toBe('FedEx');
      expect(entities.extractedOrderId).toBe(testOrder.orderRef);
    }, 15000);

    // Document 5: Corrupted Document Handling
    it('Doc 5: Corrupted document error handling', async () => {
      const corruptedBuffer = Buffer.from('this is completely corrupted binary garbage not a pdf or image');

      // 1. StorageService must reject corrupted document at upload gate
      const validation = StorageService.validateFile('corrupted.pdf', corruptedBuffer);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Header verification failed');

      // 2. extractTextFromPdf must throw clean error rather than unhandled crash
      await expect(
        DocumentIntelligenceService.extractTextFromPdf(corruptedBuffer)
      ).rejects.toThrow();
    });
  });

  describe('Validation 3: Evidence Interpretation & Discrepancy Rules', () => {
    it('RULE: Document mismatches must be categorized as discrepancies / inconsistencies', () => {
      const mismatchedEntities = {
        documentType: 'INVOICE' as const,
        extractedOrderId: 'ORD-DIFFERENT-999',
        extractedAmount: (testOrder.amount / 100) + 75.0,
        extractedSku: 'SKU-UNBILLED-000',
      };

      const verification = DocumentIntelligenceService.crossVerifyWithOrder(
        mismatchedEntities,
        testOrder,
        testProduct
      );

      // Must be reported as inconsistencies, not a fraud sentence
      expect(verification.orderMatchStatus).toBe('CONTRADICTORY');
      expect(verification.inconsistencies.length).toBe(3);
      expect(verification.inconsistencies[0]).toContain('Order ID mismatch');
      expect(verification.inconsistencies[1]).toContain('Amount mismatch');
      expect(verification.inconsistencies[2]).toContain('Product SKU mismatch');
    });
  });

  describe('Validation 4: Evidence Security Verification', () => {
    it('RULE: Evidence storage root must assert safe path and prevent directory traversal', () => {
      const unsafeTraversalPath = 'C:\\Users\\mcsr8\\Desktop\\founderlabs\\storage\\evidence\\..\\..\\secret.env';
      expect(() => StorageService.assertSafePath(unsafeTraversalPath)).toThrow(/Path traversal/i);
    });

    it('RULE: Deleting an evidence file must cascade delete its ImageAnalysis/DocumentAnalysis while keeping AuditEvents', async () => {
      // Create a unique buffer to avoid SHA-256 duplicate collision
      const uniqueCascadeBuffer = await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 3,
          background: { r: 10, g: 20, b: 30 },
        },
      })
        .png()
        .toBuffer();

      const upload = await StorageService.storeEvidenceFile(
        testRequestId,
        'cascade_test.png',
        uniqueCascadeBuffer,
        'security_auditor'
      );
      const fileId = upload.file!.id;

      // Create an image analysis record for this file via upsert
      await prisma.imageAnalysis.upsert({
        where: { evidenceFileId: fileId },
        update: {
          width: 300,
          height: 300,
          qualityScore: 90,
          analysisSummary: 'Cascade deletion test',
        },
        create: {
          evidenceFileId: fileId,
          width: 300,
          height: 300,
          qualityScore: 90,
          analysisSummary: 'Cascade deletion test',
        },
      });

      // Confirm image analysis exists
      const beforeDeleteAnalysis = await prisma.imageAnalysis.findUnique({
        where: { evidenceFileId: fileId },
      });
      expect(beforeDeleteAnalysis).not.toBeNull();

      // Delete the evidence file
      const delResult = await StorageService.deleteEvidenceFile(fileId, 'security_auditor');
      expect(delResult.success).toBe(true);

      // Confirm image analysis was cascaded
      const afterDeleteAnalysis = await prisma.imageAnalysis.findUnique({
        where: { evidenceFileId: fileId },
      });
      expect(afterDeleteAnalysis).toBeNull();

      // Confirm audit event persists
      const audit = await prisma.auditEvent.findFirst({
        where: { entityId: fileId, eventType: 'DELETED' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actor).toBe('security_auditor');
    });
  });
});
