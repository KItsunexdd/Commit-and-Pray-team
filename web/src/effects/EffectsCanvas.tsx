import { useEffect, useRef, useState } from 'react'
import type { MapSurface } from './contour'
import { createPainter } from './paint'
import { effectProfile } from './quality'
import { animationLoop } from './loop'
import { observeInactivity } from './inactivity'
import type { useMotionSettings } from './useMotionSettings'
import './effects.css'
import { subscribeTheme } from '../theme/store'

export function EffectsCanvas({ surface, motion, economy, enabled = true }: {
  surface: MapSurface; motion: ReturnType<typeof useMotionSettings>; economy: boolean; enabled?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { hidden, reduced, running } = motion
  const clock = useRef(0)
  const [idle, setIdle] = useState(false)
  useEffect(() => observeInactivity(document, setIdle), [])
  useEffect(() => {
    const element = canvas.current!
    if (!enabled) { element.dataset.motion = 'hidden'; element.width = 0; element.height = 0; return }
    const context = element.getContext('2d')
    const shell = element.closest('.app-shell')!
    if (!context) return
    let loop: ReturnType<typeof animationLoop> | null = null
    let paint: ((time: number) => void) | null = null
    let frames = 0
    const animating = running && !idle
    const stop = () => { if (loop) { clock.current += loop.time(); loop.stop(); loop = null } }
    const renderStill = () => { if (!hidden && !animating && !surface.moving) paint?.(reduced ? 0 : clock.current) }
    const syncMovement = () => {
      if (surface.moving) {
        loop?.stop()
        context.clearRect(0, 0, element.width, element.height)
        element.dataset.motion = 'moving'
      } else {
        element.dataset.motion = hidden ? 'hidden' : reduced ? 'reduced' : !running ? 'paused' : idle ? 'idle' : 'running'
        if (animating) loop?.start(); else renderStill()
      }
    }
    const resize = () => {
      stop()
      const { width, height } = element.getBoundingClientRect()
      if (!width || !height) return
      const profile = effectProfile(width, height, devicePixelRatio, economy, reduced)
      element.width = Math.round(width * profile.ratio); element.height = Math.round(height * profile.ratio)
      context.setTransform(profile.ratio, 0, 0, profile.ratio, 0, 0)
      const origin = element.getBoundingClientRect()
      const clear = [...shell.querySelectorAll('.map-hero, .app-header')].map((el) => {
        const rect = el.getBoundingClientRect()
        return new DOMRect(rect.x - origin.x, rect.y - origin.y, rect.width, rect.height)
      })
      paint = createPainter(context, surface, width, height, profile, reduced, clear)
      element.dataset.quality = economy ? 'economy' : width < 640 ? 'mobile' : 'full'
      element.dataset.particles = String(profile.particles)
      element.dataset.ratio = String(profile.ratio)
      renderStill()
      if (animating) {
        loop = animationLoop((time) => {
          paint?.(clock.current + time)
          if (import.meta.env.MODE === 'test') element.dataset.frame = String(++frames)
        }, profile.fps)
      }
      syncMovement()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    const hero = shell.querySelector('.map-hero')
    if (hero) observer.observe(hero)
    const unsubscribe = surface.subscribe(renderStill)
    const stopMovement = surface.subscribeMotion(syncMovement)
    const stopTheme = subscribeTheme(resize)
    resize()
    return () => { stop(); observer.disconnect(); unsubscribe(); stopMovement(); stopTheme() }
  }, [surface, hidden, reduced, running, economy, enabled, idle])
  return <canvas className="scene-effects" ref={canvas} aria-hidden="true" hidden={!enabled} />
}
