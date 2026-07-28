import type { CategoryId } from './types';

export interface CategoryInfo {
  title: string;
  explanation: string;
  falsePositiveRisk: 'low' | 'medium' | 'high';
  strongSignal: boolean;
}

/**
 * Product copy for each finding category, ported from the reference skill's
 * interpretation table (pdf-stowaway-scanner/SKILL.md) and rewritten as UI copy.
 * Every CategoryId must have an entry — the report groups look categories up by
 * key, so a missing key would render as undefined.
 */
export const CATEGORIES: Record<CategoryId, CategoryInfo> = {
  near_white_text: {
    title: 'Near-white text',
    explanation:
      'Text colored so close to the page background that a human reader sees nothing, while an AI parsing the text layer reads it in full. White text on a white page is almost never legitimate.',
    falsePositiveRisk: 'low',
    strongSignal: true,
  },
  invisible_render_mode: {
    title: 'Invisible render mode',
    explanation:
      'Text drawn with PDF render mode 3, which paints no pixels at all yet stays in the machine-readable text layer. Normal authoring tools essentially never use this.',
    falsePositiveRisk: 'low',
    strongSignal: true,
  },
  tiny_font: {
    title: 'Tiny font',
    explanation:
      'Text set below 4pt — too small to read on screen or in print, but fully extractable by software. The most common source by far is a chart scaled down to fit a page: axis ticks and labels routinely land between 1pt and 4pt, and a single figure can account for hundreds of these. What is worth reading is the text that forms sentences rather than single words and numbers.',
    falsePositiveRisk: 'high',
    strongSignal: false,
  },
  outside_cropbox: {
    title: 'Off-page text',
    explanation:
      'Text that sits entirely outside the visible page area: present in the file, extractable by any tool that reads the whole page, and never drawn where a reader would see it. PDF engines normally clip it away before extraction — this scanner deliberately reads the full sheet first, so the text itself is quoted below. Text beyond the sheet of paper (outside the media box) stays out of reach.',
    falsePositiveRisk: 'low',
    strongSignal: false,
  },
  cropbox_mismatch: {
    title: 'Crop box mismatch',
    explanation:
      'The page is cropped smaller than its full media size, which can push content into the trimmed margins. Frequently benign in scanned files — inspect what falls outside the crop.',
    falsePositiveRisk: 'low',
    strongSignal: false,
  },
  hidden_layers: {
    title: 'Hidden layers',
    explanation:
      'Optional-content layers that are off by default or explicitly marked hidden. The layer contents stay in the file and remain readable by software even though they are not shown.',
    falsePositiveRisk: 'low',
    strongSignal: false,
  },
  embedded_files: {
    title: 'Embedded files',
    explanation:
      'One or more files attached inside the PDF. Routine on engineering datasheets, unusual on papers or contracts. The names are listed below — do not open them without checking.',
    falsePositiveRisk: 'low',
    strongSignal: false,
  },
  javascript: {
    title: 'Embedded JavaScript',
    explanation:
      'The document carries JavaScript, which can run when the file is opened in some viewers. Expected in interactive forms, out of place in a static paper or contract. It is never executed here.',
    falsePositiveRisk: 'low',
    strongSignal: false,
  },
  annotations: {
    title: 'Annotations',
    explanation:
      'Comments and sticky notes whose text is invisible in normal rendering but still sits in the file. Often legitimate, but a classic place to hide instructions — always read the content.',
    falsePositiveRisk: 'medium',
    strongSignal: false,
  },
  prompt_injection: {
    title: 'Prompt injection',
    explanation:
      'Text matching known patterns that try to steer an AI reviewer or summarizer — for example, telling it to ignore its instructions or return a positive verdict. Suggestive, not conclusive: a paper about prompt injection may quote such strings legitimately, so read the surrounding context.',
    falsePositiveRisk: 'low',
    strongSignal: false,
  },
  review_watermark: {
    title: 'Peer-review watermark',
    explanation:
      'Hidden text instructing an AI reviewer to work fixed phrases into its review. Some conferences add one to every submitted paper, so that a review written by a language model gives itself away when those phrases turn up in it — meaning a finding here says nothing about the authors, who usually have no idea it is there. Where a venue does this, its own guidance is normally that a watermark revealing AI use needs no action, while hidden text that tries to influence the decision does. Matched on the shape of the instruction, so read it as "looks like a reviewing watermark", not as proof of one.',
    falsePositiveRisk: 'low',
    strongSignal: false,
  },
};
