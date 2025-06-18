import { App, Editor, TFolder, View } from 'obsidian';
import { t } from "src/lang/helpers";
import { searchLocalData, LocalSearchResult, highlightTextInElement } from './search_local_data';
import { searchRemoteData, SearchResult } from './search_remote_data';

export class SearchUI {
    app: App;
    plugin: any;
    resultsContainerEl: HTMLElement;
    keywordInputEl: HTMLInputElement;
    dateStartEl: HTMLInputElement;
    dateEndEl: HTMLInputElement;
    folderSelectEl: HTMLSelectElement;    
    advancedSearchVisible: boolean;
    advancedSearchEl: HTMLElement;
    historyKeywords: string[];
    currentHistoryIndex: number;
    currentInputValue: string;
    searchDebounceTimer: number | null;
    showPath: boolean;
    caseSensitiveChecked: boolean;
    isRemoteSearch: boolean;
    typeSelectEl: HTMLSelectElement;

    protected searchInput: HTMLInputElement;
    protected resultsList: HTMLElement;

    constructor(app: App, plugin: any, containerEl: HTMLElement, showPath: boolean) {
        this.app = app;
        this.plugin = plugin;
        this.showPath = showPath;
        this.caseSensitiveChecked = false;
        this.isRemoteSearch = false;

        containerEl.addClass('local-search-content-wrapper');

        const searchAreaEl = containerEl.createEl('div', { cls: 'local-search-area' });
        this.initializeUI(searchAreaEl);

        this.resultsContainerEl = containerEl.createEl('div', { cls: 'search-results-container' });
        this.restoreLastSearch();
    }

    protected initializeUI(containerEl: HTMLElement) {
        const searchRowEl = containerEl.createEl('div', { cls: 'search-row' });
        
        // later adjust
        const searchModeButton = searchRowEl.createEl('button', {
            cls: 'search-mode-button',
            attr: { title: t('toggleSearchMode') || 'Toggle search mode' }
        });
        searchModeButton.textContent = this.isRemoteSearch ? '🌐' : '📁';
        
        searchModeButton.addEventListener('click', () => {
            this.isRemoteSearch = !this.isRemoteSearch;
            searchModeButton.textContent = this.isRemoteSearch ? '🌐' : '📁';
            this.executeSearch();
        });
        
        const inputContainerEl = searchRowEl.createEl('div', { cls: 'search-input-container' });
        const inputWrapperEl = inputContainerEl.createEl('div', { cls: 'input-wrapper' });
        this.keywordInputEl = inputWrapperEl.createEl('input', {
            attr: { placeholder: t('searchKeyword') + ' (' + t('searchSyntaxTip') + ')' },
            cls: 'search-input'
        });
        this.keywordInputEl.type = 'text';

        const btnControlsEl = inputWrapperEl.createEl('div', { cls: 'btn-controls' });
        const clearButtonEl = btnControlsEl.createEl('button', {
            cls: 'clear-button',
            attr: { title: t('clearInput') || 'Clear input' }
        });
        clearButtonEl.textContent = '×';
        clearButtonEl.style.display = 'none';        

        const caseSensitiveButtonEl = btnControlsEl.createEl('button', {
            cls: 'case-sensitive-button',
            attr: { title: t('caseSensitive') || 'Case sensitive' }
        });
        caseSensitiveButtonEl.textContent = 'Aa';
        caseSensitiveButtonEl.addClass('case-sensitive-inactive');
        
        this.keywordInputEl.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                await this.executeSearch();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory('up');
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory('down');
            } else {
                this.currentInputValue = this.keywordInputEl.value;
                this.currentHistoryIndex = -1;
            }
        });

        this.keywordInputEl.addEventListener('input', () => {
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
            }
            this.searchDebounceTimer = window.setTimeout(async () => {
                await this.executeSearch();
            }, 300);

            clearButtonEl.style.display = this.keywordInputEl.value ? 'block' : 'none';
        });

        clearButtonEl.addEventListener('click', () => {
            this.keywordInputEl.value = '';
            clearButtonEl.style.display = 'none';
        });        

        caseSensitiveButtonEl.addEventListener('click', () => {
            this.caseSensitiveChecked = !this.caseSensitiveChecked;
            if (this.caseSensitiveChecked) {
                console.log('Case sensitive search enabled');
                caseSensitiveButtonEl.removeClass('case-sensitive-inactive');
                caseSensitiveButtonEl.addClass('case-sensitive-active');
            } else {
                console.log('Case sensitive search disabled');
                caseSensitiveButtonEl.addClass('case-sensitive-inactive');
                caseSensitiveButtonEl.removeClass('case-sensitive-active');
            }
        });
        
        /*
        const searchButtonEl = searchRowEl.createEl('button', {
            cls: 'search-button',
            attr: { title: t('search') }
        });

        const searchIconEl = searchButtonEl.createEl('div', { cls: 'search-icon' });

        searchIconEl.createEl('div', { cls: 'search-icon-handle' });

        searchButtonEl.addEventListener('click', async () => {
            await this.executeSearch();
        });
        */

        const advancedToggleEl = searchRowEl.createEl('button', {
            cls: 'advanced-toggle',
            attr: { title: t('advancedSearch') || 'Advanced search' }
        });
        advancedToggleEl.textContent = '▼';

        this.advancedSearchEl = containerEl.createEl('div', { cls: 'advanced-search-panel' });
        this.advancedSearchEl.style.display = 'none';

        const folderContainer = this.advancedSearchEl.createEl('div', { cls: 'folder-container' });

        const folderLabelEl = folderContainer.createEl('label', { cls: 'search-label' });
        folderLabelEl.textContent = t('folder') + ":";

        this.folderSelectEl = folderContainer.createEl('select', { cls: 'folder-select' });

        const rootOption = this.folderSelectEl.createEl('option');
        rootOption.value = '';
        rootOption.textContent = t('allFolders') || 'All folders';

        this.populateFolderSelect();

        if (this.isRemoteSearch) { // later
            const typeContainer = this.advancedSearchEl.createEl('div', { cls: 'type-container' });
            const typeLabel = typeContainer.createEl('label', { cls: 'search-label' });
            typeLabel.textContent = t('etype') + ":";

            this.typeSelectEl = typeContainer.createEl('select', { cls: 'type-select' });
            
            const noteOption = this.typeSelectEl.createEl('option');
            noteOption.value = 'note';
            noteOption.textContent = t('note');
            
            const webOption = this.typeSelectEl.createEl('option');
            webOption.value = 'web';
            webOption.textContent = t('web');
            
            const recordOption = this.typeSelectEl.createEl('option');
            recordOption.value = 'record';
            recordOption.textContent = t('record');
        }

        const dateRangeContainer = this.advancedSearchEl.createEl('div', { cls: 'date-range-container' });

        const dateLabel = dateRangeContainer.createEl('label', { cls: 'search-label' });
        dateLabel.textContent = t('range') + ":";

        const datesWrapper = dateRangeContainer.createEl('div', { cls: 'dates-wrapper' });

        this.dateStartEl = datesWrapper.createEl('input', { cls: 'date-input' });
        this.dateStartEl.type = 'date';

        datesWrapper.createEl('span').textContent = '-';

        this.dateEndEl = datesWrapper.createEl('input', { cls: 'date-input' });
        this.dateEndEl.type = 'date';

        this.advancedSearchVisible = !!this.plugin.settings.advancedSearchVisible;
        this.advancedSearchEl.style.display = this.advancedSearchVisible ? 'block' : 'none';
        advancedToggleEl.textContent = this.advancedSearchVisible ? '▲' : '▼';

        advancedToggleEl.addEventListener('click', () => {
            this.advancedSearchVisible = !this.advancedSearchVisible;
            this.advancedSearchEl.style.display = this.advancedSearchVisible ? 'block' : 'none';
            advancedToggleEl.textContent = this.advancedSearchVisible ? '▲' : '▼';

            this.plugin.settings.advancedSearchVisible = this.advancedSearchVisible;
            this.plugin.saveSettings();
        });
    }

    async executeSearch() {
        const keyword = this.keywordInputEl.value;
        if (!keyword.trim()) return;

        const startDate = this.dateStartEl.value;
        const endDate = this.dateEndEl.value;
        const selectedFolder = this.folderSelectEl.value;
        const caseSensitive = this.caseSensitiveChecked;

        this.saveSearchToHistory(keyword);
        this.updateHistoryKeywords();

        if (this.isRemoteSearch) {
            const selectedType = this.typeSelectEl ? this.typeSelectEl.value : '';
            const results = await searchRemoteData(
                this.plugin,
                keyword,
                startDate,
                endDate,
                selectedFolder,
                caseSensitive,
                101,
                '', // ctype
                selectedType, // etype
                '' // status
            );
            console.log('Remote search results:', results);
            this.displayRemoteResults(results);
        } else {
            const results = await searchLocalData(
                this.app,
                keyword,
                startDate,
                endDate,
                selectedFolder,
                caseSensitive,
                101
            );
            this.displayLocalResults(results);
        }
    }

    navigateHistory(direction: 'up' | 'down') {
        if (this.historyKeywords.length === 0) return;

        if (direction === 'up') {
            if (this.currentHistoryIndex === -1 && this.keywordInputEl.value) {
                this.currentInputValue = this.keywordInputEl.value;
            }

            this.currentHistoryIndex = Math.min(this.currentHistoryIndex + 1, this.historyKeywords.length - 1);
        } else {
            this.currentHistoryIndex = Math.max(this.currentHistoryIndex - 1, -1);
        }

        if (this.currentHistoryIndex === -1) {
            this.keywordInputEl.value = this.currentInputValue;
        } else {
            this.keywordInputEl.value = this.historyKeywords[this.currentHistoryIndex];
        }
    }

    updateHistoryKeywords() {
        const history = this.plugin.settings.localSearchHistory || {};

        this.historyKeywords = Object.entries<{ lastUsed: number }>(history)
            .sort(([, a], [, b]) => b.lastUsed - a.lastUsed)
            .map(([keyword]) => keyword);

        this.currentHistoryIndex = -1;
    }

    populateFolderSelect() {
        const folders: TFolder[] = [];
        const rootFolder = this.app.vault.getRoot();

        const collectFolders = (folder: TFolder, depth = 0) => {
            folders.push(folder);

            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    collectFolders(child, depth + 1);
                }
            }
        };

        collectFolders(rootFolder);

        folders.slice(1).forEach(folder => {
            const option = this.folderSelectEl.createEl('option');
            option.value = folder.path;
            const depth = folder.path.split('/').length - 1;
            const indent = '\u00A0\u00A0'.repeat(depth);
            option.textContent = indent + folder.name;
        });
    }

    saveSearchToHistory(keyword: string) {
        if (!keyword.trim()) return;

        if (!this.plugin.settings.localSearchHistory) {
            this.plugin.settings.localSearchHistory = {};
        }

        const now = Date.now();
        const history = this.plugin.settings.localSearchHistory;

        if (history[keyword]) {
            history[keyword].count += 1;
            history[keyword].lastUsed = now;
        } else {
            history[keyword] = {
                count: 1,
                lastUsed: now
            };
        }

        this.plugin.saveSettings();
    }

    restoreLastSearch() {
        const history = this.plugin.settings.localSearchHistory || {};

        const sortedEntries = Object.entries<{ count: number; lastUsed: number }>(history)
            .sort(([, a], [, b]) => b.lastUsed - a.lastUsed);

        this.updateHistoryKeywords();

        if (sortedEntries.length > 0 && this.keywordInputEl) {
            this.keywordInputEl.value = sortedEntries[0][0];
        }
    }

    protected displayLocalResults(results: LocalSearchResult[]) {
        this.resultsContainerEl.empty();

        const headerEl = this.resultsContainerEl.createEl('div', { cls: 'results-header' });

        let searchTypeText = '';
        const keyword = this.keywordInputEl.value;
        if (keyword.startsWith('tag:')) {
            searchTypeText = t('tagSearch') || 'Tag search';
        } else if (keyword.startsWith('file:')) {
            searchTypeText = t('fileSearch') || 'File search';
        } else if (keyword) {
            searchTypeText = t('keywordSearch') || 'Keyword search';
        }

        const titleEl = headerEl.createEl('div', { cls: 'search-results-title' });
        titleEl.textContent = searchTypeText ? `${searchTypeText}` : t('searchResults');

        if (results.length > 0) {
            const displayCount = results.length > 100 ? '100+' : results.length.toString();
            headerEl.createEl('span', { cls: 'results-count' }).textContent = t('total') + ': ' + displayCount;
        }

        if (results.length === 0) {
            this.resultsContainerEl.createEl('p').textContent = t('noResultsFound');
            return;
        }

        const resultListEl = this.resultsContainerEl.createEl('ul', { cls: 'local-search-results' });

        const displayResults = results.length > 100 ? results.slice(0, 100) : results;

        displayResults.forEach(result => {
            const resultItemEl = resultListEl.createEl('li', { cls: 'local-search-item' });

            resultItemEl.addEventListener('click', async () => {
                await this.app.workspace.openLinkText(result.file.path, '', true);
                await new Promise(resolve => setTimeout(resolve, 300));

                const searchValue = this.keywordInputEl.value;
                if (searchValue.startsWith('tag:')) {
                    return;
                } else if (searchValue.startsWith('file:')) {
                    return;
                }

                const view = this.app.workspace.getActiveViewOfType(View);
                if (view && 'editor' in view) {
                    const editor = (view as any).editor as Editor;
                    if (editor) {
                        if (!searchValue) return;
                        console.log(`Searching for: ${searchValue}`);
                        editor.focus();
                        const keyword = searchValue;
                        const content = editor.getValue();
                        //
                        const caseSensitive = this.caseSensitiveChecked;
                        const searchContent = caseSensitive ? content : content.toLowerCase();
                        const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();
                        const index = searchContent.indexOf(searchKeyword);
                        if (index >= 0) {
                            console.log(`Highlighting keyword: ${keyword} at index: ${index}`);
                            const startPos = editor.offsetToPos(index);
                            const endPos = editor.offsetToPos(index + keyword.length);
                            setTimeout(() => {
                                editor.setSelection(startPos, endPos);
                                const pos = editor.offsetToPos(index);
                                const betterPos = { line: pos.line - 5, ch: 0 };
                                console.log(`Scrolling to position:  ${JSON.stringify(betterPos)}`, pos, startPos);
                                editor.scrollIntoView({ from: betterPos, to: betterPos }, true);
                                //this.app.commands.executeCommandById("editor:open-search");
                            }, 100);
                        }
                    }
                }
            });

            const titleRowEl = resultItemEl.createEl('div', { cls: 'local-search-title-row' });

            let titleEl: HTMLElement;
            if (this.showPath) {
                titleEl = titleRowEl.createEl('div', { cls: 'local-search-title-short' });
                const pathEl = titleRowEl.createEl('div', { cls: 'local-search-path' });
                const filePath = result.file.path;
                const pathParts = filePath.split('/');
                const folderPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
                pathEl.textContent = folderPath ? folderPath : '/';
            } else {
                titleEl = titleRowEl.createEl('div', { cls: 'local-search-title-long' });
            }

            const timeEl = titleRowEl.createEl('div', { cls: 'local-search-time' });
            timeEl.textContent = result.createdTime;

            const contentEl = resultItemEl.createEl('div', { cls: 'local-search-content' });

            if (this.keywordInputEl.value) {
                const keywordInput = this.keywordInputEl.value;
                const caseSensitive = this.caseSensitiveChecked;

                let searchType: 'tag' | 'file' | 'keyword' = 'keyword';
                let searchValue = keywordInput;

                if (keywordInput.startsWith('tag:')) {
                    searchType = 'tag';
                    searchValue = keywordInput.substring(4).trim();
                } else if (keywordInput.startsWith('file:')) {
                    searchType = 'file';
                    searchValue = keywordInput.substring(5).trim();
                }

                let keywordArray: string[] = [];
                if (searchType === 'keyword') {
                    const regex = /"([^"]+)"|(\S+)/g;
                    let match;
                    while ((match = regex.exec(searchValue)) !== null) {
                        const term = match[1] || match[2];
                        if (term && term.trim()) {
                            keywordArray.push(term.trim());
                        }
                    }
                } else {
                    keywordArray = [searchValue];
                }

                titleEl.textContent = result.title;
                this.applyHighlighting(titleEl, result.title, searchType, keywordArray, searchValue, caseSensitive);

                if (result.content) {
                    contentEl.textContent = result.content;
                    this.applyHighlighting(contentEl, result.content, searchType, keywordArray, searchValue, caseSensitive);
                }
            } else {
                titleEl.textContent = result.title;
                contentEl.textContent = result.content || '';
            }
        });
    }

    protected displayRemoteResults(results: SearchResult[]) {
        this.resultsContainerEl.empty();

        const headerEl = this.resultsContainerEl.createEl('div', { cls: 'results-header' });

        const titleEl = headerEl.createEl('div', { cls: 'search-results-title' });
        titleEl.textContent = t('remoteSearchResults') || 'Remote Search Results';

        if (results.length > 0) {
            const displayCount = results.length > 100 ? '100+' : results.length.toString();
            headerEl.createEl('span', { cls: 'results-count' }).textContent = t('total') + ': ' + displayCount;
        }

        if (results.length === 0) {
            this.resultsContainerEl.createEl('p').textContent = t('noResultsFound');
            return;
        }

        const resultListEl = this.resultsContainerEl.createEl('ul', { cls: 'local-search-results' });

        const displayResults = results.length > 100 ? results.slice(0, 100) : results;

        displayResults.forEach(result => {
            const resultItemEl = resultListEl.createEl('li', { cls: 'local-search-item' });

            const titleRowEl = resultItemEl.createEl('div', { cls: 'local-search-title-row' });
            const titleEl = titleRowEl.createEl('div', { cls: 'remote-search-title' });
            titleEl.textContent = result.title;

            const timeEl = titleRowEl.createEl('div', { cls: 'remote-search-time' });
            timeEl.textContent = result.created_time;

            if (result.addr) {
                const pathEl = resultItemEl.createEl('div', { cls: 'remote-search-path' });
                pathEl.textContent = result.addr;
            }

            if (result.ctype || result.etype) {
                const typeEl = resultItemEl.createEl('div', { cls: 'local-search-type' });
                typeEl.textContent = `${result.ctype || ''} ${result.etype || ''}`.trim();
            }

            if (result.raw) {
                const contentEl = resultItemEl.createEl('div', { cls: 'local-search-content' });
                contentEl.textContent = result.raw.substring(0, 200) + (result.raw.length > 200 ? '...' : '');

                if (this.keywordInputEl.value) {
                    this.highlightMatchedContent(contentEl, this.keywordInputEl.value);
                }
            }

            if (result.etype === 'web' && result.addr) {
                resultItemEl.addEventListener('click', () => {
                    window.open(result.addr, '_blank');
                });
                resultItemEl.addClass('clickable');
            }
        });
    }

    private highlightMatchedContent(element: HTMLElement, keyword: string) {
        if (!keyword) return;
        const content = element.textContent || '';
        const keywordIndex = content.toLowerCase().indexOf(keyword.toLowerCase());
        if (keywordIndex === -1) return;

        element.empty();
        if (keywordIndex > 0) {
            element.appendText(content.substring(0, keywordIndex));
        }
        const highlightSpan = element.createEl('span', { cls: 'search-highlight' });
        highlightSpan.textContent = content.substring(keywordIndex, keywordIndex + keyword.length);
        if (keywordIndex + keyword.length < content.length) {
            element.appendText(content.substring(keywordIndex + keyword.length));
        }
    }

    applyHighlighting(element: HTMLElement, text: string, searchType: 'tag' | 'file' | 'keyword',
        keywordArray: string[], searchValue: string, caseSensitive: boolean) {
        element.empty();

        if (searchType === 'keyword' && keywordArray.length > 0) {
            element.textContent = text;
            keywordArray.forEach(keyword => {
                highlightTextInElement(element, keyword, caseSensitive);
            });
        } else if (searchValue) {
            let elementText = text;
            let keywordText = searchValue;

            if (!caseSensitive) {
                elementText = elementText.toLowerCase();
                keywordText = keywordText.toLowerCase();
            }

            const keywordIndex = elementText.indexOf(keywordText);

            if (keywordIndex >= 0) {
                if (keywordIndex > 0) {
                    element.createSpan({ text: text.substring(0, keywordIndex) });
                }

                element.createSpan({
                    text: text.substring(keywordIndex, keywordIndex + searchValue.length),
                    cls: 'keyword-highlight'
                });

                if (keywordIndex + searchValue.length < text.length) {
                    element.createSpan({ text: text.substring(keywordIndex + searchValue.length) });
                }
            } else {
                element.textContent = text;
            }
        }
    }
}
