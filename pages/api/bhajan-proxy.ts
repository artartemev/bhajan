// File: pages/api/bhajan-proxy.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const API_URL = 'https://bhajan.miracall.net/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body), // Просто перенаправляем тело запроса
    });

    if (!response.ok) {
      // Перенаправляем статус ошибки от внешнего API
      return res.status(response.status).json({ message: 'Error from external API' });
    }

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ message: 'Internal Server Error in proxy' });
  }
}