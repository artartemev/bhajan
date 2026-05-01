import React from 'react';

export function useShareBhajan() {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const share = async (bhajan: { id: string; title: string; author: string }) => {
    const url = `${window.location.origin}/bhajan/${bhajan.id}`;
    const shareData = { title: bhajan.title, text: `${bhajan.title} — ${bhajan.author}`, url };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(bhajan.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      prompt('Скопируйте ссылку:', url);
    }
  };

  return { share, copiedId };
}
