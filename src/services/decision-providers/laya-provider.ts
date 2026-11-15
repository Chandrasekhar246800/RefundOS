import {
  DecisionInput,
  NormalizedDecision,
  PolicyCheckResult,
  RefundDecisionProvider,
} from '@/types';

export class LayaDecisionProvider implements RefundDecisionProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = options?.apiKey || process.env.LAYA_API_KEY || '';
    this.baseUrl = (options?.baseUrl || process.env.LAYA_API_BASE_URL || 'https://api.laya-ai.com').replace(/\/+$/, '');
    this.model = options?.model || process.env.LAYA_MODEL || 'typed-decisions';
  }

  getProviderName(): string {
    return 'LAYA';
  }

  isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey.trim().length > 0 &&
      !this.apiKey.includes('your-laya-api-key')
    );
  }

  async checkConnection(): Promise<{ connected: boolean; message: string; details?: any }> {
    if (!this.isConfigured()) {
      return {
        connected: false,
        message: 'Laya API key is not configured. Set LAYA_API_KEY in environment or Settings.',
        details: {
          configured: false,
          endpoint: `${this.baseUrl}/v1/systemone`,
          model: this.model,
        },
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      // Ping Laya System One endpoint with a lightweight health validation payload
      const response = await fetch(`${this.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          state: 'Health ping connection verification for AI refund decision platform.',
          questions: {
            service_health: {
              type: 'choice',
              instructions: 'Verify system operational status.',
              criteria: {
                operational: 'System is responsive and operational',
                degraded: 'System is degraded',
              },
            },
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return {
          connected: true,
          message: 'Connected to Laya API System One successfully.',
          details: {
            status: response.status,
            model: data.model || this.model,
            usage: data.usage || null,
          },
        };
      } else {
        const errorText = await response.text();
        return {
          connected: false,
          message: `Laya API returned HTTP ${response.status}: ${errorText.slice(0, 160)}`,
          details: { status: response.status, endpoint: `${this.baseUrl}/v1/systemone` },
        };
      }
    } catch (err: any) {
      return {
        connected: false,
        message: `Failed to connect to Laya API: ${err.message || 'Network error'}`,
        details: { error: err.name || 'ConnectionError' },
      };
    }
  }

  async decide(input: DecisionInput): Promise<NormalizedDecision> {
    if (!this.isConfigured()) {
      throw new Error('Laya API is not configured. LAYA_API_KEY must be provided in .env or Settings.');
    }

    const { request, policy } = input;

    // Build the structured context state evaluating:
    // 1. Refund legitimacy
    // 2. Fraud risk
    // 3. Refund policy compliance
    // 4. Customer purchase history
    // 5. Previous refund history
    // 6. Delivery and order evidence
    // (Notice: Ground-truth label is STRICTLY OMITTED from evaluationState)
    const evaluationState = {
      orderSummary: {
        product: request.productName,
        sku: request.productSku,
        category: request.productCategory,
        quantity: request.quantity,
        orderAmountCents: request.orderAmount,
        currency: request.currency,
        purchasedAt: request.purchasedAt,
        deliveredAt: request.deliveredAt,
        daysSinceDelivery: request.daysSinceDelivery,
        fulfilmentStatus: request.fulfilmentStatus,
      },
      refundClaim: {
        requestedAmountCents: request.requestedAmount,
        reason: request.reason,
        customerMessage: request.customerMessage,
      },
      customerHistory: {
        accountAgeDays: request.customerAccountAgeDays,
        totalOrders: request.customerTotalOrders,
        priorRefunds: request.customerPriorRefunds,
        priorReturns: request.customerPriorReturns,
        priorChargebacks: request.customerPriorChargebacks,
        previousOutcomes: request.previousRefundOutcomes || [],
      },
      deliveryAndTrackingEvidence: request.trackingSignals,
      submittedEvidence: request.evidence,
      policyGuardrails: {
        policyWindowDays: policy.policyWindowDays,
        highValueManualReviewThresholdCents: policy.highValueManualReviewThreshold,
        maxPriorRefundsBeforeReview: policy.maxPriorRefundsBeforeReview,
        maxPriorChargebacksBeforeReject: policy.maxPriorChargebacksBeforeReject,
        requireImageForDamaged: policy.requireImageForDamaged,
        requireDeliveryProofForNonReceipt: policy.requireDeliveryProofForNonReceipt,
      },
    };

    const payload = {
      model: this.model,
      state: JSON.stringify(evaluationState),
      questions: {
        decision: {
          type: 'choice',
          instructions:
            'Evaluate this ecommerce refund claim based on evidence, customer history, and policy rules. Output APPROVE if evidence is valid and legitimate, REJECT if there is clear policy violation, contradictory carrier proof, or suspected fraud, and MANUAL_REVIEW if high-value, ambiguous, or missing required evidence.',
          criteria: {
            APPROVE: 'The refund meets all policy requirements with verified evidence and low fraud risk.',
            REJECT: 'The refund violates return policy window, has contradictory carrier/photo evidence, or high fraud risk.',
            MANUAL_REVIEW: 'The refund has ambiguous delivery signals, missing damage proof, or exceeds high-value threshold requiring human review.',
          },
        },
        risk_score: {
          type: 'score',
          instructions:
            'Rate overall fraud and financial risk on a scale from 0 (completely safe) to 100 (definitive fraud/severe violation).',
        },
        legitimacy_probability: {
          type: 'noul',
          instructions:
            'What is the probability (0.0 to 1.0) that this refund request represents a genuine, legitimate customer problem?',
        },
        policy_compliance: {
          type: 'noul',
          instructions:
            'What is the probability that this request strictly complies with the merchant return window and policy rules?',
        },
        evidence_integrity: {
          type: 'noul',
          instructions:
            'What is the probability that the submitted photographic and tracking evidence is authentic and unmanipulated?',
        },
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let rawData: any;
    try {
      const response = await fetch(`${this.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Laya API HTTP error ${response.status}: ${errText.slice(0, 200)}`);
      }

      rawData = await response.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw new Error(`Laya API communication failed: ${err.message || 'Network error'}`);
    }

    return this.normalizeLayaResponse(rawData, input);
  }

  private normalizeLayaResponse(raw: any, input: DecisionInput): NormalizedDecision {
    const answers = raw.answers || {};
    const decisionAnswer = answers.decision || {};
    const riskAnswer = answers.risk_score || {};
    const legitimacyAnswer = answers.legitimacy_probability || {};
    const policyAnswer = answers.policy_compliance || {};
    const evidenceAnswer = answers.evidence_integrity || {};

    let decision: 'APPROVE' | 'REJECT' | 'MANUAL_REVIEW' = 'MANUAL_REVIEW';
    if (
      decisionAnswer.choice === 'APPROVE' ||
      decisionAnswer.choice === 'REJECT' ||
      decisionAnswer.choice === 'MANUAL_REVIEW'
    ) {
      decision = decisionAnswer.choice;
    }

    const confidence =
      typeof decisionAnswer.confidence === 'number'
        ? decisionAnswer.confidence
        : typeof legitimacyAnswer.noul === 'number'
        ? legitimacyAnswer.noul
        : null;

    const riskScore =
      typeof riskAnswer.score === 'number'
        ? Math.round(riskAnswer.score)
        : legitimacyAnswer.noul !== undefined
        ? Math.round((1 - legitimacyAnswer.noul) * 100)
        : null;

    const policyChecks: PolicyCheckResult[] = [];
    const reasonCodes: string[] = [];
    const evidenceFor: string[] = [];
    const evidenceAgainst: string[] = [];
    const missingInformation: string[] = [];

    // Policy Compliance Noul mapping
    if (policyAnswer.noul !== undefined) {
      const complies = policyAnswer.noul > 0.5;
      policyChecks.push({
        rule: 'POLICY_COMPLIANCE',
        result: complies ? 'PASS' : 'FAIL',
        explanation: `Laya evaluated policy compliance probability at ${(policyAnswer.noul * 100).toFixed(1)}%.`,
      });
      if (complies) {
        reasonCodes.push('POLICY_COMPLIANT');
        evidenceFor.push('Timely submission compliant with merchant policy window.');
      } else {
        reasonCodes.push('EXCEEDS_POLICY_WINDOW');
        evidenceAgainst.push('Claim falls outside permitted policy timeline or thresholds.');
      }
    }

    // Evidence Integrity Noul mapping
    if (evidenceAnswer.noul !== undefined) {
      const authentic = evidenceAnswer.noul > 0.5;
      policyChecks.push({
        rule: 'EVIDENCE_INTEGRITY',
        result: authentic ? 'PASS' : 'FAIL',
        explanation: `Laya evidence authenticity estimation: ${(evidenceAnswer.noul * 100).toFixed(1)}%.`,
      });
      if (authentic) {
        reasonCodes.push('EVIDENCE_VERIFIED');
        evidenceFor.push('Submitted photo and tracking signals verified authentic.');
      } else {
        reasonCodes.push('ANOMALOUS_EVIDENCE');
        evidenceAgainst.push('Submitted photo metadata or carrier signals show inconsistencies.');
      }
    }

    // Legitimacy Probability Noul mapping
    if (legitimacyAnswer.noul !== undefined) {
      policyChecks.push({
        rule: 'REFUND_LEGITIMACY_ESTIMATION',
        result: legitimacyAnswer.noul >= 0.7 ? 'PASS' : legitimacyAnswer.noul <= 0.3 ? 'FAIL' : 'UNKNOWN',
        explanation: `Laya estimated legitimate customer problem probability at ${(legitimacyAnswer.noul * 100).toFixed(1)}%.`,
      });
      if (legitimacyAnswer.noul >= 0.7) {
        evidenceFor.push('High probability of genuine item damage, defect, or carrier misplacement.');
      } else if (legitimacyAnswer.noul <= 0.3) {
        evidenceAgainst.push('Low probability of legitimate claim; elevated fraud indicators detected.');
      }
    }

    const rationale = `Laya System One decision: ${decision} (Risk Score: ${riskScore ?? 'N/A'}/100, Confidence: ${
      confidence ? `${(confidence * 100).toFixed(1)}%` : 'N/A'
    }). Evaluated across legitimacy, customer history, and delivery telemetry.`;

    return {
      decision,
      riskScore,
      confidence,
      reasonCodes: reasonCodes.length > 0 ? reasonCodes : ['LAYA_DECISION_GENERATED'],
      rationale,
      evidenceFor,
      evidenceAgainst,
      missingInformation,
      policyChecks,
      recommendedNextAction:
        decision === 'APPROVE'
          ? 'Process simulated refund credit'
          : decision === 'REJECT'
          ? 'Issue policy rejection notification'
          : 'Route to human operations team for manual verification',
    };
  }
}
