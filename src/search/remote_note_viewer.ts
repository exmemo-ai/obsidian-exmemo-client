import { App, Modal, Component, MarkdownRenderer, Notice } from 'obsidian';
import { t } from "src/lang/helpers";
import { requestWithToken } from "src/utils";
import { parseKeywords } from "src/search/search_data";

export class RemoteNoteViewerModal extends Modal {
    private plugin: any;
    private noteContentEl: HTMLElement;
    private loadingEl: HTMLElement;
    private rawMarkdownContent: string = '';
    private idx: string | null = null;
    private etype: string | null = null;
    private pathInfoEl: HTMLElement;
    private addr: string = '';
    private keyword: string = '';
    private noteTitleEl: HTMLElement;
    private filename: string = '';
    private keywords: string[] = [];
    private highlightedElements: HTMLElement[] = [];
    private currentHighlightIndex: number = 0;
    private nextKeywordBtn: HTMLButtonElement;

    constructor(app: App, plugin: any, item: any, keyword: string) {
        super(app);
        this.plugin = plugin;
        if (item && item.idx) 
            this.idx = item.idx;
        if (item && item.etype)
            this.etype = item.etype;
        this.keyword = keyword;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('remote-note-viewer-modal');

        this.keywords = parseKeywords(this.keyword);
        
        this.createHeader();
        this.createContentArea();
        this.loadNoteContent();
    }

    private createHeader() {
        const headerEl = this.contentEl.createEl('div', { cls: 'remote-note-header' });
        
        const titleRowEl = headerEl.createEl('div', { cls: 'remote-note-title-row' });
        this.noteTitleEl = titleRowEl.createEl('h2', { cls: 'remote-note-title' });
        
        const headerActionsEl = titleRowEl.createEl('div', { cls: 'remote-note-header-actions' });
        this.createActionButtons(headerActionsEl);
        
        this.pathInfoEl = headerEl.createEl('div', { cls: 'remote-note-path-info' });
    }

    private createContentArea() {
        this.noteContentEl = this.contentEl.createEl('div', { cls: 'remote-note-content' });
        
        this.loadingEl = this.noteContentEl.createEl('div', { cls: 'remote-note-loading' });
        this.loadingEl.createEl('div', { cls: 'loading-spinner' });
        this.loadingEl.createEl('div', { text: t('loadingNoteContent') });
    }

    private async loadNoteContent() {
        try {
            const content = await this.fetchRemoteNoteContent();
            await this.displayContent(content);
        } catch (error) {
            this.displayError(error);
        }
    }

    private async fetchRemoteNoteContent(): Promise<string> {
        if (!this.idx) {
            throw new Error(t('missingNoteIndex'));
        }

        if (!this.plugin) {
            throw new Error('ExMemo plugin not found');
        }

        const url = new URL(this.plugin.settings.url + '/api/entry/data/' + this.idx + '/');
        
        const requestOptions = {
            url: url.toString(),
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Token ' + this.plugin.settings.myToken
            }
        };

        try {
            const response = await requestWithToken(this.plugin, requestOptions, true);
            const data = await response.json;
            console.log('fetchRemoteNoteContent', data);

            if (data && data.title) {
                this.noteTitleEl.textContent = data.title;
                this.filename = data.title;
            }
            if (data && data.addr) {
                this.addr = data.addr;
                this.pathInfoEl.textContent = data.addr;
                if (!this.filename && data.addr) {
                    const pathParts = data.addr.split('/');
                    this.filename = pathParts[pathParts.length - 1] || 'download';
                }
            }
            if (data && (data.content || data.raw)) {
                return data.content || data.raw;
            } else {
                return t('remoteContentNotPreviewable');
            }
        } catch (err) {
            console.error(err);
            throw new Error(t('searchFailed') + ': ' + (err.status || err.message));
        }
    }

    private async displayContent(content: string) {
        this.rawMarkdownContent = content;
        this.loadingEl.style.display = 'none';
        const contentContainer = this.noteContentEl.createEl('div', { cls: 'remote-note-markdown-content' });
        
        contentContainer.style.userSelect = 'text';
        contentContainer.style.webkitUserSelect = 'text';
        
        await MarkdownRenderer.renderMarkdown(
            content, 
            contentContainer, 
            '',
            new Component()
        );
        
        this.makeContentSelectable(contentContainer);
        this.highlightKeywords(contentContainer);
        this.updateNavigationButton();
    }

    private makeContentSelectable(container: HTMLElement) {
        const allElements = container.querySelectorAll('*');
        allElements.forEach((element: Element) => {
            const htmlElement = element as HTMLElement;
            htmlElement.style.userSelect = 'text';
            htmlElement.style.webkitUserSelect = 'text';
        });
        
        container.style.userSelect = 'text';
        container.style.webkitUserSelect = 'text';
    }

    private highlightKeywords(container: HTMLElement) {
        this.highlightedElements = [];
        
        if (!this.keywords || this.keywords.length === 0) {
            return;
        }
        
        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            null
        );
        
        const textNodes: Text[] = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node as Text);
        }
        
        // Create highlighting for each keyword
        this.keywords.forEach((keyword, keywordIndex) => {
            if (!keyword.trim()) return;
            
            textNodes.forEach(textNode => {
                const text = textNode.textContent || '';
                const regex = new RegExp(this.escapeRegExp(keyword), 'gi');
                const matches = [...text.matchAll(regex)];
                
                if (matches.length > 0) {
                    let newHtml = text;
                    let offset = 0;
                    
                    matches.forEach(match => {
                        const start = (match.index || 0) + offset;
                        const end = start + match[0].length;
                        const highlightClass = `keyword-highlight keyword-${keywordIndex}`;
                        const highlightSpan = `<span class="${highlightClass}" data-keyword-index="${keywordIndex}">${match[0]}</span>`;
                        
                        newHtml = newHtml.slice(0, start) + highlightSpan + newHtml.slice(end);
                        offset += highlightSpan.length - match[0].length;
                    });
                    
                    if (newHtml !== text && textNode.parentElement) {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = newHtml;
                        
                        const fragment = document.createDocumentFragment();
                        while (tempDiv.firstChild) {
                            fragment.appendChild(tempDiv.firstChild);
                        }
                        
                        textNode.parentElement.replaceChild(fragment, textNode);
                    }
                }
            });
        });
        
        // Collect all highlighted elements
        this.highlightedElements = Array.from(container.querySelectorAll('.keyword-highlight'));
        this.currentHighlightIndex = 0;
        
        // Add numbering to highlighted elements
        this.highlightedElements.forEach((el, index) => {
            el.setAttribute('data-highlight-index', index.toString());
        });
    }
    
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    private updateNavigationButton() {
        if (this.nextKeywordBtn) {
            const hasHighlights = this.highlightedElements.length > 0;
            this.nextKeywordBtn.style.display = hasHighlights ? 'inline-block' : 'none';
            
            if (hasHighlights) {
                this.nextKeywordBtn.textContent = t('nextKeywordWithCount')
                    .replace('{current}', (this.currentHighlightIndex + 1).toString())
                    .replace('{total}', this.highlightedElements.length.toString());
                
                this.highlightCurrentKeyword();
            }
        }
    }
    
    private scrollToNextKeyword() {
        if (this.highlightedElements.length === 0) return;
        
        this.currentHighlightIndex = (this.currentHighlightIndex + 1) % this.highlightedElements.length;
        this.highlightCurrentKeyword();
        this.updateNavigationButton();
    }
    
    private highlightCurrentKeyword() {
        this.highlightedElements.forEach(el => {
            el.classList.remove('current-highlight');
        });
        
        const currentElement = this.highlightedElements[this.currentHighlightIndex];
        if (currentElement) {
            currentElement.classList.add('current-highlight');
            currentElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }

    private createActionButtons(container?: HTMLElement) {
        const actionsEl = container || this.noteContentEl.createEl('div', { cls: 'remote-note-actions' });
        
        if (this.keywords && this.keywords.length > 0) {
            this.nextKeywordBtn = actionsEl.createEl('button', { 
                cls: 'remote-note-action-btn keyword-nav-btn',
                text: t('nextKeyword')
            });
            this.nextKeywordBtn.addEventListener('click', () => {
                this.scrollToNextKeyword();
            });
            this.nextKeywordBtn.style.display = 'none';
        }
        
        if (this.etype == 'web' && this.addr) {
            const openBtn = actionsEl.createEl('button', { 
                cls: 'remote-note-action-btn',
                text: t('openInBrowser')
            });
            openBtn.addEventListener('click', () => {
                window.open(this.addr, '_blank');
            });
        }

        if (this.etype == 'file' && this.idx) {
            const downloadBtn = actionsEl.createEl('button', { 
                cls: 'remote-note-action-btn',
                text: t('downloadFile')
            });
            downloadBtn.addEventListener('click', () => {
                this.downloadFile();
            });
        }

        const copyBtn = actionsEl.createEl('button', { 
            cls: 'remote-note-action-btn',
            text: t('copy')
        });
        copyBtn.addEventListener('click', () => {
            this.copyContent(copyBtn);
        });
    }

    private displayError(error: any) {
        this.loadingEl.style.display = 'none';
        
        const errorEl = this.noteContentEl.createEl('div', { cls: 'remote-note-error' });
        errorEl.createEl('h3', { text: t('loadError') });
        errorEl.createEl('p', { text: error.message || t('cannotLoadNoteContent') });
        
        const retryBtn = errorEl.createEl('button', { 
            cls: 'remote-note-retry-btn',
            text: t('retry')
        });
        retryBtn.addEventListener('click', () => {
            errorEl.remove();
            this.loadingEl.style.display = 'block';
            this.loadNoteContent();
        });
    }

    private copyContent(copyBtn: HTMLButtonElement) {
        let contentToCopy = '';
        
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            contentToCopy = selection.toString();
        } else {
            contentToCopy = this.rawMarkdownContent;
        }
        
        navigator.clipboard.writeText(contentToCopy).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = t('copied');
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 1500);
        }).catch((err) => {
            console.error('Copy failed:', err);
            const originalText = copyBtn.textContent;
            copyBtn.textContent = t('copyFailed');
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 1500);
        });
    }

    private async downloadFile() {
        if (!this.idx) {
            console.error(t('missingFileIndex'));
            return;
        }

        if (!this.plugin) {
            console.error('ExMemo plugin not found');
            return;
        }

        try {
            const url = this.plugin.settings.url + '/api/entry/data/' + this.idx + '/download';
            
            const requestOptions = {
                url: url,
                method: 'GET',
                headers: {
                    'Authorization': 'Token ' + this.plugin.settings.myToken
                }
            };

            const response = await requestWithToken(this.plugin, requestOptions, true);
            
            if (response.arrayBuffer) {
                const blob = new Blob([response.arrayBuffer], { 
                    type: response.headers?.['content-type'] || 'application/octet-stream' 
                });
                
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadUrl;
                a.download = this.filename || 'download';
                
                // 显示开始下载的通知
                new Notice(t('startDownload').replace('{filename}', this.filename));
                
                document.body.appendChild(a);
                a.click();
                
                setTimeout(() => {
                    window.URL.revokeObjectURL(downloadUrl);
                    document.body.removeChild(a);
                }, 1000);
            } else {
                new Notice(t('downloadFailedResponse'));
            }
        } catch (error) {
            console.error(t('downloadFileFailed'), error);
            new Notice(t('downloadFileFailedRetry'));
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
