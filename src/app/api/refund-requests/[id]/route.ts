import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const refundRequest = await prisma.refundRequest.findUnique({
      where: { id: params.id },
      include: {
        product: { include: { brand: true } },
        customer: {
          include: {
            riskProfile: true,
            orders: {
              take: 5,
              orderBy: { purchasedAt: 'desc' },
              include: { product: { select: { name: true, sku: true } } },
            },
          },
        },
        order: true,
        decision: true,
        transaction: true,
        batch: true,
        fraudEvaluation: true,
        layaUsage: {
          orderBy: { createdAt: 'desc' },
        },
        evidenceFiles: {
          orderBy: { uploadedAt: 'desc' },
          include: {
            imageAnalysis: true,
            documentAnalysis: true,
          },
        },
      },
    });

    if (!refundRequest) {
      return NextResponse.json({ success: false, error: 'Refund request not found' }, { status: 404 });
    }

    // Get audit logs for this refund request
    const auditEvents = await prisma.auditEvent.findMany({
      where: { entityId: refundRequest.id },
      orderBy: { createdAt: 'desc' },
    });

    let evidence = [];
    try {
      evidence = refundRequest.evidence ? JSON.parse(refundRequest.evidence) : [];
    } catch {}

    let deliveryEvidence = {};
    try {
      deliveryEvidence = refundRequest.order.deliveryEvidence
        ? JSON.parse(refundRequest.order.deliveryEvidence)
        : {};
    } catch {}

    let policyChecks = [];
    let evidenceFor = [];
    let evidenceAgainst = [];
    let missingInfo = [];
    let reasonCodes = [];
    if (refundRequest.decision) {
      try {
        policyChecks = JSON.parse(refundRequest.decision.policyChecks);
        evidenceFor = JSON.parse(refundRequest.decision.evidenceFor);
        evidenceAgainst = JSON.parse(refundRequest.decision.evidenceAgainst);
        missingInfo = JSON.parse(refundRequest.decision.missingInformation);
        reasonCodes = JSON.parse(refundRequest.decision.reasonCodes);
      } catch {}
    }

    let parsedFraudEvaluation = null;
    if (refundRequest.fraudEvaluation) {
      try {
        parsedFraudEvaluation = {
          ...refundRequest.fraudEvaluation,
          detectedPatterns: JSON.parse(refundRequest.fraudEvaluation.detectedPatterns),
          anomalyDetails: JSON.parse(refundRequest.fraudEvaluation.anomalyDetails),
          contributingEvidence: refundRequest.fraudEvaluation.contributingEvidence
            ? JSON.parse(refundRequest.fraudEvaluation.contributingEvidence)
            : [],
          missingInformation: refundRequest.fraudEvaluation.missingInformation
            ? JSON.parse(refundRequest.fraudEvaluation.missingInformation)
            : [],
        };
      } catch {
        parsedFraudEvaluation = refundRequest.fraudEvaluation;
      }
    }

    let parsedCustomerRiskProfile = null;
    if (refundRequest.customer?.riskProfile) {
      try {
        parsedCustomerRiskProfile = {
          ...refundRequest.customer.riskProfile,
          compositeScore: refundRequest.customer.riskProfile.compositeRiskScore,
          signals: refundRequest.customer.riskProfile.fraudSignals
            ? JSON.parse(refundRequest.customer.riskProfile.fraudSignals)
            : [],
          scoreBreakdown: refundRequest.customer.riskProfile.scoreBreakdown
            ? JSON.parse(refundRequest.customer.riskProfile.scoreBreakdown)
            : null,
        };
      } catch {
        parsedCustomerRiskProfile = refundRequest.customer.riskProfile;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...refundRequest,
        parsedEvidence: evidence,
        parsedDeliveryEvidence: deliveryEvidence,
        decisionDetails: refundRequest.decision
          ? {
              ...refundRequest.decision,
              policyChecks,
              evidenceFor,
              evidenceAgainst,
              missingInfo,
              reasonCodes,
            }
          : null,
        parsedFraudEvaluation,
        parsedCustomerRiskProfile,
        auditEvents,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
