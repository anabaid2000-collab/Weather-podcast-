import React from "react";
import { Pressable, Text, View } from "react-native";

export default function ForecastScreen({ daily, place, describe, dayLabel, temp, number, styles, onOpenRadio }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>The week ahead</Text>
      <Text style={styles.muted}>A seven-day view for {place?.name || "your location"}.</Text>
      <View style={styles.forecast}>
        {daily.time.map((date, i) => {
          const weather = describe(daily.weather_code[i]);
          return (
            <View key={"forecast-tab-" + date} style={styles.forecastRow}>
              <Text style={styles.day}>{dayLabel(date, i)}</Text>
              <Text style={styles.forecastIcon}>{weather[1]}</Text>
              <Text style={styles.forecastCondition}>{weather[0]}</Text>
              <Text style={styles.high}>{temp(daily.temperature_2m_max[i])}</Text>
              <Text style={styles.low}>{temp(daily.temperature_2m_min[i])}</Text>
              <Text style={styles.rainChance}>{number(daily.precipitation_probability_max[i], "%")}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.timestamp}>Hourly details and spoken briefings are available in Forecast FM.</Text>
      <Pressable onPress={onOpenRadio} style={styles.exploreTile}>
        <Text style={styles.exploreTileTitle}>Listen to Forecast FM →</Text>
        <Text style={styles.exploreTileHint}>Choose a presenter and hear today's outlook.</Text>
      </Pressable>
    </View>
  );
}
