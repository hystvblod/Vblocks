import { PushNotifications } from '@capacitor/push-notifications';

const DEBUG_PUSH = false; // passe à true seulement en debug local

(async () => {
  try {
    // Si besoin: gate consent (utilise la même clé que ta home si tu veux)
    const consent = localStorage.getItem('rgpdConsent'); 
    if (consent !== 'accept') return;

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', (token) => {
      localStorage.setItem('fcmToken', token.value);
      if (DEBUG_PUSH) {
        // Log masqué : pas de fuite du token complet
        console.log('[Push] FCM token:', (token.value || '').slice(0, 8) + '…');
      }
      // NOTE: plus d'alert() ni de console.log complet
    });

    PushNotifications.addListener('registrationError', (e) => {
      if (DEBUG_PUSH) console.error('[Push] registrationError', e);
    });
  } catch (e) {
    if (DEBUG_PUSH) console.error('[Push] init error', e);
  }
})();
