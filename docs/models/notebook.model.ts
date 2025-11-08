export interface InsightBlock {
  id: string;
  type: string;
  content: string;
  summary: string;
  tags: string[];
  confidenceScore: number;
}

export type ArticleChannel = 'Blog Post' | 'LinkedIn' | 'X.com Post' | 'Technical Paper';
export type ArticleVoice = 'Formal' | 'Conversational' | 'Creative' | 'Journalistic';
