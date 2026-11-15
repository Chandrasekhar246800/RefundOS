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
        auditEvents,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
