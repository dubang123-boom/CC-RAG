/**
 * Post-generation validation and auto-cleanup for defense documents.
 */

export interface ValidationResult {
  /** Auto-cleaned markdown (source annotations removed) */
  cleaned: string;
  /** Warnings for issues that couldn't be auto-fixed */
  warnings: string[];
  /** Whether all required sections are present */
  isComplete: boolean;
}

/**
 * Validate and clean a generated defense document.
 * Auto-fixes what it can (source annotations), warns about the rest.
 */
export function validateGeneratedDocument(
  fullMarkdown: string,
  hearingEligible: boolean
): ValidationResult {
  const warnings: string[] = [];
  let cleaned = fullMarkdown;

  // 1. Auto-clean: Remove source annotations leaked into text
  const annotationPatterns = [
    /（用户明确回答[^）]*）/g,
    /（用户回答[^）]*）/g,
    /（根据处罚文书[^）]*）/g,
    /（结合上下文[^）]*）/g,
    /（处罚文书记载[^）]*）/g,
    /（来源[：:][^）]*）/g,
    /（文书原文[^）]*）/g,
  ];

  let hasAnnotations = false;
  for (const pattern of annotationPatterns) {
    if (pattern.test(cleaned)) {
      hasAnnotations = true;
      cleaned = cleaned.replace(pattern, '');
    }
  }
  if (hasAnnotations) {
    warnings.push('检测到来源标注泄漏，已自动清除');
  }

  // 2. Check three-part completeness
  const sections = cleaned.split(/\n---\n/);

  if (sections.length < 2) {
    warnings.push('缺少证据清单（第二段），文书不完整');
  }
  if (hearingEligible && sections.length < 3) {
    warnings.push('罚款金额达到听证标准但缺少听证申请书（第三段）');
  }

  // 3. Check for unfilled placeholder brackets [xxx]
  // Exclude markdown links [text](url) and table alignment [---|---]
  const placeholderRegex = /\[([^\]]{2,})\](?!\()/g;
  const placeholders: string[] = [];
  let match;
  while ((match = placeholderRegex.exec(cleaned)) !== null) {
    const content = match[1];
    // Skip table separators and common non-placeholder patterns
    if (content.includes('---') || content.includes('证据清单') || content === '加盖公章') continue;
    placeholders.push(match[0]);
  }
  if (placeholders.length > 0) {
    warnings.push(`检测到未填充的占位符：${placeholders.slice(0, 3).join('、')}`);
  }

  // 4. Check signature block in first section
  const firstSection = sections[0] || '';
  if (!firstSection.includes('公章') && !firstSection.includes('签字')) {
    warnings.push('正文缺少落款（公章/签字栏）');
  }

  // 5. Check evidence section has table markers
  if (sections.length >= 2) {
    const evidenceSection = sections[1];
    if (!evidenceSection.includes('|')) {
      warnings.push('证据清单缺少表格格式');
    }
  }

  const isComplete = sections.length >= (hearingEligible ? 3 : 2);

  return { cleaned, warnings, isComplete };
}
