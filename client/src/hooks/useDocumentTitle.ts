import { useEffect } from 'react';
import { useConfig } from './useConfig';

export function useDocumentTitle(title: string) {
  const { appName } = useConfig();
  useEffect(() => {
    document.title = title ? `${title} · ${appName}` : appName;
  }, [title, appName]);
}
