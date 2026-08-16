const EXPLICIT_WEB_PATTERN = /검색|찾아\s*봐|찾아\s*줘|알아\s*봐|확인해\s*줘|웹에서|인터넷에서|최신|최근|실시간|(?:search|browse|look\s*up|find|check)\s+(?:the\s+)?(?:web|internet|online)|web\s*search|open\s+(?:the\s+)?(?:web\s*)?(?:page|site|url)/i;
const CURRENT_INFO_PATTERN = /오늘|내일|이번\s*주|현재|지금|뉴스|날씨|기온|미세먼지|환율|주가|시세|가격|요금|일정|시간표|운영\s*시간|영업\s*시간|교통|출시|업데이트|선거|대통령|대표|ceo|\b(?:today|tomorrow|current|latest|recent|live|news|weather|temperature|forecast|exchange\s*rate|stock\s*price|price|schedule|opening\s*hours|traffic|release|update|election|president|ceo)\b/i;
const FACT_QUESTION_PATTERN = /누구|언제|어디|얼마|몇\s*(?:시|명|개|살|년)|무엇|뭐야|정보|사실|알려\s*줘|설명해\s*줘/i;
const PERSONAL_SUPPORT_PATTERN = /내\s*(?:마음|기분|고민|생각)|오늘\s*(?:내게\s*)?있었던\s*일|하루를?\s*정리|속상|외로|우울|불안|싸웠|관계|위로|조언|어떻게\s*말/i;

export function shouldSearchGuardianWeb(question: string) {
  if (EXPLICIT_WEB_PATTERN.test(question)) return true;
  if (PERSONAL_SUPPORT_PATTERN.test(question)) return false;
  return CURRENT_INFO_PATTERN.test(question) || FACT_QUESTION_PATTERN.test(question);
}

export function buildGuardianWebSearchQuery(question: string) {
  let query = question.replace(/\s+/g, ' ').trim();

  query = query
    .replace(/^(?:please\s+)?(?:search|browse|look\s*up|find|check)\s+(?:(?:the\s+)?(?:web|internet|online)\s+)?(?:for\s+)?/i, '')
    .replace(/\s+(?:and\s+)?(?:answer|respond|reply)(?:\s+to\s+me)?\s+in\s+(?:the\s+)?(?:korean|english)(?:\s+language)?[.!?]*$/i, '')
    .replace(/^(?:웹|인터넷)에서\s*/i, '')
    .replace(/^(?:검색|조회)\s*[:：]?\s*/i, '')
    .replace(/\s*(?:검색|조회|확인|찾아|알아)\s*(?:해\s*)?(?:봐|줘|주세요|줄래|주실래)?[.!?]*$/i, '')
    .replace(/\s*(?:알려|말해|설명해)\s*(?:줘|주세요|줄래|주실래)?[.!?]*$/i, '')
    .trim();

  return (query || question.trim()).slice(0, 180);
}
