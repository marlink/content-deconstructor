import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { InsightBlock } from '../../models/notebook.model';

@Component({
  selector: 'app-insight-block',
  // FIX: Replaced templateUrl with an inline template and used native control flow.
  template: `
<div class="border border-slate-200 rounded-lg bg-white shadow-sm transition-shadow hover:shadow-md">
  <div class="p-3 cursor-pointer" (click)="toggleExpand()">
    <div class="flex justify-between items-start">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <span [class]="'px-2 py-0.5 text-xs font-semibold rounded-full ' + blockTypeColor()">
            {{ block().type }}
          </span>
          <span class="text-xs font-mono text-slate-400" title="Confidence Score">
            {{ (block().confidenceScore * 100).toFixed(0) }}%
          </span>
        </div>
        <p class="text-sm font-medium text-slate-700 pr-2">
          {{ block().summary }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        @if (addToSkeleton.observed || removeFromSkeleton.observed) {
          <button 
            (click)="onToggleSkeleton($event)"
            [title]="isInSkeleton() ? 'Remove from skeleton' : 'Add to skeleton'"
            class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-lg font-semibold transition-colors"
            [class]="isInSkeleton() 
              ? 'bg-red-100 text-red-700 hover:bg-red-200' 
              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'"
            >
            @if (isInSkeleton()) {
              <span>-</span>
            } @else {
              <span>+</span>
            }
          </button>
        }
        <button class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transition-transform" [class.rotate-180]="isExpanded()" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
        </button>
      </div>
    </div>
  </div>

  @if (isExpanded()) {
    <div class="border-t border-slate-200 p-4">
        <h4 class="text-sm font-semibold text-slate-800 mb-2">Full Content</h4>
        <pre class="bg-slate-50 p-3 rounded-md text-sm text-slate-700 whitespace-pre-wrap font-sans">{{ block().content }}</pre>
        
        <div class="mt-4">
          <h4 class="text-sm font-semibold text-slate-800 mb-2">Tags</h4>
          <div class="flex flex-wrap gap-2">
            @for (tag of block().tags; track tag) {
              <span class="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded">
                {{ tag }}
              </span>
            }
          </div>
        </div>
    </div>
  }
</div>
`,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightBlockComponent {
  block = input.required<InsightBlock>();
  isInSkeleton = input<boolean>(false);
  
  addToSkeleton = output<InsightBlock>();
  removeFromSkeleton = output<string>();

  isExpanded = signal(false);

  blockTypeColor = computed(() => {
    const type = this.block().type.toLowerCase();
    if (type.includes('title')) return 'bg-blue-100 text-blue-800';
    if (type.includes('conclusion') || type.includes('result')) return 'bg-green-100 text-green-800';
    if (type.includes('code')) return 'bg-gray-200 text-gray-800';
    if (type.includes('kpi') || type.includes('metric')) return 'bg-purple-100 text-purple-800';
    if (type.includes('hypothesis')) return 'bg-yellow-100 text-yellow-800';
    if (type.includes('limitation')) return 'bg-orange-100 text-orange-800';
    return 'bg-slate-100 text-slate-800';
  });

  toggleExpand(): void {
    this.isExpanded.update(v => !v);
  }

  onToggleSkeleton(event: Event): void {
    event.stopPropagation();
    if (this.isInSkeleton()) {
      this.removeFromSkeleton.emit(this.block().id);
    } else {
      this.addToSkeleton.emit(this.block());
    }
  }
}