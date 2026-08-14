import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';

export function Login() {
  const { isAuthenticated, requestMagicCode, verifyMagicCode, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function handleRequestCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestMagicCode(email.trim().toLowerCase());
      setCodeSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить код');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyMagicCode(email.trim().toLowerCase(), code.trim());
      navigate(from, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Неверный или истёкший код');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-sm border bg-card rounded-xl p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">L</span>
          <div>
            <h1 className="text-xl font-bold leading-tight">Lumo</h1>
            <p className="text-sm text-muted-foreground">Alto Coffee Bishkek</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6">Вход в панель управления</p>

        {codeSent ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Код отправлен на <span className="font-medium text-foreground">{email}</span>.
            </p>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Код из письма</label>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-background"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Проверяем…' : 'Войти'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setCode('');
                setCodeSent(false);
                setError(null);
              }}
              className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Изменить email
            </button>
          </form>
        ) : (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Эл. почта</label>
              <input
                type="email"
                autoComplete="email"
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-background"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Отправляем…' : 'Получить код'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
