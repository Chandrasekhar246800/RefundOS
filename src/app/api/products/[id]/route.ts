import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ProductUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  category: z.string().min(2).optional(),
  description: z.string().optional(),
  unitPrice: z.number().int().positive().optional(),
  currency: z.string().optional(),
  imageUrl: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: {
        brand: true,
        refundRequests: {
          take: 10,
          orderBy: { requestedAt: 'desc' },
          include: { decision: true, transaction: true },
        },
        _count: { select: { refundRequests: true, orders: true } },
      },
    });

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const validated = ProductUpdateSchema.parse(body);

    const product = await prisma.product.update({
      where: { id: params.id },
      data: validated,
      include: { brand: true },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'PRODUCT',
        entityId: product.id,
        eventType: 'UPDATED',
        details: JSON.stringify(validated),
      },
    });

    return NextResponse.json({ success: true, data: product });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const product = await prisma.product.update({
      where: { id: params.id },
      data: { status: 'INACTIVE' },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'PRODUCT',
        entityId: product.id,
        eventType: 'DEACTIVATED',
        details: JSON.stringify({ message: 'Product set to inactive' }),
      },
    });

    return NextResponse.json({ success: true, data: product });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
