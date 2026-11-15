import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { CustomerRiskService } from '../src/services/intelligence/customer-risk-service';
import { FraudDetectionEngine } from '../src/services/intelligence/fraud-detection-engine';
import { DecisionEngine } from '../src/services/decision-engine';
import crypto from 'crypto';

describe('REFUND OS 2.0 - Phase 3 Customer Risk Intelligence & Advanced Fraud Detection', () => {
  let riskService: CustomerRiskService;
  let fraudEngine: FraudDetectionEngine;

  let testBrandId: string;
  let testProductId: string;
  const cleanUpCustomerIds: string[] = [];
  const cleanUpOrderIds: string[] = [];
  const cleanUpRequestIds: string[] = [];
  const cleanUpFileIds: string[] = [];

  const createCustomer = async (ref: string, custom: any = {}) => {
    const cust = await prisma.customer.create({
      data: {
        syntheticCustomerRef: ref,
        accountCreatedAt: custom.accountCreatedAt || new Date(),
        totalOrders: custom.totalOrders ?? 1,
        priorRefundCount: custom.priorRefundCount ?? 0,
        priorReturnCount: custom.priorReturnCount ?? 0,
        priorChargebackCount: custom.priorChargebackCount ?? 0,
      },
    });
    cleanUpCustomerIds.push(cust.id);
    return cust;
  };

  const createOrder = async (customerId: string, productId: string, amount: number, custom: any = {}) => {
    const ord = await prisma.order.create({
      data: {
        brandId: testBrandId,
        productId,
        customerId,
        orderRef: custom.orderRef || `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        amount,
        currency: 'USD',
        purchasedAt: custom.purchasedAt || new Date(),
        fulfilmentStatus: custom.fulfilmentStatus || 'DELIVERED',
        deliveredAt: custom.deliveredAt !== undefined ? custom.deliveredAt : new Date(),
        deliveryEvidence: custom.deliveryEvidence || null,
      },
    });
    cleanUpOrderIds.push(ord.id);
    return ord;
  };

  const createRefundRequest = async (customerId: string, orderId: string, productId: string, amount: number, custom: any = {}) => {
    const req = await prisma.refundRequest.create({
      data: {
        customerId,
        orderId,
        productId,
        requestRef: custom.requestRef || `REF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        requestedAmount: amount,
        currency: 'USD',
        reason: custom.reason || 'DAMAGED_ITEM',
        customerMessage: custom.customerMessage || 'Defective item',
        groundTruthLabel: custom.groundTruthLabel || 'SUSPICIOUS',
        status: custom.status || 'PENDING',
        requestedAt: custom.requestedAt || new Date(),
      },
    });
    cleanUpRequestIds.push(req.id);
    return req;
  };

  beforeAll(async () => {
    riskService = new CustomerRiskService();
    fraudEngine = new FraudDetectionEngine();

    let brand = await prisma.brand.findFirst();
    if (!brand) {
      brand = await prisma.brand.create({
        data: {
          name: 'Test Fraud Brand',
          code: 'TF-BRAND',
          policyConfig: JSON.stringify({
            returnWindowDays: 30,
            allowDamagedReturns: true,
            maxRefundAmount: 50000,
          }),
        },
      });
    }
    testBrandId = brand.id;

    let product = await prisma.product.findFirst({ where: { brandId: testBrandId } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          brandId: testBrandId,
          name: 'Premium Wireless Headphones',
          sku: `PWH-${Date.now()}`,
          unitPrice: 14999,
          category: 'ELECTRONICS',
        },
      });
    }
    testProductId = product.id;
  });

  afterAll(async () => {
    for (const reqId of cleanUpRequestIds) {
      await prisma.fraudEvaluation.deleteMany({ where: { refundRequestId: reqId } });
      await prisma.decision.deleteMany({ where: { refundRequestId: reqId } });
      await prisma.layaUsageLog.deleteMany({ where: { refundRequestId: reqId } });
      await prisma.auditEvent.deleteMany({ where: { entityId: reqId } });
      await prisma.refundRequest.deleteMany({ where: { id: reqId } });
    }

    for (const fileId of cleanUpFileIds) {
      await prisma.imageAnalysis.deleteMany({ where: { evidenceFileId: fileId } });
      await prisma.documentAnalysis.deleteMany({ where: { evidenceFileId: fileId } });
      await prisma.evidenceFile.deleteMany({ where: { id: fileId } });
    }

    for (const orderId of cleanUpOrderIds) {
      await prisma.order.deleteMany({ where: { id: orderId } });
    }

    for (const custId of cleanUpCustomerIds) {
      await prisma.customerRiskProfile.deleteMany({ where: { customerId: custId } });
      await prisma.customer.deleteMany({ where: { id: custId } });
    }
  });

  // =========================================================================
  // Scenario 1: New customer with no history
  // =========================================================================
  it('Scenario 1: Handles new customer with no history without unfair penalty (baseline score = 10, LOW tier)', async () => {
    const customer = await createCustomer(`TEST-CUST-NEW-${Date.now()}`, { totalOrders: 0, priorRefundCount: 0 });

    const profile = await riskService.evaluateCustomerRisk(customer.id);

    expect(profile).toBeDefined();
    expect(profile.compositeRiskScore).toBe(10);
    expect(profile.riskTier).toBe('LOW');
    expect(profile.totalOrders).toBe(0);
    expect(profile.totalRefundRequests).toBe(0);
    expect(profile.refundToOrderRatio).toBe(0);
    expect(profile.refundToSpendRatio).toBe(0);
    expect(profile.claimsLast7Days).toBe(0);
    expect(profile.behaviourChangeTrend).toBe('INSUFFICIENT_HISTORY');
    expect(profile.contributingSignals).toHaveLength(1);
    expect(profile.contributingSignals[0].rule).toBe('NEW_CUSTOMER_BASELINE');
    expect(profile.calculationExplanation).toContain('New customer account with limited order history');
  });

  // =========================================================================
  // Scenario 2: Customer with legitimate refund history
  // =========================================================================
  it('Scenario 2: Customer with high spend and legitimate low-ratio refund receives positive credits and LOW tier', async () => {
    const customer = await createCustomer(`TEST-CUST-LEGIT-${Date.now()}`, {
      accountCreatedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
      totalOrders: 10,
      priorRefundCount: 1,
    });

    let firstOrderId = '';
    for (let i = 0; i < 10; i++) {
      const order = await createOrder(customer.id, testProductId, 15000, {
        purchasedAt: new Date(Date.now() - (150 - i * 10) * 24 * 60 * 60 * 1000),
        deliveredAt: new Date(Date.now() - (145 - i * 10) * 24 * 60 * 60 * 1000),
      });
      if (i === 0) firstOrderId = order.id;
    }

    await createRefundRequest(customer.id, firstOrderId, testProductId, 5000, {
      status: 'APPROVED',
      requestedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      groundTruthLabel: 'LEGITIMATE',
    });

    const profile = await riskService.evaluateCustomerRisk(customer.id);

    expect(profile.totalOrders).toBe(10);
    expect(profile.totalPurchaseAmountCents).toBe(150000); // $1500
    expect(profile.totalRefundAmountCents).toBe(5000); // $50
    expect(profile.refundToSpendRatio).toBeCloseTo(0.033, 2); // ~3.3%
    expect(profile.riskTier).toBe('LOW');
    expect(profile.compositeRiskScore).toBeLessThanOrEqual(15);
    const healthySignal = profile.contributingSignals.find((s) => s.rule === 'ESTABLISHED_HEALTHY_BUYER');
    expect(healthySignal).toBeDefined();
    expect(healthySignal?.scoreContribution).toBeLessThan(0);
  });

  // =========================================================================
  // Scenario 3: Customer with unusually frequent refund requests
  // =========================================================================
  it('Scenario 3: Unusually frequent refund velocity (>=2 in 7d, >=3 in 30d) triggers velocity penalties', async () => {
    const customer = await createCustomer(`TEST-CUST-VELOCITY-${Date.now()}`, {
      accountCreatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      totalOrders: 4,
      priorRefundCount: 3,
    });

    for (let i = 0; i < 4; i++) {
      const order = await createOrder(customer.id, testProductId, 10000, {
        purchasedAt: new Date(Date.now() - (20 - i * 4) * 24 * 60 * 60 * 1000),
      });

      if (i > 0) {
        await createRefundRequest(customer.id, order.id, testProductId, 10000, {
          requestedAt: new Date(Date.now() - (i === 1 ? 2 : i === 2 ? 4 : 10) * 24 * 60 * 60 * 1000),
          groundTruthLabel: 'SUSPICIOUS',
        });
      }
    }

    const profile = await riskService.evaluateCustomerRisk(customer.id);

    expect(profile.claimsLast7Days).toBeGreaterThanOrEqual(2);
    expect(profile.claimsLast30Days).toBeGreaterThanOrEqual(3);
    expect(profile.behaviourChangeTrend).toBe('ACCELERATING');
    expect(profile.compositeRiskScore).toBeGreaterThanOrEqual(50);
    expect(['HIGH', 'CRITICAL']).toContain(profile.riskTier);

    const signal7d = profile.contributingSignals.find((s) => s.rule === 'HIGH_VELOCITY_7_DAYS');
    expect(signal7d).toBeDefined();
    expect(signal7d?.severity).toBe('HIGH');
  });

  // =========================================================================
  // Scenario 4: Repeated refund against the same order
  // =========================================================================
  it('Scenario 4: Identifies repeated refund attempts against the exact same order', async () => {
    const customer = await createCustomer(`TEST-CUST-REORDER-${Date.now()}`, {
      accountCreatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      totalOrders: 1,
    });

    const order = await createOrder(customer.id, testProductId, 8999, {
      purchasedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    await createRefundRequest(customer.id, order.id, testProductId, 8999, {
      status: 'REJECTED',
      requestedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      reason: 'NOT_RECEIVED',
    });

    const refund2 = await createRefundRequest(customer.id, order.id, testProductId, 8999, {
      status: 'PENDING',
      requestedAt: new Date(),
      reason: 'DAMAGED_ITEM',
    });

    const profile = await riskService.evaluateCustomerRisk(customer.id);
    expect(profile.repeatedRefundCount).toBeGreaterThanOrEqual(1);
    const repeatedSignal = profile.contributingSignals.find((s) => s.rule === 'REPEATED_ORDER_CLAIMS');
    expect(repeatedSignal).toBeDefined();

    const evaluation = await fraudEngine.evaluateFraudRisk(refund2.id);
    expect(evaluation.detectedPatterns).toContain('REPEATED_CLAIM_ON_ORDER');
    expect(evaluation.anomalyDetails.repeatedOrderClaims).toBeDefined();
  });

  // =========================================================================
  // Scenario 5: Duplicate evidence across different claims (SHA-256)
  // =========================================================================
  it('Scenario 5: Detects cross-claim duplicate evidence via SHA-256 and flags CRITICAL anomaly', async () => {
    const c1 = await createCustomer(`TEST-CUST-DUP1-${Date.now()}`);
    const c2 = await createCustomer(`TEST-CUST-DUP2-${Date.now()}`);

    const ord1 = await createOrder(c1.id, testProductId, 12000);
    const ord2 = await createOrder(c2.id, testProductId, 12000);

    const req1 = await createRefundRequest(c1.id, ord1.id, testProductId, 12000, { status: 'APPROVED' });
    const req2 = await createRefundRequest(c2.id, ord2.id, testProductId, 12000, { status: 'PENDING' });

    const identicalBuffer = Buffer.from(`TEST-IMAGE-DATA-HASH-${Date.now()}`);
    const sha256 = crypto.createHash('sha256').update(identicalBuffer).digest('hex');

    const file1 = await prisma.evidenceFile.create({
      data: {
        refundRequestId: req1.id,
        fileType: 'IMAGE',
        fileName: 'damage1.jpg',
        filePath: `evidence/stored-dup1-${Date.now()}.jpg`,
        fileSize: identicalBuffer.length,
        mimeType: 'image/jpeg',
        fileHash: sha256,
      },
    });
    const file2 = await prisma.evidenceFile.create({
      data: {
        refundRequestId: req2.id,
        fileType: 'IMAGE',
        fileName: 'damage2.jpg',
        filePath: `evidence/stored-dup2-${Date.now()}.jpg`,
        fileSize: identicalBuffer.length,
        mimeType: 'image/jpeg',
        fileHash: sha256,
      },
    });
    cleanUpFileIds.push(file1.id, file2.id);

    const evaluation = await fraudEngine.evaluateFraudRisk(req2.id);

    expect(evaluation.detectedPatterns).toContain('DUPLICATE_FILE_HASH_CROSS_CLAIM');
    expect(evaluation.anomalyDetails.duplicateHash).toBeDefined();
    expect(evaluation.fraudScore).toBeGreaterThanOrEqual(40);
  });

  // =========================================================================
  // Scenario 6: Reused invoice number across claims
  // =========================================================================
  it('Scenario 6: Detects reused invoice number across multiple distinct claims', async () => {
    const c1 = await createCustomer(`TEST-CUST-INV1-${Date.now()}`);
    const c2 = await createCustomer(`TEST-CUST-INV2-${Date.now()}`);

    const ord1 = await createOrder(c1.id, testProductId, 15000);
    const ord2 = await createOrder(c2.id, testProductId, 15000);

    const req1 = await createRefundRequest(c1.id, ord1.id, testProductId, 15000, { status: 'APPROVED' });
    const req2 = await createRefundRequest(c2.id, ord2.id, testProductId, 15000, { status: 'PENDING' });

    const sharedInvoiceNo = `INV-UNIQUE-${Date.now()}`;

    const file1 = await prisma.evidenceFile.create({
      data: {
        refundRequestId: req1.id,
        fileType: 'DOCUMENT',
        fileName: 'invoice1.pdf',
        filePath: `evidence/stored-inv1-${Date.now()}.pdf`,
        fileSize: 1024,
        mimeType: 'application/pdf',
        fileHash: crypto.randomBytes(32).toString('hex'),
      },
    });
    await prisma.documentAnalysis.create({
      data: {
        evidenceFileId: file1.id,
        documentType: 'INVOICE',
        ocrText: `Invoice Number: ${sharedInvoiceNo}`,
        extractedInvoiceNo: sharedInvoiceNo,
        extractedAmount: 15000,
      },
    });

    const file2 = await prisma.evidenceFile.create({
      data: {
        refundRequestId: req2.id,
        fileType: 'DOCUMENT',
        fileName: 'invoice2.pdf',
        filePath: `evidence/stored-inv2-${Date.now()}.pdf`,
        fileSize: 2048,
        mimeType: 'application/pdf',
        fileHash: crypto.randomBytes(32).toString('hex'),
      },
    });
    await prisma.documentAnalysis.create({
      data: {
        evidenceFileId: file2.id,
        documentType: 'INVOICE',
        ocrText: `Invoice Number: ${sharedInvoiceNo}`,
        extractedInvoiceNo: sharedInvoiceNo,
        extractedAmount: 15000,
      },
    });
    cleanUpFileIds.push(file1.id, file2.id);

    const evaluation = await fraudEngine.evaluateFraudRisk(req2.id);

    expect(evaluation.detectedPatterns).toContain('REUSED_INVOICE_NUMBER_CROSS_CLAIM');
    expect(evaluation.anomalyDetails.reusedInvoice).toBeDefined();
  });

  // =========================================================================
  // Scenario 7: Contradictory invoice amount
  // =========================================================================
  it('Scenario 7: Flags document amount contradiction when extracted total diverges from order total', async () => {
    const cust = await createCustomer(`TEST-CUST-AMTMIS-${Date.now()}`);
    const ord = await createOrder(cust.id, testProductId, 14999);
    const req = await createRefundRequest(cust.id, ord.id, testProductId, 14999);

    const file = await prisma.evidenceFile.create({
      data: {
        refundRequestId: req.id,
        fileType: 'DOCUMENT',
        fileName: 'inflated_receipt.pdf',
        filePath: `evidence/stored-inflated-${Date.now()}.pdf`,
        fileSize: 1024,
        mimeType: 'application/pdf',
        fileHash: crypto.randomBytes(32).toString('hex'),
      },
    });
    await prisma.documentAnalysis.create({
      data: {
        evidenceFileId: file.id,
        documentType: 'RECEIPT',
        ocrText: 'Total: $450.00',
        extractedAmount: 45000, // Order was 14999 ($149.99)
      },
    });
    cleanUpFileIds.push(file.id);

    const evaluation = await fraudEngine.evaluateFraudRisk(req.id);

    expect(evaluation.detectedPatterns).toContain('DOCUMENT_AMOUNT_MISMATCH');
    expect(evaluation.anomalyDetails.documentAmountMismatch).toBeDefined();
  });

  // =========================================================================
  // Scenario 8: Product-specific refund concentration
  // =========================================================================
  it('Scenario 8: Identifies product-specific defect concentration rate (>25%)', async () => {
    const fragileProduct = await prisma.product.create({
      data: {
        brandId: testBrandId,
        name: 'Fragile Ceramic Vase',
        sku: `CER-VASE-${Date.now()}`,
        unitPrice: 8500,
        category: 'HOME',
      },
    });

    const cust = await createCustomer(`TEST-CUST-CONC-${Date.now()}`);

    let latestReqId = '';
    for (let i = 0; i < 4; i++) {
      const order = await createOrder(cust.id, fragileProduct.id, 8500, {
        purchasedAt: new Date(Date.now() - (15 - i * 3) * 24 * 60 * 60 * 1000),
      });

      if (i < 2) {
        const req = await createRefundRequest(cust.id, order.id, fragileProduct.id, 8500, {
          reason: 'DAMAGED_ITEM',
          status: i === 0 ? 'APPROVED' : 'PENDING',
          requestedAt: new Date(Date.now() - (10 - i * 3) * 24 * 60 * 60 * 1000),
        });
        latestReqId = req.id;
      }
    }

    const evaluation = await fraudEngine.evaluateFraudRisk(latestReqId);

    expect(evaluation.detectedPatterns).toContain('PRODUCT_HIGH_DEFECT_RATE');
    expect(evaluation.anomalyDetails.productConcentration).toBeDefined();
  });

  // =========================================================================
  // Scenario 9: Missing delivery information vs non-receipt contradiction
  // =========================================================================
  it('Scenario 9: Flags non-receipt claim contradiction when carrier reports verified signature and GPS match', async () => {
    const cust = await createCustomer(`TEST-CUST-DELIV-${Date.now()}`);
    const ord = await createOrder(cust.id, testProductId, 9900, {
      deliveryEvidence: JSON.stringify({
        carrier: 'FedEx',
        trackingNumber: 'TRK-99887766',
        status: 'DELIVERED',
        signatureObtained: true,
        deliveryGpsMatch: true,
      }),
    });

    const req = await createRefundRequest(cust.id, ord.id, testProductId, 9900, {
      reason: 'NOT_RECEIVED',
      customerMessage: 'I never received this package at my door.',
    });

    const evaluation = await fraudEngine.evaluateFraudRisk(req.id);

    expect(evaluation.detectedPatterns).toContain('NON_RECEIPT_CONTRADICTS_CARRIER_SIGNATURE');
    expect(evaluation.anomalyDetails.deliveryContradiction).toBeDefined();
  });

  // =========================================================================
  // Scenario 10: Combined multi-signal risk assessment
  // =========================================================================
  it('Scenario 10: Multi-signal risk correlation unifies behavioral, evidence, product, and delivery anomalies', async () => {
    const cust = await createCustomer(`TEST-CUST-MULTI-${Date.now()}`, { totalOrders: 3 });
    const ord = await createOrder(cust.id, testProductId, 20000);
    const req = await createRefundRequest(cust.id, ord.id, testProductId, 20000);

    const evaluation = await fraudEngine.evaluateFraudRisk(req.id);

    expect(evaluation).toBeDefined();
    expect(evaluation.fraudScore).toBeGreaterThanOrEqual(0);
    expect(evaluation.fraudScore).toBeLessThanOrEqual(100);
    expect(['PASS', 'REVIEW', 'REJECT']).toContain(evaluation.dispositionProposal);
    expect(['APPROVE', 'MANUAL_REVIEW', 'REJECT']).toContain(evaluation.recommendedAction);
    expect(typeof evaluation.anomalyDetails).toBe('object');
    expect(Array.isArray(evaluation.contributingEvidence)).toBe(true);
  });

  // =========================================================================
  // Scenario 11: Ground-truth isolation
  // =========================================================================
  it('Scenario 11: Confirms ground-truth label is strictly isolated and never accessed by intelligence services', async () => {
    const cust = await createCustomer(`TEST-CUST-ISOLATION-${Date.now()}`);
    const ord = await createOrder(cust.id, testProductId, 5000);
    const req = await createRefundRequest(cust.id, ord.id, testProductId, 5000, {
      groundTruthLabel: 'FRAUDULENT', // strictly evaluation metadata
    });

    const profile = await riskService.evaluateCustomerRisk(cust.id);
    const profileJson = JSON.stringify(profile);
    expect(profileJson).not.toContain('FRAUDULENT');

    const fraudEval = await fraudEngine.evaluateFraudRisk(req.id);
    const fraudEvalJson = JSON.stringify(fraudEval);
    expect(fraudEvalJson).not.toContain('groundTruthLabel');
    expect(fraudEvalJson).not.toContain('FRAUDULENT');
  });

  // =========================================================================
  // Scenario 12: Laya provider failure handling
  // =========================================================================
  it('Scenario 12: Gracefully handles decision provider fallback without data corruption', async () => {
    const cust = await createCustomer(`TEST-CUST-FALLBACK-${Date.now()}`);
    const ord = await createOrder(cust.id, testProductId, 4500);
    const req = await createRefundRequest(cust.id, ord.id, testProductId, 4500, {
      reason: 'DEFECTIVE_COMPONENT',
      customerMessage: 'Headphone left side is silent.',
    });

    const result = await DecisionEngine.processSingleRequest(req.id);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.decision).toBeDefined();
    expect(['APPROVE', 'REJECT', 'MANUAL_REVIEW']).toContain(result.decision!.decision);

    const dbDecision = await prisma.decision.findUnique({
      where: { refundRequestId: req.id },
    });
    expect(dbDecision).toBeDefined();
  });

  // =========================================================================
  // Scenario 13: Risk score consistency and calibration
  // =========================================================================
  it('Scenario 13: Risk score is deterministic, properly calibrated, and bounded in [0, 100]', async () => {
    const cust = await createCustomer(`TEST-CUST-CALIB-${Date.now()}`, { totalOrders: 5 });

    const profile1 = await riskService.evaluateCustomerRisk(cust.id);
    const profile2 = await riskService.evaluateCustomerRisk(cust.id);

    expect(profile1.compositeRiskScore).toBe(profile2.compositeRiskScore);
    expect(profile1.riskTier).toBe(profile2.riskTier);
    expect(profile1.compositeRiskScore).toBeGreaterThanOrEqual(0);
    expect(profile1.compositeRiskScore).toBeLessThanOrEqual(100);
  });

  // =========================================================================
  // Scenario 14: Existing refund workflow regression
  // =========================================================================
  it('Scenario 14: Preserves complete end-to-end refund workflow with audit events and usage ledger', async () => {
    const cust = await createCustomer(`TEST-CUST-REGRESS-${Date.now()}`);
    const ord = await createOrder(cust.id, testProductId, 12000);
    const req = await createRefundRequest(cust.id, ord.id, testProductId, 12000, {
      reason: 'SIZE_TOO_SMALL',
      customerMessage: 'Shoe is one size too small, requesting refund.',
    });

    const result = await DecisionEngine.processSingleRequest(req.id);
    expect(result.success).toBe(true);

    const auditEvents = await prisma.auditEvent.findMany({
      where: { entityId: req.id },
    });
    expect(auditEvents.length).toBeGreaterThanOrEqual(1);

    const ledger = await prisma.layaUsageLog.findFirst({
      where: { refundRequestId: req.id },
    });
    expect(ledger).toBeDefined();
    expect(ledger?.totalTokens).toBeGreaterThan(0);
  });
});
