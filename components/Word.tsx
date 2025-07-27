// File: components/Word.tsx (версия с использованием IndexedDB)
import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useQuery } from '@tanstack/react-query';
import { Badge } from './ui/badge';
import { getWordFromDb, setWordInDb } from '../lib/db'; // ✅ Импортируем функции для работы с БД

type WordAnalysis = {
  sourceLanguage: "sanskrit" | "bengali" | "unknown";
  transliteration: string;
  russianTranslation: string;
  englishTranslation: string;
  spiritualMeaning?: string;
  isProperNoun: boolean;
  confidence: "high" | "medium" | "low";
};

// Функция запроса к AI остается как запасной вариант
const fetchWordAnalysisFromApi = async (word: string): Promise<WordAnalysis> => {
  const response = await fetch('/api/translate-word', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word }),
  });
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

const cleanWord = (word: string) => {
  return word.toLowerCase().replace(/[.,!?;:"“]/g, '');
};

export const Word = ({ children }: { children: string }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const cleaned = cleanWord(children);

  // ✅ Обновленная логика useQuery
  const { data, isLoading, isError } = useQuery<WordAnalysis>({
    queryKey: ['word', cleaned],
    queryFn: async () => {
      // 1. Сначала ищем слово в локальной базе
      const cachedWord = await getWordFromDb(cleaned);
      if (cachedWord) {
        console.log(`Found "${cleaned}" in local DB.`);
        return cachedWord;
      }

      // 2. Если не нашли, идем к API
      console.log(`"${cleaned}" not in DB, fetching from API...`);
      const apiData = await fetchWordAnalysisFromApi(cleaned);
      
      // 3. Сохраняем результат в базу для будущего использования
      await setWordInDb({ word: cleaned, ...apiData });
      console.log(`Saved "${cleaned}" to local DB.`);
      
      return apiData;
    },
    enabled: isOpen, // Запрос выполняется только при открытии Popover
    staleTime: Infinity,
    retry: 1, // Попробовать еще раз в случае ошибки сети
  });

  if (cleaned.length < 3) {
    return <span>{children} </span>;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <span className="cursor-pointer text-primary hover:underline">{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        {isLoading && <p>Анализ слова...</p>}
        {isError && <p className="text-destructive">Не удалось проанализировать слово.</p>}
        {data && (
          <div className="space-y-3">
            <div>
              <h4 className="font-medium leading-none">{data.transliteration}</h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground capitalize">{data.sourceLanguage}</span>
                {data.isProperNoun && <Badge variant="secondary">Имя собственное</Badge>}
              </div>
            </div>
            <hr />
            <div>
                <p><b>Русский:</b> {data.russianTranslation}</p>
                <p><b>Английский:</b> {data.englishTranslation}</p>
            </div>
            {data.spiritualMeaning && (
                <>
                    <hr />
                    <p className="text-sm">
                    <b>Духовное значение:</b> {data.spiritualMeaning}
                    </p>
                </>
            )}
            <p className="text-xs text-right text-muted-foreground pt-2">Уверенность: {data.confidence}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
