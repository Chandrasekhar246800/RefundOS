import { prisma } from '@/lib/prisma';
import {
  ICustomerRiskService,
  DetailedCustomerRiskProfile,
  CustomerSignal,
} from '@/types';

export class CustomerRiskService implements ICustomerRiskService {
  /**
   * Evaluates and updates the explainable customer risk profile based on real database records.
   */
  public async evaluateCustomerRisk(customerId: string): Promise<DetailedCustomerRiskProfile> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: {
          orderBy: { purchasedAt: 'desc' },
        },
        refundRequests: {
          orderBy: { requestedAt: 'desc' },
          include: {
            order: true,
          },
        },
      },
    });

    if (!customer) {
      throw new Error(`Customer with ID '${customerId}' not found.`);
    }

    const now = new Date().getTime();
    const msPerDay = 1000 * 60 * 60 * 24;

    // 1. Metric: Total orders
    const totalOrders = customer.orders.length;

    // 2. Metric: Total refund requests
    const totalRefundRequests = customer.refundRequests.length;

    // 3. Metric: Approved refunds
    const approvedRefunds = customer.refundRequests.filter(
      (r) => r.status === 'APPROVED'
    ).length;

    // 4. Metric: Rejected refunds
    const rejectedRefunds = customer.refundRequests.filter(
      (r) => r.status === 'REJECTED'
    ).length;

    // 5. Metric: Manual reviews
    const manualReviews = customer.refundRequests.filter(
      (r) => r.status === 'MANUAL_REVIEW'
    ).length;

    // 6. Metric: Total refund amount (cents)
    const totalRefundAmountCents = customer.refundRequests.reduce(
      (sum, r) => sum + r.requestedAmount,
      0
    );

    // 7. Metric: Total purchase amount (cents)
    const totalPurchaseAmountCents = customer.orders.reduce(
      (sum, o) => sum + o.amount,
      0
    );

    // 8. Metric: Refund-to-order ratio
    const refundToOrderRatio = Number(
      (totalRefundRequests / Math.max(1, totalOrders)).toFixed(3)
    );

    // 9. Metric: Refund-to-spend ratio
    const refundToSpendRatio = Number(
      (totalRefundAmountCents / Math.max(1, totalPurchaseAmountCents)).toFixed(3)
    );

    // 10. Metric: Frequencies over 7, 30, and 90 days
    const claimsLast7Days = customer.refundRequests.filter((r) => {
      const diffDays = (now - new Date(r.requestedAt).getTime()) / msPerDay;
      return diffDays <= 7;
    }).length;

    const claimsLast30Days = customer.refundRequests.filter((r) => {
      const diffDays = (now - new Date(r.requestedAt).getTime()) / msPerDay;
      return diffDays <= 30;
    }).length;

    const claimsLast90Days = customer.refundRequests.filter((r) => {
      const diffDays = (now - new Date(r.requestedAt).getTime()) / msPerDay;
      return diffDays <= 90;
    }).length;

    // 11. Metric: Repeated refund requests against the same order
    const orderClaimCounts: Record<string, number> = {};
    for (const r of customer.refundRequests) {
      orderClaimCounts[r.orderId] = (orderClaimCounts[r.orderId] || 0) + 1;
    }
    const repeatedRefundCount = Object.values(orderClaimCounts).filter(
      (c) => c > 1
    ).length;

    // 12. Metric: Previous chargebacks
    const previousChargebacks = customer.priorChargebackCount || 0;
    const chargebackRate = Number(
      (previousChargebacks / Math.max(1, totalOrders)).toFixed(3)
    );

    // 13. Metric: Average time between orders and refund requests (days)
    let totalLagDays = 0;
    let validLagCount = 0;
    for (const r of customer.refundRequests) {
      if (r.order?.purchasedAt) {
        const lag =
          (new Date(r.requestedAt).getTime() -
            new Date(r.order.purchasedAt).getTime()) /
          msPerDay;
        if (lag >= 0) {
          totalLagDays += lag;
          validLagCount++;
        }
      }
    }
    const avgDaysToRefund =
      validLagCount > 0 ? Number((totalLagDays / validLagCount).toFixed(1)) : null;

    // 14. Metric: Historical changes in refund behavior
    const accountAgeDays =
      (now - new Date(customer.accountCreatedAt).getTime()) / msPerDay;
    let behaviourChangeTrend:
      | 'STABLE'
      | 'ACCELERATING'
      | 'DECELERATING'
      | 'INSUFFICIENT_HISTORY' = 'STABLE';

    if (totalOrders <= 1 && totalRefundRequests <= 1) {
      behaviourChangeTrend = 'INSUFFICIENT_HISTORY';
    } else if (claimsLast7Days >= 2 || claimsLast30Days >= 3 || (claimsLast30Days >= 2 && totalRefundRequests > claimsLast30Days)) {
      behaviourChangeTrend = 'ACCELERATING';
    } else if (claimsLast30Days === 0 && totalRefundRequests >= 2) {
      behaviourChangeTrend = 'DECELERATING';
    } else {
      behaviourChangeTrend = 'STABLE';
    }

    // Data completeness estimation
    let dataCompleteness = 1.0;
    if (totalOrders <= 1) dataCompleteness = 0.5;
    else if (totalOrders <= 3) dataCompleteness = 0.75;

    // -------------------------------------------------------------
    // Explainable Risk Scoring Engine (0 - 100)
    // -------------------------------------------------------------
    const contributingSignals: CustomerSignal[] = [];
    let score = 15; // Baseline healthy score

    // Signal: New Customer / Insufficient History
    if (behaviourChangeTrend === 'INSUFFICIENT_HISTORY') {
      score = 10;
      contributingSignals.push({
        rule: 'NEW_CUSTOMER_BASELINE',
        severity: 'LOW',
        scoreContribution: 0,
        description:
          'New customer account with limited order history. Scored conservatively without speculative penalties.',
      });
    }

    // Signal: Legitimate Return History Credit
    if (
      totalOrders >= 4 &&
      refundToOrderRatio <= 0.25 &&
      refundToSpendRatio <= 0.25
    ) {
      score = Math.max(5, score - 5);
      contributingSignals.push({
        rule: 'ESTABLISHED_HEALTHY_BUYER',
        severity: 'LOW',
        scoreContribution: -5,
        description: `Established customer with ${totalOrders} purchases and normal return frequency (${(refundToSpendRatio * 100).toFixed(1)}% spend refunded).`,
      });
    }

    // Signal: 7-Day Velocity Spike
    if (claimsLast7Days >= 2) {
      const penalty = claimsLast7Days >= 3 ? 30 : 20;
      score += penalty;
      contributingSignals.push({
        rule: 'HIGH_VELOCITY_7_DAYS',
        severity: claimsLast7Days >= 3 ? 'CRITICAL' : 'HIGH',
        scoreContribution: penalty,
        description: `Abnormal claim frequency: ${claimsLast7Days} refund requests submitted within the past 7 days.`,
      });
    }

    // Signal: 30-Day Volume Anomaly
    if (claimsLast30Days >= 3 && claimsLast7Days < 2) {
      score += 15;
      contributingSignals.push({
        rule: 'HIGH_VELOCITY_30_DAYS',
        severity: 'MEDIUM',
        scoreContribution: 15,
        description: `High monthly claim volume: ${claimsLast30Days} refund requests submitted in the last 30 days.`,
      });
    }

    // Signal: High Refund-to-Spend Ratio
    if (refundToSpendRatio > 0.6 && totalOrders >= 2) {
      const penalty = refundToSpendRatio > 0.85 ? 30 : 20;
      score += penalty;
      contributingSignals.push({
        rule: 'ELEVATED_REFUND_SPEND_RATIO',
        severity: refundToSpendRatio > 0.85 ? 'HIGH' : 'MEDIUM',
        scoreContribution: penalty,
        description: `High refund-to-spend ratio: ${(refundToSpendRatio * 100).toFixed(1)}% of customer lifetime gross spend has been claimed for refund.`,
      });
    }

    // Signal: High Refund-to-Order Ratio
    if (refundToOrderRatio >= 0.5 && totalOrders >= 3) {
      score += 20;
      contributingSignals.push({
        rule: 'HIGH_REFUND_ORDER_RATIO',
        severity: 'HIGH',
        scoreContribution: 20,
        description: `Claims filed on ${(refundToOrderRatio * 100).toFixed(1)}% of all orders (${totalRefundRequests} claims across ${totalOrders} orders).`,
      });
    }

    // Signal: Repeated Claims on Same Order
    if (repeatedRefundCount > 0) {
      score += 25;
      contributingSignals.push({
        rule: 'REPEATED_ORDER_CLAIMS',
        severity: 'HIGH',
        scoreContribution: 25,
        description: `Multiple distinct refund requests submitted against the same order (${repeatedRefundCount} order(s) have repeated claims).`,
      });
    }

    // Signal: Verified Historical Chargebacks
    if (previousChargebacks > 0) {
      const cbPenalty = Math.min(50, previousChargebacks * 25);
      score += cbPenalty;
      contributingSignals.push({
        rule: 'RECORDED_CHARGEBACKS',
        severity: 'CRITICAL',
        scoreContribution: cbPenalty,
        description: `${previousChargebacks} previously recorded payment chargeback dispute(s) on file.`,
      });
    }

    // Signal: Accelerating Velocity Shift
    if (behaviourChangeTrend === 'ACCELERATING') {
      score += 15;
      contributingSignals.push({
        rule: 'ACCELERATING_REFUND_TREND',
        severity: 'MEDIUM',
        scoreContribution: 15,
        description:
          'Sudden acceleration in refund filing activity relative to account historical baseline.',
      });
    }

    // Signal: Rapid Claim Turnaround
    if (avgDaysToRefund !== null && avgDaysToRefund < 0.5 && totalRefundRequests >= 2) {
      score += 10;
      contributingSignals.push({
        rule: 'IMMEDIATE_CLAIM_TURNAROUND',
        severity: 'LOW',
        scoreContribution: 10,
        description:
          'Near-immediate claim submission pattern: refunds requested within hours of purchase or fulfillment.',
      });
    }

    const compositeRiskScore = Math.max(0, Math.min(100, Math.round(score)));

    let riskTier: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (compositeRiskScore >= 80) riskTier = 'CRITICAL';
    else if (compositeRiskScore >= 55) riskTier = 'HIGH';
    else if (compositeRiskScore >= 30) riskTier = 'MODERATE';
    else riskTier = 'LOW';

    const calculationExplanation =
      contributingSignals.length > 0
        ? contributingSignals.map((s) => `[${s.rule}: ${s.description}]`).join(' ')
        : 'Customer demonstrates baseline normal purchasing activity with no anomalous velocity or spend signals.';

    const fraudSignalsList = contributingSignals.map((s) => s.rule);

    // Persist into CustomerRiskProfile table
    await prisma.customerRiskProfile.upsert({
      where: { customerId },
      update: {
        compositeRiskScore,
        riskTier,
        totalOrders,
        totalRefundRequests,
        approvedRefunds,
        rejectedRefunds,
        manualReviews,
        totalRefundAmount: totalRefundAmountCents,
        totalPurchaseAmount: totalPurchaseAmountCents,
        refundToOrderRatio,
        refundToSpendRatio,
        claimsLast7Days,
        claimsLast30Days,
        claimsLast90Days,
        repeatedRefundCount,
        chargebackRate,
        previousChargebacks,
        avgDaysToRefund,
        behaviourChangeTrend,
        dataCompleteness,
        fraudSignals: JSON.stringify(fraudSignalsList),
        scoreBreakdown: JSON.stringify(contributingSignals),
        lastEvaluatedAt: new Date(),
      },
      create: {
        customerId,
        compositeRiskScore,
        riskTier,
        totalOrders,
        totalRefundRequests,
        approvedRefunds,
        rejectedRefunds,
        manualReviews,
        totalRefundAmount: totalRefundAmountCents,
        totalPurchaseAmount: totalPurchaseAmountCents,
        refundToOrderRatio,
        refundToSpendRatio,
        claimsLast7Days,
        claimsLast30Days,
        claimsLast90Days,
        repeatedRefundCount,
        chargebackRate,
        previousChargebacks,
        avgDaysToRefund,
        behaviourChangeTrend,
        dataCompleteness,
        fraudSignals: JSON.stringify(fraudSignalsList),
        scoreBreakdown: JSON.stringify(contributingSignals),
        lastEvaluatedAt: new Date(),
      },
    });

    return {
      customerId,
      customerRef: customer.syntheticCustomerRef,
      compositeRiskScore,
      riskTier,
      totalOrders,
      totalRefundRequests,
      approvedRefunds,
      rejectedRefunds,
      manualReviews,
      totalRefundAmountCents,
      totalPurchaseAmountCents,
      refundToOrderRatio,
      refundToSpendRatio,
      claimsLast7Days,
      claimsLast30Days,
      claimsLast90Days,
      repeatedRefundCount,
      chargebackRate,
      previousChargebacks,
      avgDaysToRefund,
      behaviourChangeTrend,
      dataCompleteness,
      contributingSignals,
      calculationExplanation,
      lastEvaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieves an existing customer risk profile or calculates on the fly if not yet generated.
   */
  public async getCustomerRiskProfile(
    customerId: string
  ): Promise<DetailedCustomerRiskProfile | null> {
    const existing = await prisma.customerRiskProfile.findUnique({
      where: { customerId },
      include: {
        customer: true,
      },
    });

    if (existing) {
      let contributingSignals: CustomerSignal[] = [];
      try {
        contributingSignals = JSON.parse(existing.scoreBreakdown || '[]');
      } catch {}

      return {
        customerId: existing.customerId,
        customerRef: existing.customer.syntheticCustomerRef,
        compositeRiskScore: existing.compositeRiskScore,
        riskTier: existing.riskTier as any,
        totalOrders: existing.totalOrders,
        totalRefundRequests: existing.totalRefundRequests,
        approvedRefunds: existing.approvedRefunds,
        rejectedRefunds: existing.rejectedRefunds,
        manualReviews: existing.manualReviews,
        totalRefundAmountCents: existing.totalRefundAmount,
        totalPurchaseAmountCents: existing.totalPurchaseAmount,
        refundToOrderRatio: existing.refundToOrderRatio,
        refundToSpendRatio: existing.refundToSpendRatio,
        claimsLast7Days: existing.claimsLast7Days,
        claimsLast30Days: existing.claimsLast30Days,
        claimsLast90Days: existing.claimsLast90Days,
        repeatedRefundCount: existing.repeatedRefundCount,
        chargebackRate: existing.chargebackRate,
        previousChargebacks: existing.previousChargebacks,
        avgDaysToRefund: existing.avgDaysToRefund,
        behaviourChangeTrend: (existing.behaviourChangeTrend as any) || 'STABLE',
        dataCompleteness: existing.dataCompleteness,
        contributingSignals,
        calculationExplanation:
          contributingSignals.map((s) => s.description).join(' ') ||
          'Customer risk profile loaded.',
        lastEvaluatedAt: existing.lastEvaluatedAt.toISOString(),
      };
    }

    return this.evaluateCustomerRisk(customerId);
  }
}
