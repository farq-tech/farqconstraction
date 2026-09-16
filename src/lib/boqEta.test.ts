import { describe, expect, it } from 'vitest'
import {
  BoqEtaTracker,
  emptyCalibration,
  loadBoqCalibration,
  predictMs,
  recordBoqRun,
  type BoqCalibration,
} from './boqEta'

/** Deterministic clock — the estimator must never read the wall clock itself. */
function clock(start = 1_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
    at: () => t,
  }
}

function memoryStore() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    raw: map,
  }
}

describe('predictMs', () => {
  it('returns null with no measurements — there is no constant to fall back on', () => {
    expect(predictMs([], 200)).toBeNull()
  })

  it('scales a single measurement and says it is only a ratio', () => {
    const out = predictMs([{ size: 80, ms: 11_500, at: 0 }], 160)
    expect(out?.basis).toBe('history-ratio')
    expect(out?.ms).toBeCloseTo(23_000, -1)
  })

  it('fits fixed + per-line cost across two orders of magnitude', () => {
    // Real anchors: 80 lines in 11.5s, 200 lines in 22s → ~4s fixed, ~90ms/line.
    const out = predictMs(
      [
        { size: 80, ms: 11_500, at: 0 },
        { size: 200, ms: 22_000, at: 0 },
      ],
      10_219,
    )
    expect(out?.basis).toBe('history-fit')
    // Must extrapolate to minutes for a 10,219-line booklet, not stay near 22s.
    expect(out!.ms).toBeGreaterThan(500_000)
  })

  it('refits through the origin instead of promising a read that gets cheaper as it grows', () => {
    const out = predictMs(
      [
        { size: 50, ms: 20_000, at: 0 },
        { size: 500, ms: 10_000, at: 0 },
      ],
      1_000,
    )
    expect(out!.ms).toBeGreaterThan(0)
    expect(out!.ms).toBeGreaterThan(predictMs(
      [
        { size: 50, ms: 20_000, at: 0 },
        { size: 500, ms: 10_000, at: 0 },
      ],
      500,
    )!.ms)
  })
})

describe('BoqEtaTracker — before anything is measured', () => {
  it('publishes no estimate on a first run with no history', () => {
    const c = clock()
    const tracker = new BoqEtaTracker({ now: c.now, calibration: emptyCalibration() })
    tracker.note({ kind: 'start', leg: 'extract', unit: 'page', total: 40, capMs: 60_000 })
    c.advance(50)
    tracker.note({ kind: 'tick', leg: 'extract', done: 1, total: 40 })
    const view = tracker.view()
    expect(view.remainingMs).toBeNull()
    expect(view.basis).toBeNull()
    expect(view.leg).toBe('extract')
    expect(view.legCapMs).toBe(60_000)
    // One page in 50ms is not evidence; the fraction is still real and shown.
    expect(view.legFraction).toBeCloseTo(0.025)
  })

  it('never invents a fraction for a single opaque request', () => {
    const c = clock()
    const tracker = new BoqEtaTracker({ now: c.now, calibration: emptyCalibration() })
    tracker.note({ kind: 'start', leg: 'api-parse', opaque: true, capMs: 12_000 })
    c.advance(4_000)
    const view = tracker.view()
    expect(view.legKind).toBe('opaque')
    expect(view.legFraction).toBeNull()
    expect(view.remainingMs).toBeNull()
    expect(view.legCapMs).toBe(12_000)
  })
})

describe('BoqEtaTracker — estimating from the current run', () => {
  it('estimates from measured pages per second and refines as it goes', () => {
    const c = clock()
    const tracker = new BoqEtaTracker({ now: c.now, calibration: emptyCalibration() })
    tracker.note({ kind: 'start', leg: 'extract', unit: 'page', total: 100, capMs: 60_000 })
    for (let page = 1; page <= 10; page++) {
      c.advance(100)
      tracker.note({ kind: 'tick', leg: 'extract', done: page, total: 100 })
    }
    const view = tracker.view()
    expect(view.basis).toBe('in-run')
    expect(view.ratePerSec).toBeCloseTo(10, 0)
    // 90 pages left at ~100ms each.
    expect(view.remainingMs!).toBeGreaterThan(8_000)
    expect(view.remainingMs!).toBeLessThan(10_500)
  })

  it('prefers history when history is slower than the current leg says', () => {
    const c = clock()
    const calibration: BoqCalibration = {
      ...emptyCalibration(),
      match: [{ size: 100, ms: 30_000, at: 0 }],
    }
    const tracker = new BoqEtaTracker({ now: c.now, calibration })
    tracker.note({ kind: 'start', leg: 'match-rank', unit: 'line', total: 100, lines: 100 })
    for (let line = 1; line <= 10; line++) {
      c.advance(100)
      tracker.note({ kind: 'tick', leg: 'match-rank', done: line, total: 100 })
    }
    const view = tracker.view()
    // In-run says ~9s left; the last real read of 100 lines took 30s. Take 30s.
    expect(view.basis).toBe('history-ratio')
    expect(view.remainingMs!).toBeGreaterThan(20_000)
  })

  it('cannot estimate matching before the line count exists', () => {
    const c = clock()
    const calibration: BoqCalibration = {
      ...emptyCalibration(),
      match: [{ size: 100, ms: 30_000, at: 0 }],
    }
    const tracker = new BoqEtaTracker({ now: c.now, calibration })
    tracker.note({ kind: 'start', leg: 'resolve' })
    c.advance(2_000)
    expect(tracker.view().remainingMs).toBeNull()
    expect(tracker.view().lines).toBeNull()
  })
})

describe('BoqEtaTracker — when the estimate is exceeded', () => {
  it('latches overdue, stops publishing, and keeps counting elapsed', () => {
    const c = clock()
    const tracker = new BoqEtaTracker({ now: c.now, calibration: emptyCalibration() })
    tracker.note({ kind: 'start', leg: 'match-rank', unit: 'line', total: 100, lines: 100 })
    for (let line = 1; line <= 10; line++) {
      c.advance(100)
      tracker.note({ kind: 'tick', leg: 'match-rank', done: line, total: 100 })
    }
    const promised = tracker.view().remainingMs!
    expect(promised).toBeGreaterThan(0)

    // Work stalls completely: no more ticks, well past the promise and its grace.
    c.advance(promised + 5_000)
    const late = tracker.view()
    expect(late.overdue).toBe(true)
    expect(late.remainingMs).toBeNull()
    expect(late.brokenEstimateMs).toBeGreaterThan(0)

    // And it stays honest as time passes — no new promise, elapsed keeps rising.
    c.advance(20_000)
    const later = tracker.view()
    expect(later.overdue).toBe(true)
    expect(later.remainingMs).toBeNull()
    expect(later.overdueByMs).toBeGreaterThanOrEqual(20_000)
    expect(later.elapsedMs).toBeGreaterThan(late.elapsedMs)
  })

  it('does not resurrect a countdown when work resumes after overrunning', () => {
    const c = clock()
    const tracker = new BoqEtaTracker({ now: c.now, calibration: emptyCalibration() })
    tracker.note({ kind: 'start', leg: 'match-rank', unit: 'line', total: 100, lines: 100 })
    for (let line = 1; line <= 10; line++) {
      c.advance(100)
      tracker.note({ kind: 'tick', leg: 'match-rank', done: line, total: 100 })
    }
    c.advance(tracker.view().remainingMs! + 4_000)
    expect(tracker.view().overdue).toBe(true)

    for (let line = 11; line <= 20; line++) {
      c.advance(100)
      tracker.note({ kind: 'tick', leg: 'match-rank', done: line, total: 100 })
    }
    const view = tracker.view()
    expect(view.overdue).toBe(true)
    expect(view.remainingMs).toBeNull()
    // Real progress is still reported — only the promise is withheld.
    expect(view.done).toBe(20)
  })

  it('discloses an upward revision instead of sliding the goalpost quietly', () => {
    const c = clock()
    const tracker = new BoqEtaTracker({ now: c.now, calibration: emptyCalibration() })
    tracker.note({ kind: 'start', leg: 'match-rank', unit: 'line', total: 200, lines: 200 })
    for (let line = 1; line <= 10; line++) {
      c.advance(100)
      tracker.note({ kind: 'tick', leg: 'match-rank', done: line, total: 200 })
    }
    expect(tracker.view().revisedUp).toBe(false)
    // Throughput collapses by 20× but work continues, so the estimate must grow.
    for (let line = 11; line <= 14; line++) {
      c.advance(2_000)
      tracker.note({ kind: 'tick', leg: 'match-rank', done: line, total: 200 })
    }
    expect(tracker.view().revisedUp).toBe(true)
  })
})

describe('BoqEtaTracker — the last second', () => {
  it('reads "finishing now" instead of crying overrun for rounding noise', () => {
    const c = clock()
    const tracker = new BoqEtaTracker({ now: c.now, calibration: emptyCalibration() })
    tracker.note({ kind: 'start', leg: 'match-rank', unit: 'line', total: 100, lines: 100 })
    for (let line = 1; line <= 99; line++) {
      c.advance(10)
      tracker.note({ kind: 'tick', leg: 'match-rank', done: line, total: 100 })
    }
    // One line left at ~10ms: the promise is smaller than a rendered second.
    expect(tracker.view().remainingMs).toBeLessThan(1_000)
    c.advance(700)
    const view = tracker.view()
    expect(view.overdue).toBe(false)
    expect(view.remainingMs).toBe(0)
  })
})

describe('calibration store', () => {
  it('records only phases that completed, and reads them back', () => {
    const c = clock()
    const store = memoryStore()
    const tracker = new BoqEtaTracker({ now: c.now, calibration: emptyCalibration() })

    tracker.note({ kind: 'start', leg: 'extract', unit: 'page', total: 25 })
    c.advance(400)
    tracker.note({ kind: 'tick', leg: 'extract', done: 25, total: 25 })
    tracker.note({ kind: 'end', leg: 'extract' })

    tracker.note({ kind: 'start', leg: 'match-remote', opaque: true, lines: 45 })
    c.advance(9_000)
    tracker.note({ kind: 'end', leg: 'match-remote' })

    const saved = recordBoqRun(tracker, store)
    expect(saved.localRead).toEqual([{ size: 25, ms: 400, at: c.at() }])
    expect(saved.match).toEqual([{ size: 45, ms: 9_000, at: c.at() }])
    // The server-read phase never ran in this run, so nothing is claimed for it.
    expect(saved.serverRead).toEqual([])
    expect(loadBoqCalibration(store).match).toHaveLength(1)
  })

  it('survives unreadable storage without inventing history', () => {
    const store = memoryStore()
    store.setItem('farq.boq.eta.v1', '{not json')
    expect(loadBoqCalibration(store)).toEqual(emptyCalibration())
  })
})
