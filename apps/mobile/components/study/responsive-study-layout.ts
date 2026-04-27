type ResponsiveStudyLayoutOptions = {
  screenWidth: number;
  baseFontSize: number;
  minFontSize: number;
  baseLineHeight: number;
  minLineHeight: number;
  shrinkStartWords: number;
  shrinkWordsPerStep: number;
  shrinkFontStep?: number;
  baseMinHeight?: number;
  expandStartWords?: number;
  expandWordsPerStep?: number;
  expandHeightStep?: number;
  maxExtraHeight?: number;
};

type ResponsiveStudyLayout = {
  fontSize: number;
  lineHeight: number;
  minHeight?: number;
  wordCount: number;
};

const WORD_MATCHER = /\S+/g;

export function getResponsiveStudyLayout(
  text: string | null | undefined,
  options: ResponsiveStudyLayoutOptions
): ResponsiveStudyLayout {
  const wordCount = countWords(text);
  const compactPenalty = getCompactPenalty(options.screenWidth);
  const shrinkFontStep = options.shrinkFontStep ?? 1.5;
  const baseFontSize = Math.max(options.minFontSize, options.baseFontSize - compactPenalty);
  const minFontSize = Math.max(11, options.minFontSize - compactPenalty * 0.5);
  const baseLineHeight = Math.max(options.minLineHeight, options.baseLineHeight - compactPenalty * 2);
  const minLineHeight = Math.max(minFontSize + 4, options.minLineHeight - compactPenalty);
  const shrinkSteps =
    wordCount > options.shrinkStartWords
      ? Math.ceil((wordCount - options.shrinkStartWords) / options.shrinkWordsPerStep)
      : 0;
  const fontSize = Math.max(minFontSize, baseFontSize - shrinkSteps * shrinkFontStep);
  const fontProgress =
    baseFontSize === minFontSize ? 1 : (baseFontSize - fontSize) / (baseFontSize - minFontSize);
  const lineHeight = Math.max(
    minLineHeight,
    Math.round(baseLineHeight - (baseLineHeight - minLineHeight) * fontProgress)
  );

  if (options.baseMinHeight == null) {
    return {
      fontSize,
      lineHeight,
      wordCount,
    };
  }

  const expandStartWords = options.expandStartWords ?? options.shrinkStartWords;
  const expandWordsPerStep = options.expandWordsPerStep ?? options.shrinkWordsPerStep;
  const expandHeightStep = options.expandHeightStep ?? 28;
  const baseMinHeight = options.baseMinHeight + compactPenalty * 18;
  const expansionThreshold = fontSize <= minFontSize + 0.25 ? expandStartWords : expandStartWords + expandWordsPerStep;
  const expandSteps =
    wordCount > expansionThreshold ? Math.ceil((wordCount - expansionThreshold) / expandWordsPerStep) : 0;
  const maxExtraHeight = options.maxExtraHeight ?? expandHeightStep * 6;
  const minHeight = baseMinHeight + Math.min(maxExtraHeight, expandSteps * expandHeightStep);

  return {
    fontSize,
    lineHeight,
    minHeight,
    wordCount,
  };
}

function countWords(text: string | null | undefined) {
  return text?.trim().match(WORD_MATCHER)?.length ?? 0;
}

function getCompactPenalty(screenWidth: number) {
  if (screenWidth <= 360) {
    return 2;
  }

  if (screenWidth <= 410) {
    return 1;
  }

  return 0;
}
