import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export async function registerForPushNotificationsAsync() {
  if (Platform.OS !== "android") return null;

  await Notifications.setNotificationChannelAsync("weather-alerts", {
    name: "Weather alerts",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250]
  });

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Missing Expo project ID in app.json.");

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}
