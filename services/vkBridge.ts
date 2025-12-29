import vkBridge from '@vkontakte/vk-bridge';

// Интерфейс для данных прогресса
export interface GameProgress {
  currentLevel: number;
  maxLevel: number;
  audioSettings: {
    music: boolean;
    sfx: boolean;
  };
}

let isInitialized = false;

// Инициализация VK Bridge
export async function initVKBridge(): Promise<boolean> {
  if (isInitialized) {
    return true;
  }

  try {
    await vkBridge.send('VKWebAppInit');
    isInitialized = true;
    console.log('VK Bridge initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize VK Bridge:', error);
    return false;
  }
}

// Получение данных из VK Storage
export async function getCloudData(key: string): Promise<GameProgress | null> {
  try {
    const data = await vkBridge.send('VKWebAppStorageGet', { keys: [key] });
    if (data.keys && data.keys[0] && data.keys[0].value) {
      const parsedData = JSON.parse(data.keys[0].value);
      console.log('Loaded data from VK Storage:', parsedData);
      if (
        typeof parsedData.currentLevel === 'number' &&
        typeof parsedData.maxLevel === 'number' &&
        typeof parsedData.audioSettings === 'object'
      ) {
        return parsedData;
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to get VK Storage data:', error);
    return null;
  }
}

// Сохранение данных в VK Storage
export async function saveCloudData(key: string, value: GameProgress): Promise<boolean> {
  try {
    await vkBridge.send('VKWebAppStorageSet', {
      key: key,
      value: JSON.stringify(value),
    });
    console.log('Data saved to VK Storage successfully');
    return true;
  } catch (error) {
    console.error('Failed to save VK Storage data:', error);
    return false;
  }
}

// Интерфейс для колбэков рекламы
export interface AdCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown: boolean) => void;
  onError?: (error: any) => void;
}

// Показ полноэкранной рекламы (interstitial)
export async function showFullscreenAd(callbacks?: AdCallbacks): Promise<boolean> {
  callbacks?.onOpen?.();
  try {
    const result = await vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' });
    if (result.result) {
      console.log('Interstitial ad shown successfully');
      callbacks?.onClose?.(true);
      return true;
    } else {
      console.warn('Interstitial ad was not shown');
      callbacks?.onClose?.(false);
      return false;
    }
  } catch (error) {
    console.error('Interstitial ad error:', error);
    callbacks?.onError?.(error);
    callbacks?.onClose?.(false);
    return false;
  }
}

// Показ видео-рекламы с наградой (reward)
export async function showRewardedVideo(callbacks?: AdCallbacks): Promise<boolean> {
  callbacks?.onOpen?.();
  try {
    const result = await vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' });
    if (result.result) {
      console.log('Rewarded ad shown successfully');
      callbacks?.onClose?.(true);
      return true;
    } else {
      console.warn('Rewarded ad was not shown');
      callbacks?.onClose?.(false);
      return false;
    }
  } catch (error) {
    console.error('Rewarded ad error:', error);
    callbacks?.onError?.(error);
    callbacks?.onClose?.(false);
    return false;
  }
}
