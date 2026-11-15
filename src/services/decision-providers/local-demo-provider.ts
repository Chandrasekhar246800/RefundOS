import {
  DecisionInput,
  NormalizedDecision,
  PolicyCheckResult,
  RefundDecisionProvider,
} from '@/types';

export class LocalDemoDecisionProvider implements RefundDecisionProvider {
  getProviderName(): string {
    return 'LOCAL_DEMO';
  }

  async checkConnection(): Promise<{ connected: boolean; message: string; details?: any }> {
    return {
      connected: true,
      message: 'Local Demo Decision Engine is active, deterministic, and ready.',
      details: {
        mode: 'deterministic-rules',
        latency: 'instant (<5ms)',
        version: '2.4.0-demo',
      },
    };
  }

  async decide(input: DecisionInput): Promise<NormalizedDecision> {
    const { request, policy } = input;
    const policyChecks: PolicyCheckResult[] = [];
    const evidenceFor: string[] = [];
    const evidenceAgainst: string[] = [];
    const missingInfo: string[] = [];
    const reasonCodes: string[] = [];

    let riskScore = 15; // Baseline low risk

    // 1. Policy Window Check
    const isWithinWindow =
      request.daysSinceDelivery !== null &&
      request.daysSinceDelivery <= policy.policyWindowDays;
    
    if (request.daysSinceDelivery === null && request.reason !== 'NOT_RECEIVED') {
      policyChecks.push({
        rule: 'DELIVERY_DATE_VERIFICATION',
        result: 'UNKNOWN',
        explanation: 'Delivery date is not recorded; cannot definitively verify policy window.',
      });
      missingInfo.push('Confirmed delivery timestamp');
      riskScore += 25;
    } else if (isWithinWindow) {
      policyChecks.push({
        rule: 'POLICY_WINDOW',
        result: 'PASS',
        explanation: `Requested ${request.daysSinceDelivery} days after delivery (limit: ${policy.policyWindowDays} days).`,
      });
      evidenceFor.push(`Request submitted within ${policy.policyWindowDays}-day return window.`);
      reasonCodes.push('WITHIN_POLICY_WINDOW');
    } else if (request.daysSinceDelivery !== null && request.daysSinceDelivery > policy.policyWindowDays) {
      policyChecks.push({
        rule: 'POLICY_WINDOW',
        result: 'FAIL',
        explanation: `Requested ${request.daysSinceDelivery} days after delivery, exceeding ${policy.policyWindowDays}-day limit.`,
      });
      evidenceAgainst.push(`Request submitted ${request.daysSinceDelivery - policy.policyWindowDays} days past policy window.`);
      reasonCodes.push('EXCEEDS_POLICY_WINDOW');
      riskScore += 60;
    }

    // 2. High Value Check
    const isHighValue = request.requestedAmount >= policy.highValueManualReviewThreshold;
    if (isHighValue) {
      policyChecks.push({
        rule: 'HIGH_VALUE_THRESHOLD',
        result: 'UNKNOWN',
        explanation: `Requested amount ($${(request.requestedAmount / 100).toFixed(2)}) meets or exceeds high-value threshold ($${(policy.highValueManualReviewThreshold / 100).toFixed(2)}).`,
      });
      evidenceAgainst.push('High monetary refund value requires elevated review.');
      reasonCodes.push('HIGH_VALUE_TRANSACTION');
      riskScore += 30;
    } else {
      policyChecks.push({
        rule: 'HIGH_VALUE_THRESHOLD',
        result: 'PASS',
        explanation: `Amount ($${(request.requestedAmount / 100).toFixed(2)}) is within standard authorization thresholds.`,
      });
    }

    // 3. Customer Fraud & Chargeback History
    if (request.customerPriorChargebacks >= policy.maxPriorChargebacksBeforeReject) {
      policyChecks.push({
        rule: 'CHARGEBACK_HISTORY',
        result: 'FAIL',
        explanation: `Customer account has ${request.customerPriorChargebacks} prior chargeback(s) (threshold: ${policy.maxPriorChargebacksBeforeReject}).`,
      });
      evidenceAgainst.push(`Excessive prior chargeback activity (${request.customerPriorChargebacks} instances).`);
      reasonCodes.push('EXCESSIVE_CHARGEBACKS');
      riskScore += 50;
    } else if (request.customerPriorRefunds > policy.maxPriorRefundsBeforeReview) {
      policyChecks.push({
        rule: 'REFUND_FREQUENCY',
        result: 'UNKNOWN',
        explanation: `Customer has ${request.customerPriorRefunds} prior refunds (review threshold: ${policy.maxPriorRefundsBeforeReview}).`,
      });
      evidenceAgainst.push(`Frequent refund history: ${request.customerPriorRefunds} prior claims.`);
      reasonCodes.push('FREQUENT_REFUND_HISTORY');
      riskScore += 35;
    } else {
      policyChecks.push({
        rule: 'CUSTOMER_HISTORY',
        result: 'PASS',
        explanation: `Customer history normal (${request.customerTotalOrders} orders, ${request.customerPriorRefunds} prior refunds).`,
      });
      if (request.customerTotalOrders > 2 && request.customerPriorRefunds === 0) {
        evidenceFor.push('Loyal customer with clean order history and zero prior chargebacks.');
        reasonCodes.push('CLEAN_CUSTOMER_HISTORY');
      }
    }

    // 4. Evidence Inspection & Consistency Checks
    const photoEvidence = request.evidence.find((e) => e.type === 'PHOTO');
    const carrierRecord = request.evidence.find((e) => e.type === 'CARRIER_RECORD');
    const fulfillmentLog = request.evidence.find((e) => e.type === 'FULFILLMENT_LOG');

    if (request.reason === 'DAMAGED_ITEM' || request.reason === 'DEFECTIVE') {
      if (photoEvidence && photoEvidence.verified) {
        // Check metadata consistency
        if (photoEvidence.metadata?.inconsistentTimestamp || photoEvidence.metadata?.mismatchedModel) {
          policyChecks.push({
            rule: 'EVIDENCE_AUTHENTICITY',
            result: 'FAIL',
            explanation: `Photo metadata anomaly: ${photoEvidence.metadata?.inconsistentTimestamp ? 'Image timestamp predates order' : 'Image shows mismatched hardware model'}.`,
          });
          evidenceAgainst.push('Submitted photo metadata contradicts order timeline or SKU.');
          reasonCodes.push('FRAUDULENT_EVIDENCE_METADATA');
          riskScore += 65;
        } else {
          policyChecks.push({
            rule: 'DAMAGE_VERIFICATION',
            result: 'PASS',
            explanation: `Verified photographic evidence confirmed: ${photoEvidence.description}.`,
          });
          evidenceFor.push('Clear photo documentation depicting physical item damage.');
          reasonCodes.push('VERIFIED_PHOTO_EVIDENCE');
        }
      } else if (policy.requireImageForDamaged) {
        policyChecks.push({
          rule: 'DAMAGE_VERIFICATION',
          result: 'FAIL',
          explanation: 'Required photographic evidence for damaged item was not provided or failed verification.',
        });
        evidenceAgainst.push('Missing required photographic proof of damage.');
        missingInfo.push('High-resolution photo of damaged item with serial label');
        reasonCodes.push('MISSING_DAMAGE_PHOTO');
        riskScore += 45;
      }
    }

    // 5. Non-Receipt & Carrier Signals
    if (request.reason === 'NOT_RECEIVED') {
      if (request.trackingSignals.signatureObtained && request.trackingSignals.deliveryGpsMatch === true) {
        policyChecks.push({
          rule: 'DELIVERY_DISPUTE_VALIDATION',
          result: 'FAIL',
          explanation: 'Carrier provided GPS-verified coordinate match and recipient signature confirmation.',
        });
        evidenceAgainst.push('Strong contradictory carrier proof: GPS coordinate match and recipient signature present.');
        reasonCodes.push('CONTRADICTORY_DELIVERY_CONFIRMATION');
        riskScore += 70;
      } else if (request.trackingSignals.status === 'EXCEPTION' || request.trackingSignals.deliveryGpsMatch === false) {
        policyChecks.push({
          rule: 'DELIVERY_DISPUTE_VALIDATION',
          result: 'PASS',
          explanation: 'Carrier tracking confirms delivery exception or GPS coordinate mismatch at dropoff.',
        });
        evidenceFor.push('Carrier delivery telemetry shows delivery exception or GPS discrepancy.');
        reasonCodes.push('CARRIER_ANOMALY_CONFIRMED');
      } else {
        policyChecks.push({
          rule: 'DELIVERY_DISPUTE_VALIDATION',
          result: 'UNKNOWN',
          explanation: 'Standard parcel drop without signature; carrier notes ambiguous.',
        });
        evidenceAgainst.push('Carrier marked delivered without signature confirmation.');
        missingInfo.push('Carrier geofence delivery audit log');
        reasonCodes.push('AMBIGUOUS_DELIVERY_SIGNAL');
        riskScore += 25;
      }
    }

    // 6. Wrong Item Delivered
    if (request.reason === 'WRONG_ITEM') {
      if (fulfillmentLog && fulfillmentLog.verified) {
        policyChecks.push({
          rule: 'FULFILLMENT_ACCURACY',
          result: 'PASS',
          explanation: `Warehouse fulfillment log confirms scan mismatch: ${fulfillmentLog.description}`,
        });
        evidenceFor.push('Warehouse packaging scan confirms incorrect SKU dispatched.');
        reasonCodes.push('WAREHOUSE_MISPICK_CONFIRMED');
      } else if (photoEvidence && photoEvidence.verified) {
        evidenceFor.push('Customer photograph confirms different SKU/color received.');
        reasonCodes.push('VERIFIED_WRONG_ITEM_PHOTO');
      }
    }

    // 7. Duplicate Refund Attempt Check
    const hasDuplicateClaim = request.previousRefundOutcomes?.some(
      (p) => p.outcome === 'APPROVED' || p.outcome === 'PENDING'
    );
    if (hasDuplicateClaim) {
      policyChecks.push({
        rule: 'DUPLICATE_CLAIM_CHECK',
        result: 'FAIL',
        explanation: 'A refund has already been granted or is actively open for this order line.',
      });
      evidenceAgainst.push('Duplicate refund request detected for identical order.');
      reasonCodes.push('DUPLICATE_CLAIM_ATTEMPT');
      riskScore = 99;
    }

    // Clamp risk score
    riskScore = Math.min(100, Math.max(0, riskScore));

    // Determine normalized decision
    let decision: 'APPROVE' | 'REJECT' | 'MANUAL_REVIEW';
    let rationale: string;
    let recommendedNextAction: string;

    const hasCriticalFail = policyChecks.some((c) => c.result === 'FAIL');
    const hasAmbiguity = policyChecks.some((c) => c.result === 'UNKNOWN');

    if (riskScore >= 70 || hasCriticalFail) {
      decision = 'REJECT';
      rationale = `Refund request rejected due to clear policy violation: ${
        evidenceAgainst[0] || 'Significant contradictory risk signals and policy failure'
      }.`;
      recommendedNextAction = 'Issue polite formal rejection notice citing specific policy terms.';
    } else if (riskScore >= 40 || hasAmbiguity || isHighValue) {
      decision = 'MANUAL_REVIEW';
      rationale = `Request flagged for manual review due to ${
        isHighValue ? 'high monetary value' : 'ambiguous evidence or contextual risk factors'
      }: ${missingInfo[0] || evidenceAgainst[0] || 'Elevated risk parameters'}.`;
      recommendedNextAction = 'Route to Tier 2 Support agent for human inspection and evidence verification.';
    } else {
      decision = 'APPROVE';
      rationale = `Refund approved: customer request is within policy window, evidence is verified, and customer history is good (${evidenceFor.slice(0, 2).join('; ')}).`;
      recommendedNextAction = 'Proceed with automated simulated refund transaction credit.';
    }

    const confidence = decision === 'MANUAL_REVIEW' ? 0.72 : 0.94;

    return {
      decision,
      riskScore,
      confidence,
      reasonCodes,
      rationale,
      evidenceFor,
      evidenceAgainst,
      missingInformation: missingInfo,
      policyChecks,
      recommendedNextAction,
    };
  }
}
