import React from "react";
import { Pressable, Text, View } from "react-native";

const TOOLS = [
  ["rain", "Rain, Air & Sun", "Rain chances, air quality, UV, sunrise and sunset."],
  ["travel", "Travel Planner", "Check weather at another destination."],
  ["intelligence", "Weather Intelligence", "Daily decisions, activity scores, community reports and safety guidance."]
];

export default function ExploreScreen({ place, styles, onNavigate }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Explore your atmosphere</Text>
      <Text style={styles.muted}>Choose a weather tool for {place?.name || "your city"}.</Text>
      {TOOLS.map(([key, title, hint]) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          onPress={() => onNavigate(key)}
          style={styles.exploreTile}
        >
          <Text style={styles.exploreTileTitle}>{title}  →</Text>
          <Text style={styles.exploreTileHint}>{hint}</Text>
        </Pressable>
      ))}
    </View>
  );
}
