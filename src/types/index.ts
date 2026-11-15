export type GroundTruthLabel = 'LEGITIMATE' | 'NON_LEGITIMATE';

export type RefundStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'APPROVED'
  | 'REJECTED'
  | 'MANUAL_REVIEW'
  | 'FAILED';

export type DecisionOutcome = 'APPROVE' | 'REJECT' | 'MANUAL_REVIEW';

export type ProviderType = 'JEV' | 'LOCAL_DEMO';

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
  accuracy: number; // (TP + TN) / total evaluated
  precision: number; // TP / (TP + FP)
  recall: number; // TP / (TP + FN)
  f1Score: number;
}
