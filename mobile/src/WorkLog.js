import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => sub.remove()
  }, [])
  return reduced
}

// startedAt is when the turn started, in ms.
export function WorkLogLive({ startedAt, theme }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(ticker)
  }, [])
  const elapsed = `${(Math.max(0, now - startedAt) / 1000).toFixed(1)}s`

  return (
    <FadeUp style={styles.step} accessibilityLabel="Assistant is thinking">
      <DotSpinner theme={theme} />
      <Text style={[styles.stepLabel, { color: theme.text }]}>Thinking</Text>
      <Text style={[styles.timer, { color: theme.muted }]} accessibilityElementsHidden>
        {elapsed}
      </Text>
    </FadeUp>
  )
}

export function WorkLogSummary({ durationMs, theme }) {
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  return <Text style={[styles.summary, { color: theme.muted }]}>Worked for {seconds}s</Text>
}

function FadeUp({ style, children, ...props }) {
  const reduced = useReducedMotion()
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true
    }).start()
  }, [progress, reduced])
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [4, 0] })
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]} {...props}>
      {children}
    </Animated.View>
  )
}

// A 3×3 grid of dots with a lit pair running clockwise around the edge. Each
// edge dot runs the same pass, started one beat after the dot before it.
const BEAT = 100
// Grid index (0–8, row by row) → place in the clockwise order. The middle dot,
// 4, never lights.
const EDGE_ORDER = { 0: 0, 1: 1, 2: 2, 5: 3, 8: 4, 7: 5, 6: 6, 3: 7 }
// One dot's pass, as [progress, opacity of the lit color over the dot]: lit,
// then fading, then out.
const PASS = [
  [0, 1],
  [0.12, 1],
  [0.25, 0.45],
  [0.4, 0],
  [1, 0]
]
const SAMPLES = 80

function passAt(progress) {
  const i = PASS.findIndex(([p]) => p >= progress)
  if (i <= 0) return PASS[0][1]
  const [p0, o0] = PASS[i - 1]
  const [p1, o1] = PASS[i]
  return o0 + ((o1 - o0) * (progress - p0)) / (p1 - p0)
}

// The lit opacity of the dot at place `position`, sampled over one loop, so a
// single looping value drives every dot in step.
function litRange(position) {
  const inputRange = []
  const outputRange = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    inputRange.push(t)
    outputRange.push(passAt((t - position / 8 + 1) % 1))
  }
  return { inputRange, outputRange }
}

export function DotSpinner({ theme }) {
  const reduced = useReducedMotion()
  const loop = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduced) return
    const animation = Animated.loop(
      Animated.timing(loop, {
        toValue: 1,
        duration: BEAT * 8,
        easing: Easing.linear,
        useNativeDriver: true
      })
    )
    animation.start()
    return () => animation.stop()
  }, [loop, reduced])

  return (
    <View style={styles.spinner} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 9 }, (_, i) => {
        const position = EDGE_ORDER[i]
        // With reduced motion, the pair holds still at the top left.
        const lit =
          position === undefined
            ? 0
            : reduced
              ? i < 2
                ? 1
                : 0
              : loop.interpolate(litRange(position))
        return (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: i === 4 ? theme.dotCenter : theme.dot }]}
          >
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.dotLit, { backgroundColor: theme.accent, opacity: lit }]}
            />
          </View>
        )
      })}
    </View>
  )
}

// Milliseconds between reveals, and so how fast a short reply types.
const TICK = 24

// Reveals text a few characters at a time, or all at once when animate is
// false or the user prefers reduced motion. onDone runs once it's all shown.
export function useTypewriter(text, { animate, onDone }) {
  const reduced = useReducedMotion()
  const typing = animate && !reduced
  const [visible, setVisible] = useState(typing ? '' : text)
  const shown = typing ? visible : text
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (!typing) return
    const timer = setInterval(() => {
      setVisible((current) => {
        const remaining = text.length - current.length
        if (remaining <= 0) {
          clearInterval(timer)
          return current
        }
        // A sixtieth of the backlog per tick, so a long reply doesn't take
        // ages, and a short one goes out a character a tick.
        return text.slice(0, current.length + Math.max(1, Math.ceil(remaining / 60)))
      })
    }, TICK)
    return () => clearInterval(timer)
  }, [text, typing])

  const finished = shown === text
  useEffect(() => {
    if (animate && finished) done.current?.()
  }, [animate, finished])

  return shown
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  timer: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontVariant: ['tabular-nums']
  },
  summary: { fontSize: 13 },
  spinner: { width: 16, height: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, overflow: 'hidden' },
  dotLit: { borderRadius: 2 }
})
