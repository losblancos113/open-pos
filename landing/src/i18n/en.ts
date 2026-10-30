export const en = {
  nav: {
    brand: 'Open POS',
    tagline: 'Open Source POS Engine',
    features: 'Features',
    demo: 'Interactive Demo',
    architecture: 'LAN Architecture',
    comparison: 'Comparison',
    freedom: '100% Free',
    faq: 'FAQ',
    github: 'Source Code',
    download: 'Download App',
  },
  hero: {
    badge: '100% Free & Open-Source Offline POS for Restaurants & Cafés',
    titleLine1: 'Smooth checkout operations, even when',
    titleHighlight: 'the internet goes down.',
    description:
      'A modern point-of-sale system engineered for food and beverage operators. 100% offline-first, peer-to-peer LAN mesh sync across cashier & waiter terminals, native VietQR dynamic checkout, and lossless integer accounting.',
    ctaDownload: 'Download Free Application',
    ctaGithub: 'Explore GitHub Source',
    ctaDemo: 'Try Cashier Simulator ↓',
    pills: [
      { text: '100% Free Forever, $0/month', icon: 'check' },
      { text: '100% Offline-First', icon: 'wifi-off' },
      { text: 'PouchDB LAN Mesh Sync', icon: 'refresh' },
      { text: 'Lightweight Tauri 2 (~15MB RAM)', icon: 'zap' },
    ],
  },
  stats: {
    stat1Value: '$0 / 0 ₫',
    stat1Label: 'Monthly recurring subscription fee',
    stat2Value: '100%',
    stat2Label: 'Uptime during ISP cable outages',
    stat3Value: '< 15 ms',
    stat3Label: 'Local network LAN sync latency',
    stat4Value: '0 drift',
    stat4Label: 'VND integer accounting rounding error',
  },
  simulator: {
    badge: 'Live Interactive Sandbox',
    title: 'Experience Open POS Cashier in Real Time',
    subtitle:
      'Tap dishes below, adjust quantities, split bills with zero lost minor units, and preview instant dynamic QR payments.',
    categories: {
      all: 'All Items',
      coffee: 'Coffee & Tea',
      food: 'Main Dishes',
      dessert: 'Pastries & Snacks',
    },
    menu: {
      item1: 'Saigon Iced Milk Coffee',
      item1Desc: 'Traditional drip brew with rich condensed milk',
      item2: 'Special Beef Phở Noodle',
      item2Desc: '12-hour bone broth, tender brisket & rare beef',
      item3: 'Sizzling Pan Bánh Mì',
      item3Desc: 'Hot liver pâté, sunny eggs, meatballs, and sausage',
      item4: 'Peach Orange Lemongrass Tea',
      item4Desc: 'Refreshing lemongrass aroma with crisp sweet peach',
      item5: 'Three-Layer Iced Bạc Xỉu',
      item5Desc: 'Velvety milk forward with fragrant espresso hint',
      item6: 'Fresh Butter Croissant',
      item6Desc: 'Golden flaky layers baked fresh daily',
    },
    orderPanel: {
      title: 'Current Cashier Order',
      table: 'Table 04 — Garden Terrace',
      empty: 'Cart is empty. Click any item on the left menu to begin.',
      subtotal: 'Subtotal:',
      discount: 'Member Discount (10%):',
      total: 'Total Due:',
      btnSplit: 'Split Bill Equally',
      btnVietQr: 'Generate VietQR',
      btnCash: 'Cash Payment',
      splitNotice: 'Split {count} ways: {amount} each (Largest-remainder allocation guarantees zero lost minor units).',
      paidSuccess: '✓ Payment received successfully!',
    },
    qrModal: {
      title: 'Instant Dynamic VietQR',
      desc: 'Scan with any mobile banking app to settle the exact order amount.',
      accountName: 'OPEN POS VIETNAM CO., LTD',
      bank: 'Vietcombank — 0071001234567',
      transferContent: 'PAY TABLE 04 #HD-8921',
      btnDone: 'Confirm Payment Received',
      btnClose: 'Close',
    },
  },
  architecture: {
    badge: 'Architecture & Resilience',
    title: 'Local Network Mesh Sync: When Internet Cuts, Sales Keep Rolling',
    subtitle:
      'No reliance on distant cloud servers. Open POS persists data locally with PouchDB and replicates directly between terminals via your venue’s Wi-Fi router.',
    nodes: {
      hubTitle: 'Main Cashier Terminal (PouchDB Hub)',
      hubDesc: 'Lightweight sidecar hub runs right on your primary counter PC. Stores order history and coordinates local replication.',
      waiterTitle: 'Waiter Order Tablets',
      waiterDesc: 'Staff takes orders table-side and syncs back to the bar/cashier in <10ms through the local LAN.',
      kitchenTitle: 'Kitchen Display System / Ticket Printer',
      kitchenDesc: 'Kitchen line sees tickets immediately and prints receipts via standard ESC/POS without touching the internet.',
    },
    features: [
      {
        title: 'Bulletproof ISP Outage Protection',
        desc: 'Subsea cable cuts or local broadband glitches will never stall your service. Orders, tickets, and cashiers stay 100% operational.',
      },
      {
        title: 'Zero Cloud Latency',
        desc: 'Every tap responds at a crisp 60 FPS. Say goodbye to the spinning loading wheel while waiting for remote servers to answer.',
      },
      {
        title: 'Total Data Sovereignty',
        desc: 'Revenue stats, client history, and secret recipes remain exclusively yours on your local machine, fully under your control.',
      },
    ],
  },
  featuresGrid: {
    badge: 'Core Capabilities',
    title: 'Engineered for Speed, Durability, and Real Operations',
    subtitle:
      'Every technical architectural decision was made to survive your busiest Friday night rush.',
    items: [
      {
        title: 'Lossless Integer Money Accounting',
        desc: 'Money is modeled strictly as integer minor units. Bill splits use deterministic largest-remainder math so numbers match down to the exact single unit with zero float rounding errors.',
        tag: 'Exact Math',
      },
      {
        title: 'Visual Type Registry Schema',
        desc: 'Add custom fields on the fly: sugar & ice levels, toppings, doneness, table attributes, and special modifiers without touching source code.',
        tag: 'Extensible Schema',
      },
      {
        title: 'Featherlight Tauri 2 & Rust',
        desc: 'Consuming just ~15-25MB RAM, launching up to 10x faster than bloated Electron wrappers. Runs smoothly on modest touchscreen hardware.',
        tag: '60 FPS Native',
      },
      {
        title: 'Standard Bank VietQR Integration',
        desc: 'Generates dynamic Napas247 QR codes containing exact transaction sums and invoice references. Funds land directly in the owner’s bank account.',
        tag: 'Instant QR',
      },
      {
        title: 'Universal ESC/POS Thermal Printing',
        desc: 'Plug and play with standard 80mm and 58mm thermal printers over USB, LAN network cables, or Bluetooth without forced vendor lock-in.',
        tag: 'Universal Hardware',
      },
      {
        title: 'Thoughtful Ergonomic Interface',
        desc: 'Designed with high contrast, generous touch targets, and clear visual feedback to minimize operator fatigue during double shifts.',
        tag: 'Ergonomic UI',
      },
    ],
  },
  comparison: {
    badge: 'Transparent Comparison',
    title: 'Why Restaurants Are Switching to Open POS',
    subtitle:
      'An honest comparison between free open-source Open POS, subscription cloud software, and outdated legacy systems.',
    colCriterion: 'Evaluation Criteria',
    colOpenPos: 'Open POS (Open Source)',
    colCloud: 'Cloud POS (Subscription)',
    colLegacy: 'Legacy Windows POS',
    rows: [
      {
        criterion: 'Software License Fee',
        openPos: '$0 / 0₫ Forever (100% Free)',
        cloud: '$20 – $80 / month / terminal',
        legacy: '$300 – $1,000 upfront buyout',
      },
      {
        criterion: 'When Internet Fails',
        openPos: '100% uninterrupted sales & printing',
        cloud: 'Freezes, throws errors, or halts',
        legacy: 'Runs offline but lacks modern sync',
      },
      {
        criterion: 'Multi-Terminal LAN Sync',
        openPos: 'Automatic PouchDB Wi-Fi replication',
        cloud: 'Mandatory external internet required',
        legacy: 'Fragile SQL Server setup with high IT cost',
      },
      {
        criterion: 'Data Ownership & Privacy',
        openPos: '100% stored on your local hardware',
        cloud: 'Locked in vendor cloud servers',
        legacy: 'Local files prone to unbacked corruptions',
      },
      {
        criterion: 'Hardware Resource Footprint',
        openPos: 'Featherlight (~15–25 MB RAM, Tauri 2)',
        cloud: 'Heavy memory footprint (500MB+ in browser)',
        legacy: 'Clunky archaic UI framework',
      },
      {
        criterion: 'Extensibility & Community',
        openPos: 'Fully open source, customizable schema',
        cloud: 'Proprietary, closed walled garden',
        legacy: 'End-of-life, zero new updates',
      },
    ],
  },
  freedom: {
    badge: 'Our Open Promise',
    title: 'Why is Open POS 100% Free? Where is the Catch?',
    subtitle:
      'No 14-day trial traps. No hidden paywalls. No sponsored ads. Here is why we built this.',
    cards: [
      {
        title: 'Ending the Subscription Tax on Small Businesses',
        desc: 'Small café and restaurant owners already juggle rent, rising food costs, and staffing. Fundamental point-of-sale software should be basic digital infrastructure, not an unending monthly rent on your hard work.',
      },
      {
        title: 'Direct Payments, Zero Middleman Fees',
        desc: 'When customers scan VietQR or hand over cash, 100% of the funds go straight into your bank account. Open POS does not sit in the transaction path and never takes percentage cuts.',
      },
      {
        title: 'Empowered by Modern Open Technologies',
        desc: 'Built on world-class open-source foundations (Vue 3, Tauri 2, Rust, PouchDB). Open POS is auditable, resilient, and community-driven.',
      },
    ],
  },
  faq: {
    badge: 'Got Questions?',
    title: 'Frequently Asked Questions',
    subtitle: 'Everything you need to know before deploying Open POS at your venue.',
    items: [
      {
        q: 'Is Open POS truly 100% free of charge?',
        a: 'Yes, absolutely. Open POS is released under a free and open-source license. You can download, install, and run it across any number of computers, tablets, or branches without paying licensing or renewal fees.',
      },
      {
        q: 'What happens if our restaurant internet goes down during peak hours?',
        a: 'Nothing stops. Open POS is built offline-first from the ground up. All menu items, prices, tables, and receipts are saved locally on your terminal. Terminals continue to synchronize seamlessly across your venue’s local Wi-Fi router.',
      },
      {
        q: 'Can I reuse my existing thermal printers and cash drawers?',
        a: 'Yes. Open POS supports standard ESC/POS protocol across 80mm (K80) and 58mm (K58) thermal printers via USB, local LAN cable, or Bluetooth. RJ11 cash drawers connected to the printer pop open automatically upon payment.',
      },
      {
        q: 'How do I connect multiple cashier terminals and order tablets?',
        a: 'Your main cashier machine runs the built-in Hub service. Waiter tablets connected to the same restaurant Wi-Fi simply enter the hub’s local IP address to establish instant, two-way replication in real time.',
      },
      {
        q: 'How do I receive updates and new features?',
        a: 'You can download the latest installer releases directly from the GitHub repository or update seamlessly through the Settings panel inside the app.',
      },
    ],
  },
  cta: {
    title: 'Ready to elevate your restaurant operations?',
    subtitle:
      'Download Open POS today and embrace true freedom: zero monthly fees, zero cloud downtime, and 100% control over your data.',
    btnDownload: 'Download Free (Windows, macOS, Linux)',
    btnGithub: 'Join the GitHub Community',
    badge: 'Open Source • Free License • Zero Vendor Lock-in',
    latest: 'Latest version',
    loading: 'Fetching download links…',
    downloadFor: 'Download for {platform}',
    viewReleases: 'View all releases on GitHub',
    platforms: {
      windows: { label: 'Windows 10/11', formats: 'MSI / EXE' },
      macos: { label: 'macOS', formats: 'DMG (Universal)' },
      linux: { label: 'Linux', formats: 'AppImage / DEB' },
    },
  },
  footer: {
    brand: 'Open POS',
    desc: 'The next-generation offline-first Point of Sale system for restaurants, cafés, and retail businesses.',
    navigation: 'Navigation',
    community: 'Community',
    license: 'Free and open-source software. Crafted with passion for modern tech and deep respect for hospitality entrepreneurs.',
    rights: '© 2026 Open POS Project. All rights reserved.',
  },
};
