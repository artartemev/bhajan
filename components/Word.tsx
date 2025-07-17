// File: components/Word.tsx (исправленная версия)
import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useQuery } from '@tanstack/react-query';
import { Badge } from './ui/badge';

type WordAnalysis = {
  sourceLanguage: "sanskrit" | "bengali" | "unknown";
  transliteration: string;
  russianTranslation: string;
  englishTranslation: string;
  spiritualMeaning?: string;
  isProperNoun: boolean;
  confidence: "high" | "medium" | "low";
};

const fetchWordAnalysis = async (word: string): Promise<WordAnalysis> => {
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
  return word.replace(/[.,!?;:]+$/, '').replace(/^-/, '');
};

export const Word = ({ children }: { children: string }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const cleaned = cleanWord(children);

  // ✅ ИСПРАВЛЕНИЕ 1: Достаем isError из хука
  const { data, isLoading, isError } = useQuery<WordAnalysis>({
    queryKey: ['word', cleaned],
    queryFn: () => fetchWordAnalysis(cleaned),
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
        {isLoading && <p>Analyzing word...</p>}
        {/* ✅ ИСПРАВЛЕНИЕ 2: Используем isError вместо error */}
        {isError && <p className="text-destructive">Could not analyze word.</p>}
        {data && (
          <div className="space-y-3">
            <div>
              <h4 className="font-medium leading-none">{data.transliteration}</h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground capitalize">{data.sourceLanguage}</span>
                {data.isProperNoun && <Badge variant="secondary">Proper Noun</Badge>}
              </div>
            </div>
            <hr />
            <div>
                <p><b>Russian:</b> {data.russianTranslation}</p>
                <p><b>English:</b> {data.englishTranslation}</p>
            </div>
            {data.spiritualMeaning && (
                <>
                    <hr />
                    <p className="text-sm">
                    <b>Spiritual meaning:</b> {data.spiritualMeaning}
                    </p>
                </>
            )}
            <p className="text-xs text-right text-muted-foreground pt-2">Confidence: {data.confidence}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};