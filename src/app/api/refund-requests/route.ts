import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId') || undefined;
    const productId = searchParams.get('productId') || undefined;
    const batchId = searchParams.get('batchId') || undefined;
    const status = searchParams.get('status') || undefined;
    const reason = searchParams.get('reason') || undefined;
    const groundTruthLabel = searchParams.get('groundTruthLabel') || undefined;
    const search = searchParams.get('search') || undefined;
    const sortBy = searchParams.get('sortBy') || 'requestedAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const skip = (page - 1) * limit;

    let orderBy: any = { requestedAt: 'desc' };
    if (sortBy === 'requestedAmount') {
      orderBy = { requestedAmount: sortOrder };
    } else if (sortBy === 'status') {
      orderBy = { status: sortOrder };
    } else if (sortBy === 'reason') {
      orderBy = { reason: sortOrder };
    } else if (sortBy === 'requestedAt') {
      orderBy = { requestedAt: sortOrder };
    }

    const where: any = {};
    if (batchId) where.batchId = batchId;
    if (productId) where.productId = productId;
    if (status) where.status = status;
    if (reason) where.reason = reason;
    if (groundTruthLabel) where.groundTruthLabel = groundTruthLabel;

    if (brandId) {
      where.product = { brandId };
    }

    if (search) {
      where.OR = [
        { requestRef: { contains: search } },
        { customerMessage: { contains: search } },
        { order: { orderRef: { contains: search } } },
        { customer: { syntheticCustomerRef: { contains: search } } },
      ];
    }

    const [total, requests] = await Promise.all([
      prisma.refundRequest.count({ where }),
      prisma.refundRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          product: { select: { id: true, name: true, sku: true, brand: { select: { id: true, name: true } } } },
          customer: { select: { id: true, syntheticCustomerRef: true, totalOrders: true, priorRefundCount: true } },
          order: { select: { id: true, orderRef: true, amount: true, fulfilmentStatus: true, deliveredAt: true } },
          decision: {
            select: {
              decision: true,
              riskScore: true,
              confidence: true,
              provider: true,
              rationale: true,
              reasonCodes: true,
            },
          },
          transaction: { select: { reference: true, status: true, amount: true } },
          layaUsage: {
            select: {
              inputTokens: true,
              stateTokens: true,
              outputTokens: true,
              totalTokens: true,
              latencyMs: true,
              estimatedCostUsd: true,
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    const formatted = requests.map((r) => ({
      id: r.id,
      requestRef: r.requestRef,
      orderRef: r.order.orderRef,
      customerRef: r.customer.syntheticCustomerRef,
      productName: r.product.name,
      productSku: r.product.sku,
      brandName: r.product.brand.name,
      brandId: r.product.brand.id,
      requestedAmount: r.requestedAmount,
      currency: r.currency,
      reason: r.reason,
      status: r.status,
      requestedAt: r.requestedAt,
      groundTruthLabel: r.groundTruthLabel,
      decision: r.decision?.decision || null,
      riskScore: r.decision?.riskScore ?? null,
      confidence: r.decision?.confidence ?? null,
      provider: r.decision?.provider || null,
      rationale: r.decision?.rationale || null,
      reasonCodes: r.decision ? JSON.parse(r.decision.reasonCodes) : [],
      transactionRef: r.transaction?.reference || null,
      layaUsage: r.layaUsage && r.layaUsage.length > 0 ? r.layaUsage[0] : null,
    }));

    return NextResponse.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
