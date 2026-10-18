export interface FrameScheduler { request: (callback: (now: number) => void, delay?: number) => number; cancel: (id: number) => void }

function pacedFrames(): FrameScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null, frame = 0
  return {
    request(callback, delay = 0) {
      if (delay > 0) timer = setTimeout(() => { timer = null; frame = requestAnimationFrame(callback) }, delay)
      else frame = requestAnimationFrame(callback)
      return 1
    },
    cancel() { if (timer !== null) clearTimeout(timer); timer = null; cancelAnimationFrame(frame) },
  }
}

export function animationLoop(draw: (seconds: number, gap: number, now: number) => void, fps: number,
  scheduler: FrameScheduler = pacedFrames()) {
  let frame: number | null = null
  let running = false
  let previous: number | null = null
  let lastDraw: number | null = null
  let elapsed = 0
  const tick = (now: number) => {
    frame = null
    if (!running) return
    const gap = previous === null ? 0 : Math.max(0, now - previous)
    previous = now
    elapsed += Math.min(gap, 100)
    if (lastDraw === null || now - lastDraw >= 1000 / fps - 0.5) {
      lastDraw = now
      draw(elapsed / 1000, gap, now)
    }
    if (running) frame = scheduler.request(tick, Math.max(0, 1000 / fps - (now - (lastDraw ?? now)) - 3))
  }
  return {
    start() { if (running) return; running = true; previous = null; lastDraw = null; frame = scheduler.request(tick) },
    stop() { running = false; if (frame !== null) scheduler.cancel(frame); frame = null; previous = null },
    time: () => elapsed / 1000,
  }
}
