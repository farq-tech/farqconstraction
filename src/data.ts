import type { BOQItem, RFQSummary, SupplierEntry } from './types'

export const BOQ_ITEMS: BOQItem[] = [
  {
    id: 1, name: 'بورسلان أرضيات', qty: '5,600', unit: 'م²',
    spec: '60×60 سم · لون حسب اعتماد الاستشاري',
    status: 'ready', supplierCount: 14,
    suppliers: [
      { id: 1, name: 'الخزف السعودي', city: 'الرياض', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 2, name: 'شركة البيت الحديث', city: 'جدة', evidence: 'نشاط متطابق', channel: 'واتساب' },
      { id: 3, name: 'مورد الخليج', city: 'الدمام', evidence: 'دليل منتج', channel: 'بريد' },
      { id: 4, name: 'مصنع السلام للبورسلان', city: 'الرياض', evidence: 'دليل منتج', channel: 'واتساب' },
    ],
  },
  {
    id: 2, name: 'سيراميك حوائط', qty: '976', unit: 'م²',
    spec: '30×60 سم · أبيض ناصع',
    status: 'ready', supplierCount: 9,
    suppliers: [
      { id: 1, name: 'الخزف السعودي', city: 'الرياض', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 5, name: 'سيراميك الجزيرة', city: 'جدة', evidence: 'نشاط متطابق', channel: 'واتساب' },
      { id: 6, name: 'توب سيراميك', city: 'الرياض', evidence: 'دليل منتج', channel: 'بريد' },
    ],
  },
  {
    id: 3, name: 'حديد تسليح', qty: '770', unit: 'طن',
    spec: 'SABIC Grade 60 · قطر 12–25مم',
    status: 'ready', supplierCount: 7,
    suppliers: [
      { id: 7, name: 'حديد سابك', city: 'الجبيل', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 8, name: 'الصلب العربي', city: 'الرياض', evidence: 'نشاط متطابق', channel: 'بريد' },
      { id: 9, name: 'الحديد الوطني', city: 'الدمام', evidence: 'دليل منتج', channel: 'واتساب' },
    ],
  },
  {
    id: 4, name: 'كابلات نحاسية', qty: '2,210', unit: 'م ط',
    spec: 'NYY 4×10mm² · 600V',
    status: 'ready', supplierCount: 11,
    suppliers: [
      { id: 10, name: 'كابلات الرياض', city: 'الرياض', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 11, name: 'LAPP Arabia', city: 'جدة', evidence: 'نشاط متطابق', channel: 'بريد' },
      { id: 12, name: 'الكابلات الوطنية', city: 'الدمام', evidence: 'دليل منتج', channel: 'واتساب' },
    ],
  },
  {
    id: 5, name: 'لوحات توزيع', qty: '12', unit: 'عدد',
    spec: '400A Main DB · IP65',
    status: 'ready', supplierCount: 5,
    suppliers: [
      { id: 13, name: 'ABB Arabia', city: 'الرياض', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 14, name: 'Siemens SA', city: 'الرياض', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 15, name: 'لوحات الخليج', city: 'جدة', evidence: 'دليل منتج', channel: 'واتساب' },
    ],
  },
  {
    id: 6, name: 'وحدات إنارة', qty: '1,460', unit: 'عدد',
    spec: 'LED Panel 60×60 · 36W · 4000K',
    status: 'ready', supplierCount: 8,
    suppliers: [
      { id: 16, name: 'فيليبس العربية', city: 'الرياض', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 17, name: 'GE Lighting Arabia', city: 'جدة', evidence: 'نشاط متطابق', channel: 'بريد' },
      { id: 18, name: 'نور الخليج', city: 'الدمام', evidence: 'نشاط متطابق', channel: 'واتساب' },
    ],
  },
  {
    id: 7, name: 'ألواح جبسوم بورد', qty: '1,750', unit: 'م²',
    spec: '12mm Standard · ISO 6308',
    status: 'ready', supplierCount: 6,
    suppliers: [
      { id: 19, name: 'كنوف العربية', city: 'الرياض', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 20, name: 'سعودي جبس', city: 'الرياض', evidence: 'نشاط متطابق', channel: 'واتساب' },
      { id: 21, name: 'مصنع الجبس', city: 'جدة', evidence: 'دليل منتج', channel: 'بريد' },
    ],
  },
  {
    id: 8, name: 'عازل بيتومين', qty: '2,100', unit: 'م²',
    spec: 'APP Modified 4mm · ASTM D6153',
    status: 'ready', supplierCount: 4,
    suppliers: [
      { id: 22, name: 'سيكا السعودية', city: 'الرياض', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 23, name: 'السعودية للعزل', city: 'جدة', evidence: 'نشاط متطابق', channel: 'واتساب' },
      { id: 24, name: 'بيتومين الخليج', city: 'الدمام', evidence: 'دليل منتج', channel: 'بريد' },
    ],
  },
  {
    id: 9, name: 'خرسانة جاهزة C40', qty: '4,265', unit: 'م³',
    spec: 'C40/20mm aggregate · SASO 1016',
    status: 'ready', supplierCount: 5,
    suppliers: [
      { id: 25, name: 'بتروجي للخرسانة', city: 'الرياض', evidence: 'دليل مباشر', channel: 'بريد' },
      { id: 26, name: 'الخرسانة الجاهزة', city: 'الرياض', evidence: 'نشاط متطابق', channel: 'بريد' },
      { id: 27, name: 'مصنع الخرسانة الوطني', city: 'جدة', evidence: 'دليل منتج', channel: 'واتساب' },
    ],
  },
  {
    id: 10, name: 'باب زجاجي سحاب', qty: '7', unit: 'عدد',
    spec: 'Frameless glass sliding · 90×210 سم',
    status: 'searching', supplierCount: 1,
    suppliers: [
      { id: 28, name: 'زجاج الرياض', city: 'الرياض', evidence: 'نشاط متطابق', channel: 'واتساب' },
    ],
  },
]

export const ALL_RFQS: RFQSummary[] = [
  {
    id: 'RFQ-2024-089', name: 'تجديد مبنى إداري — الرياض',
    items: 65, offers: 18, suppliers: 92,
    status: 'active', date: '14 سبتمبر 2026', deadline: '16 سبتمبر 2026',
  },
  {
    id: 'RFQ-2024-077', name: 'توسعة مستشفى المعادي',
    items: 42, offers: 38, suppliers: 67,
    status: 'awarded', date: '7 سبتمبر 2026', deadline: '10 سبتمبر 2026',
  },
  {
    id: 'RFQ-2024-061', name: 'برج الأعمال — الخبر',
    items: 91, offers: 0, suppliers: 0,
    status: 'draft', date: '1 سبتمبر 2026',
  },
  {
    id: 'RFQ-2024-055', name: 'فلل الواحة السكنية',
    items: 33, offers: 28, suppliers: 54,
    status: 'closed', date: '25 أغسطس 2026', deadline: '28 أغسطس 2026',
  },
  {
    id: 'RFQ-2024-041', name: 'مركز تجاري — جدة',
    items: 118, offers: 94, suppliers: 140,
    status: 'awarded', date: '10 أغسطس 2026', deadline: '14 أغسطس 2026',
  },
  {
    id: 'RFQ-2024-030', name: 'مدرسة حكومية — الدمام',
    items: 27, offers: 0, suppliers: 0,
    status: 'draft', date: '5 أغسطس 2026',
  },
]

export const RECENT_RFQS = ALL_RFQS.slice(0, 3)

export const SUPPLIER_LIST: SupplierEntry[] = [
  { id: 1, name: 'الخزف السعودي', city: 'الرياض', category: 'بورسلان وسيراميك', phone: '0112345001', email: 'sales@saudi-ceramic.com.sa', interactions: 14, lastSeen: 'منذ يومين' },
  { id: 2, name: 'سيكا السعودية', city: 'الرياض', category: 'مواد عزل وكيماويات', phone: '0112345002', email: 'sa@sika.com', interactions: 8, lastSeen: 'منذ أسبوع' },
  { id: 3, name: 'كابلات الرياض', city: 'الرياض', category: 'كابلات وأسلاك', phone: '0112345003', email: 'info@riyadh-cables.sa', interactions: 6, lastSeen: 'منذ 3 أيام' },
  { id: 4, name: 'حديد سابك', city: 'الجبيل', category: 'حديد ومعادن', phone: '0135001000', email: 'steel@sabic.com', interactions: 5, lastSeen: 'منذ أسبوعين' },
  { id: 5, name: 'فيليبس العربية', city: 'الرياض', category: 'إنارة وكهرباء', phone: '0112345004', email: 'lighting@philips-ar.com', interactions: 9, lastSeen: 'منذ 5 أيام' },
  { id: 6, name: 'كنوف العربية', city: 'الرياض', category: 'جبسوم بورد وتشطيب', phone: '0112345005', email: 'sales@knauf-ar.com', interactions: 4, lastSeen: 'منذ شهر' },
  { id: 7, name: 'بتروجي للخرسانة', city: 'الرياض', category: 'خرسانة جاهزة', phone: '0112345006', email: 'info@petrogy.sa', interactions: 3, lastSeen: 'منذ 10 أيام' },
  { id: 8, name: 'ABB Arabia', city: 'الرياض', category: 'لوحات توزيع وكهرباء', phone: '0112345007', email: 'sales@abb-ar.com', interactions: 7, lastSeen: 'منذ 4 أيام' },
]
