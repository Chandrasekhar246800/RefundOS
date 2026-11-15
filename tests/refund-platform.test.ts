import { describe, it, expect } from 'vitest';
import { DecisionEngine } from '../src/services/decision-engine';
import { LocalDemoDecisionProvider } from '../src/services/decision-providers/local-demo-provider';
import { DecisionProviderFactory } from '../src/services/decision-providers/factory';
import { LayaDecisionProvider } from '../src/services/decision-providers/laya-provider';
import { SyntheticDataService } from '../src/services/synthetic-data-service';
import { MetricsService } from '../src/services/metrics-service';
import { prisma } from '../src/lib/prisma';

describe('AI Refund Management Platform - Laya & Safety Tests', () => {
  const localProvider = new LocalDemoDecisionProvider();

  const standardPolicy = {
    version: 'v1.0-test',
    policyWindowDays: 30,
    maxInstantApprovalAmount: 25000, // $250
    highValueManualReviewThreshold: 30000, // $300
    maxPriorRefundsBeforeReview: 3,
    maxPriorChargebacksBeforeReject: 1,
    requireDeliveryProofForNonReceipt: true,
    requireImageForDamaged: true,
  };

  it('RULE: Ground-truth label must be strictly isolated from evidence packet', () => {
    const mockRequest = {
      id: 'req_123',
      requestedAmount: 8500,
      currency: 'USD',
      reason: 'DAMAGED_ITEM',
      customerMessage: 'Broken on arrival',
      requestedAt: new Date(),
      evidence: JSON.stringify([{ type: 'PHOTO', description: 'Cracked item', verified: true }]),
      groundTruthLabel: 'LEGITIMATE', // The label that must be excluded!
    };

    const mockOrder = {
      orderRef: 'ORD-123',
      quantity: 1,
      amount: 8500,
      currency: 'USD',
      purchasedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      fulfilmentStatus: 'DELIVERED',
      deliveryEvidence: JSON.stringify({
        carrier: 'FedEx',
        trackingNumber: '12345',
        status: 'DELIVERED',
        deliveryGpsMatch: true,
        signatureObtained: false,
      }),
    };

    const mockCustomer = {
      syntheticCustomerRef: 'CUST-123',
      accountCreatedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      totalOrders: 5,
      priorRefundCount: 0,
      priorReturnCount: 0,
      priorChargebacksCount: 0,
    };

    const mockProduct = {
      name: 'Merino Wool Crewneck',
      sku: 'AUR-MER-001',
      category: 'Knitwear',
    };

    const packet = DecisionEngine.buildEvidencePacket(
      mockRequest,
      mockOrder,
      mockCustomer,
      mockProduct
    );

    // Verify groundTruthLabel is NOT present anywhere in the evidence packet
    expect((packet as any).groundTruthLabel).toBeUndefined();
    expect((packet as any).groundTruth).toBeUndefined();
    expect(JSON.stringify(packet)).not.toContain('LEGITIMATE');
    expect(packet.requestId).toBe('req_123');
    expect(packet.daysSinceDelivery).toBe(2);
  });

  it('RULE: Laya Provider response normalizer handles Choice, Score, and Noul primitives', () => {
    const laya = new LayaDecisionProvider({ apiKey: 'sk_test_key_mock' });

    const mockInput = {
      request: {
        requestId: 'req_mock',
        orderRef: 'ORD-1',
        customerRef: 'CUST-1',
        productName: 'Test Product',
        productSku: 'SKU-1',
        productCategory: 'Apparel',
        orderAmount: 8500,
        requestedAmount: 8500,
        currency: 'USD',
        quantity: 1,
        purchasedAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
        daysSinceDelivery: 2,
        fulfilmentStatus: 'DELIVERED',
        reason: 'DAMAGED_ITEM',
        customerMessage: 'Item was scratched',
        customerAccountAgeDays: 100,
        customerTotalOrders: 4,
        customerPriorRefunds: 0,
        customerPriorReturns: 0,
        customerPriorChargebacks: 0,
        evidence: [],
        trackingSignals: {
          carrier: 'FedEx',
          trackingNumber: '1234',
          status: 'DELIVERED',
          deliveryGpsMatch: true,
          signatureObtained: false,
        },
      },
      policy: standardPolicy,
    };

    const mockLayaRaw = {
      model: 'typed-decisions',
      answers: {
        decision: {
          type: 'choice',
          choice: 'APPROVE',
          confidence: 0.96,
        },
        risk_score: {
          type: 'score',
          score: 12,
        },
        legitimacy_probability: {
          type: 'noul',
          noul: 0.94,
        },
        policy_compliance: {
          type: 'noul',
          noul: 0.99,
        },
        evidence_integrity: {
          type: 'noul',
          noul: 0.92,
        },
      },
    };

    const normalized = (laya as any).normalizeLayaResponse(mockLayaRaw, mockInput);

    expect(normalized.decision).toBe('APPROVE');
    expect(normalized.riskScore).toBe(12);
    expect(normalized.confidence).toBe(0.96);
    expect(normalized.policyChecks.length).toBeGreaterThanOrEqual(3);
    expect(normalized.rationale).toContain('Laya System One');
  });

  it('RULE: Local Demo Provider approves timely legitimate request with verified evidence', async () => {
    const input = {
      request: {
        requestId: 'req_legit_1',
        orderRef: 'ORD-999',
        customerRef: 'CUST-888',
        productName: 'ANC Earbuds',
        productSku: 'VLT-ANC-101',
        productCategory: 'Audio',
        orderAmount: 14900,
        requestedAmount: 14900,
        currency: 'USD',
        quantity: 1,
        purchasedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        deliveredAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        daysSinceDelivery: 3,
        fulfilmentStatus: 'DELIVERED',
        reason: 'DAMAGED_ITEM',
        customerMessage: 'Arrived dented and cracked.',
        customerAccountAgeDays: 300,
        customerTotalOrders: 4,
        customerPriorRefunds: 0,
        customerPriorReturns: 0,
        customerPriorChargebacks: 0,
        evidence: [
          {
            type: 'PHOTO' as const,
            description: 'Clear photo of crack',
            verified: true,
            metadata: { consistentTimestamp: true },
          },
        ],
        trackingSignals: {
          carrier: 'FedEx',
          trackingNumber: '782910',
          status: 'DELIVERED',
          deliveryGpsMatch: true,
          signatureObtained: false,
        },
      },
      policy: standardPolicy,
    };

    const decision = await localProvider.decide(input);

    expect(decision.decision).toBe('APPROVE');
    expect(decision.riskScore).toBeLessThan(40);
    expect(decision.reasonCodes).toContain('WITHIN_POLICY_WINDOW');
    expect(decision.reasonCodes).toContain('VERIFIED_PHOTO_EVIDENCE');
    expect(decision.rationale).toContain('Refund approved');
  });

  it('RULE: Local Demo Provider rejects request exceeding policy window', async () => {
    const input = {
      request: {
        requestId: 'req_expired_1',
        orderRef: 'ORD-998',
        customerRef: 'CUST-887',
        productName: 'ANC Earbuds',
        productSku: 'VLT-ANC-101',
        productCategory: 'Audio',
        orderAmount: 14900,
        requestedAmount: 14900,
        currency: 'USD',
        quantity: 1,
        purchasedAt: new Date(Date.now() - 85 * 86400000).toISOString(),
        deliveredAt: new Date(Date.now() - 75 * 86400000).toISOString(),
        daysSinceDelivery: 75, // Policy limit is 30!
        fulfilmentStatus: 'DELIVERED',
        reason: 'CHANGED_MIND',
        customerMessage: 'Changed my mind after two months.',
        customerAccountAgeDays: 120,
        customerTotalOrders: 1,
        customerPriorRefunds: 0,
        customerPriorReturns: 0,
        customerPriorChargebacks: 0,
        evidence: [],
        trackingSignals: {
          carrier: 'FedEx',
          trackingNumber: '782911',
          status: 'DELIVERED',
          deliveryGpsMatch: true,
          signatureObtained: true,
        },
      },
      policy: standardPolicy,
    };

    const decision = await localProvider.decide(input);

    expect(decision.decision).toBe('REJECT');
    expect(decision.reasonCodes).toContain('EXCEEDS_POLICY_WINDOW');
    expect(decision.riskScore).toBeGreaterThanOrEqual(70);
  });

  it('RULE: Local Demo Provider routes high-value request to MANUAL_REVIEW', async () => {
    const input = {
      request: {
        requestId: 'req_high_value',
        orderRef: 'ORD-997',
        customerRef: 'CUST-886',
        productName: 'Enterprise Setup',
        productSku: 'AUR-EXP-999',
        productCategory: 'Electronics',
        orderAmount: 45000, // $450, exceeds $300 threshold!
        requestedAmount: 45000,
        currency: 'USD',
        quantity: 1,
        purchasedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        deliveredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        daysSinceDelivery: 2,
        fulfilmentStatus: 'DELIVERED',
        reason: 'DAMAGED_ITEM',
        customerMessage: 'Expensive item damaged in transit',
        customerAccountAgeDays: 400,
        customerTotalOrders: 6,
        customerPriorRefunds: 0,
        customerPriorReturns: 0,
        customerPriorChargebacks: 0,
        evidence: [{ type: 'PHOTO' as const, description: 'Photo of damage', verified: true }],
        trackingSignals: {
          carrier: 'UPS',
          trackingNumber: '1Z999',
          status: 'DELIVERED',
          deliveryGpsMatch: true,
          signatureObtained: false,
        },
      },
      policy: standardPolicy,
    };

    const decision = await localProvider.decide(input);

    expect(decision.decision).toBe('MANUAL_REVIEW');
    expect(decision.reasonCodes).toContain('HIGH_VALUE_TRANSACTION');
  });

  it('RULE: Provider Factory cleanly identifies active provider and preserves attribution', async () => {
    const laya = new LayaDecisionProvider();
    const isConfigured = laya.isConfigured();

    const { provider, isFallback, providerName, statusMessage } =
      await DecisionProviderFactory.getProvider('LAYA');

    if (isConfigured) {
      expect(providerName).toBe('LAYA');
      expect(isFallback).toBe(false);
      expect(statusMessage).toContain('Laya API (System One) Active');
    } else {
      expect(providerName).toBe('LOCAL_DEMO');
      expect(isFallback).toBe(true);
      expect(statusMessage).toContain('Laya not configured — using Demo Decision Engine');
    }
  });

  it('RULE: Synthetic Data Generator generates balanced 10/10 split and respects seed', async () => {
    const product = await prisma.product.findFirst({
      include: { brand: true },
    });

    expect(product).not.toBeNull();

    const result = await SyntheticDataService.generateRequests({
      brandId: product!.brandId,
      productId: product!.id,
      legitimateCount: 10,
      nonLegitimateCount: 10,
      seed: 'founderlabs-laya-seed',
      dryRun: true,
    });

    expect(result.preview).toBe(true);
    expect(result.totalCount).toBe(20);
    expect(result.legitimateCount).toBe(10);
    expect(result.nonLegitimateCount).toBe(10);

    const legits = (result as any).items.filter((i: any) => i.groundTruthLabel === 'LEGITIMATE');
    const nonLegits = (result as any).items.filter((i: any) => i.groundTruthLabel === 'NON_LEGITIMATE');

    expect(legits.length).toBe(10);
    expect(nonLegits.length).toBe(10);
  });

  it('RULE: Confusion Matrix correctly computes TP, FP, TN, FN and accuracy metrics', () => {
    const simulatedDecisions = [
      { status: 'APPROVED', groundTruthLabel: 'LEGITIMATE' }, // TP
      { status: 'APPROVED', groundTruthLabel: 'LEGITIMATE' }, // TP
      { status: 'APPROVED', groundTruthLabel: 'LEGITIMATE' }, // TP
      { status: 'REJECTED', groundTruthLabel: 'LEGITIMATE' }, // FN
      { status: 'REJECTED', groundTruthLabel: 'NON_LEGITIMATE' }, // TN
      { status: 'REJECTED', groundTruthLabel: 'NON_LEGITIMATE' }, // TN
      { status: 'REJECTED', groundTruthLabel: 'NON_LEGITIMATE' }, // TN
      { status: 'APPROVED', groundTruthLabel: 'NON_LEGITIMATE' }, // FP
      { status: 'MANUAL_REVIEW', groundTruthLabel: 'LEGITIMATE' }, // MR
      { status: 'MANUAL_REVIEW', groundTruthLabel: 'NON_LEGITIMATE' }, // MR
    ];

    const matrix = MetricsService.calculateConfusionMatrix(simulatedDecisions);

    expect(matrix.truePositives).toBe(3);
    expect(matrix.trueNegatives).toBe(3);
    expect(matrix.falsePositives).toBe(1);
    expect(matrix.falseNegatives).toBe(1);
    expect(matrix.totalManualReviews).toBe(2);
    expect(matrix.precision).toBe(75.0); // 3 / (3 + 1) = 75%
    expect(matrix.recall).toBe(75.0); // 3 / (3 + 1) = 75%
    expect(matrix.accuracy).toBe(75.0); // (3 + 3) / 8 = 75%
  });
});
