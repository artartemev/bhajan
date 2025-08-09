// File: client/utils.ts
// Создаем "заглушки" для хуков, чтобы приложение не падало
export function useAuth() {
    // Возвращаем базовый статус, т.к. реальной аутентификации нет
    return { status: "unauthenticated", signIn: function () { return alert("Sign in is not configured."); } };
}
export function useToast() {
    // Имитируем функцию toast из UI-библиотеки
    return { toast: function (_a) {
            var title = _a.title, description = _a.description;
            return console.log("Toast: ".concat(title, " - ").concat(description));
        } };
}
