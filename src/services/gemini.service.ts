import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { ArticleChannel, ArticleVoice, InsightBlock } from '../models/notebook.model';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private readonly ai: GoogleGenAI;

  constructor() {
    // IMPORTANT: This relies on `process.env.API_KEY` being set in the environment.
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set.");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async deconstructContent(content: string, sourceType: string): Promise<InsightBlock[]> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `
          Here is the content from a ${sourceType}:
          ---
          ${content}
          ---
          Please deconstruct this content and respond ONLY with a JSON array of insight block objects. Ensure each object has a unique id.
        `,
        config: {
          systemInstruction: `You are an expert data science and content strategy analyst. Your task is to deconstruct the provided content from a web source (like a notebook, an article, or a webpage) into distinct, meaningful "insight blocks". Each block should represent a self-contained piece of information. Analyze the text, code, and outputs to identify these blocks. Pay special attention to sections that define the core problem, describe the methodology, or discuss the limitations or potential weaknesses of the approach or findings. For each block, you must provide the following information in a structured JSON format.`,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 }, // Speeds up the response for structured extraction tasks.
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: 'Categorize the block. Examples: "Problem Statement", "Data Source", "Methodology", "Code Explanation", "Code Snippet", "Data Visualization", "Result", "Limitation", "Future Work", "Conclusion", "Narrative", "Hypothesis", "KPI", "Metric".' },
                content: { type: Type.STRING, description: 'The full, original plain-text content of the block. For code, include the code itself.' },
                summary: { type: Type.STRING, description: 'A concise, compelling summary of the block, maximum 500 characters.' },
                tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Generate 3-5 relevant lowercase tags for easy filtering.' },
                confidenceScore: { type: Type.NUMBER, description: 'Your confidence (0.0 to 1.0) that this is a distinct and valuable insight.' }
              },
            },
          },
        },
      });

      const jsonText = response.text.trim();
      const blocks = JSON.parse(jsonText) as Omit<InsightBlock, 'id'>[];
      return blocks.map(block => ({...block, id: crypto.randomUUID() }));

    } catch (error) {
      console.error('Error deconstructing notebook with Gemini:', error);
      throw new Error('The AI failed to process the content. The content might be too complex or the format unsupported.');
    }
  }

  async rewriteArticle(blocks: InsightBlock[], channel: ArticleChannel, voice: ArticleVoice): Promise<string> {
     try {
       const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `
          **Target Channel:** ${channel}
          **Target Voice:** ${voice}

          Here are the JSON blocks to synthesize into a complete article:
          ---
          ${JSON.stringify(blocks)}
          ---
        `,
        config: {
          systemInstruction: `You are an expert writer and editor. Your task is to synthesize the provided JSON content blocks into a single, cohesive, well-structured article. Do not just list the blocks or use their 'type' as a heading. Instead, weave them together into a flowing narrative. Generate natural, meaningful headings and subheadings where appropriate to structure the article. The final output should be a complete, polished article. Your response must be a single JSON object containing the final article as a string in Markdown format.`,
          responseMimeType: 'application/json',
           responseSchema: {
            type: Type.OBJECT,
            properties: {
              articleContent: {
                type: Type.STRING,
                description: 'The full, rewritten article in Markdown format, with headings, paragraphs, and proper formatting.'
              }
            },
            required: ['articleContent']
          },
        },
      });
       
      const jsonText = response.text.trim();
      const result = JSON.parse(jsonText);
      return result.articleContent;

    } catch (error)
    {
      console.error('Error rewriting article with Gemini:', error);
      throw new Error('The AI failed to rewrite the article.');
    }
  }
}