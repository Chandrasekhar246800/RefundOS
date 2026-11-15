import { prisma } from '@/lib/prisma';
import { GroundTruthLabel, EvidenceItem, TrackingSignals } from '@/types';

// Deterministic pseudo-random number generator for reproducible seed
function createPrng(seedStr: string | number) {
  let s = typeof seedStr === 'number' ? seedStr : hashString(seedStr);
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 12345;
}

export interface GenerateOptions {
  brandId: string;
  productId: string;
  legitimateCount?: number;
  nonLegitimateCount?: number;
  seed?: string | number;
  dryRun?: boolean;
}

interface ScenarioTemplate {
  groundTruth: GroundTruthLabel;
  reason: string;
  customerMessage: string;
  daysAfterDelivery: number | null;
  fulfilmentStatus: string;
  customerProfile: {
    accountAgeDays: number;
    totalOrders: number;
    priorRefunds: number;
    priorReturns: number;
    priorChargebacks: number;
  };
  evidence: EvidenceItem[];
  trackingSignals: TrackingSignals;
  duplicateClaim?: boolean;
}

const LEGITIMATE_SCENARIOS: ScenarioTemplate[] = [
  {
    groundTruth: 'LEGITIMATE',
    reason: 'DAMAGED_ITEM',
    customerMessage: 'Item arrived with deep scratches across the front face and dented packaging. Photos attached.',
    daysAfterDelivery: 2,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 450, totalOrders: 7, priorRefunds: 0, priorReturns: 1, priorChargebacks: 0 },
    evidence: [
      {
        type: 'PHOTO',
        description: 'High-res image showing deep surface dent and cracked housing.',
        verified: true,
        metadata: { timestamp: '2026-11-12T14:22:00Z', consistentTimestamp: true },
      },
    ],
    trackingSignals: {
      carrier: 'FedEx Ground',
      trackingNumber: '782910481920',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
      carrierNotes: 'Delivered to front porch.',
    },
  },
  {
    groundTruth: 'LEGITIMATE',
    reason: 'WRONG_ITEM',
    customerMessage: 'I ordered the Midnight Black variant, but received Desert Sand with a different SKU barcode.',
    daysAfterDelivery: 3,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 280, totalOrders: 4, priorRefunds: 1, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'PHOTO',
        description: 'Customer photo of box barcode showing color code mismatch.',
        verified: true,
      },
      {
        type: 'FULFILLMENT_LOG',
        description: 'Warehouse packaging scan flag: pick bin discrepancy logged on assembly belt.',
        verified: true,
      },
    ],
    trackingSignals: {
      carrier: 'UPS Ground',
      trackingNumber: '1Z9999999999999991',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
    },
  },
  {
    groundTruth: 'LEGITIMATE',
    reason: 'NOT_RECEIVED',
    customerMessage: 'Tracking says delivered yesterday afternoon, but no package was left. Porch camera confirms no courier arrival.',
    daysAfterDelivery: 1,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 600, totalOrders: 9, priorRefunds: 0, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'CUSTOMER_AFFIDAVIT',
        description: 'Signed affidavit of non-receipt with porch security camera footage timeline.',
        verified: true,
      },
    ],
    trackingSignals: {
      carrier: 'USPS Priority',
      trackingNumber: '9400111899562910291823',
      status: 'DELIVERED',
      deliveryGpsMatch: false,
      signatureObtained: false,
      carrierNotes: 'GPS scan 0.3 miles away from registered address.',
    },
  },
  {
    groundTruth: 'LEGITIMATE',
    reason: 'DUPLICATE_CHARGE',
    customerMessage: 'My card was billed twice for the single order. Please refund the duplicate second transaction.',
    daysAfterDelivery: 4,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 320, totalOrders: 3, priorRefunds: 0, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'INVOICE',
        description: 'Payment gateway audit log showing twin authorization tokens created 12ms apart.',
        verified: true,
      },
    ],
    trackingSignals: {
      carrier: 'DHL Express',
      trackingNumber: 'DHL928172615',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: true,
    },
  },
  {
    groundTruth: 'LEGITIMATE',
    reason: 'DEFECTIVE',
    customerMessage: 'Unit powers on for 5 seconds and abruptly shuts off with an error code E-04.',
    daysAfterDelivery: 6,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 180, totalOrders: 2, priorRefunds: 0, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'INSPECTION',
        description: 'Diagnostics log matching known batch firmware crash on serial string.',
        verified: true,
      },
    ],
    trackingSignals: {
      carrier: 'UPS Ground',
      trackingNumber: '1Z9999999999999992',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
    },
  },
  {
    groundTruth: 'LEGITIMATE',
    reason: 'MISSING_ITEM',
    customerMessage: 'Ordered two units in a bundle, but package contained only one unit. Packing invoice lists both.',
    daysAfterDelivery: 3,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 410, totalOrders: 6, priorRefunds: 1, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'FULFILLMENT_LOG',
        description: 'Carrier scale weigh-in was 0.85kg; expected package weight with 2 units was 1.60kg.',
        verified: true,
      },
    ],
    trackingSignals: {
      carrier: 'FedEx Home Delivery',
      trackingNumber: '782910481921',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
    },
  },
  {
    groundTruth: 'LEGITIMATE',
    reason: 'DAMAGED_ITEM',
    customerMessage: 'Outer shipping carton was pierced during transit, puncturing the product casing.',
    daysAfterDelivery: 1,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 730, totalOrders: 11, priorRefunds: 0, priorReturns: 1, priorChargebacks: 0 },
    evidence: [
      {
        type: 'PHOTO',
        description: 'Photo of crushed cardboard and internal puncture damage.',
        verified: true,
        metadata: { timestamp: '2026-11-13T09:15:00Z', consistentTimestamp: true },
      },
    ],
    trackingSignals: {
      carrier: 'FedEx Ground',
      trackingNumber: '782910481922',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
      carrierNotes: 'Package noted with torn packaging by delivery driver.',
    },
  },
  {
    groundTruth: 'LEGITIMATE',
    reason: 'CHANGED_MIND',
    customerMessage: 'Item unopened in factory seal. Requesting standard return within 14 days of purchase.',
    daysAfterDelivery: 8,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 120, totalOrders: 2, priorRefunds: 0, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'PHOTO',
        description: 'Pristine unopened packaging with intact security holographic seal.',
        verified: true,
      },
    ],
    trackingSignals: {
      carrier: 'USPS Priority',
      trackingNumber: '9400111899562910291824',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
    },
  },
  {
    groundTruth: 'LEGITIMATE',
    reason: 'NOT_RECEIVED',
    customerMessage: 'Delivery driver dropped parcel at the wrong building entrance across the street.',
    daysAfterDelivery: 2,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 340, totalOrders: 5, priorRefunds: 0, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'CARRIER_RECORD',
        description: 'Carrier drop photo shows building door 402; customer delivery address is 408.',
        verified: true,
      },
    ],
    trackingSignals: {
      carrier: 'OnTrac Delivery',
      trackingNumber: 'C118274910291',
      status: 'DELIVERED',
      deliveryGpsMatch: false,
      signatureObtained: false,
    },
  },
  {
    groundTruth: 'LEGITIMATE',
    reason: 'DEFECTIVE',
    customerMessage: 'Hardware component loose inside chassis causing heavy rattling and failure to spin.',
    daysAfterDelivery: 4,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 520, totalOrders: 8, priorRefunds: 1, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'PHOTO',
        description: 'Audio/video metadata demonstrating mechanical rattle and loose bracket.',
        verified: true,
      },
    ],
    trackingSignals: {
      carrier: 'UPS Ground',
      trackingNumber: '1Z9999999999999993',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
    },
  },
];

const NON_LEGITIMATE_SCENARIOS: ScenarioTemplate[] = [
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'CHANGED_MIND',
    customerMessage: 'I bought this over two months ago and decided I do not need it anymore. Want my money back.',
    daysAfterDelivery: 74, // Well outside 30-day window!
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 200, totalOrders: 1, priorRefunds: 0, priorReturns: 0, priorChargebacks: 0 },
    evidence: [],
    trackingSignals: {
      carrier: 'UPS Ground',
      trackingNumber: '1Z9999999999999994',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: true,
    },
  },
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'NOT_RECEIVED',
    customerMessage: 'Never got my package. Give me an immediate refund.',
    daysAfterDelivery: 5,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 90, totalOrders: 3, priorRefunds: 2, priorReturns: 0, priorChargebacks: 1 },
    evidence: [],
    trackingSignals: {
      carrier: 'FedEx Priority',
      trackingNumber: '782910481923',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: true,
      carrierNotes: 'Signed for in person by customer with verified photo ID scan at doorstep.',
    },
  },
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'DAMAGED_ITEM',
    customerMessage: 'Item came completely broken in pieces.',
    daysAfterDelivery: 4,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 60, totalOrders: 2, priorRefunds: 1, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'PHOTO',
        description: 'Photo of broken device.',
        verified: false,
        metadata: {
          inconsistentTimestamp: true,
          photoTimestamp: '2025-02-10T12:00:00Z', // 1.5 years old photo!
        },
      },
    ],
    trackingSignals: {
      carrier: 'USPS Priority',
      trackingNumber: '9400111899562910291825',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
    },
  },
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'DEFECTIVE',
    customerMessage: 'Device has broken screen and does not turn on.',
    daysAfterDelivery: 6,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 45, totalOrders: 1, priorRefunds: 0, priorReturns: 0, priorChargebacks: 0 },
    evidence: [
      {
        type: 'PHOTO',
        description: 'Photo showing broken older model.',
        verified: false,
        metadata: {
          mismatchedModel: true,
          detectedDeviceModel: 'Legacy Gen 1', // Mismatched SKU
        },
      },
    ],
    trackingSignals: {
      carrier: 'UPS Ground',
      trackingNumber: '1Z9999999999999995',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
    },
  },
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'FRAUDULENT_CLAIM',
    customerMessage: 'Item missing from box upon arrival, only paper packing was inside.',
    daysAfterDelivery: 2,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 14, totalOrders: 2, priorRefunds: 2, priorReturns: 0, priorChargebacks: 2 },
    evidence: [],
    trackingSignals: {
      carrier: 'FedEx Express',
      trackingNumber: '782910481924',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: true,
      carrierNotes: 'Tamper-evident tape intact at delivery handover.',
    },
  },
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'DUPLICATE_CLAIM',
    customerMessage: 'Checking on my refund status, need the money credited again.',
    daysAfterDelivery: 12,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 250, totalOrders: 3, priorRefunds: 1, priorReturns: 0, priorChargebacks: 0 },
    duplicateClaim: true,
    evidence: [],
    trackingSignals: {
      carrier: 'DHL Express',
      trackingNumber: 'DHL928172616',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: true,
    },
  },
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'NOT_RECEIVED',
    customerMessage: 'I demand an instant refund right now or I will charge back.',
    daysAfterDelivery: null,
    fulfilmentStatus: 'IN_TRANSIT', // Not even delivered yet!
    customerProfile: { accountAgeDays: 3, totalOrders: 1, priorRefunds: 0, priorReturns: 0, priorChargebacks: 0 },
    evidence: [],
    trackingSignals: {
      carrier: 'USPS Ground',
      trackingNumber: '9400111899562910291826',
      status: 'IN_TRANSIT',
      deliveryGpsMatch: null,
      signatureObtained: false,
      carrierNotes: 'Package currently in sorting hub scheduled for delivery tomorrow.',
    },
  },
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'CHANGED_MIND',
    customerMessage: 'Wore this outfit to a 3-day gala. Sending back now. Tags removed and perfume applied.',
    daysAfterDelivery: 19,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 180, totalOrders: 2, priorRefunds: 1, priorReturns: 1, priorChargebacks: 0 },
    evidence: [
      {
        type: 'PHOTO',
        description: 'Photo showing cut tags, visible wear marks, and soiled lining.',
        verified: false,
      },
    ],
    trackingSignals: {
      carrier: 'UPS Ground',
      trackingNumber: '1Z9999999999999996',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
    },
  },
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'NOT_RECEIVED',
    customerMessage: 'Package was never handed over to freight consolidation warehouse.',
    daysAfterDelivery: 8,
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 40, totalOrders: 1, priorRefunds: 0, priorReturns: 0, priorChargebacks: 1 },
    evidence: [],
    trackingSignals: {
      carrier: 'FedEx Freight',
      trackingNumber: '782910481925',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: true,
      carrierNotes: 'Delivered to commercial bay dock #4, received and stamped by warehouse supervisor.',
    },
  },
  {
    groundTruth: 'NON_LEGITIMATE',
    reason: 'DEFECTIVE',
    customerMessage: 'Item completely stopped working. Customer refuses troubleshooting or return shipment.',
    daysAfterDelivery: 45, // Past 30-day window
    fulfilmentStatus: 'DELIVERED',
    customerProfile: { accountAgeDays: 150, totalOrders: 2, priorRefunds: 1, priorReturns: 0, priorChargebacks: 0 },
    evidence: [],
    trackingSignals: {
      carrier: 'USPS Priority',
      trackingNumber: '9400111899562910291827',
      status: 'DELIVERED',
      deliveryGpsMatch: true,
      signatureObtained: false,
    },
  },
];

export class SyntheticDataService {
  static async generateRequests(options: GenerateOptions) {
    const {
      brandId,
      productId,
      legitimateCount = 10,
      nonLegitimateCount = 10,
      seed = 42,
      dryRun = false,
    } = options;

    const prng = createPrng(seed);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { brand: true },
    });

    if (!product) {
      throw new Error(`Product not found with id: ${productId}`);
    }

    if (product.brandId !== brandId) {
      throw new Error(`Product ${product.name} does not belong to brand ${brandId}`);
    }

    // Pick scenarios with seeded shuffling
    const selectedScenarios: ScenarioTemplate[] = [];

    // Add legitimate scenarios
    for (let i = 0; i < legitimateCount; i++) {
      const idx = Math.floor(prng() * LEGITIMATE_SCENARIOS.length);
      selectedScenarios.push(LEGITIMATE_SCENARIOS[idx]);
    }

    // Add non-legitimate scenarios
    for (let i = 0; i < nonLegitimateCount; i++) {
      const idx = Math.floor(prng() * NON_LEGITIMATE_SCENARIOS.length);
      selectedScenarios.push(NON_LEGITIMATE_SCENARIOS[idx]);
    }

    // Shuffle combined array reproducibly
    for (let i = selectedScenarios.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      [selectedScenarios[i], selectedScenarios[j]] = [selectedScenarios[j], selectedScenarios[i]];
    }

    const now = new Date();
    const batchRef = `BATCH-${Math.floor(100000 + prng() * 900000)}`;

    const generatedItems = selectedScenarios.map((sc, index) => {
      const itemNum = String(index + 1).padStart(3, '0');
      const orderRef = `ORD-${product.sku.slice(0, 3)}-${Math.floor(100000 + prng() * 900000)}`;
      const customerRef = `CUST-${Math.floor(10000 + prng() * 90000)}`;
      const requestRef = `REF-${product.sku.slice(0, 3)}-${Math.floor(100000 + prng() * 900000)}`;

      // Calculate timestamps
      const daysAgoPurchased = (sc.daysAfterDelivery || 5) + Math.floor(prng() * 10) + 5;
      const purchasedAt = new Date(now.getTime() - daysAgoPurchased * 24 * 60 * 60 * 1000);
      
      let deliveredAt: Date | null = null;
      if (sc.fulfilmentStatus === 'DELIVERED' && sc.daysAfterDelivery !== null) {
        deliveredAt = new Date(now.getTime() - sc.daysAfterDelivery * 24 * 60 * 60 * 1000);
      }

      const requestedAt = new Date(now.getTime() - Math.floor(prng() * 24) * 60 * 60 * 1000);

      const requestedAmount = sc.reason === 'MISSING_ITEM'
        ? Math.round(product.unitPrice / 2)
        : product.unitPrice;

      return {
        itemIndex: index + 1,
        requestRef,
        orderRef,
        customerRef,
        brandId,
        productId,
        productName: product.name,
        productSku: product.sku,
        unitPrice: product.unitPrice,
        requestedAmount,
        currency: product.currency,
        purchasedAt,
        deliveredAt,
        requestedAt,
        reason: sc.reason,
        customerMessage: sc.customerMessage,
        groundTruthLabel: sc.groundTruth,
        fulfilmentStatus: sc.fulfilmentStatus,
        customerProfile: sc.customerProfile,
        evidence: sc.evidence,
        trackingSignals: sc.trackingSignals,
        duplicateClaim: Boolean(sc.duplicateClaim),
      };
    });

    if (dryRun) {
      return {
        preview: true,
        batchRef,
        totalCount: generatedItems.length,
        legitimateCount,
        nonLegitimateCount,
        seed,
        items: generatedItems,
      };
    }

    // Persist batch and records in a transaction
    return await prisma.$transaction(async (tx) => {
      const batch = await tx.processingBatch.create({
        data: {
          brandId,
          productId,
          status: 'PENDING',
          totalCount: generatedItems.length,
          processedCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          manualReviewCount: 0,
          failedCount: 0,
          provider: 'LOCAL_DEMO',
        },
      });

      const createdRequests = [];

      for (const item of generatedItems) {
        // Find or create synthetic customer
        const customer = await tx.customer.upsert({
          where: { syntheticCustomerRef: item.customerRef },
          update: {
            totalOrders: item.customerProfile.totalOrders,
            priorRefundCount: item.customerProfile.priorRefunds,
            priorReturnCount: item.customerProfile.priorReturns,
            priorChargebackCount: item.customerProfile.priorChargebacks,
          },
          create: {
            syntheticCustomerRef: item.customerRef,
            accountCreatedAt: new Date(now.getTime() - item.customerProfile.accountAgeDays * 24 * 60 * 60 * 1000),
            totalOrders: item.customerProfile.totalOrders,
            priorRefundCount: item.customerProfile.priorRefunds,
            priorReturnCount: item.customerProfile.priorReturns,
            priorChargebackCount: item.customerProfile.priorChargebacks,
          },
        });

        // Create Order
        const order = await tx.order.create({
          data: {
            orderRef: item.orderRef,
            customerId: customer.id,
            brandId,
            productId,
            quantity: 1,
            amount: item.unitPrice,
            currency: item.currency,
            purchasedAt: item.purchasedAt,
            deliveredAt: item.deliveredAt,
            fulfilmentStatus: item.fulfilmentStatus,
            deliveryEvidence: JSON.stringify(item.trackingSignals),
          },
        });

        // Create RefundRequest
        const refundRequest = await tx.refundRequest.create({
          data: {
            requestRef: item.requestRef,
            orderId: order.id,
            customerId: customer.id,
            productId,
            reason: item.reason,
            customerMessage: item.customerMessage,
            requestedAmount: item.requestedAmount,
            currency: item.currency,
            requestedAt: item.requestedAt,
            evidence: JSON.stringify(item.evidence),
            groundTruthLabel: item.groundTruthLabel,
            status: 'PENDING',
            batchId: batch.id,
          },
        });

        // If duplicate claim simulation, create a previous refund record
        if (item.duplicateClaim) {
          await tx.refundTransaction.create({
            data: {
              refundRequestId: refundRequest.id,
              amount: item.requestedAmount,
              currency: item.currency,
              status: 'SIMULATED_COMPLETED',
              reference: `PREV-TXN-${Math.floor(100000 + prng() * 900000)}`,
            },
          });
        }

        createdRequests.push(refundRequest);
      }

      // Record Audit Event
      await tx.auditEvent.create({
        data: {
          entityType: 'BATCH',
          entityId: batch.id,
          eventType: 'GENERATED',
          actor: 'demo_operator',
          details: JSON.stringify({
            brandId,
            productId,
            productName: product.name,
            totalGenerated: generatedItems.length,
            legitimateCount,
            nonLegitimateCount,
            seed,
          }),
        },
      });

      return {
        batchId: batch.id,
        totalGenerated: createdRequests.length,
        legitimateCount,
        nonLegitimateCount,
        seed,
        product: { id: product.id, name: product.name, sku: product.sku },
        brand: { id: product.brand.id, name: product.brand.name },
      };
    });
  }
}
