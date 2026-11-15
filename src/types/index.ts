export type GroundTruthLabel = 'LEGITIMATE' | 'NON_LEGITIMATE';

export type RefundStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'APPROVED'
  | 'REJECTED'
  | 'MANUAL_REVIEW'
  | 'FAILED';

export type DecisionOutcome = 'APPROVE' | 'REJECT' | 'MANUAL_REVIEW';

export type ProviderType = 'LAYA' | 'LOCAL_DEMO' | 'JEV';

export interface EvidenceItem {
  type: 'PHOTO' | 'CARRIER_RECORD' | 'INSPECTION' | 'INVOICE' | 'CUSTOMER_AFFIDAVIT' | 'FULFILLMENT_LOG';
  description: string;
  verified: boolean;
  metadata?: Record<string, any>;
}

export interface TrackingSignals {
  carrier: string;
  trackingNumber: string;
  status: string;
  deliveryGpsMatch: boolean | null;
  signatureObtained: boolean;
  carrierNotes?: string;
  timeline?: Array<{ timestamp: string; event: string }>;
}

export interface RefundEvidencePacket {
  requestId: string;
  orderRef: string;
  customerRef: string;
  productName: string;
  productSku: string;
  productCategory: string;
  orderAmount: number; // in minor units (cents)
  requestedAmount: number; // in minor units (cents)
  currency: string;
  quantity: number;
  purchasedAt: string;
  deliveredAt: string | null;
  daysSinceDelivery: number | null;
  fulfilmentStatus: string;
  reason: string;
  customerMessage: string;
  customerAccountAgeDays: number;
  customerTotalOrders: number;
  customerPriorRefunds: number;
  customerPriorReturns: number;
  customerPriorChargebacks: number;
  evidence: EvidenceItem[];
  trackingSignals: TrackingSignals;
  previousRefundOutcomes?: Array<{
    date: string;
    outcome: string;
    amount: number;
  }>;
}

export interface RefundPolicySnapshot {
  version: string;
  policyWindowDays: number;
  maxInstantApprovalAmount: number; // in cents
  highValueManualReviewThreshold: number; // in cents
  maxPriorRefundsBeforeReview: number;
  maxPriorChargebacksBeforeReject: number;
  requireDeliveryProofForNonReceipt: boolean;
  requireImageForDamaged: boolean;
  allowOpenedPackaging?: boolean;
}

export interface DecisionInput {
  request: RefundEvidencePacket;
  policy: RefundPolicySnapshot;
}

export interface PolicyCheckResult {
  rule: string;
  result: 'PASS' | 'FAIL' | 'UNKNOWN';
  explanation: string;
}

export interface LayaUsageTelemetry {
  inputTokens: number;
  stateTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number | null;
}

export interface NormalizedDecision {
  decision: DecisionOutcome;
  riskScore?: number | null; // 0 - 100
  confidence?: number | null; // 0.0 - 1.0
  reasonCodes: string[];
  rationale: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  missingInformation: string[];
  policyChecks: PolicyCheckResult[];
  recommendedNextAction?: string;
  usage?: LayaUsageTelemetry;
}

export interface RefundDecisionProvider {
  getProviderName(): string;
  checkConnection(): Promise<{ connected: boolean; message: string; details?: any }>;
  decide(input: DecisionInput): Promise<NormalizedDecision>;
}

export interface ConfusionMatrixMetrics {
  totalLegitimateGroundTruth: number;
  totalNonLegitimateGroundTruth: number;
  truePositives: number; // Legitimate approved
  falsePositives: number; // Non-legitimate approved (high risk error)
  trueNegatives: number; // Non-legitimate rejected
  falseNegatives: number; // Legitimate rejected
  manualReviewLegitimate: number;
  manualReviewNonLegitimate: number;
  totalManualReviews: number;
  accuracy: number; // (TP + TN) / total evaluated definitive
  precision: number; // TP / (TP + FP)
  recall: number; // TP / (TP + FN)
  f1Score: number;
  automationRate?: number; // (TP + TN + FP + FN) / total requests
  manualReviewRate?: number; // totalManualReviews / total requests
  strictLegitimateApprovalRate?: number; // TP / totalLegitimate
  strictFraudBlockRate?: number; // TN / totalNonLegitimate
}

// ==========================================
// REFUND OS 2.0 STORAGE & INTELLIGENCE TYPES
// ==========================================

export type StoredFileType = 'IMAGE' | 'DOCUMENT';

export interface StorageFileMetadata {
  id: string;
  refundRequestId: string;
  fileType: StoredFileType;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  uploadedAt: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  mimeType?: string;
  fileType?: StoredFileType;
  sanitizedFileName?: string;
  fileHash?: string;
}

export interface StorageUploadResult {
  success: boolean;
  file?: StorageFileMetadata;
  isDuplicate?: boolean;
  duplicateOfId?: string;
  error?: string;
}

// ------------------------------------------
// Intelligence Domain Interfaces
// ------------------------------------------

export interface ImageInspectionInput {
  evidenceFileId: string;
  filePath?: string;
  claimedReason?: string;
  orderDeliveredAt?: Date | string | null;
  buffer?: Buffer;
  mimeType?: string;
  requestId?: string;
}

export interface ImageInspectionResult {
  damageDetected: boolean | null;
  damageType?: string;
  damageSeverity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE';
  packagingCondition: 'UNOPENED' | 'OPENED_INTACT' | 'DAMAGED_TAMPERED';
  tamperScore: number; // 0 - 100
  exifTimestamp?: string;
  exifDeviceModel?: string;
  authenticityScore: number; // 0 - 100
  analysisSummary: string;
  width?: number;
  height?: number;
  format?: string;
  qualityScore?: number; // 0 - 100
  isBlurry?: boolean;
  lightingIssue?: boolean;
  perceptualHash?: string;
  duplicateFound?: boolean;
  duplicateDetails?: string;
  provider?: string;
  modelOrEngine?: string;
  isSemanticVision?: boolean;
  visualConfidence?: number | null;
  findings?: string[];
}

export interface IImageIntelligenceService {
  inspectImage(input: ImageInspectionInput): Promise<ImageInspectionResult>;
}

export interface DocumentInspectionInput {
  evidenceFileId: string;
  filePath?: string;
  expectedOrderId?: string;
  expectedOrderAmount?: number;
  expectedTrackingNumber?: string;
  buffer?: Buffer;
  mimeType?: string;
  requestId?: string;
}

export interface DocumentInspectionResult {
  documentType: 'INVOICE' | 'PACKING_SLIP' | 'RETURN_LABEL' | 'CARRIER_LOG' | 'POLICE_REPORT' | 'AFFIDAVIT';
  ocrText: string;
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
  orderMatchStatus: 'MATCHED' | 'PARTIAL_MISMATCH' | 'CONTRADICTORY';
  confidenceScore: number;
  inconsistencies: string[];
  provider?: string;
}

export interface IDocumentIntelligenceService {
  inspectDocument(input: DocumentInspectionInput): Promise<DocumentInspectionResult>;
}

export interface DeliveryInspectionInput {
  orderId: string;
  carrier: string;
  trackingNumber: string;
  shippingAddressCoordinates?: { lat: number; lng: number };
  carrierDeliveryGps?: { lat: number; lng: number };
  carrierTimelineJson?: string;
}

export interface DeliveryInspectionResult {
  carrier: string;
  trackingNumber: string;
  carrierStatus: string;
  geofenceMatch: boolean;
  geofenceDistanceMeters?: number;
  transitVelocityValid: boolean;
  signatureVerified: boolean;
  deliveryPhotoVerified: boolean;
  carrierDisputeFlag: boolean;
  riskScore: number; // 0 - 100
  signals: Record<string, any>;
}

export interface IDeliveryIntelligenceService {
  inspectDelivery(input: DeliveryInspectionInput): Promise<DeliveryInspectionResult>;
}

export interface CustomerRiskMetrics {
  compositeRiskScore: number; // 0 - 100
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'RESTRICTED';
  claimsLast7Days: number;
  claimsLast30Days: number;
  refundToSpendRatio: number;
  chargebackRate: number;
  anonymizedClusterHash?: string;
  fraudSignals: string[];
}

export interface ICustomerRiskService {
  evaluateCustomerRisk(customerId: string): Promise<CustomerRiskMetrics>;
}

export interface FraudEvaluationResult {
  fraudScore: number; // 0 - 100
  riskTier: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  detectedPatterns: string[];
  anomalyDetails: Record<string, any>;
  dispositionProposal: 'PASS' | 'REVIEW' | 'REJECT';
}

export interface IFraudDetectionEngine {
  evaluateFraudRisk(refundRequestId: string): Promise<FraudEvaluationResult>;
}
