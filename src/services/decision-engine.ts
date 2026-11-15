import { prisma } from '@/lib/prisma';
import {
  DecisionInput,
  NormalizedDecision,
  RefundEvidencePacket,
  RefundPolicySnapshot,
} from '@/types';
import { DecisionProviderFactory } from './decision-providers/factory';
import { FraudDetectionEngine } from './intelligence/fraud-detection-engine';

export class DecisionEngine {
  /**
   * Constructs the sanitized evidence packet for the AI provider.
   * STRICT GUARD: groundTruthLabel is NOT included here.
   */
  static buildEvidencePacket(
    request: any,
    order: any,
    customer: any,
    product: any,
    previousRefunds: any[] = [],
    fraudEval?: any,
    customerRisk?: any,
    evidenceFiles: any[] = []
  ): RefundEvidencePacket {
    let daysSinceDelivery: number | null = null;
    if (order.deliveredAt) {
      const diffMs = new Date(request.requestedAt).getTime() - new Date(order.deliveredAt).getTime();
      daysSinceDelivery = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    const customerAccountAgeDays = Math.max(
      1,
      Math.floor(
        (new Date().getTime() - new Date(customer.accountCreatedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    let parsedEvidence = [];
    try {
      parsedEvidence = request.evidence ? JSON.parse(request.evidence) : [];
    } catch {
      parsedEvidence = [];
    }

    let parsedTracking: any = {
      carrier: 'Unknown Carrier',
      trackingNumber: 'N/A',
      status: order.fulfilmentStatus,
      deliveryGpsMatch: null,
      signatureObtained: false,
    };

    try {
      if (order.deliveryEvidence) {
        parsedTracking = JSON.parse(order.deliveryEvidence);
      }
    } catch {}

    const previousOutcomes = previousRefunds.map((pr) => ({
      date: pr.createdAt.toISOString(),
      outcome: pr.status,
      amount: pr.amount,
    }));

    // Summaries for multi-signal risk correlation
    const customerRiskSummary = customerRisk
      ? {
          compositeScore: customerRisk.compositeRiskScore,
          riskTier: customerRisk.riskTier,
          refundToSpendRatio: customerRisk.refundToSpendRatio,
          frequency30d: customerRisk.claimsLast30Days,
          signals: customerRisk.fraudSignals,
        }
      : undefined;

    const fraudEvaluationSummary = fraudEval
      ? {
          fraudScore: fraudEval.fraudScore,
          riskTier: fraudEval.riskTier,
          detectedPatterns: fraudEval.detectedPatterns,
          anomalyCount: Object.keys(fraudEval.anomalyDetails || {}).length,
          recommendedAction: fraudEval.recommendedAction,
        }
      : undefined;

    let hasPerceptualDuplicates = false;
    let hasDocumentInconsistencies = false;
    let ocrMatchStatus = 'N/A';

    for (const f of evidenceFiles) {
      if (f.imageAnalysis?.duplicateFound) hasPerceptualDuplicates = true;
      if (f.documentAnalysis) {
        ocrMatchStatus = f.documentAnalysis.orderMatchStatus;
        if (ocrMatchStatus === 'CONTRADICTORY') hasDocumentInconsistencies = true;
      }
    }

    const evidenceIntelligenceSummary = {
      fileCount: evidenceFiles.length,
      hasPerceptualDuplicates,
      hasDocumentInconsistencies,
      ocrMatchStatus,
    };

    return {
      requestId: request.id,
      orderRef: order.orderRef,
      customerRef: customer.syntheticCustomerRef,
      productName: product.name,
      productSku: product.sku,
      productCategory: product.category,
      orderAmount: order.amount,
      requestedAmount: request.requestedAmount,
      currency: request.currency,
      quantity: order.quantity,
      purchasedAt: order.purchasedAt.toISOString(),
      deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
      daysSinceDelivery,
      fulfilmentStatus: order.fulfilmentStatus,
      reason: request.reason,
      customerMessage: request.customerMessage || '',
      customerAccountAgeDays,
      customerTotalOrders: customer.totalOrders,
      customerPriorRefunds: customer.priorRefundCount,
      customerPriorReturns: customer.priorReturnCount,
      customerPriorChargebacks: customer.priorChargebackCount,
      evidence: parsedEvidence,
      trackingSignals: parsedTracking,
      previousRefundOutcomes: previousOutcomes,
      customerRiskSummary,
      fraudEvaluationSummary,
      evidenceIntelligenceSummary,
    };
  }

  /**
   * Retrieves the active policy snapshot.
   */
  static async getActivePolicy(): Promise<RefundPolicySnapshot> {
    const policy = await prisma.refundPolicy.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!policy) {
      return {
        version: 'v1.0-default',
        policyWindowDays: 30,
        maxInstantApprovalAmount: 25000,
        highValueManualReviewThreshold: 30000,
        maxPriorRefundsBeforeReview: 3,
        maxPriorChargebacksBeforeReject: 1,
        requireDeliveryProofForNonReceipt: true,
        requireImageForDamaged: true,
      };
    }

    try {
      const config = JSON.parse(policy.configuration);
      return {
        version: policy.version,
        ...config,
      };
    } catch {
      return {
        version: policy.version,
        policyWindowDays: 30,
        maxInstantApprovalAmount: 25000,
        highValueManualReviewThreshold: 30000,
        maxPriorRefundsBeforeReview: 3,
        maxPriorChargebacksBeforeReject: 1,
        requireDeliveryProofForNonReceipt: true,
        requireImageForDamaged: true,
      };
    }
  }

  /**
   * Evaluates a single refund request idempotently.
   */
  static async processSingleRequest(
    requestId: string,
    forcedProvider?: string
  ): Promise<{
    success: boolean;
    decision?: NormalizedDecision;
    status: string;
    error?: string;
  }> {
    // 1. Fetch Request with relations
    const request = await prisma.refundRequest.findUnique({
      where: { id: requestId },
      include: {
        order: true,
        customer: true,
        product: true,
        decision: true,
        transaction: true,
        evidenceFiles: {
          include: {
            imageAnalysis: true,
            documentAnalysis: true,
          },
        },
      },
    });

    if (!request) {
      throw new Error(`Refund request ${requestId} not found.`);
    }

    // Idempotency: If already finalized, do not re-execute or duplicate transaction
    if (
      request.status === 'APPROVED' ||
      request.status === 'REJECTED' ||
      request.status === 'MANUAL_REVIEW'
    ) {
      if (request.decision) {
        return {
          success: true,
          status: request.status,
          decision: {
            decision: request.decision.decision as any,
            riskScore: request.decision.riskScore,
            confidence: request.decision.confidence,
            reasonCodes: JSON.parse(request.decision.reasonCodes),
            rationale: request.decision.rationale,
            evidenceFor: JSON.parse(request.decision.evidenceFor),
            evidenceAgainst: JSON.parse(request.decision.evidenceAgainst),
            missingInformation: JSON.parse(request.decision.missingInformation),
            policyChecks: JSON.parse(request.decision.policyChecks),
            recommendedNextAction: request.decision.recommendedNextAction || undefined,
          },
        };
      }
    }

    // Atomic claim: Mark request as PROCESSING
    await prisma.refundRequest.update({
      where: { id: requestId },
      data: { status: 'PROCESSING' },
    });

    try {
      // 2. Intelligence Layer: Multi-dimensional Fraud Detection Engine
      const fraudEngine = new FraudDetectionEngine();
      const fraudEval = await fraudEngine.evaluateFraudRisk(request.id);

      // 3. Fetch previous refund history for this customer/order
      const previousRefunds = await prisma.refundTransaction.findMany({
        where: {
          refundRequest: {
            orderId: request.orderId,
            id: { not: request.id },
          },
        },
      });

      // 4. Build sanitized evidence packet (Strictly without groundTruthLabel)
      const evidencePacket = this.buildEvidencePacket(
        request,
        request.order,
        request.customer,
        request.product,
        previousRefunds,
        fraudEval,
        null,
        request.evidenceFiles || []
      );

      // 5. Get active policy
      const policy = await this.getActivePolicy();

      // 6. Select provider
      const { provider, providerName } = await DecisionProviderFactory.getProvider(forcedProvider);

      const decisionInput: DecisionInput = {
        request: evidencePacket,
        policy,
      };

      // 7. Call provider (Decision Layer) with graceful fallback on provider failure
      let decision: NormalizedDecision;
      let effectiveProviderName = providerName;
      try {
        decision = await provider.decide(decisionInput);
      } catch (providerError: any) {
        if (effectiveProviderName !== 'LOCAL_DEMO') {
          const { LocalDemoDecisionProvider } = await import('./decision-providers/local-demo-provider');
          const localDemo = new LocalDemoDecisionProvider();
          decision = await localDemo.decide(decisionInput);
          decision.rationale += ` [Fallback from ${effectiveProviderName}: ${providerError.message}]`;
          effectiveProviderName = 'LOCAL_DEMO';
        } else {
          throw providerError;
        }
      }

      // 8. Policy Guardrail Layer: Validate AI Recommendation Against Fraud Signals
      // Rule: Risk score alone must not automatically reject a refund.
      // Rule: High-risk cases are routed to MANUAL_REVIEW.
      // Rule: Conclusive fraud patterns (e.g. duplicate evidence, contradictory documents) trigger REJECT or MANUAL_REVIEW.
      if (fraudEval.recommendedAction === 'REJECT') {
        if (decision.decision !== 'REJECT') {
          decision.policyChecks.push({
            rule: 'FRAUD_ENGINE_GUARDRAIL',
            result: 'FAIL',
            explanation: `Policy Guardrail: Overrode decision to REJECT due to high-risk fraud patterns (${fraudEval.detectedPatterns.join(', ')}).`,
          });
          decision.decision = 'REJECT';
          decision.rationale += ` [Policy Guardrail: Overrode to REJECT due to detected fraud patterns: ${fraudEval.detectedPatterns.join(', ')}].`;
        }
      } else if (fraudEval.recommendedAction === 'MANUAL_REVIEW') {
        if (decision.decision === 'APPROVE') {
          decision.policyChecks.push({
            rule: 'FRAUD_ENGINE_GUARDRAIL',
            result: 'FAIL',
            explanation: `Policy Guardrail: Overrode APPROVE to MANUAL_REVIEW due to elevated risk tier (${fraudEval.riskTier}) and detected anomalies (${fraudEval.detectedPatterns.join(', ')}).`,
          });
          decision.decision = 'MANUAL_REVIEW';
          decision.rationale += ` [Policy Guardrail: Overrode to MANUAL_REVIEW due to elevated risk tier: ${fraudEval.riskTier}].`;
        }
      }

      // 7. Persist Decision, update request status, and execute state transition in transaction
      await prisma.$transaction(async (tx) => {
        // Save decision record
        await tx.decision.upsert({
          where: { refundRequestId: request.id },
          update: {
            provider: effectiveProviderName,
            modelOrDeployment: effectiveProviderName === 'LAYA' ? process.env.LAYA_MODEL || 'typed-decisions' : 'deterministic-v2',
            policyVersion: policy.version,
            decision: decision.decision,
            riskScore: decision.riskScore ?? null,
            confidence: decision.confidence ?? null,
            reasonCodes: JSON.stringify(decision.reasonCodes),
            rationale: decision.rationale,
            evidenceFor: JSON.stringify(decision.evidenceFor),
            evidenceAgainst: JSON.stringify(decision.evidenceAgainst),
            missingInformation: JSON.stringify(decision.missingInformation),
            policyChecks: JSON.stringify(decision.policyChecks),
            recommendedNextAction: decision.recommendedNextAction || null,
            inputSnapshot: JSON.stringify(evidencePacket),
            providerResponseSanitized: JSON.stringify({
              provider: effectiveProviderName,
              decision: decision.decision,
              riskScore: decision.riskScore,
            }),
          },
          create: {
            refundRequestId: request.id,
            provider: effectiveProviderName,
            modelOrDeployment: effectiveProviderName === 'LAYA' ? process.env.LAYA_MODEL || 'typed-decisions' : 'deterministic-v2',
            policyVersion: policy.version,
            decision: decision.decision,
            riskScore: decision.riskScore ?? null,
            confidence: decision.confidence ?? null,
            reasonCodes: JSON.stringify(decision.reasonCodes),
            rationale: decision.rationale,
            evidenceFor: JSON.stringify(decision.evidenceFor),
            evidenceAgainst: JSON.stringify(decision.evidenceAgainst),
            missingInformation: JSON.stringify(decision.missingInformation),
            policyChecks: JSON.stringify(decision.policyChecks),
            recommendedNextAction: decision.recommendedNextAction || null,
            inputSnapshot: JSON.stringify(evidencePacket),
            providerResponseSanitized: JSON.stringify({
              provider: effectiveProviderName,
              decision: decision.decision,
              riskScore: decision.riskScore,
            }),
          },
        });

        // Record Laya usage telemetry log
        if (decision.usage) {
          await tx.layaUsageLog.create({
            data: {
              refundRequestId: request.id,
              batchId: request.batchId || null,
              endpoint: '/v1/systemone',
              model: effectiveProviderName === 'LAYA' ? process.env.LAYA_MODEL || 'typed-decisions' : 'local-deterministic',
              inputTokens: decision.usage.inputTokens,
              stateTokens: decision.usage.stateTokens,
              outputTokens: decision.usage.outputTokens,
              totalTokens: decision.usage.totalTokens,
              latencyMs: decision.usage.latencyMs,
              estimatedCostUsd: decision.usage.estimatedCostUsd,
              statusCode: 200,
            },
          });
        }

        // State Transition Handling
        if (decision.decision === 'APPROVE') {
          // Rule 9: For APPROVE, create simulated refund transaction
          const simTxnRef = `SIM-TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
          
          await tx.refundTransaction.upsert({
            where: { refundRequestId: request.id },
            update: {
              amount: request.requestedAmount,
              currency: request.currency,
              status: 'SIMULATED_COMPLETED',
              reference: simTxnRef,
            },
            create: {
              refundRequestId: request.id,
              amount: request.requestedAmount,
              currency: request.currency,
              status: 'SIMULATED_COMPLETED',
              reference: simTxnRef,
            },
          });

          await tx.refundRequest.update({
            where: { id: request.id },
            data: { status: 'APPROVED' },
          });

          // Audit Event
          await tx.auditEvent.create({
            data: {
              entityType: 'REFUND_REQUEST',
              entityId: request.id,
              eventType: 'TRANSACTION_CREATED',
              actor: providerName,
              details: JSON.stringify({
                decision: 'APPROVE',
                simulatedReference: simTxnRef,
                amount: request.requestedAmount,
              }),
            },
          });
        } else if (decision.decision === 'REJECT') {
          // Rule 10: For REJECT, record rejection, NO refund transaction
          await tx.refundRequest.update({
            where: { id: request.id },
            data: { status: 'REJECTED' },
          });

          await tx.auditEvent.create({
            data: {
              entityType: 'REFUND_REQUEST',
              entityId: request.id,
              eventType: 'DECIDED',
              actor: providerName,
              details: JSON.stringify({
                decision: 'REJECT',
                rationale: decision.rationale,
              }),
            },
          });
        } else {
          // Rule 11: For MANUAL_REVIEW, leave unexecuted
          await tx.refundRequest.update({
            where: { id: request.id },
            data: { status: 'MANUAL_REVIEW' },
          });

          await tx.auditEvent.create({
            data: {
              entityType: 'REFUND_REQUEST',
              entityId: request.id,
              eventType: 'DECIDED',
              actor: providerName,
              details: JSON.stringify({
                decision: 'MANUAL_REVIEW',
                rationale: decision.rationale,
              }),
            },
          });
        }
      });

      return {
        success: true,
        status: decision.decision,
        decision,
      };
    } catch (err: any) {
      // Rule 12: On failure, mark FAILED, never auto-approve
      await prisma.refundRequest.update({
        where: { id: request.id },
        data: { status: 'FAILED' },
      });

      await prisma.auditEvent.create({
        data: {
          entityType: 'REFUND_REQUEST',
          entityId: request.id,
          eventType: 'FAILED',
          actor: 'decision_engine',
          details: JSON.stringify({ error: err.message }),
        },
      });

      return {
        success: false,
        status: 'FAILED',
        error: err.message,
      };
    }
  }
}
