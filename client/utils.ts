// File: client/utils.ts
// Создаем "заглушки" для хуков, чтобы приложение не падало

export function useAuth() {
  // Возвращаем базовый статус, т.к. реальной аутентификации нет
  return { status: "unauthenticated", signIn: () => alert("Sign in is not configured.") };
}

export function useToast() {
  // Имитируем функцию toast из UI-библиотеки
  return { toast: ({ title, description }: { title: string, description?: string }) => console.log(`Toast: ${title} - ${description}`) };
}