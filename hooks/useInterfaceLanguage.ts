import { useEffect, useState } from 'react';

export function useInterfaceLanguage(preferredLang: 'ru' | 'en' = 'ru') {
  const [language, setLanguage] = useState<string>(preferredLang);

  useEffect(() => {
    setLanguage(preferredLang);
  }, [preferredLang]);

  return language;
}
