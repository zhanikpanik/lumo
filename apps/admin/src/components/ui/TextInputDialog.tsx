import { useState } from 'react';
import { Modal } from './Modal';

interface TextInputDialogProps {
  title: string;
  label: string;
  initialValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
}

export function TextInputDialog({
  title,
  label,
  initialValue = '',
  submitLabel = 'Сохранить',
  onSubmit,
  onClose,
}: TextInputDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = value.trim();
    if (!name) return;
    setPending(true);
    try {
      await onSubmit(name);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-foreground" htmlFor="dialog-text-input">
          {label}
        </label>
        <input
          id="dialog-text-input"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={pending}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        />
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50">
            Отмена
          </button>
          <button type="submit" disabled={pending || !value.trim()} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {pending ? 'Подождите…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
