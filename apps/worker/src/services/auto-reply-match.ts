export interface AutoReplyMatcher {
  keyword: string;
  match_type: 'exact' | 'contains';
}

export function matchesAutoReply(rule: AutoReplyMatcher, incoming: string): boolean {
  return rule.match_type === 'exact'
    ? incoming === rule.keyword
    : incoming.includes(rule.keyword);
}
