import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const TABS = [
  ["home", "Home", "⌂"],
  ["forecast", "Forecast", "◷"],
  ["explore", "Explore", "◇"],
  ["radio", "Radio", "◉"],
  ["more", "More", "•••"],
];
const EXPLORE_PAGES = ["rain", "travel", "intelligence"];

function isSelected(tab, page) {
  if (tab === page) return true;
  if (tab === "explore") return EXPLORE_PAGES.includes(page);
  if (tab === "more") return page === "dashboard";
  return false;
}

export default function BottomNavigation({ page, onNavigate }) {
  return (
    <View style={styles.container}>
      {TABS.map(([key, label, symbol]) => {
        const selected = isSelected(key, page);
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onNavigate(key)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Text style={[styles.icon, selected && styles.iconActive]}>{symbol}</Text>
            <Text style={[styles.label, selected && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute", left: 12, right: 12, bottom: 12, minHeight: 68,
    backgroundColor: "#34472A", borderRadius: 6, borderWidth: 1,
    borderColor: "#53652C", flexDirection: "row", alignItems: "center",
    justifyContent: "space-around", paddingHorizontal: 7, paddingVertical: 7,
    elevation: 5, shadowColor: "#34472A", shadowOpacity: 0.14,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  item: {
    flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center",
    gap: 3, borderRadius: 4,
  },
  pressed: { opacity: 0.72 },
  icon: { fontSize: 19, color: "#F3F2E8", fontWeight: "700" },
  iconActive: { color: "#D7ED82" },
  label: { fontSize: 10, color: "#F3F2E8", fontWeight: "600" },
  labelActive: { color: "#D7ED82", fontWeight: "900" },
});
