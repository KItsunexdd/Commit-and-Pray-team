import { colors, subscribeTheme } from '../theme/store'

export function vanish(canvas: HTMLCanvasElement, input: HTMLInputElement): () => void {
  const width = input.clientWidth
  const height = input.clientHeight
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return () => {}
  const style = getComputedStyle(input)
  context.font = style.font
  context.fillStyle = colors().vanish
  context.textBaseline = 'middle'
  context.fillText(input.value, parseFloat(style.paddingLeft), height / 2)
  const pixels = context.getImageData(0, 0, width, height).data
  const dots: { x: number; y: number; drift: number }[] = []
  for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) {
    if (pixels[(y * width + x) * 4 + 3]! > 90) dots.push({ x, y, drift: (x * 7 + y * 11) % 29 - 14 })
  }
  let frame = 0
  const stopTheme = subscribeTheme(() => { context.fillStyle = colors().vanish })
  const start = performance.now()
  const draw = (now: number) => {
    const t = Math.min(1, (now - start) / 450)
    context.clearRect(0, 0, width, height)
    context.globalAlpha = 1 - t
    for (const dot of dots) context.fillRect(dot.x + t * 22, dot.y + dot.drift * t, 2 * (1 - t), 2 * (1 - t))
    if (t < 1 && !document.hidden) frame = requestAnimationFrame(draw)
    else { context.clearRect(0, 0, width, height); stopTheme() }
  }
  frame = requestAnimationFrame(draw)
  return () => { cancelAnimationFrame(frame); stopTheme(); context.clearRect(0, 0, width, height) }
}
