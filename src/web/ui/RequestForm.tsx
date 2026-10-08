import { useState, type ReactElement } from 'react';
import type { AgentQuestion, PendingRequest } from '../../shared/types';
import { sendControl, type ControlAccess } from '../state/control';
import { preview } from './format';

/**
 * A question or permission prompt an agent is waiting on, answered right here. It shows how long is
 * left before the normal dialog appears in the session instead.
 * @param props - access, the request, its session's name and the clock
 * @returns the form
 */
export function RequestForm({ access, request, sessionName, now }: { access: ControlAccess; request: PendingRequest; sessionName: string; now: number }): ReactElement {
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const secondsLeft = Math.max(0, Math.round((Date.parse(request.expiresAt) - now) / 1000));

  const send = async (body: unknown): Promise<void> => {
    setSending(true);
    setError(null);
    const reply = await sendControl<true>(access, `/api/requests/${request.id}/answers`, body);
    setSending(false);
    if (!reply.ok) setError(reply.error);
  };

  if (request.kind === 'permission') {
    return (
      <article className="request-form request-form--permission">
        <p className="request__who">{sessionName} needs permission</p>
        <p className="request__what">
          <strong>{request.tool}</strong> {request.summary !== request.tool ? request.summary : ''}
        </p>
        <pre className="request__detail" aria-label="Exactly what would be allowed">
          {request.detail}
        </pre>
        <div className="request__actions">
          <button
            type="button"
            className="button button--primary"
            disabled={sending || request.truncated}
            title={request.truncated ? 'Too long to review here; allow it in the session' : undefined}
            onClick={() => void send({ decision: 'allow' })}
          >
            Allow
          </button>
          <button type="button" className="button" disabled={sending} onClick={() => void send({ decision: 'deny' })}>
            Deny
          </button>
          <span className="request__clock">{secondsLeft}s left</span>
        </div>
        {request.truncated && <p className="notice-inline">This is too long to show in full. Deny it here, or read and allow it in the session.</p>}
        {error && <p className="notice-inline notice-inline--error">{error}</p>}
      </article>
    );
  }

  const answers = Object.fromEntries(request.questions.map((question) => [question.question, answerFor(question, choices[question.question] ?? [], other[question.question] ?? '')]));
  const complete = request.questions.every((question) => answers[question.question]);

  return (
    <article className="request-form">
      <p className="request__who">{sessionName} is asking you</p>
      {request.questions.map((question, index) => (
        <QuestionBlock
          key={index}
          question={question}
          chosen={choices[question.question] ?? []}
          other={other[question.question] ?? ''}
          onChoose={(label) => {
            setChoices((current) => {
              const picked = current[question.question] ?? [];
              const next = question.multiSelect ? (picked.includes(label) ? picked.filter((entry) => entry !== label) : [...picked, label]) : [label];
              return { ...current, [question.question]: next };
            });
            if (!question.multiSelect) setOther((current) => ({ ...current, [question.question]: '' }));
          }}
          onOther={(text) => {
            setOther((current) => ({ ...current, [question.question]: text }));
            if (!question.multiSelect && text.trim()) setChoices((current) => ({ ...current, [question.question]: [] }));
          }}
        />
      ))}
      <div className="request__actions">
        <button type="button" className="button button--primary" disabled={!complete || sending} onClick={() => void send({ answers })}>
          Send answer
        </button>
        <span className="request__clock">{secondsLeft}s left</span>
      </div>
      {error && <p className="notice-inline notice-inline--error">{error}</p>}
    </article>
  );
}

/**
 * One question: its options as buttons plus a free-text answer.
 * @param props - the question, current picks and handlers
 * @returns the block
 */
function QuestionBlock(props: { question: AgentQuestion; chosen: string[]; other: string; onChoose: (label: string) => void; onOther: (text: string) => void }): ReactElement {
  const { question, chosen, other } = props;
  return (
    <div className="question">
      <p className="question__text">{question.question}</p>
      <div className="question__options" role="group" aria-label={question.header || question.question}>
        {question.options.map((option, index) => (
          <button
            key={index}
            type="button"
            className="option"
            aria-pressed={chosen.includes(option.label)}
            onClick={() => props.onChoose(option.label)}
            title={option.description || undefined}
          >
            <span className="option__label">{option.label}</span>
            {option.description && <span className="option__description">{preview(option.description, 90)}</span>}
          </button>
        ))}
      </div>
      <input className="field__input" value={other} placeholder="Or type your own answer" onChange={(event) => props.onOther(event.target.value)} />
    </div>
  );
}

/**
 * The answer to send for one question. Typed text replaces a single-choice pick (it is the "Other"
 * answer); for a multiple-choice question it is added to the picks.
 * @param question - the question
 * @param chosen - picked option labels
 * @param other - typed answer
 * @returns answer text, empty when nothing is given
 */
export function answerFor(question: AgentQuestion, chosen: string[], other: string): string {
  const typed = other.trim();
  if (!question.multiSelect) return typed || chosen[0] || '';
  return [...chosen, typed].filter(Boolean).join(', ');
}
