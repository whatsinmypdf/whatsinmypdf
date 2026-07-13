/**
 * Prompt-injection pattern library, ported from the Python reference
 * implementation `pdf-stowaway-scanner/scripts/scan_pdf.py`
 * (`DEFAULT_INJECTION_PATTERNS`, lines 46-71).
 *
 * Each pattern is compiled with the `i` flag to mirror Python's
 * `re.IGNORECASE`. `findInjections` mirrors the injection-scan block at
 * lines 229-243: find all matches, take a +/-40-char context snippet with
 * newlines replaced by spaces.
 */

export interface InjectionPattern {
  severity: 'high' | 'medium';
  rx: RegExp;
  description: string;
}

export interface InjectionHit {
  severity: 'high' | 'medium';
  description: string;
  match: string;
  context: string;
}

export const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    severity: 'high',
    rx: /ignore (all |the |any )?(previous|prior|above|earlier) (instructions|prompt|directives|guidance)/i,
    description: "Classic 'ignore previous instructions' injection",
  },
  {
    severity: 'high',
    rx: /disregard (all |the |any )?(previous|prior|above) (instructions|prompt|guidance)/i,
    description: 'Disregard-previous-instructions variant',
  },
  {
    severity: 'high',
    rx: /(?:^|[\s"'(\[])(?:system|assistant)\s*prompt\s*[:=]\s/i,
    description: 'Fake system/assistant prompt injection',
  },
  {
    severity: 'high',
    rx: /<\/?\s*(system|assistant|admin|instruction)\s*>/i,
    description: 'Fake chat-role tag (system/assistant/admin/instruction)',
  },
  {
    severity: 'high',
    rx: /(?:please\s+)?(?:give|provide|write|return)\s+(?:a\s+|an\s+)?(?:positive|favorable|strong\s+accept|glowing|highly\s+positive)\s+(?:review|recommendation|score|rating)/i,
    description: 'Reviewer-targeted positive-review injection',
  },
  {
    severity: 'high',
    rx: /recommend(?:ation)?\s+(?:strong\s+)?accept(?:ance)?\b(?!\s+(?:rate|criteria|threshold))/i,
    description: 'Reviewer-targeted accept injection',
  },
  {
    severity: 'high',
    rx: /do not (?:highlight|mention|reveal|disclose) (?:any |the )?(?:negatives?|weaknesses?|flaws?|limitations?|this prompt|these instructions)/i,
    description: 'Stealth-review instruction',
  },
  {
    severity: 'high',
    rx: /as (?:a |an )?(?:llm|language model|ai|assistant) (?:reviewer|reviewing|reading this)/i,
    description: 'AI-reviewer addressed instruction',
  },
  {
    severity: 'medium',
    rx: /forget (everything|all (?:previous|prior))/i,
    description: 'Memory-wipe instruction',
  },
  {
    severity: 'medium',
    rx: /\b(jailbreak|DAN mode|developer mode|god mode)\b/i,
    description: 'Jailbreak vocabulary',
  },
  {
    severity: 'medium',
    rx: /(?:write|output|respond) (?:only |exclusively )?['"][^'"]{1,60}['"] and nothing else/i,
    description: 'Output-only-X injection',
  },
  {
    severity: 'medium',
    rx: /if you are (an? )?(ai|llm|language model|assistant)[^.]{0,80}(then|please|you must)/i,
    description: 'AI-conditional injection',
  },
];

/**
 * Scan `text` for all configured injection patterns.
 *
 * For each pattern, all non-overlapping matches are collected (equivalent to
 * Python's `rx.finditer`). Context is `[match.start - 40, match.end + 40]`
 * (clamped to the string bounds) with newlines replaced by spaces, matching
 * the reference implementation's snippet logic.
 */
export function findInjections(text: string): InjectionHit[] {
  const hits: InjectionHit[] = [];

  for (const { severity, rx, description } of INJECTION_PATTERNS) {
    // Create a fresh global-flagged RegExp per call so `lastIndex` state
    // never leaks across invocations of findInjections, and matchAll can
    // safely drive iteration itself.
    const globalRx = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    for (const m of text.matchAll(globalRx)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const snippetStart = Math.max(0, start - 40);
      const snippetEnd = Math.min(text.length, end + 40);
      hits.push({
        severity,
        description,
        match: m[0],
        context: text.slice(snippetStart, snippetEnd).replace(/\n/g, ' '),
      });
    }
  }

  return hits;
}
