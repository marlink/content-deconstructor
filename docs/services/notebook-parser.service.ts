import { Injectable } from '@angular/core';

// These are loaded from index.html and will be available globally.
declare var Readability: any;

@Injectable({
  providedIn: 'root',
})
export class ContentFetcherService {

  /**
   * Parses the content of a Jupyter Notebook (.ipynb) file.
   * Extracts markdown and code cells into a single string.
   * @param fileContent The raw string content of the .ipynb file.
   * @returns A formatted string containing the notebook's content.
   */
  private parseIpynb(fileContent: string): string {
    try {
      const notebook = JSON.parse(fileContent);
      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        return fileContent;
      }

      let content = '';
      for (const cell of notebook.cells) {
        if (cell.cell_type === 'markdown' || cell.cell_type === 'code') {
          const source = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source);
          if (cell.cell_type === 'code') {
            content += '```\n' + source + '\n```\n\n';
          } else {
            content += source + '\n\n';
          }
        }
      }
      return content.trim();
    } catch (error) {
      console.warn('Could not parse as JSON, treating as plain text.', error);
      return fileContent;
    }
  }

  /**
   * Parses an uploaded file, determining its type and extracting its text content.
   * @param file The file to parse.
   * @returns A promise that resolves to an object with the extracted content and the determined source type.
   */
  async parseFile(file: File): Promise<{ content: string; type: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          let content = text;
          let type = 'File';

          if (file.name.endsWith('.ipynb')) {
            content = this.parseIpynb(text);
            type = 'Jupyter Notebook';
          } else if (file.type.startsWith('text/')) {
            type = 'Text File';
          } else {
            type = file.name;
          }
          resolve({ content, type });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read the file.'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Fetches content from a public URL. Uses a CORS proxy and Readability.js for clean article extraction.
   * @param url The public URL to fetch.
   * @returns A promise resolving to the extracted content and its determined type.
   */
  async fetchFromUrl(url: string): Promise<{ content: string; type: string }> {
    if (url.endsWith('.pdf')) {
      throw new Error("Fetching remote PDF files via URL is not supported due to browser security restrictions (CORS). Please download the PDF and upload it directly.");
    }
      
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    
    let response: Response;
    try {
        response = await fetch(proxyUrl);
    } catch (networkError) {
        console.error("Network error during fetch:", networkError);
        throw new Error("A network error occurred. Please check your internet connection and if the proxy is accessible.");
    }

    if (!response.ok) { 
      throw new Error(`Network error: The content proxy returned a bad response (Status: ${response.status}).`); 
    }
    
    const data = await response.json();
    
    // Check for errors reported by the proxy about the target URL
    if (data.status.http_code && data.status.http_code >= 400) {
        const code = data.status.http_code;
        if (code === 404) {
            throw new Error(`Content not found at the source URL (Error 404). Please check if the URL is correct.`);
        }
        if (code === 403 || code === 401) {
            throw new Error(`Access denied to the source URL (Error ${code}). The resource may be private or require a login.`);
        }
        if (code >= 500) {
            throw new Error(`The remote server for the content encountered an error (Error ${code}). Please try again later.`);
        }
        throw new Error(`Failed to fetch content from the source URL (Error: ${code}). The URL may be invalid or blocked.`);
    }

    if (!data.contents) {
        throw new Error("The URL was fetched successfully, but the response contained no content.");
    }
    
    let content = data.contents;
    let type = 'Webpage';

    if (url.endsWith('.ipynb')) {
      content = this.parseIpynb(content);
      type = 'Jupyter Notebook';
    } else if (data.status.content_type && data.status.content_type.includes('html')) {
      try {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        const reader = new Readability(doc);
        const article = reader.parse();
        content = article?.textContent || doc.body.textContent || '';
        type = `Webpage Article (${article?.siteName || new URL(url).hostname})`;
      } catch (e) {
        console.warn("Readability.js parsing failed, falling back to raw text.", e);
        // Fallback to using the raw content if Readability fails
      }
    } else {
      // Handle cases where the content is not HTML, e.g. raw text or markdown files from github
      type = 'Remote Text File';
    }

    if (!content.trim()) {
      throw new Error("Could not extract meaningful content from the URL. The page might be empty or require JavaScript to render.");
    }

    return { content, type };
  }
}