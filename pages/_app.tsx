// File: pages/_app.tsx

import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Импортируем провайдер аудио из вашего основного файла
// Обратите внимание на путь, он ведет на уровень выше, к pages/index.tsx
import { AudioProvider } from './index';

// Импортируем глобальные стили
import '../theme.css'; 

// Создаем клиент для React Query здесь, в глобальной области
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AudioProvider>
        <Component {...pageProps} />
      </AudioProvider>
    </QueryClientProvider>
  );
}

export default MyApp;