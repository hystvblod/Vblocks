import { PushNotifications } from '@capacitor/push-notifications';

(async () => {
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', (token) => {
    alert('FCM token:\n' + token.value);   // copie-le
    console.log('FCM token:', token.value);
  });

  PushNotifications.addListener('registrationError', (e) => console.error(e));
})();
