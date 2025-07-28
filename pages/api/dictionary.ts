// File: pages/api/dictionary.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

// ✅ ЭТА СТРОКА РЕШАЕТ ПРОБЛЕМУ
// Увеличиваем максимальное время выполнения функции до 60 секунд
export const maxDuration = 60; 

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const words = await prisma.word.findMany();
    
    const dictionaryMap = words.reduce((acc, word) => {
      acc[word.sourceText] = word;
      return acc;
    }, {} as Record<string, any>);

    res.status(200).json(dictionaryMap);
  } catch (error) {
    console.error('Failed to fetch dictionary:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}
