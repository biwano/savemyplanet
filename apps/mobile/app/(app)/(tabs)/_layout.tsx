import { Tabs } from 'expo-router'
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols'
import { type ColorValue, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FundsTabLabel } from '@/components/FundsTabLabel'
import { HeaderBrandLeft } from '@/components/HeaderBrandLeft'
import { HeaderRight } from '@/components/HeaderRight'
import { tabBarStyle } from '@/lib/tabBar'
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

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitle: '',
        headerLeft: () => <HeaderBrandLeft />,
        headerRight: () => <HeaderRight />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: colors.accentSoft,
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: spacing.xs,
          overflow: 'hidden',
        },
        tabBarStyle: tabBarStyle(insets.bottom),
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
        name="funds"
        options={{
          title: 'Funds',
          tabBarLabel: ({ focused }) => <FundsTabLabel focused={focused} />,
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              ios="dollarsign.circle"
              iosFocused="dollarsign.circle.fill"
              material="account_balance_wallet"
            />
          ),
        }}
      />
      {/* Flows that keep the tab bar — not permanent tab buttons. */}
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          title: 'Profile',
          headerLeft: () => <HeaderBrandLeft showBack />,
        }}
      />
      <Tabs.Screen
        name="evaluate"
        options={{
          href: null,
          title: 'Evaluate',
          headerLeft: () => <HeaderBrandLeft showBack />,
        }}
      />
    </Tabs>
  )
}
