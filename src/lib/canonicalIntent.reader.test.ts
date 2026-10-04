import { describe, expect, it } from 'vitest'
import { buildOntologyResolution, isGeneralRequirements, unglueBullets } from './canonicalIntent'

// Every example below is a production booklet line from the cpo-v21 audit
// (/Users/m4pro/farq-eval/booklet-lines.json), F143–F146.

const read = (name: string) => buildOntologyResolution(name)!

describe('F143 — a list bullet glued to the first letter', () => {
  it('removes the bullet only where the rest is a known word', () => {
    expect(unglueBullets('أطفاية حريق نوع')).toBe('طفاية حريق نوع')
    expect(unglueBullets('أمبير ثناق القطبية رم مفتاح أمفتاح فصل')).toBe('أمبير ثناق القطبية رم مفتاح مفتاح فصل')
    expect(unglueBullets('إمخرج هواء')).toBe('مخرج هواء')
  })

  it('leaves real words that start with a hamza exactly as printed', () => {
    for (const word of ['أكسيد', 'أمبير', 'أمنية', 'أبواب', 'إنارة', 'أنابيب', 'أرضيات']) {
      expect(unglueBullets(word)).toBe(word)
    }
  })

  it('a bare alef is not a bullet: only «أ» and «إ» are', () => {
    expect(unglueBullets('اطفاية حريق')).toBe('اطفاية حريق')
  })

  it('names the line once the bullet is gone', () => {
    const r = read('أطفاية حريق نوع')
    expect(r.canonical_intent_id).toBe('fire_extinguisher')
    expect(r.reader_reread).toMatchObject({ fix: 'glued_bullet' })
    expect(read('أرشاشات حريق من النوع المتدلي').canonical_intent_id).toBe('fire_sprinkler')
    expect(read('أمرحاض غربي نوع خاص بذوى الاحتياجات الخاصه').canonical_intent_id).toBe('wc_sanitaryware')
    expect(read('أصمام كروي لمواسير الغازات مم الطبيه قابل للقفل قطر').canonical_intent_id).toBe('ball_valve')
  })

  it('an un-glued word that did not decide the answer is not credited', () => {
    const r = read('الحشوء العزل وأعتاب الخرسانة الأسمنتية المسلحة مواد فوق الفتحات مواد مواد أجدار بسمك مم أجدار بسمك مم')
    expect(r.reader_reread).toBeUndefined()
  })

  it('a line that already resolves is never re-read', () => {
    const r = read('طفاية حريق')
    expect(r.canonical_intent_id).toBe('fire_extinguisher')
    expect(r.reader_reread).toBeUndefined()
  })
})

describe('F144 — a long work preamble before the product', () => {
  it('drops «تسليم», «وضع في الخدمة», «برمجة» too, for matching only', () => {
    const r = read('توريد وتركيب وبرمجة وتوصيل واختبار لوحة نظام أنذار الحريق الرئيسية المعنونة 16 العمليات')
    expect(r.canonical_intent_id).toBe('fire_alarm_system')
    expect(r.reader_reread).toMatchObject({ fix: 'work_preamble' })
    const s = read('توريد وتركيب وأختبار وتسليم ووضع في الخدمة منظومة أنذار ضد الحريق معنونه شامل')
    expect(s.family).toBe('fire_detection_alarm')
  })

  it('a preamble with nothing after it stays unnamed', () => {
    expect(read('توريد وتركيب وأختبار وتسليم ووضع في الخدمة نظام').canonical_intent_id).toBeNull()
  })
})

describe('F145 — two booklet rows joined with « — »', () => {
  it('keeps the part that opens with its material when the other is a tail', () => {
    const r = read('سماكة 44 ملم وتشتمل علي الخردوات والعتبات والخرسانة المالئة لإلطارات والتثبيت والتشطيب — باب دوار أحادي من الصلب مع فتحات')
    expect(r.canonical_intent_id).toBe('automatic_door')
    expect(r.reader_reread).toMatchObject({ fix: 'merged_row' })
  })

  it('never takes a tail that only mentions a material («وكابلات …», «مثبتة على …»)', () => {
    const fax = read('قسم جهاز فاكس مع جميع ملحقاته مع مراعاة الالتزام بجميع منتجات القائمة الالزامية — وكابلات الالياف الضوئية لكل مقعد')
    expect(fax.canonical_intent_id).toBeNull()
    const pit = read('ارضى مغطاه باغطيه من الحديد الزهر موضوع حول المبنى كل الاعمال الالزمة و التوصيالت — مثبتة على الحائط / السقف لنقاط الوصول اللاسلكية')
    expect(pit.canonical_intent_id).toBeNull()
  })

  it('two items in one line stay as they were', () => {
    const r = read('توريد وتركيب أسقف معلقة من بلاطات الألمنيوم المثقبة مقاس — توريد وتركيب بلاط سيراميك مضغوط')
    expect(r.canonical_intent_id).toBeNull()
    const gas = read('كرة توريد وتركيب واختبار وتشغيل لوحة إنذار غازات طبية رقمية — خلاطات ترموستاتية وحواف صحية')
    expect(gas.canonical_intent_id).toBeNull()
  })

  it('a line already in a family is never carried into another trade by a fragment', () => {
    const r = read('ممسحة أرجل أرضية غاطسة للمدخل والسعر يشمل التثبيت كامال بمقاس قياس 2550 × 600 مممع مبني امن المنشآت 600 × — اكسسوارات الحمامات من الستانلس ستيل')
    expect(r.canonical_intent_id).not.toBe('washroom_accessories')
  })
})

describe('F146 — a general-requirements paragraph read as a line', () => {
  it('is NOT_SUPPLY', () => {
    const line = 'أعمال الكهرباء القسم رقم متطلبات عامة أسعار البنود يجب أن تشمل ولا تقتصر على تكلفة جميع الاعمال المدنية القواعد الخرساني'
    expect(isGeneralRequirements(line)).toBe(true)
    const r = read(line)
    expect(r.canonical_intent_status).toBe('NOT_SUPPLY')
    expect(r.family).toBeNull()
  })

  it('needs all three marks: a spec sentence with «يجب أن تشمل» is not one', () => {
    expect(isGeneralRequirements('يجب أن تشمل أيضا على وحدات تحكم برمجية و تكاملية عند اللزوم و ذلك لتحقيق الإتصال و التفاعل بين هذه الأجهزة اللأعمال الكه')).toBe(false)
    expect(isGeneralRequirements('الحفر في جميع أنواع التربة باستخدام معدات وادوات مناسبة — متطلبات عامة')).toBe(false)
  })
})
