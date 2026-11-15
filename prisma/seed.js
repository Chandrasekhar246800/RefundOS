const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial demo data...');

  // 1. Initial Refund Policy v1.0
  const policyConfig = {
    policyWindowDays: 30,
    maxInstantApprovalAmount: 25000, // $250.00 in minor units
    highValueManualReviewThreshold: 30000, // $300.00
    maxPriorRefundsBeforeReview: 3,
    maxPriorChargebacksBeforeReject: 1,
    requireDeliveryProofForNonReceipt: true,
    requireImageForDamaged: true,
    allowOpenedPackaging: true,
  };

  const policy = await prisma.refundPolicy.upsert({
    where: { version: 'v1.0' },
    update: {
      name: 'Standard Consumer Demo Policy v1.0',
      configuration: JSON.stringify(policyConfig),
      active: true,
    },
    create: {
      version: 'v1.0',
      name: 'Standard Consumer Demo Policy v1.0',
      configuration: JSON.stringify(policyConfig),
      active: true,
    },
  });
  console.log(`✓ Active policy initialized: ${policy.version}`);

  // 2. System Settings
  const settings = [
    { key: 'ACTIVE_PROVIDER', value: 'LAYA' },
    { key: 'LAYA_API_BASE_URL', value: 'https://api.laya-ai.com' },
    { key: 'LAYA_MODEL', value: 'typed-decisions' },
    { key: 'CONCURRENCY_LIMIT', value: '3' },
    { key: 'REQUEST_TIMEOUT_MS', value: '15000' },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }
  console.log('✓ System settings initialized');

  // 3. Seed Brands & Products
  const brandsData = [
    {
      name: 'Aura Apparel',
      category: 'Apparel & Fashion',
      description: 'Contemporary minimalist clothing engineered from sustainable natural fibers.',
      currency: 'USD',
      status: 'ACTIVE',
      products: [
        {
          name: 'Merino Wool Crewneck',
          sku: 'AUR-MER-001',
          category: 'Knitwear',
          description: '100% ultrafine Australian merino wool sweater, thermoregulating and odor-resistant.',
          unitPrice: 8500, // $85.00
          currency: 'USD',
          status: 'ACTIVE',
        },
        {
          name: 'Tailored Linen Trousers',
          sku: 'AUR-LIN-002',
          category: 'Bottoms',
          description: 'Relaxed taper linen blend trousers with concealed drawstring waistband.',
          unitPrice: 11000, // $110.00
          currency: 'USD',
          status: 'ACTIVE',
        },
        {
          name: 'Waterproof Commuter Parka',
          sku: 'AUR-PRK-003',
          category: 'Outerwear',
          description: '3-layer seam-sealed breathable shell with magnetic storm flaps.',
          unitPrice: 24000, // $240.00
          currency: 'USD',
          status: 'ACTIVE',
        },
      ],
    },
    {
      name: 'Volt Electronics',
      category: 'Consumer Electronics',
      description: 'Precision-engineered wireless audio and high-performance charging peripherals.',
      currency: 'USD',
      status: 'ACTIVE',
      products: [
        {
          name: 'Pulse Pro Wireless ANC Earbuds',
          sku: 'VLT-ANC-101',
          category: 'Audio',
          description: 'Active noise cancellation earbuds with spatial audio and 32hr battery life.',
          unitPrice: 14900, // $149.00
          currency: 'USD',
          status: 'ACTIVE',
        },
        {
          name: 'OmniCharge 100W GaN Station',
          sku: 'VLT-GAN-102',
          category: 'Power & Accessories',
          description: 'Quad-port GaN fast desktop charger capable of powering two laptops simultaneously.',
          unitPrice: 6900, // $69.00
          currency: 'USD',
          status: 'ACTIVE',
        },
        {
          name: 'AeroGlide Mechanical Keyboard',
          sku: 'VLT-KBD-103',
          category: 'Computer Peripherals',
          description: 'Hot-swappable gasket-mounted wireless mechanical keyboard with aluminum body.',
          unitPrice: 12900, // $129.00
          currency: 'USD',
          status: 'ACTIVE',
        },
      ],
    },
    {
      name: 'Stride Athletic',
      category: 'Footwear & Performance',
      description: 'Elite road running, trail exploration, and orthotic recovery footwear.',
      currency: 'USD',
      status: 'ACTIVE',
      products: [
        {
          name: 'CarbonFlow Marathon Runners',
          sku: 'STR-RUN-201',
          category: 'Footwear',
          description: 'Full-length carbon fiber propulsion plate with supercritical nitrogen foam midsole.',
          unitPrice: 18000, // $180.00
          currency: 'USD',
          status: 'ACTIVE',
        },
        {
          name: 'All-Terrain Trail Climber',
          sku: 'STR-TRL-202',
          category: 'Footwear',
          description: 'Vibram Megagrip lug outsole with reinforced ripstop water-resistant upper.',
          unitPrice: 16500, // $165.00
          currency: 'USD',
          status: 'ACTIVE',
        },
        {
          name: 'Recovery Cloud Slide',
          sku: 'STR-SLD-203',
          category: 'Footwear',
          description: 'Biomechanically molded arch support slide for post-run recovery.',
          unitPrice: 4500, // $45.00
          currency: 'USD',
          status: 'ACTIVE',
        },
      ],
    },
    {
      name: 'Haven Living',
      category: 'Home & Kitchen',
      description: 'Modern artisanal kitchenware and certified organic home textiles.',
      currency: 'USD',
      status: 'ACTIVE',
      products: [
        {
          name: 'Ceramic Pour-Over Kettle',
          sku: 'HVN-KTL-301',
          category: 'Kitchenware',
          description: 'Precision gooseneck electric kettle with variable temperature control.',
          unitPrice: 7500, // $75.00
          currency: 'USD',
          status: 'ACTIVE',
        },
        {
          name: 'Organic Percale Sheet Set',
          sku: 'HVN-SHT-302',
          category: 'Bedding',
          description: '400 thread count GOTS certified long-staple organic cotton sheet set.',
          unitPrice: 14000, // $140.00
          currency: 'USD',
          status: 'ACTIVE',
        },
        {
          name: 'Nordic Walnut Accent Lamp',
          sku: 'HVN-LMP-303',
          category: 'Home Decor',
          description: 'Solid FSC-certified walnut wood table lamp with hand-blown frosted glass shade.',
          unitPrice: 9500, // $95.00
          currency: 'USD',
          status: 'ACTIVE',
        },
      ],
    },
  ];

  for (const bData of brandsData) {
    const { products, ...brandFields } = bData;
    const brand = await prisma.brand.upsert({
      where: { name: brandFields.name },
      update: brandFields,
      create: brandFields,
    });

    for (const pData of products) {
      await prisma.product.upsert({
        where: { sku: pData.sku },
        update: { ...pData, brandId: brand.id },
        create: { ...pData, brandId: brand.id },
      });
    }
  }

  console.log(`✓ Seeded ${brandsData.length} brands with at least 3 products each.`);

  // Audit event for initialization
  await prisma.auditEvent.create({
    data: {
      entityType: 'DEMO',
      entityId: 'seed_init',
      eventType: 'SEEDED',
      actor: 'system',
      details: JSON.stringify({ message: 'Initial demo dataset seeded successfully' }),
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
