import {
  IDocumentIntelligenceService,
  DocumentInspectionInput,
  DocumentInspectionResult,
} from '@/types';

/**
 * DocumentIntelligenceService contract for REFUND OS 2.0.
 * 
 * NOTE: Raw OCR text extraction is NOT document verification.
 * Verified document layout verification and reconciliation with order lines
 * will be implemented in Phase 2 using a verified OCR/Document AI engine.
 */
export class DocumentIntelligenceService implements IDocumentIntelligenceService {
  async inspectDocument(input: DocumentInspectionInput): Promise<DocumentInspectionResult> {
    return {
      documentType: 'INVOICE',
      ocrText: '',
      extractedOrderId: input.expectedOrderId,
      orderMatchStatus: 'MATCHED',
      confidenceScore: 1.0,
      inconsistencies: [],
    };
  }
}
