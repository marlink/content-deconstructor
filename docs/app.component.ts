import { ChangeDetectionStrategy, Component, computed, inject, signal, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Subscription, interval, takeWhile } from 'rxjs';

import { GeminiService } from './services/gemini.service';
import { ContentFetcherService } from './services/notebook-parser.service';
import { ArticleChannel, ArticleVoice, InsightBlock } from './models/notebook.model';
import { InsightBlockComponent } from './components/insight-block/insight-block.component';

// These are loaded from index.html and will be available globally.
declare var marked: any;

type AppState =
  | { view: 'initial'; error: string | null }
  | { view: 'loading'; message: string }
  | { view: 'insights' }
  | { view: 'rewriting'; message: string }
  | { view: 'article' };

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, InsightBlockComponent],
  template: `
    <div class="bg-slate-50 min-h-screen font-sans text-slate-800">
      <header class="bg-white border-b border-slate-200 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div class="flex justify-between items-start">
            <div>
              <h1 class="text-2xl font-bold text-slate-900">AI Content Synthesizer</h1>
              <p class="text-sm text-slate-500">Deconstruct notebooks, articles, and webpages into key insights, then rewrite them for any audience.</p>
            </div>
            <span class="ml-4 flex-shrink-0 text-xs font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded-full">v{{ version }}</span>
          </div>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        @switch (state().view) {
          @case ('initial') {
            <div class="bg-white p-8 rounded-lg shadow-md max-w-2xl mx-auto">
              <h2 class="text-lg font-semibold mb-4 text-center">Start by providing content</h2>
              
              <div class="mb-6">
                <label for="url-input" class="block text-sm font-medium text-slate-700 mb-1">From a public URL</label>
                <div class="flex gap-2">
                  <input #urlInput type="url" id="url-input" (keyup.enter)="startUrlProcessing(urlInput.value)" placeholder="https://example.com/article" class="flex-grow p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  <button (click)="startUrlProcessing(urlInput.value)" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Fetch</button>
                </div>
              </div>

              <div class="relative my-6">
                <div class="absolute inset-0 flex items-center" aria-hidden="true">
                  <div class="w-full border-t border-slate-300"></div>
                </div>
                <div class="relative flex justify-center">
                  <span class="px-2 bg-white text-sm text-slate-500">OR</span>
                </div>
              </div>

              <div>
                <label for="file-upload" class="block text-sm font-medium text-slate-700 mb-2">From a local file</label>
                <div class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md">
                  <div class="space-y-1 text-center">
                    <svg class="mx-auto h-12 w-12 text-slate-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    <div class="flex text-sm text-slate-600">
                      <label for="file-upload" class="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                        <span>Upload a file</span>
                        <input id="file-upload" name="file-upload" type="file" class="sr-only" (change)="startFileProcessing($event)">
                      </label>
                      <p class="pl-1">or drag and drop</p>
                    </div>
                    <p class="text-xs text-slate-500">.ipynb, .txt, .md, etc.</p>
                  </div>
                </div>
              </div>
              @if (state(); as s) {
                @if(s.error) {
                    <div class="mt-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm">
                        <strong>Error:</strong> {{ s.error }}
                    </div>
                }
              }
            </div>
          }
          @case ('loading') {
             <div class="text-center py-20 max-w-2xl mx-auto">
              <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p class="mt-4 text-lg font-semibold text-slate-700">{{ state().message }} ({{ elapsedTime() }}s)</p>
              <button (click)="stopProcess()" class="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-semibold">Stop</button>
              
              @if(isPaused()) {
                <div class="mt-6 p-4 bg-yellow-100 border border-yellow-300 rounded-md">
                  <p class="text-sm text-yellow-800">Processing is taking longer than expected. The analysis is continuing in the background.</p>
                  <button (click)="continueProcess()" class="mt-2 px-3 py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 text-sm font-semibold">Continue Monitoring</button>
                </div>
              }
            </div>
          }
          @case ('insights') {
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">Source Insights <span class="text-base font-normal text-slate-500">({{ insightBlocks().length }})</span></h2>
                    <button (click)="reset()" class="text-sm text-blue-600 hover:underline">Start Over</button>
                </div>
                <div class="space-y-3 max-h-[75vh] overflow-y-auto pr-2">
                  @for (block of insightBlocks(); track block.id) {
                    <div draggable="true" (dragstart)="onDragStart(block)" (dragend)="onDragEnd()">
                      <app-insight-block 
                        [block]="block" 
                        [isInSkeleton]="skeletonBlockIds().has(block.id)"
                        (addToSkeleton)="addToSkeleton($event)"
                        (removeFromSkeleton)="removeFromSkeleton($event)"
                        />
                    </div>
                  }
                </div>
              </div>
              
              <div 
                class="sticky top-8 self-start transition-all"
                (dragover)="onSkeletonDragOver($event)"
                (dragleave)="onSkeletonDragLeave()"
                (drop)="onSkeletonDrop()"
                [class.scale-105]="isDraggingOverSkeleton()"
              >
                <h2 class="text-xl font-bold mb-4">Article Skeleton <span class="text-base font-normal text-slate-500">({{ skeletonBlocks().length }})</span></h2>
                <div 
                  class="bg-white p-4 rounded-lg shadow-md min-h-[40vh] flex flex-col transition-colors"
                  [class.bg-blue-50]="isDraggingOverSkeleton()"
                >
                  @if (skeletonBlocks().length === 0) {
                    <div class="flex-grow flex items-center justify-center text-center text-slate-500 border-2 border-dashed border-slate-300 rounded-lg">
                      <p>Drag insights here or click the '+'<br>to build your article outline.</p>
                    </div>
                  } @else {
                    <div class="space-y-2 flex-grow overflow-y-auto max-h-[50vh]">
                      @for (block of skeletonBlocks(); track block.id; let i = $index) {
                         <div 
                          class="flex items-start gap-2 p-2 bg-slate-50 rounded-md cursor-grab"
                          draggable="true"
                          (dragstart)="onSkeletonItemDragStart(i)"
                          (dragend)="onSkeletonItemDragEnd()"
                          (dragover)="onSkeletonItemDragOver($event, i)"
                          [class.border-t-2]="dropTargetSkeletonIndex() === i && draggedSkeletonIndex() !== i"
                          [class.border-blue-500]="dropTargetSkeletonIndex() === i && draggedSkeletonIndex() !== i"
                          [class.opacity-50]="draggedSkeletonIndex() === i"
                         >
                           <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="getBlockColor(block.type)">{{ block.type }}</span>
                           <p class="text-sm text-slate-700 flex-1">{{ block.summary }}</p>
                           <button (click)="removeFromSkeleton(block.id)" title="Remove from skeleton" class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-sm font-semibold bg-red-100 text-red-700 hover:bg-red-200">-</button>
                         </div>
                      }
                    </div>
                  }

                  @if (skeletonBlocks().length > 0) {
                    <div class="border-t border-slate-200 mt-4 pt-4">
                      <h3 class="text-md font-semibold mb-3">Rewrite Options</h3>
                      <div class="grid grid-cols-2 gap-4">
                        <div>
                          <label for="channel" class="block text-sm font-medium text-slate-700">Channel</label>
                          <select id="channel" [ngModel]="selectedChannel()" (ngModelChange)="selectedChannel.set($event)" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                            @for (channel of articleChannels; track channel) {
                              <option [value]="channel">{{ channel }}</option>
                            }
                          </select>
                        </div>
                         <div>
                          <label for="voice" class="block text-sm font-medium text-slate-700">Voice</label>
                          <select id="voice" [ngModel]="selectedVoice()" (ngModelChange)="selectedVoice.set($event)" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                            @for (voice of articleVoices; track voice) {
                              <option [value]="voice">{{ voice }}</option>
                            }
                          </select>
                        </div>
                      </div>
                      <button (click)="handleRewrite()" class="mt-4 w-full bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 transition-colors">
                        Synthesize Article
                      </button>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
          @case ('rewriting') {
            <div class="text-center py-20 max-w-2xl mx-auto">
              <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
              <p class="mt-4 text-lg font-semibold text-slate-700">{{ state().message }} ({{ elapsedTime() }}s)</p>
              <p class="text-sm text-slate-500">This can take a moment.</p>
              <button (click)="stopProcess()" class="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-semibold">Stop</button>
               @if(isPaused()) {
                <div class="mt-6 p-4 bg-yellow-100 border border-yellow-300 rounded-md">
                  <p class="text-sm text-yellow-800">Processing is taking longer than expected. The analysis is continuing in the background.</p>
                  <button (click)="continueProcess()" class="mt-2 px-3 py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 text-sm font-semibold">Continue Monitoring</button>
                </div>
              }
            </div>
          }
          @case ('article') {
            <div class="bg-white p-8 rounded-lg shadow-md max-w-4xl mx-auto">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold">Your Synthesized Article</h2>
                    <button (click)="reset()" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Start Over</button>
                </div>
                <div class="prose max-w-none text-slate-700 leading-relaxed" [innerHTML]="rewrittenArticleHtml()">
                </div>
            </div>
          }
        }
      </main>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnDestroy {
  private readonly contentFetcher = inject(ContentFetcherService);
  private readonly geminiService = inject(GeminiService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly version = '0.0.1';
  state = signal<AppState>({ view: 'initial', error: null });
  insightBlocks = signal<InsightBlock[]>([]);
  skeletonBlocks = signal<InsightBlock[]>([]);
  rewrittenArticle = signal<string>('');
  
  readonly articleChannels: ArticleChannel[] = ['Blog Post', 'LinkedIn', 'X.com Post', 'Technical Paper'];
  readonly articleVoices: ArticleVoice[] = ['Formal', 'Conversational', 'Creative', 'Journalistic'];
  selectedChannel = signal<ArticleChannel>(this.articleChannels[0]);
  selectedVoice = signal<ArticleVoice>(this.articleVoices[0]);

  // Process control
  private processSubscription: Subscription | null = null;
  elapsedTime = signal(0);
  isPaused = signal(false);

  // Drag & Drop
  draggedBlock = signal<InsightBlock | null>(null);
  isDraggingOverSkeleton = signal(false);
  draggedSkeletonIndex = signal<number | null>(null);
  dropTargetSkeletonIndex = signal<number | null>(null);

  skeletonBlockIds = computed(() => new Set(this.skeletonBlocks().map(b => b.id)));
  rewrittenArticleHtml = computed(() => {
    if (this.rewrittenArticle()) {
      const html = marked.parse(this.rewrittenArticle());
      return this.sanitizer.bypassSecurityTrustHtml(html);
    }
    return '';
  });

  ngOnDestroy(): void {
    this.stopProcess();
  }

  startFileProcessing(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    
    const task = async () => {
        this.state.set({ view: 'loading', message: `Parsing ${file.name}...` });
        const { content, type } = await this.contentFetcher.parseFile(file);
        this.state.set({ view: 'loading', message: 'Deconstructing content with AI...' });
        const blocks = await this.geminiService.deconstructContent(content, type);
        this.insightBlocks.set(blocks);
        this.state.set({ view: 'insights' });
    };

    this.runMonitoredProcess(task);
  }

  startUrlProcessing(url: string): void {
    if (!url) return;

    const task = async () => {
      this.state.set({ view: 'loading', message: `Fetching content from URL...` });
      const { content, type } = await this.contentFetcher.fetchFromUrl(url);
      this.state.set({ view: 'loading', message: 'Deconstructing content with AI...' });
      const blocks = await this.geminiService.deconstructContent(content, type);
      this.insightBlocks.set(blocks);
      this.state.set({ view: 'insights' });
    };
    
    this.runMonitoredProcess(task);
  }

  addToSkeleton(block: InsightBlock): void {
    if (!this.skeletonBlockIds().has(block.id)) {
      this.skeletonBlocks.update(blocks => [...blocks, block]);
    }
  }

  removeFromSkeleton(blockId: string): void {
    this.skeletonBlocks.update(blocks => blocks.filter(b => b.id !== blockId));
  }
  
  handleRewrite(): void {
    if (this.skeletonBlocks().length === 0) return;
    
    const task = async () => {
      this.state.set({ view: 'rewriting', message: 'Synthesizing your article...' });
      const article = await this.geminiService.rewriteArticle(this.skeletonBlocks(), this.selectedChannel(), this.selectedVoice());
      this.rewrittenArticle.set(article);
      this.state.set({ view: 'article' });
    };

    this.runMonitoredProcess(task);
  }

  private runMonitoredProcess(task: () => Promise<void>) {
    this.stopProcess(); // Ensure no other process is running
    this.elapsedTime.set(0);
    this.isPaused.set(false);

    this.processSubscription = interval(1000).subscribe(() => {
        this.elapsedTime.update(t => t + 1);
        if (this.elapsedTime() >= 35 && !this.isPaused()) {
            this.isPaused.set(true); // Pause UI updates, but let background task continue
        }
    });

    task().catch(error => this.handleError(error)).finally(() => this.stopTimer());
  }

  stopTimer() {
    this.processSubscription?.unsubscribe();
    this.processSubscription = null;
  }

  stopProcess() {
    this.stopTimer();
    this.reset();
  }
  
  continueProcess() {
    this.isPaused.set(false);
  }

  reset(): void {
    this.stopTimer();
    this.state.set({ view: 'initial', error: null });
    this.insightBlocks.set([]);
    this.skeletonBlocks.set([]);
    this.rewrittenArticle.set('');
    this.elapsedTime.set(0);
    this.isPaused.set(false);
  }

  private handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    this.state.set({ view: 'initial', error: message });
  }

  // Drag & Drop Handlers
  onDragStart(block: InsightBlock): void { this.draggedBlock.set(block); }
  onDragEnd(): void { this.draggedBlock.set(null); }
  onSkeletonDragOver(event: DragEvent): void { event.preventDefault(); this.isDraggingOverSkeleton.set(true); }
  onSkeletonDragLeave(): void { this.isDraggingOverSkeleton.set(false); }
  onSkeletonDrop(): void {
    if (this.draggedBlock()) {
      this.addToSkeleton(this.draggedBlock()!);
    }
    this.isDraggingOverSkeleton.set(false);
    this.draggedBlock.set(null);
  }
  onSkeletonItemDragStart(index: number): void { this.draggedSkeletonIndex.set(index); }
  onSkeletonItemDragEnd(): void { this.draggedSkeletonIndex.set(null); this.dropTargetSkeletonIndex.set(null); }
  onSkeletonItemDragOver(event: DragEvent, index: number): void { event.preventDefault(); this.dropTargetSkeletonIndex.set(index); }
  onSkeletonItemDrop(): void {
    const fromIndex = this.draggedSkeletonIndex();
    const toIndex = this.dropTargetSkeletonIndex();
    if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
      this.skeletonBlocks.update(blocks => {
        const newBlocks = [...blocks];
        const [movedBlock] = newBlocks.splice(fromIndex, 1);
        newBlocks.splice(toIndex, 0, movedBlock);
        return newBlocks;
      });
    }
    this.onSkeletonItemDragEnd();
  }

  getBlockColor(type: string): string {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('title')) return 'bg-blue-100 text-blue-800';
    if (lowerType.includes('conclusion') || lowerType.includes('result')) return 'bg-green-100 text-green-800';
    if (lowerType.includes('code')) return 'bg-gray-200 text-gray-800';
    if (lowerType.includes('kpi') || lowerType.includes('metric')) return 'bg-purple-100 text-purple-800';
    if (lowerType.includes('hypothesis')) return 'bg-yellow-100 text-yellow-800';
    if (lowerType.includes('limitation')) return 'bg-orange-100 text-orange-800';
    return 'bg-slate-100 text-slate-800';
  }
}