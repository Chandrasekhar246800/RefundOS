import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ProductCreateSchema = z.object({
  brandId: z.string().min(1, 'Brand is required'),
  name: z.string().min(2, 'Product name must be at least 2 characters'),
  sku: z.string().min(3, 'SKU is required'),
  category: z.string().min(2, 'Category is required'),
  description: z.string().optional(),
  unitPrice: z.number().int().positive('Unit price must be positive integer cents'),
  currency: z.string().default('USD'),
  imageUrl: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId') || undefined;
    const category = searchParams.get('category') || undefined;

    const products = await prisma.product.findMany({
      where: {
        ...(brandId ? { brandId } : {}),
        ...(category ? { category } : {}),
      },
      include: {
        brand: { select: { id: true, name: true, currency: true } },
        _count: { select: { refundRequests: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: products });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = ProductCreateSchema.parse(body);

    const existingSku = await prisma.product.findUnique({
      where: { sku: validated.sku },
    });

    if (existingSku) {
      return NextResponse.json(
        { success: false, error: `Product with SKU "${validated.sku}" already exists.` },
        { status: 409 }
      );
    }

    const product = await prisma.product.create({
      data: {
        brandId: validated.brandId,
        name: validated.name,
        sku: validated.sku,
        category: validated.category,
        description: validated.description,
        unitPrice: validated.unitPrice,
        currency: validated.currency,
        imageUrl: validated.imageUrl,
        status: 'ACTIVE',
      },
      include: { brand: true },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'PRODUCT',
        entityId: product.id,
        eventType: 'CREATED',
        details: JSON.stringify(product),
      },
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
