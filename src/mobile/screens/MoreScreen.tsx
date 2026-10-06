import { useState } from 'react'
import { farqSession } from '../../api/farqSession'
import { disablePush } from '../push'
import { useFarqSession } from '../../api/useFarqSession'
import { FileIcon, PriceIcon, AccountIcon } from '../../icons'
import type { Nav } from '../MobileApp'
import { Avatar, Group, Row, Screen, SectionTitle } from '../ui'

function IconTile({ children, bg }: { children: React.ReactNode; bg: string }) {
  return <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: bg }}>{children}</span>
}

export default function MoreScreen({ nav }: { nav: Nav }) {
  const session = useFarqSession()
  const [leaving, setLeaving] = useState(false)
  const name = session.user?.displayName?.trim() || 'حسابك'
  const email = session.user?.email || ''

  return (
    <Screen title="المزيد">
      <Group>
        <Row leading={<Avatar name={name} size={52} />} title={<span className="text-[17px] font-bold">{name}</span>} subtitle={<bdi dir="ltr">{email}</bdi>} chevron={false} />
      </Group>

      <SectionTitle>الأدوات</SectionTitle>
      <Group>
        <Row leading={<IconTile bg="#123F3A"><FileIcon className="w-5 h-5" /></IconTile>} title="التقارير" subtitle="أداء الطلبات والموردين" onClick={() => nav.push({ kind: 'reports' })} />
        <Row leading={<IconTile bg="#1a7a45"><PriceIcon className="w-5 h-5" /></IconTile>} title="أسعار المواد" subtitle="مؤشر أسعار مواد البناء" onClick={() => nav.push({ kind: 'prices' })} />
      </Group>

      <SectionTitle>الحساب</SectionTitle>
      <Group>
        <Row
          leading={<IconTile bg="#6b7280"><AccountIcon className="w-5 h-5" /></IconTile>}
          title="الموقع الكامل"
          subtitle="رفع الكراسات والإعدادات من الكمبيوتر"
          trailing={<bdi dir="ltr" className="text-[12px] text-neutral-400">construction.farq.sa</bdi>}
          chevron={false}
        />
        <button
          disabled={leaving}
          onClick={async () => {
            setLeaving(true)
            try {
              await disablePush()
              await farqSession.signOut()
            } finally {
              setLeaving(false)
            }
          }}
          className="w-full px-4 py-4 text-right text-[16px] font-semibold text-red-600 active:bg-neutral-100 disabled:opacity-50"
        >
          {leaving ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
        </button>
      </Group>
      <p className="text-center text-[12px] text-neutral-400 mt-6">فرق بناء · iOS · الإصدار <bdi>{import.meta.env.VITE_APP_VERSION || 'غير معروف'}</bdi> · البناء <bdi>{import.meta.env.VITE_APP_BUILD || 'غير معروف'}</bdi></p>
    </Screen>
  )
}
