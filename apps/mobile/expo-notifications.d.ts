declare module 'expo-notifications' {
  export type NotificationPermissionsStatus = {
    granted: boolean;
    canAskAgain: boolean;
  };

  export function getPermissionsAsync(): Promise<NotificationPermissionsStatus>;
  export function requestPermissionsAsync(): Promise<NotificationPermissionsStatus>;
}
