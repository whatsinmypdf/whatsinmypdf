import type { CategoryId } from '@/lib/scanner/types';
import { CATEGORIES, type CategoryInfo } from '@/lib/scanner/categories';
import type { Locale } from './locales';

// zh title/explanation for each detection category. The structural fields
// (falsePositiveRisk, strongSignal) are canonical and come from
// src/lib/scanner/categories.ts regardless of locale — only the copy is
// translated here, so the detection logic file stays untouched.
const CATEGORIES_ZH: Record<CategoryId, Pick<CategoryInfo, 'title' | 'explanation'>> = {
  near_white_text: {
    title: '近白色文字',
    explanation:
      '文字颜色与页面背景几乎相同，人眼看是一片空白，但 AI 解析文本层时能完整读出。白底白字几乎从来都不是无意的。',
  },
  invisible_render_mode: {
    title: '隐形渲染模式',
    explanation:
      '文字以 PDF 渲染模式 3 绘制，不会画出任何像素，却仍留在可被机器读取的文本层中。正常的排版工具几乎不会用到这种模式。',
  },
  tiny_font: {
    title: '极小字号',
    explanation:
      '字号小于 4pt，屏幕或打印都看不清，但软件仍能完整提取。最常见的来源是被缩小后放进版面的图表：坐标轴刻度和标签经常落在 1pt 到 4pt 之间，一张图就能产生几百条。真正值得读的是那些成句子的文字，而不是单个的词和数字。',
  },
  outside_cropbox: {
    title: '页面外文字',
    explanation:
      '完全落在可视页面范围之外的文字：它存在于文件里，任何读取整页的工具都能提取到，却从来没有被画在读者看得见的地方。PDF 引擎通常会在提取之前就把这类文字裁掉，本工具特意先按整张纸读一遍，所以下面能直接引用原文。超出整张纸范围（媒体框之外）的文字仍然取不到。',
  },
  cropbox_mismatch: {
    title: '裁剪框不匹配',
    explanation:
      '页面的裁剪范围比完整的原始尺寸更小，可能把部分内容挤到了被裁掉的边缘之外。这在扫描件里往往是无害的，建议检查裁剪掉的部分究竟是什么。',
  },
  hidden_layers: {
    title: '隐藏图层',
    explanation:
      '默认关闭或被显式标记为隐藏的可选内容图层。图层的内容仍留在文件里，软件依然可以读取，即便没有显示出来。',
  },
  embedded_files: {
    title: '嵌入文件',
    explanation:
      'PDF 内附带了一个或多个文件。工程数据表里常见，出现在论文或合同里则不寻常。附件名称会在下方列出，打开前请先核实。',
  },
  javascript: {
    title: '嵌入 JavaScript',
    explanation:
      '文档携带 JavaScript 代码，部分阅读器打开文件时会执行它。出现在交互式表单里属正常，出现在静态论文或合同里则不寻常。这里只报告其存在，不会执行它。',
  },
  annotations: {
    title: '批注',
    explanation:
      '评论和便签的文字在正常渲染下不可见，但仍留在文件里。多数情况下是编辑过程留下的无害内容，但也是藏匿指令的常见位置，务必读一读批注内容。',
  },
  prompt_injection: {
    title: '提示词注入',
    explanation:
      '文本匹配了已知的、试图操纵 AI 审阅者或摘要工具的模式，例如让它忽略原有指令或给出正面结论。这一发现仅供参考，并非定论，一篇讨论提示词注入的论文可能会合理地引用这类文字，需结合上下文判断。',
  },
};

export function getCategories(locale: Locale): Record<CategoryId, CategoryInfo> {
  if (locale === 'en') return CATEGORIES;
  const merged = {} as Record<CategoryId, CategoryInfo>;
  for (const id of Object.keys(CATEGORIES) as CategoryId[]) {
    merged[id] = { ...CATEGORIES[id], ...CATEGORIES_ZH[id] };
  }
  return merged;
}
