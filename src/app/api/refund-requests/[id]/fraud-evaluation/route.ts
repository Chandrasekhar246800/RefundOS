import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FraudDetectionEngine } from '@/services/intelligence/fraud-detection-engine';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.fraudEvaluation.findUnique({
      where: { refundRequestId: params.id },
      include: {
        refundRequest: {
          include: {
            customer: true,
            order: true,
            product: true,
          },
        },
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: {
          ...existing,
          detectedPatterns: JSON.parse(existing.detectedPatterns || '[]'),
          anomalyDetails: JSON.parse(existing.anomalyDetails || '{}'),
          contributingEvidence: JSON.parse(existing.contributingEvidence || '[]'),
          missingInformation: JSON.parse(existing.missingInformation || '[]'),
        },
      });
    }

    // If not yet evaluated, evaluate on-the-fly
    const fraudEngine = new FraudDetectionEngine();
    const evaluation = await fraudEngine.evaluateFraudRisk(params.id);

    return NextResponse.json({
      success: true,
      data: evaluation,
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const fraudEngine = new FraudDetectionEngine();
    const evaluation = await fraudEngine.evaluateFraudRisk(params.id);

    return NextResponse.json({
      success: true,
      data: evaluation,
      message: 'Fraud and anomaly risk evaluated successfully.',
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
