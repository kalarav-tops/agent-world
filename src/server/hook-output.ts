/** PreToolUse output that answers an AskUserQuestion call on the user's behalf. */
export interface QuestionHookOutput {
  hookSpecificOutput: { hookEventName: 'PreToolUse'; permissionDecision: 'deny'; permissionDecisionReason: string };
}

/** PermissionRequest output that allows or denies a tool call. */
export interface PermissionHookOutput {
  hookSpecificOutput: { hookEventName: 'PermissionRequest'; decision: { behavior: 'allow' } | { behavior: 'deny'; message: string } };
}

/**
 * The hook output for questions answered in Agent World. The question tool call is denied (so the
 * dialog does not appear) and the reason carries the answers, which Claude reads and continues with.
 * @param answers - answer per question text
 * @returns hook output JSON
 */
export function questionOutput(answers: Record<string, string>): QuestionHookOutput {
  const lines = Object.entries(answers).map(([question, answer]) => `- ${question}: ${answer}`);
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `The user answered your question in Agent World, so the question dialog was not shown. Their answers:\n${lines.join('\n')}\nContinue using these answers.`,
    },
  };
}

/**
 * The hook output for a permission decision made in Agent World.
 * @param decision - allow or deny
 * @returns hook output JSON
 */
export function permissionOutput(decision: 'allow' | 'deny'): PermissionHookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: decision === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: 'The user denied this in Agent World.' },
    },
  };
}
