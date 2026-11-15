import {
  DecisionInput,
  NormalizedDecision,
  PolicyCheckResult,
  RefundDecisionProvider,
} from '@/types';

export class JevDecisionProvider implements RefundDecisionProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = options?.apiKey || process.env.JEV_API_KEY || '';
    this.baseUrl = (options?.baseUrl || process.env.JEV_API_BASE_URL || 'https://api.typesafe.ai/v1').replace(/\/+$/, '');
    this.model = options?.model || process.env.JEV_MODEL || 'jev-latest';
  }

  getProviderName(): string {
    return 'JEV';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && !this.apiKey.includes('your-jev-api-key'));
  }

  async checkConnection(): Promise<{ connected: boolean; message: string; details?: any }> {
    if (!this.isConfigured()) {
      return {
        connected: false,
        message: 'Jev API key is not configured. Set JEV_API_KEY in environment or Settings.',
        details: {
          configured: false,
          endpoint: `${this.baseUrl}/systemone`,
          model: this.model,
        },
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      // Ping System One with a lightweight validation state
      const response = await fetch(`${this.baseUrl}/systemone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          state: 'Health ping connection check for refund decision service.',
          questions: {
            health: {
              type: 'choice',
              instructions: 'Is this connection check healthy?',
              criteria: {
                healthy: 'System is operational',
                unhealthy: 'System is not operational',
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
          message: 'Connected to TypeSafe AI Jev Decision API successfully.',
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
          message: `Jev API returned HTTP ${response.status}: ${errorText.slice(0, 150)}`,
          details: { status: response.status },
        };
      }
    } catch (err: any) {
      return {
        connected: false,
        message: `Failed to connect to Jev API: ${err.message || 'Network error'}`,
        details: { error: err.name || 'ConnectionError' },
      };
    }
  }

  async decide(input: DecisionInput): Promise<NormalizedDecision> {
    if (!this.isConfigured()) {
      throw new Error('Jev API is not configured. JEV_API_KEY must be provided.');
    }

    const { request, policy } = input;

    // Strict sanitization: ensure no ground truth or extraneous data is passed
    const evaluationState = {
      order: {
        product: request.productName,
        sku: request.productSku,
        category: request.productCategory,
        quantity: request.quantity,
        amountCents: request.orderAmount,
        currency: request.currency,
        purchasedAt: request.purchasedAt,
        deliveredAt: request.deliveredAt,
        daysSinceDelivery: request.daysSinceDelivery,
        fulfilmentStatus: request.fulfilmentStatus,
      },
      refundRequest: {
        requestedAmountCents: request.requestedAmount,
        reason: request.reason,
        customerMessage: request.customerMessage,
      },
      customerRiskProfile: {
        accountAgeDays: request.customerAccountAgeDays,
        totalOrders: request.customerTotalOrders,
        priorRefunds: request.customerPriorRefunds,
        priorReturns: request.customerPriorReturns,
        priorChargebacks: request.customerPriorChargebacks,
      },
      evidenceSubmitted: request.evidence,
      carrierTrackingTelemetry: request.trackingSignals,
      applicablePolicyRules: {
        policyWindowDays: policy.policyWindowDays,
        highValueThresholdCents: policy.highValueManualReviewThreshold,
        maxPriorRefundsBeforeReview: policy.maxPriorRefundsBeforeReview,
        maxPriorChargebacksBeforeReject: policy.maxPriorChargebacksBeforeReject,
        requireImageForDamaged: policy.requireImageForDamaged,
      },
    };

    const payload = {
      model: this.model,
      state: JSON.stringify(evaluationState),
      questions: {
        decision: {
          type: 'choice',
          instructions:
            'Evaluate this refund request against policy and evidence. Output APPROVE if evidence is valid and low risk, REJECT if there is clear policy violation or fraud, or MANUAL_REVIEW if high value or ambiguous.',
          criteria: {
            APPROVE: 'The refund meets policy requirements with verified evidence and acceptable risk.',
            REJECT: 'The refund violates policy, has contradictory carrier/evidence proof, or indicates fraud.',
            MANUAL_REVIEW: 'The refund is ambiguous, lacks proof, or exceeds high-value threshold requiring manual review.',
          },
        },
        risk_score: {
          type: 'score',
          instructions: 'Rate the overall risk of this refund claim from 0 (completely safe) to 100 (high risk/fraud).',
        },
        policy_window_pass: {
          type: 'noul',
          instructions: 'Does this request comply with the allowed delivery return window?',
        },
        evidence_integrity: {
          type: 'noul',
          instructions: 'Is the customer evidence authentic and consistent with carrier tracking and product SKU?',
        },
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${this.baseUrl}/systemone`, {
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
      throw new Error(`Jev API HTTP error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const rawData = await response.json();
    return this.normalizeJevResponse(rawData, input);
  }

  private normalizeJevResponse(raw: any, input: DecisionInput): NormalizedDecision {
    const answers = raw.answers || {};
    const decisionAnswer = answers.decision || {};
    const riskAnswer = answers.risk_score || {};
    const windowAnswer = answers.policy_window_pass || {};
    const evidenceAnswer = answers.evidence_integrity || {};

    let decision: 'APPROVE' | 'REJECT' | 'MANUAL_REVIEW' = 'MANUAL_REVIEW';
    if (decisionAnswer.choice === 'APPROVE' || decisionAnswer.choice === 'REJECT' || decisionAnswer.choice === 'MANUAL_REVIEW') {
      decision = decisionAnswer.choice;
    }

    const confidence = typeof decisionAnswer.confidence === 'number' ? decisionAnswer.confidence : null;
    const riskScore = typeof riskAnswer.score === 'number' ? Math.round(riskAnswer.score) : null;

    const policyChecks: PolicyCheckResult[] = [];
    const reasonCodes: string[] = [];
    const evidenceFor: string[] = [];
    const evidenceAgainst: string[] = [];
    const missingInformation: string[] = [];

    // Window check mapping
    if (windowAnswer.noul !== undefined) {
      const passes = windowAnswer.noul > 0.5;
      policyChecks.push({
        rule: 'POLICY_WINDOW',
        result: passes ? 'PASS' : 'FAIL',
        explanation: `Jev evaluated window compliance probability at ${(windowAnswer.noul * 100).toFixed(1)}%.`,
      });
      if (passes) {
        reasonCodes.push('WITHIN_POLICY_WINDOW');
        evidenceFor.push('Timely request submission within policy window.');
      } else {
        reasonCodes.push('EXCEEDS_POLICY_WINDOW');
        evidenceAgainst.push('Request evaluated outside authorized return window.');
      }
    }

    // Evidence integrity mapping
    if (evidenceAnswer.noul !== undefined) {
      const authentic = evidenceAnswer.noul > 0.5;
      policyChecks.push({
        rule: 'EVIDENCE_AUTHENTICITY',
        result: authentic ? 'PASS' : 'FAIL',
        explanation: `Jev evidence integrity score: ${(evidenceAnswer.noul * 100).toFixed(1)}%.`,
      });
      if (authentic) {
        reasonCodes.push('EVIDENCE_VERIFIED');
        evidenceFor.push('Customer submitted evidence consistent with order details.');
      } else {
        reasonCodes.push('ANOMALOUS_EVIDENCE');
        evidenceAgainst.push('Evidence inconsistencies detected against tracking or order telemetry.');
      }
    }

    const rationale = `Jev System One evaluated request: ${decision} (Risk Score: ${riskScore ?? 'N/A'}, Confidence: ${
      confidence ? `${(confidence * 100).toFixed(1)}%` : 'N/A'
    }).`;

    return {
      decision,
      riskScore,
      confidence,
      reasonCodes: reasonCodes.length > 0 ? reasonCodes : ['JEV_DECISION_GENERATED'],
      rationale,
      evidenceFor,
      evidenceAgainst,
      missingInformation,
      policyChecks,
      recommendedNextAction:
        decision === 'APPROVE'
          ? 'Process simulated refund credit'
          : decision === 'REJECT'
          ? 'Notify customer of rejection'
          : 'Escalate to human review team',
    };
  }
}
