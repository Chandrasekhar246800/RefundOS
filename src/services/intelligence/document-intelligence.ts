import Tesseract from 'tesseract.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { prisma } from '@/lib/prisma';
import { StorageService } from '@/services/storage/storage-service';
import {
  IDocumentIntelligenceService,
  DocumentInspectionInput,
  DocumentInspectionResult,
} from '@/types';

export class DocumentIntelligenceService implements IDocumentIntelligenceService {
  /**
   * Extracts text from PDF files using pdf-parse.
   */
  public static async extractTextFromPdf(buffer: Buffer): Promise<{
    text: string;
    pageCount: number;
    info: Record<string, any>;
    isScannedPdf?: boolean;
    ocrEngineUsed?: string;
  }> {
    try {
      const pdfModule: any = await import('pdf-parse');
      const PDFParseClass = pdfModule.PDFParse || pdfModule.default?.PDFParse;
      if (PDFParseClass) {
        const parser = new PDFParseClass({ data: buffer });
        const textResult = await parser.getText();
        let text = (textResult.text || '').trim();
        const pageCount = textResult.total || 1;

        // If direct text stream is empty or minimal, it's a scanned PDF
        const isScannedPdf = text.length < 30;

        if (isScannedPdf) {
          try {
            // Convert and extract page screenshots as images, then OCR each page
            const screenshots = await parser.getScreenshot({ imageBuffer: true });
            let combinedOcrText = '';

            for (const page of screenshots.pages) {
              if (page.data && page.data.length > 0) {
                const pageBuffer = Buffer.from(page.data);
                const pageOcr = await DocumentIntelligenceService.extractTextFromImage(pageBuffer);
                if (pageOcr.text) {
                  combinedOcrText += pageOcr.text + '\n';
                }
              }
            }

            await parser.destroy().catch(() => {});

            if (combinedOcrText.trim().length > 0) {
              return {
                text: combinedOcrText.trim(),
                pageCount,
                info: { convertedPagesCount: screenshots.pages.length },
                isScannedPdf: true,
                ocrEngineUsed: 'PDF_SCREENSHOT_TESSERACT_OCR',
              };
            }
          } catch (renderErr) {
            console.warn('Scanned PDF page rendering OCR error:', renderErr);
          }
        }

        await parser.destroy().catch(() => {});
        return {
          text,
          pageCount,
          info: {},
          isScannedPdf,
          ocrEngineUsed: isScannedPdf ? 'PDF_PARSE (NO_TEXT_FOUND)' : 'PDF_PARSE_STREAM',
        };
      }
      const legacyFn = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
      const data = await legacyFn(buffer);
      return {
        text: data.text || '',
        pageCount: data.numpages || 1,
        info: data.info || {},
        isScannedPdf: (data.text || '').trim().length < 30,
        ocrEngineUsed: 'PDF_PARSE_LEGACY',
      };
    } catch (err: any) {
      throw new Error(`PDF text extraction error: ${err.message}`);
    }
  }

  /**
   * Extracts text from image files (scanned receipts, invoices, labels) using Tesseract OCR.
   */
  public static async extractTextFromImage(buffer: Buffer): Promise<{
    text: string;
    confidence: number;
  }> {
    let worker: any = null;
    try {
      worker = await Tesseract.createWorker('eng');
      const result = await worker.recognize(buffer);
      const text = result.data.text || '';
      const confidence = Number((result.data.confidence / 100).toFixed(2));
      return { text, confidence };
    } catch (err: any) {
      return { text: '', confidence: 0 };
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
    }
  }

  /**
   * Parses structured key-value entities from raw extracted document text.
   */
  public static parseDocumentEntities(text: string): {
    extractedOrderId?: string;
    extractedInvoiceNo?: string;
    extractedTracking?: string;
    extractedAmount?: number;
    extractedTaxAmount?: number;
    extractedDate?: string;
    extractedProductName?: string;
    extractedSku?: string;
    extractedCarrier?: string;
    extractedDeliveryDate?: string;
    extractedCustomerRef?: string;
    documentType: 'INVOICE' | 'PACKING_SLIP' | 'RETURN_LABEL' | 'CARRIER_LOG' | 'POLICE_REPORT' | 'AFFIDAVIT';
  } {
    const cleanText = text.replace(/\r\n/g, '\n');

    // 1. Classify document type
    let documentType: 'INVOICE' | 'PACKING_SLIP' | 'RETURN_LABEL' | 'CARRIER_LOG' | 'POLICE_REPORT' | 'AFFIDAVIT' = 'INVOICE';
    if (/packing slip|delivery note|shipping manifest/i.test(cleanText)) {
      documentType = 'PACKING_SLIP';
    } else if (/return label|return merchandise|rma/i.test(cleanText)) {
      documentType = 'RETURN_LABEL';
    } else if (/carrier exception|delivery proof|proof of delivery|carrier log/i.test(cleanText)) {
      documentType = 'CARRIER_LOG';
    } else if (/police report|incident report|crime reference/i.test(cleanText)) {
      documentType = 'POLICE_REPORT';
    } else if (/affidavit|declaration under penalty|sworn statement/i.test(cleanText)) {
      documentType = 'AFFIDAVIT';
    }

    // 2. Order ID extraction
    let extractedOrderId: string | undefined;
    const orderMatch =
      cleanText.match(/\b(ORD-[A-Za-z0-9-]+)\b/i) ||
      cleanText.match(/Order\s*(?:ID|#|No[:.]?)\s*([A-Za-z0-9-]+)/i);
    if (orderMatch) {
      extractedOrderId = orderMatch[1].trim().toUpperCase();
    }

    // 3. Invoice No extraction
    let extractedInvoiceNo: string | undefined;
    const invMatch =
      cleanText.match(/\b(INV-[A-Za-z0-9-]+)\b/i) ||
      cleanText.match(/Invoice\s*(?:ID|#|No[:.]?)\s*([A-Za-z0-9-]+)/i);
    if (invMatch) {
      extractedInvoiceNo = invMatch[1].trim().toUpperCase();
    }

    // 4. SKU extraction
    let extractedSku: string | undefined;
    const skuMatch =
      cleanText.match(/\b([A-Z]{3}-[A-Z]{3}-\d{3})\b/i) ||
      cleanText.match(/SKU[:.]?\s*([A-Za-z0-9-]+)/i);
    if (skuMatch) {
      extractedSku = skuMatch[1].trim().toUpperCase();
    }

    // 5. Amount extraction (Total amount in dollars, e.g. 129.99)
    let extractedAmount: number | undefined;
    const amountMatch =
      cleanText.match(/(?:Total|Amount Due|Grand Total|Total Paid)[:\s]*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i) ||
      cleanText.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2}))/);
    if (amountMatch) {
      const cleanNum = amountMatch[1].replace(/,/g, '');
      const parsedFloat = parseFloat(cleanNum);
      if (!isNaN(parsedFloat)) {
        extractedAmount = Number(parsedFloat.toFixed(2));
      }
    }

    // 6. Tax Amount
    let extractedTaxAmount: number | undefined;
    const taxMatch = cleanText.match(/Tax[:\s]*\$?\s*(\d+(?:\.\d{2})?)/i);
    if (taxMatch) {
      const parsedTax = parseFloat(taxMatch[1]);
      if (!isNaN(parsedTax)) {
        extractedTaxAmount = Number(parsedTax.toFixed(2));
      }
    }

    // 7. Tracking Number & Carrier
    let extractedTracking: string | undefined;
    let extractedCarrier: string | undefined;

    const carrierMention = cleanText.match(/Carrier[:\s]*([A-Za-z]+)/i);
    if (carrierMention) {
      const c = carrierMention[1].toLowerCase();
      if (c.includes('fedex')) extractedCarrier = 'FedEx';
      else if (c.includes('ups')) extractedCarrier = 'UPS';
      else if (c.includes('usps')) extractedCarrier = 'USPS';
      else if (c.includes('dhl')) extractedCarrier = 'DHL';
      else extractedCarrier = carrierMention[1];
    }

    const upsMatch = cleanText.match(/\b(1Z[0-9A-Z]{16})\b/i);
    const fedexMatch = cleanText.match(/\b(\d{12}|\d{15}|\d{20})\b/);
    const uspsMatch = cleanText.match(/\b((?:94|93|92|91)\d{20})\b/);

    if (upsMatch) {
      extractedTracking = upsMatch[1].toUpperCase();
      if (!extractedCarrier) extractedCarrier = 'UPS';
    } else if (uspsMatch) {
      extractedTracking = uspsMatch[1];
      if (!extractedCarrier) extractedCarrier = 'USPS';
    } else if (fedexMatch) {
      extractedTracking = fedexMatch[1];
      if (!extractedCarrier) extractedCarrier = 'FedEx';
    }

    if (!extractedCarrier) {
      if (/fedex/i.test(cleanText)) extractedCarrier = 'FedEx';
      else if (/ups/i.test(cleanText)) extractedCarrier = 'UPS';
      else if (/usps/i.test(cleanText)) extractedCarrier = 'USPS';
      else if (/dhl/i.test(cleanText)) extractedCarrier = 'DHL';
    }

    // 8. Date extraction
    let extractedDate: string | undefined;
    const dateMatch =
      cleanText.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
      cleanText.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/) ||
      cleanText.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/i);
    if (dateMatch) {
      const parsedDate = new Date(dateMatch[1]);
      if (!isNaN(parsedDate.getTime())) {
        extractedDate = parsedDate.toISOString();
      }
    }

    // 9. Customer reference
    let extractedCustomerRef: string | undefined;
    const custMatch = cleanText.match(/\b(CUST-[A-Za-z0-9-]+)\b/i);
    if (custMatch) {
      extractedCustomerRef = custMatch[1].toUpperCase();
    }

    return {
      documentType,
      extractedOrderId,
      extractedInvoiceNo,
      extractedTracking,
      extractedAmount,
      extractedTaxAmount,
      extractedDate,
      extractedSku,
      extractedCarrier,
      extractedCustomerRef,
    };
  }

  /**
   * Cross-verifies extracted document information against REFUND OS Order and Product records.
   */
  public static crossVerifyWithOrder(
    parsed: ReturnType<typeof DocumentIntelligenceService.parseDocumentEntities>,
    order: {
      orderRef: string;
      amount: number;
      deliveryEvidence?: string | null;
      purchasedAt: Date;
    },
    product?: { sku: string; name: string } | null
  ): {
    orderMatchStatus: 'MATCHED' | 'PARTIAL_MISMATCH' | 'CONTRADICTORY';
    inconsistencies: string[];
    matchConfidence: number;
  } {
    const inconsistencies: string[] = [];
    let matchPoints = 0;
    let totalChecks = 0;

    // 1. Order ID verification
    if (parsed.extractedOrderId) {
      totalChecks++;
      if (parsed.extractedOrderId === order.orderRef.toUpperCase()) {
        matchPoints++;
      } else {
        inconsistencies.push(
          `Order ID mismatch: document states '${parsed.extractedOrderId}', order record is '${order.orderRef}'.`
        );
      }
    }

    // 2. Amount verification
    if (parsed.extractedAmount !== undefined) {
      totalChecks++;
      // Compare in dollars (order.amount is stored in cents)
      const orderAmountDollars = Number((order.amount / 100).toFixed(2));
      const diffDollars = Math.abs(parsed.extractedAmount - orderAmountDollars);
      if (diffDollars <= 1.0) {
        matchPoints++;
      } else {
        inconsistencies.push(
          `Amount mismatch: document indicates $${parsed.extractedAmount.toFixed(
            2
          )}, order record billed $${orderAmountDollars.toFixed(2)}.`
        );
      }
    }

    // 3. Tracking number verification
    if (parsed.extractedTracking && order.deliveryEvidence) {
      try {
        const deliveryData = JSON.parse(order.deliveryEvidence);
        if (deliveryData.trackingNumber) {
          totalChecks++;
          if (
            parsed.extractedTracking.toLowerCase() ===
            String(deliveryData.trackingNumber).toLowerCase()
          ) {
            matchPoints++;
          } else {
            inconsistencies.push(
              `Tracking number mismatch: document lists '${parsed.extractedTracking}', carrier log lists '${deliveryData.trackingNumber}'.`
            );
          }
        }
      } catch {}
    }

    // 4. SKU verification
    if (parsed.extractedSku && product) {
      totalChecks++;
      if (parsed.extractedSku.toUpperCase() === product.sku.toUpperCase()) {
        matchPoints++;
      } else {
        inconsistencies.push(
          `Product SKU mismatch: document lists '${parsed.extractedSku}', expected catalog SKU is '${product.sku}'.`
        );
      }
    }

    let orderMatchStatus: 'MATCHED' | 'PARTIAL_MISMATCH' | 'CONTRADICTORY' = 'MATCHED';
    let matchConfidence = 1.0;

    if (totalChecks > 0) {
      matchConfidence = Number((matchPoints / totalChecks).toFixed(2));
      if (inconsistencies.length === 0) {
        orderMatchStatus = 'MATCHED';
      } else if (matchPoints > 0) {
        orderMatchStatus = 'PARTIAL_MISMATCH';
      } else {
        orderMatchStatus = 'CONTRADICTORY';
      }
    } else {
      orderMatchStatus = 'PARTIAL_MISMATCH';
      inconsistencies.push('Document contains no identifiable Order ID, SKU, or tracking numbers.');
      matchConfidence = 0.5;
    }

    return {
      orderMatchStatus,
      inconsistencies,
      matchConfidence,
    };
  }

  /**
   * Main inspection execution on an evidence file.
   */
  public async inspectDocument(input: DocumentInspectionInput): Promise<DocumentInspectionResult> {
    const evidenceFile = await prisma.evidenceFile.findUnique({
      where: { id: input.evidenceFileId },
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
      throw new Error(`Evidence file '${input.evidenceFileId}' not found.`);
    }

    const rootDir = StorageService.getStorageRootDir();
    const absolutePath = path.join(rootDir, evidenceFile.filePath);
    StorageService.assertSafePath(absolutePath);

    const buffer = await fs.readFile(absolutePath);
    const ext = path.extname(evidenceFile.fileName).toLowerCase();

    let ocrText = '';
    let confidenceScore = 1.0;
    let provider = 'TESSERACT_OCR';

    if (ext === '.pdf' || evidenceFile.mimeType === 'application/pdf') {
      const pdfResult = await DocumentIntelligenceService.extractTextFromPdf(buffer);
      ocrText = pdfResult.text;
      provider = pdfResult.ocrEngineUsed || (pdfResult.isScannedPdf ? 'PDF_SCREENSHOT_TESSERACT_OCR' : 'PDF_PARSE');
      confidenceScore = pdfResult.isScannedPdf
        ? (ocrText.length > 30 ? 0.90 : 0.40)
        : (ocrText.length > 50 ? 0.98 : 0.60);
    } else {
      provider = 'TESSERACT_OCR';
      const imgOcrResult = await DocumentIntelligenceService.extractTextFromImage(buffer);
      ocrText = imgOcrResult.text;
      confidenceScore = imgOcrResult.confidence || 0.85;
    }

    // Parse structured entities
    const entities = DocumentIntelligenceService.parseDocumentEntities(ocrText);

    // Cross-verify with Order & Product records
    const verification = DocumentIntelligenceService.crossVerifyWithOrder(
      entities,
      evidenceFile.refundRequest.order,
      evidenceFile.refundRequest.product
    );

    // Persist DocumentAnalysis to database
    await prisma.documentAnalysis.upsert({
      where: { evidenceFileId: evidenceFile.id },
      update: {
        documentType: entities.documentType,
        ocrText,
        extractedOrderId: entities.extractedOrderId,
        extractedInvoiceNo: entities.extractedInvoiceNo,
        extractedTracking: entities.extractedTracking,
        extractedAmount: entities.extractedAmount,
        extractedTaxAmount: entities.extractedTaxAmount,
        extractedDate: entities.extractedDate ? new Date(entities.extractedDate) : null,
        extractedSku: entities.extractedSku,
        extractedCarrier: entities.extractedCarrier,
        extractedCustomerRef: entities.extractedCustomerRef,
        orderMatchStatus: verification.orderMatchStatus,
        confidenceScore,
        inconsistencies: JSON.stringify(verification.inconsistencies),
        provider,
      },
      create: {
        evidenceFileId: evidenceFile.id,
        documentType: entities.documentType,
        ocrText,
        extractedOrderId: entities.extractedOrderId,
        extractedInvoiceNo: entities.extractedInvoiceNo,
        extractedTracking: entities.extractedTracking,
        extractedAmount: entities.extractedAmount,
        extractedTaxAmount: entities.extractedTaxAmount,
        extractedDate: entities.extractedDate ? new Date(entities.extractedDate) : null,
        extractedSku: entities.extractedSku,
        extractedCarrier: entities.extractedCarrier,
        extractedCustomerRef: entities.extractedCustomerRef,
        orderMatchStatus: verification.orderMatchStatus,
        confidenceScore,
        inconsistencies: JSON.stringify(verification.inconsistencies),
        provider,
      },
    });

    return {
      documentType: entities.documentType,
      ocrText,
      extractedOrderId: entities.extractedOrderId,
      extractedInvoiceNo: entities.extractedInvoiceNo,
      extractedTracking: entities.extractedTracking,
      extractedAmount: entities.extractedAmount,
      extractedTaxAmount: entities.extractedTaxAmount,
      extractedDate: entities.extractedDate,
      extractedProductName: entities.extractedProductName,
      extractedSku: entities.extractedSku,
      extractedCarrier: entities.extractedCarrier,
      extractedDeliveryDate: entities.extractedDeliveryDate,
      extractedCustomerRef: entities.extractedCustomerRef,
      orderMatchStatus: verification.orderMatchStatus,
      confidenceScore,
      inconsistencies: verification.inconsistencies,
      provider,
    };
  }
}
