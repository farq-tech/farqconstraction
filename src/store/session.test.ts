import { beforeEach, describe, expect, it, vi } from 'vitest'

const persistence = vi.hoisted(() => ({
  clear: vi.fn(),
  load: vi.fn(),
  persist: vi.fn(),
}))

vi.mock('../api/farqSession', () => ({
  farqSession: {
    getUser: () => ({ id: 'buyer-1' }),
    subscribe: () => () => {},
  },
}))

vi.mock('./sessionPersistence', () => ({
  clearPersistedSession: persistence.clear,
  loadPersistedSession: persistence.load,
  persistSession: persistence.persist,
}))

beforeEach(() => {
  vi.resetModules()
  persistence.clear.mockReset()
  persistence.load.mockReset()
  persistence.persist.mockReset()
})

describe('restoreSession', () => {
  it('does not restore the previous booklet over a new upload started while storage is loading', async () => {
    let resolveStored!: (value: unknown) => void
    persistence.load.mockReturnValue(new Promise((resolve) => { resolveStored = resolve }))

    const session = await import('./session')
    const restore = session.restoreSession()
    session.beginBoqUpload({ fileName: 'new-booklet.pdf' })
    resolveStored({
      documentId: 'old-document',
      fileName: 'old-booklet.pdf',
      boqItems: [{ id: 1, name: 'بند قديم', qty: '1', unit: 'عدد' }],
    })

    await expect(restore).resolves.toBe(false)
    expect(session.getSession()).toMatchObject({
      documentId: null,
      fileName: 'new-booklet.pdf',
      boqItems: [],
    })
  })
})
