// File: components/Word.tsx (финальная версия, работает только с локальным словарем)
import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useQuery } from '@tanstack/react-query';
import { Badge } from './ui/badge';
import { getWordFromCachedDictionary } from '../lib/db'; // ✅ Используем новую функцию

type WordAnalysis = {
  sourceLanguage: "sanskrit" | "bengali" | "unknown";
  transliteration: string;
  russianTranslation: string;
  englishTranslation: string;
  spiritualMeaning?: string;
  isProperNoun: boolean;
  confidence: "high" | "medium" | "low";
};

const cleanWord = (word: string) => {
  return word.toLowerCase().replace(/[.,!?;:"“]/g, '');
};

export const Word = ({ children }: { children: string }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const cleaned = cleanWord(children);

  // ✅ УПРОЩЕННАЯ ЛОГИКА: Просто ищем слово в кэше
  const { data, isLoading, isError } = useQuery<WordAnalysis | null>({
    queryKey: ['word', cleaned],
    queryFn: () => getWordFromCachedDictionary(cleaned),
    enabled: isOpen,
    staleTime: Infinity,
    retry: false,
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
        {isLoading && <p>Поиск в словаре...</p>}
        {isError && <p className="text-destructive">Ошибка при поиске в словаре.</p>}
        {!isLoading && !data && <p className="text-muted-foreground">Перевод для этого слова еще не добавлен в словарь.</p>}
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
