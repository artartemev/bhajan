import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    const storedFavorites = localStorage.getItem('bhajanFavorites');
    if (storedFavorites) {
      setFavoriteIds(JSON.parse(storedFavorites));
    }
  }, []);

  const toggleFavorite = (bhajanId: string) => {
    const newFavoriteIds = favoriteIds.includes(bhajanId)
      ? favoriteIds.filter((id) => id !== bhajanId)
      : [...favoriteIds, bhajanId];
    setFavoriteIds(newFavoriteIds);
    localStorage.setItem('bhajanFavorites', JSON.stringify(newFavoriteIds));
    queryClient.invalidateQueries();
  };

  const isFavorite = (bhajanId: string) => favoriteIds.includes(bhajanId);

  return { favoriteIds, toggleFavorite, isFavorite };
}
