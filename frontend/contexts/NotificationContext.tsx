import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import { nudgeAPI } from '../services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  sendNudgeNotification: (title: string, body: string, nudgeId: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({} as NotificationContextType);

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    registerForPushNotificationsAsync().then(async (token) => {
      setExpoPushToken(token || null);
      
      // Send token to backend
      if (token) {
        try {
          const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/user/push-token`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await getAuthToken()}`,
            },
            body: JSON.stringify({ push_token: token }),
          });
          
          if (response.ok) {
            console.log('Push token saved to backend');
          } else {
            console.warn('Failed to save push token to backend');
          }
        } catch (error) {
          console.error('Error saving push token:', error);
        }
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const nudgeId = response.notification.request.content.data?.nudgeId;
      if (nudgeId) {
        nudgeAPI.markOpened(nudgeId as string).catch(console.error);
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  const sendNudgeNotification = async (title: string, body: string, nudgeId: string) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { nudgeId },
        sound: true,
      },
      trigger: null, // Send immediately
    });
  };

  return (
    <NotificationContext.Provider value={{ expoPushToken, notification, sendNudgeNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#5B9FFF',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      Alert.alert('Permission Required', 'Enable notifications to receive behavioral nudges');
      return;
    }
  }

  return token;
}
