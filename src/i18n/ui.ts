// Typed UI-string dictionary for the React islands (Scanner, ReportView) and
// the locale-aware Astro components (Header, Footer). Page copy (headings,
// FAQ, article prose) lives directly in each locale's .astro page instead —
// this file only covers strings shared by components that must not be
// duplicated per locale.

export interface UiStrings {
  nav: {
    scanner: string;
    learn: string;
    about: string;
    switchTo: string; // aria-label prefix for the language switcher, e.g. "Switch to"
  };
  footer: {
    tagline: string;
    privacy: string;
    terms: string;
    sourceOnGithub: string;
    license: string;
  };
  scanner: {
    dropTitle: string;
    dropSubtitle: string;
    tryExample: string;
    demoLabels: {
      resume: string;
      hiddenLayer: string;
    };
    demoDownloadAria: (label: string) => string;
    loadingEngine: string;
    scanningForHiddenContent: string;
    runsLocally: string;
    cancel: string;
    scannedLabel: string;
    downloadJson: string;
    scanAnother: string;
    tryAnotherFile: string;
    errors: {
      notPdf: string;
      tooLarge: (size: string) => string;
      empty: string;
      readFailed: string;
      timedOut: string;
      failedToStart: string;
      demoLoadFailed: (fileName: string) => string;
    };
  };
  report: {
    finding: (n: number) => string;
    strongSignal: string;
    riskLabel: Record<'low' | 'medium' | 'high', string>;
    cleanTitle: string;
    cleanBody: string;
    dirtyTitle: (total: number, categories: number) => string;
    dirtyBody: string;
    detectedFallback: string;
    document: {
      heading: string;
      fileName: string;
      pages: string;
      producer: string;
      creator: string;
    };
    feedback: {
      prompt: string;
      linkLabel: string;
      note: string;
    };
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const en: UiStrings = {
  nav: {
    scanner: 'Scanner',
    learn: 'Learn',
    about: 'About',
    switchTo: 'Switch to',
  },
  footer: {
    tagline: 'Your files never leave your browser. Nothing is uploaded, nothing is stored.',
    privacy: 'Privacy',
    terms: 'Terms',
    sourceOnGithub: 'Source on GitHub',
    license: 'Licensed under AGPL-3.0-or-later',
  },
  scanner: {
    dropTitle: 'Drop a PDF here, or click to choose one',
    dropSubtitle: 'Scanned locally in your browser · up to 100 MB',
    tryExample: 'No suspicious PDF handy? Try an example:',
    demoLabels: {
      resume: 'Résumé with hidden instructions',
      hiddenLayer: 'Report with a hidden layer',
    },
    demoDownloadAria: (label) => `Download the "${label}" example PDF`,
    loadingEngine: 'Loading scan engine…',
    scanningForHiddenContent: 'Scanning for hidden content…',
    runsLocally: 'Everything runs on this page. Nothing is uploaded.',
    cancel: 'Cancel',
    scannedLabel: 'Scanned',
    downloadJson: 'Download JSON report',
    scanAnother: 'Scan another file',
    tryAnotherFile: 'Try another file',
    errors: {
      notPdf: 'That file is not a PDF. Choose a .pdf file to scan.',
      tooLarge: (size) =>
        `File is ${size}. The limit is 100 MB — everything runs in your browser, so larger files are declined.`,
      empty: 'That file is empty.',
      readFailed: 'Could not read that file from disk.',
      timedOut: 'Scan timed out. The file may be malformed or too complex.',
      failedToStart: 'The scanner failed to start.',
      demoLoadFailed: (fileName) =>
        `Could not load the example file (${fileName}). Try again, or use your own PDF.`,
    },
  },
  report: {
    finding: (n) => (n === 1 ? 'finding' : 'findings'),
    strongSignal: 'Strong signal',
    riskLabel: {
      low: 'Low false-positive risk',
      medium: 'Medium false-positive risk',
      high: 'High false-positive risk',
    },
    cleanTitle: 'No hidden content found',
    cleanBody:
      'A clean structural scan is not proof of safety. This tool inspects the text and structure layers only — text baked into images, glyph-substitution tricks, and semantic obfuscation are out of scope. If suspicion remains, rasterize the pages and OCR them, then compare against this text layer.',
    dirtyTitle: (total, categories) =>
      `${total} ${total === 1 ? 'finding' : 'findings'} across ${categories} ${categories === 1 ? 'category' : 'categories'}`,
    dirtyBody:
      'Review each finding in context below. A match is a signal to inspect, not a verdict on its own.',
    detectedFallback: 'Detected.',
    document: {
      heading: 'Document',
      fileName: 'File name',
      pages: 'Pages',
      producer: 'Producer',
      creator: 'Creator',
    },
    // prompt and note carry their own spacing and punctuation: ReportView
    // concatenates prompt + link + note with nothing in between, so each
    // locale controls its own separators.
    feedback: {
      prompt: 'Does this result look wrong? ',
      linkLabel: 'Report a false positive or a missed detection',
      note: '. Opens GitHub. Nothing from this scan is attached — your file never left this browser, so you decide what to share.',
    },
  },
};

export const zh: UiStrings = {
  nav: {
    scanner: '扫描',
    learn: '文章',
    about: '关于',
    switchTo: '切换到',
  },
  footer: {
    tagline: '文件不会离开你的浏览器，不会被上传，也不会被存储。',
    privacy: '隐私',
    terms: '条款',
    sourceOnGithub: 'GitHub 源码',
    license: '基于 AGPL-3.0-or-later 协议开源',
  },
  scanner: {
    dropTitle: '将 PDF 拖到这里，或点击选择文件',
    dropSubtitle: '在浏览器本地扫描 · 最大 100 MB',
    tryExample: '手头没有可疑的 PDF？试试示例文件：',
    demoLabels: {
      resume: '藏有隐藏指令的简历',
      hiddenLayer: '带隐藏图层的报告',
    },
    demoDownloadAria: (label) => `下载示例 PDF「${label}」`,
    loadingEngine: '正在加载扫描引擎…',
    scanningForHiddenContent: '正在扫描隐藏内容…',
    runsLocally: '整个过程都在这个页面完成，不会上传任何内容。',
    cancel: '取消',
    scannedLabel: '已扫描',
    downloadJson: '下载 JSON 报告',
    scanAnother: '扫描另一个文件',
    tryAnotherFile: '换一个文件试试',
    errors: {
      notPdf: '这不是一个 PDF 文件，请选择一个 .pdf 文件进行扫描。',
      tooLarge: (size) => `文件大小为 ${size}，超过 100 MB 的上限。扫描在浏览器本地完成，因此拒绝处理更大的文件。`,
      empty: '这个文件是空的。',
      readFailed: '无法从磁盘读取该文件。',
      timedOut: '扫描超时，文件可能已损坏或结构过于复杂。',
      failedToStart: '扫描器启动失败。',
      demoLoadFailed: (fileName) => `无法加载示例文件（${fileName}），请重试，或使用你自己的 PDF。`,
    },
  },
  report: {
    finding: () => '条发现',
    strongSignal: '强信号',
    riskLabel: {
      low: '误报风险低',
      medium: '误报风险中等',
      high: '误报风险高',
    },
    cleanTitle: '未发现隐藏内容',
    cleanBody:
      '结构扫描结果干净，并不能证明文件安全。本工具只检查文本层和文件结构，图片里嵌入的文字、字形替换手法、语义层面的伪装均不在检测范围内。如果仍有怀疑，可以把每页转成图片再做 OCR，然后与这里的文本层对比。',
    dirtyTitle: (total, categories) => `共 ${total} 条发现，涉及 ${categories} 个类别`,
    dirtyBody: '请在下方逐条查看每条发现的上下文。命中某个模式只是一个需要留意的信号，不是最终结论。',
    detectedFallback: '已检测到。',
    document: {
      heading: '文档信息',
      fileName: '文件名',
      pages: '页数',
      producer: '生成程序',
      creator: '创建程序',
    },
    feedback: {
      prompt: '结果看起来不对？',
      linkLabel: '报告误报或漏报',
      note: '。会跳转到 GitHub，本次扫描的任何内容都不会被附带过去。文件始终留在你的浏览器里，分享什么由你决定。',
    },
  },
};

export function getUiStrings(locale: 'en' | 'zh'): UiStrings {
  return locale === 'zh' ? zh : en;
}

export { formatBytes };
