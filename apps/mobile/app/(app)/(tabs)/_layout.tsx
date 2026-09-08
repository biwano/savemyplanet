import { Tabs } from 'expo-router'
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols'
import { type ColorValue, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BrandMark } from '@/components/BrandMark'
import { HeaderTotalCleared } from '@/components/HeaderTotalCleared'
import {
  TAB_BAR_INNER_HEIGHT,
  tabBarBottomPadding,
  tabBarTopPadding,
} from '@/lib/tabBar'
import { colors, spacing } from '@/lib/theme'

function TabLabel({
  label,
  focused,
}: {
  label: string
  focused: boolean
}) {
  return (
    <Text
      style={{
        fontSize: 12,
        lineHeight: 16,
        fontWeight: focused ? '700' : '500',
        color: focused ? colors.accent : colors.muted,
      }}
    >
      {label}
    </Text>
  )
}

function TabIcon({
  focused,
  color,
  size,
  ios,
  iosFocused,
  material,
}: {
  focused: boolean
  color: ColorValue
  size: number
  ios: SFSymbol
  iosFocused: SFSymbol
  material: AndroidSymbol
}) {
  return (
    <SymbolView
      name={{
        ios: focused ? iosFocused : ios,
        android: material,
        web: material,
      }}
      size={size}
      tintColor={color}
    />
  )
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const topPad = tabBarTopPadding()
  const bottomPad = tabBarBottomPadding(insets.bottom)

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitle: '',
        headerLeft: () => <BrandMark />,
        headerRight: () => <HeaderTotalCleared />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: colors.accentSoft,
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: spacing.xs,
          overflow: 'hidden',
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: TAB_BAR_INNER_HEIGHT + topPad + bottomPad,
          paddingTop: topPad,
          paddingBottom: bottomPad,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Home" focused={focused} />
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              ios="house"
              iosFocused="house.fill"
              material="home"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="History" focused={focused} />
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              ios="clock"
              iosFocused="clock.fill"
              material="history"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Account" focused={focused} />
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              ios="person.crop.circle"
              iosFocused="person.crop.circle.fill"
              material="person"
            />
          ),
        }}
      />
    </Tabs>
  )
}
