// Централизованная точка логирования. Сейчас обёртка над console, но
// добавлена сразу как стабильное API: когда подключим @sentry/react-native или
// sentry-expo, заменим тело методов — все вызовы уже на месте.

type LogContext = Record<string, unknown>;

function formatTag(tag: string): string {
  return `[${tag}]`;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export const logger = {
  /**
   * Лог-ошибка с тегом. Тег = короткое название точки в коде, удобно для
   * grep в DevTools и для Sentry breadcrumbs/transaction names.
   */
  error(tag: string, error: unknown, context?: LogContext): void {
    if (context) {
      console.error(formatTag(tag), extractMessage(error), context, error);
    } else {
      console.error(formatTag(tag), extractMessage(error), error);
    }
    // TODO(sentry): captureException(error, { tags: { source: tag }, extra: context });
  },

  warn(tag: string, message: string, context?: LogContext): void {
    if (context) {
      console.warn(formatTag(tag), message, context);
    } else {
      console.warn(formatTag(tag), message);
    }
    // TODO(sentry): captureMessage(message, { level: 'warning', tags: { source: tag }, extra: context });
  },

  info(tag: string, message: string, context?: LogContext): void {
    if (context) {
      console.info(formatTag(tag), message, context);
    } else {
      console.info(formatTag(tag), message);
    }
  },
};
