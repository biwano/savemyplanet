import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

type RippleSpinnerProps = {
  color: string
  /** Outer diameter in px. Default fits primary CTA height. */
  size?: number
}

const RING_COUNT = 3
const DURATION_MS = 1400

function RippleRing({
  color,
  size,
  delay,
}: {
  color: string
  size: number
  delay: number
}) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const cycle = Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ])
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(cycle),
    ])
    animation.start()
    return () => {
      animation.stop()
      progress.setValue(0)
    }
  }, [delay, progress])

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 1],
  })
  const opacity = progress.interpolate({
    inputRange: [0, 0.15, 1],
    outputRange: [0, 0.85, 0],
  })

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  )
}

/** Decorative busy indicator — parent owns accessibility. */
export function RippleSpinner({ color, size = 22 }: RippleSpinnerProps) {
  const ringDelay = DURATION_MS / RING_COUNT

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { width: size, height: size }]}
    >
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <RippleRing
          key={i}
          color={color}
          size={size}
          delay={i * ringDelay}
        />
      ))}
      <View
        style={[
          styles.core,
          {
            backgroundColor: color,
            width: size * 0.22,
            height: size * 0.22,
            borderRadius: size * 0.11,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 1.5,
  },
  core: {
    opacity: 0.95,
  },
})
