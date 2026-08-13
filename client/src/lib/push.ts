import { api } from "./api";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeOnce(registration: ServiceWorkerRegistration): Promise<boolean> {
  const { key } = await api.get("/push/vapid-public-key");
  if (!key) return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  await api.post("/push/subscribe", subscription.toJSON());
  return true;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  try {
    return await subscribeOnce(registration);
  } catch (err) {
    // Right after a fresh permission grant, the service worker can still
    // be finishing activation for a moment — the very first subscribe
    // attempt sometimes fails as a result. Wait briefly and retry once
    // instead of forcing the user to tap the toggle a second time.
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      const freshReg = await navigator.serviceWorker.ready;
      return await subscribeOnce(freshReg);
    } catch (err2) {
      console.error("Push subscribe failed after retry:", err2);
      return false;
    }
  }
}