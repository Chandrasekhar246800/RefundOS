import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const PolicyUpdateSchema = z.object({
  version: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  policyWindowDays: z.number().int().min(1).max(365).optional(),
  maxInstantApprovalAmount: z.number().int().positive().optional(),
  highValueManualReviewThreshold: z.number().int().positive().optional(),
  maxPriorRefundsBeforeReview: z.number().int().min(0).optional(),
  maxPriorChargebacksBeforeReject: z.number().int().min(0).optional(),
  requireDeliveryProofForNonReceipt: z.boolean().optional(),
  requireImageForDamaged: z.boolean().optional(),
  allowOpenedPackaging: z.boolean().optional(),
  setActive: z.boolean().optional(),
});

export async function GET() {
  try {
    const policies = await prisma.refundPolicy.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const activePolicy = policies.find((p) => p.active) || policies[0];
    const parsedActiveConfig = activePolicy ? JSON.parse(activePolicy.configuration) : null;

    return NextResponse.json({
      success: true,
      data: {
        activePolicy: activePolicy
          ? {
              id: activePolicy.id,
              version: activePolicy.version,
              name: activePolicy.name,
              configuration: parsedActiveConfig,
              createdAt: activePolicy.createdAt,
            }
          : null,
        history: policies.map((p) => ({
          id: p.id,
          version: p.version,
          name: p.name,
          active: p.active,
          createdAt: p.createdAt,
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const validated = PolicyUpdateSchema.parse(body);

    const activePolicy = await prisma.refundPolicy.findFirst({
      where: { active: true },
    });

    if (!activePolicy) {
      return NextResponse.json({ success: false, error: 'No active policy found' }, { status: 404 });
    }

    const currentConfig = JSON.parse(activePolicy.configuration);
    const updatedConfig = {
      ...currentConfig,
      ...(validated.policyWindowDays !== undefined ? { policyWindowDays: validated.policyWindowDays } : {}),
      ...(validated.maxInstantApprovalAmount !== undefined
        ? { maxInstantApprovalAmount: validated.maxInstantApprovalAmount }
        : {}),
      ...(validated.highValueManualReviewThreshold !== undefined
        ? { highValueManualReviewThreshold: validated.highValueManualReviewThreshold }
        : {}),
      ...(validated.maxPriorRefundsBeforeReview !== undefined
        ? { maxPriorRefundsBeforeReview: validated.maxPriorRefundsBeforeReview }
        : {}),
      ...(validated.maxPriorChargebacksBeforeReject !== undefined
        ? { maxPriorChargebacksBeforeReject: validated.maxPriorChargebacksBeforeReject }
        : {}),
      ...(validated.requireDeliveryProofForNonReceipt !== undefined
        ? { requireDeliveryProofForNonReceipt: validated.requireDeliveryProofForNonReceipt }
        : {}),
      ...(validated.requireImageForDamaged !== undefined
        ? { requireImageForDamaged: validated.requireImageForDamaged }
        : {}),
      ...(validated.allowOpenedPackaging !== undefined
        ? { allowOpenedPackaging: validated.allowOpenedPackaging }
        : {}),
    };

    const newVersion = validated.version || `v${(parseFloat(activePolicy.version.replace('v', '')) + 0.1).toFixed(1)}`;

    // Create a new version record so policies remain strictly versioned
    await prisma.refundPolicy.updateMany({
      data: { active: false },
    });

    const newPolicy = await prisma.refundPolicy.create({
      data: {
        version: newVersion,
        name: validated.name || `Consumer Refund Policy ${newVersion}`,
        configuration: JSON.stringify(updatedConfig),
        active: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'SETTING',
        entityId: newPolicy.id,
        eventType: 'UPDATED',
        actor: 'demo_operator',
        details: JSON.stringify({
          previousVersion: activePolicy.version,
          newVersion: newPolicy.version,
          updatedConfig,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        version: newPolicy.version,
        name: newPolicy.name,
        configuration: updatedConfig,
      },
      message: `Refund policy updated to version ${newPolicy.version}.`,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
