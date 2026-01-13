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

// Утилита для задержки
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Функция повторных попыток с экспоненциальной задержкой
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const waitTime = baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries}, waiting ${waitTime}ms`);
        await delay(waitTime);
      }
    }
  }
  throw lastError;
}

// Инициализация VK Bridge
export async function initVKBridge(): Promise<boolean> {
  if (isInitialized) {
    return true;
  }

  try {
    await withRetry(async () => {
      await vkBridge.send('VKWebAppInit');
    }, 3, 500);
    isInitialized = true;
    console.log('VK Bridge initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize VK Bridge:', error);
    return false;
  }
}

// Получение данных из VK Storage с повторными попытками
export async function getCloudData(key: string): Promise<GameProgress | null> {
  try {
    const data = await withRetry(async () => {
      return await vkBridge.send('VKWebAppStorageGet', { keys: [key] });
    }, 3, 1000);

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
    console.error('Failed to get VK Storage data after retries:', error);
    return null;
  }
}

// Сохранение данных в VK Storage с повторными попытками
export async function saveCloudData(key: string, value: GameProgress): Promise<boolean> {
  try {
    await withRetry(async () => {
      await vkBridge.send('VKWebAppStorageSet', {
        key: key,
        value: JSON.stringify(value),
      });
    }, 3, 1000);
    console.log('Data saved to VK Storage successfully:', value);
    return true;
  } catch (error) {
    console.error('Failed to save VK Storage data after retries:', error);
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
