import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
// expo-router vendors react-navigation's bottom-tabs (there is no standalone
// @react-navigation/bottom-tabs package installed); BottomTabBar is the default
// bar we wrap to cap and centre its items.
import { BottomTabBar } from 'expo-router/build/react-navigation/bottom-tabs/index';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { Fonts, MinTapTarget, TabBarMaxWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FeatherName = keyof typeof Feather.glyphMap;

/**
 * Five tabs: Feed, Search, Groups, Messages, You.
 *
 * Standard expo-router tab bar themed against the design tokens. The bar's
 * background spans the full width (via the custom tabBar wrapper), while its
 * five items are capped to a reading-width measure and centred, so they don't
 * spread across a tablet or a wide web window.
 */
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => (
        <View
          style={[
            styles.tabBarOuter,
            { backgroundColor: colors.background, borderTopColor: colors.hairline },
          ]}>
          <View style={styles.tabBarInner}>
            <BottomTabBar {...props} />
          </View>
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        // The wrapper carries the background and top border (full width); keep
        // the inner bar transparent so it doesn't draw a second border.
        tabBarStyle: { backgroundColor: 'transparent', borderTopWidth: 0 },
        tabBarItemStyle: { minHeight: MinTapTarget },
        tabBarLabelStyle: { fontFamily: Fonts.sansMedium, fontSize: 11 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Feed', tabBarIcon: icon('book-open') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('search') }} />
      <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: icon('users') }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: icon('message-circle') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  tabBarInner: { width: '100%', maxWidth: TabBarMaxWidth },
});

function icon(name: FeatherName) {
  // This is a tabBarIcon render prop, not a component — the display-name rule
  // is a false positive here.
  // eslint-disable-next-line react/display-name
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Feather name={name} size={size} color={color as string} />
  );
}
