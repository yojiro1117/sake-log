import type { ReactNode } from 'react';

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-rice">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-rice/76">
      <span>{label}</span>
      {children}
    </label>
  );
}
