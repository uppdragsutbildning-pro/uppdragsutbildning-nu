import { ReactNode } from 'react';

interface QuestionCardProps {
  id: string;
  question: string;
  meta?: string;
  children: ReactNode;
}

export function QuestionCard({ id, question, meta, children }: QuestionCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="mb-3">
        <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full mb-2">
          {id}
        </span>
        <p className="text-slate-900 font-medium">{question}</p>
        {meta && <p className="text-slate-500 text-sm italic mt-1">{meta}</p>}
      </div>
      {children}
    </div>
  );
}