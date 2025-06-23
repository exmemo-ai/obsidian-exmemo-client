import { App, ItemView, WorkspaceLeaf, Editor, TFolder, View } from 'obsidian';
import { t } from "src/lang/helpers";
import { searchLocalData, LocalSearchResult } from './search_local_data';
import { searchRemoteData } from './search_remote_data';
import { highlightElement } from './search_result_highlight';
import { parseKeywords, BaseSearchResult } from './search_data';
import { RemoteNoteViewerModal } from './remote_note_viewer';

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
    typeContainer: HTMLElement;
    searchMethodSelectEl: HTMLSelectElement;
    searchBtnControlsEl: HTMLElement;
    folderContainer: HTMLElement;
    clearButtonEl: HTMLButtonElement;
    isSearching: boolean;
    searchIconEl: HTMLElement;

    protected searchInput: HTMLInputElement;
    protected resultsList: HTMLElement;

    constructor(app: App, plugin: any, containerEl: HTMLElement, showPath: boolean) {
        this.app = app;
        this.plugin = plugin;
        this.showPath = showPath;
        this.caseSensitiveChecked = false;
        this.isRemoteSearch = this.plugin.settings.isRemoteSearch;

        containerEl.addClass('search-content-wrapper');

        const searchAreaEl = containerEl.createEl('div', { cls: 'search-area' });
        this.initializeUI(searchAreaEl);

        this.resultsContainerEl = containerEl.createEl('div', { cls: 'search-results-container' });
        this.restoreLastSearch();
        this.executeSearch();
    }

    protected initializeUI(containerEl: HTMLElement) {
        const searchRowEl = containerEl.createEl('div', { cls: 'search-row' });
        
        const inputContainerEl = searchRowEl.createEl('div', { cls: 'search-input-container-ex' });
        const inputWrapperEl = inputContainerEl.createEl('div', { cls: 'input-wrapper' });

        this.keywordInputEl = inputWrapperEl.createEl('input', {
            attr: { placeholder: t('searchKeyword') + ' (' + t('searchSyntaxTip') + ')' },
            cls: 'search-input'
        });
        this.keywordInputEl.type = 'text';

        const modeControlsEl = inputWrapperEl.createEl('div', { cls: 'mode-controls' });
        const searchModeButton = modeControlsEl.createEl('button', {
            cls: 'search-mode-button',
            attr: { title: t('localOrRemote') || 'Local/Remote' }
        });
        searchModeButton.textContent = this.isRemoteSearch ? '🌐' : '📁';
        
        searchModeButton.addEventListener('click', () => {
            this.isRemoteSearch = !this.isRemoteSearch;
            this.plugin.settings.isRemoteSearch = this.isRemoteSearch;
            this.plugin.saveSettings();
            searchModeButton.textContent = this.isRemoteSearch ? '🌐' : '📁';
            this.setType();
            this.executeSearch();
        });

        const btnControlsEl = inputWrapperEl.createEl('div', { cls: 'btn-controls' });
        this.clearButtonEl = btnControlsEl.createEl('button', {
            cls: 'clear-button',
            attr: { title: t('clearInput') || 'Clear input' }
        });
        this.clearButtonEl.textContent = '×';
        this.clearButtonEl.style.display = 'none';        

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
            if (!this.isRemoteSearch) {
                this.searchDebounceTimer = window.setTimeout(async () => {
                    await this.executeSearch();
                }, 300);
            }
            this.resetClear();
        });

        this.clearButtonEl.addEventListener('click', () => {
            this.keywordInputEl.value = '';
            this.clearButtonEl.style.display = 'none';
            this.executeSearch();
        });        

        caseSensitiveButtonEl.addEventListener('click', () => {
            this.caseSensitiveChecked = !this.caseSensitiveChecked;
            if (this.caseSensitiveChecked) {
                caseSensitiveButtonEl.removeClass('case-sensitive-inactive');
                caseSensitiveButtonEl.addClass('case-sensitive-active');
            } else {
                caseSensitiveButtonEl.addClass('case-sensitive-inactive');
                caseSensitiveButtonEl.removeClass('case-sensitive-active');
            }
        });
        
        this.searchBtnControlsEl = searchRowEl.createEl('button', {
            cls: 'search-button',
            attr: { title: t('search') }
        });
        this.searchIconEl = this.searchBtnControlsEl.createEl('div', { cls: 'search-icon' });
        this.searchIconEl.createEl('div', { cls: 'search-icon-handle' });
        this.searchBtnControlsEl.addEventListener('click', async () => {
            await this.executeSearch();
        });

        const advancedToggleEl = searchRowEl.createEl('button', {
            cls: 'advanced-toggle',
            attr: { title: t('advancedSearch') || 'Advanced search' }
        });
        advancedToggleEl.textContent = '▼';

        this.advancedSearchEl = containerEl.createEl('div', { cls: 'advanced-search-panel' });
        this.advancedSearchEl.style.display = 'none';

        this.folderContainer = this.advancedSearchEl.createEl('div', { cls: 'folder-container' });

        const folderLabelEl = this.folderContainer.createEl('label', { cls: 'search-label' });
        folderLabelEl.textContent = t('folder') + ":";

        this.folderSelectEl = this.folderContainer.createEl('select', { cls: 'folder-select' });

        const rootOption = this.folderSelectEl.createEl('option');
        rootOption.value = '';
        rootOption.textContent = t('allFolders') || 'All folders';

        this.populateFolderSelect();

        this.typeContainer = this.advancedSearchEl.createEl('div', { cls: 'type-container' });
        const typeLabel = this.typeContainer.createEl('label', { cls: 'search-label' });
        typeLabel.textContent = t('etype') + ":";

        this.typeSelectEl = this.typeContainer.createEl('select', { cls: 'type-select' });
        
        const optionList = ["all", "note", "web", "record", "file", "chat"];
        for (const option of optionList) {
            const opt = this.typeSelectEl.createEl('option');
            opt.value = option;
            opt.textContent = t(option as any) || option.charAt(0).toUpperCase() + option.slice(1);
        }

        this.typeSelectEl.value = this.plugin.settings.lastSearchType;
        this.typeSelectEl.addEventListener('change', () => {
            this.plugin.settings.lastSearchType = this.typeSelectEl.value;
            this.plugin.saveSettings();
        });

        const dateRangeContainer = this.advancedSearchEl.createEl('div', { cls: 'date-range-container' });

        const dateLabel = dateRangeContainer.createEl('label', { cls: 'search-label' });
        dateLabel.textContent = t('range') + ":";

        const datesWrapper = dateRangeContainer.createEl('div', { cls: 'dates-wrapper' });

        this.dateStartEl = datesWrapper.createEl('input', { cls: 'date-input-ex' });
        this.dateStartEl.type = 'date';

        datesWrapper.createEl('span').textContent = '-';

        this.dateEndEl = datesWrapper.createEl('input', { cls: 'date-input-ex' });
        this.dateEndEl.type = 'date';

        // add search method
        const searchMethodContainer = this.advancedSearchEl.createEl('div', { cls: 'search-method-container' });
        const searchMethodLabel = searchMethodContainer.createEl('label', { cls: 'search-label' });
        searchMethodLabel.textContent = t('searchMethod') + ":";

        this.searchMethodSelectEl = searchMethodContainer.createEl('select', { cls: 'search-method-select' });
        
        const searchMethods = [
            { value: 'keywordOnly', key: 'keywordOnly' },
            { value: 'fuzzySearch', key: 'fuzzySearch' },
            { value: 'embeddingSearch', key: 'embeddingSearch' }
        ];
        
        for (const method of searchMethods) {
            const opt = this.searchMethodSelectEl.createEl('option');
            opt.value = method.value;
            opt.textContent = t(method.key as any) || method.key;
        }

        this.searchMethodSelectEl.value = this.plugin.settings.lastSearchMethod || 'keywordOnly';
        this.searchMethodSelectEl.addEventListener('change', () => {
            this.plugin.settings.lastSearchMethod = this.searchMethodSelectEl.value;
            this.plugin.saveSettings();
        });

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

        this.setType();
        this.resetClear();
    }

    protected resetClear() {
        this.clearButtonEl.style.display = this.keywordInputEl.value ? 'block' : 'none';
    }

    protected setType() {
        if (this.typeContainer) {
            this.typeContainer.style.display = this.isRemoteSearch ? 'flex' : 'none';
        }
        //if (this.searchBtnControlsEl) {
        //    this.searchBtnControlsEl.style.display = this.isRemoteSearch ? 'block' : 'none';
        //}
        if (this.folderContainer) {
            this.folderContainer.style.display = this.isRemoteSearch ? 'none' : 'flex';
        }
        
        if (this.searchMethodSelectEl) {
            const options = this.searchMethodSelectEl.options;
            if (options.length >= 3) {
                const embeddingOption = options[2] as HTMLOptionElement;
                embeddingOption.disabled = !this.isRemoteSearch;
                
                if (!this.isRemoteSearch && this.searchMethodSelectEl.value === 'embeddingSearch') {
                    this.searchMethodSelectEl.value = 'keywordOnly';
                    this.plugin.settings.lastSearchMethod = 'keywordOnly';
                    this.plugin.saveSettings();
                }
            }
        }
    }

    async executeSearch() {
        const keyword = this.keywordInputEl.value;
        if (!keyword.trim()) {
            this.resultsContainerEl.empty();
            return;
        }

        if (this.isSearching) {
            return;
        }

        const startDate = this.dateStartEl.value;
        const endDate = this.dateEndEl.value;
        const selectedFolder = this.folderSelectEl.value;
        const caseSensitive = this.caseSensitiveChecked;
        const searchMethod = this.searchMethodSelectEl ? this.searchMethodSelectEl.value : 'keywordOnly';

        this.saveSearchToHistory(keyword);
        this.updateHistoryKeywords();

        if (this.isRemoteSearch) {
            this.setSearchingState(true);
            this.showSearchingIndicator();
            
            try {
                let selectedType = this.typeSelectEl ? this.typeSelectEl.value : '';
                if (!selectedType || selectedType === 'all') {
                    selectedType = '';
                }
                const results = await searchRemoteData(
                    this.plugin,
                    keyword,
                    startDate,
                    endDate,
                    selectedFolder,
                    caseSensitive,
                    101,
                    '', // ctype
                    selectedType,
                    '', // status
                    searchMethod
                );
                console.log('Remote search results:', results);
                this.displayRemoteResults(results);
            } catch (error) {
                console.error('Remote search error:', error);
                this.displaySearchError();
            } finally {
                this.setSearchingState(false);
            }
        } else {
            const results = await searchLocalData(
                this.app,
                keyword,
                startDate,
                endDate,
                selectedFolder,
                caseSensitive,
                101,
                searchMethod
            );
            this.displayLocalResults(results);
        }
    }

    private setSearchingState(isSearching: boolean) {
        this.isSearching = isSearching;
        if (isSearching) {
            this.searchBtnControlsEl.style.display = 'none';
        } else {
            this.searchBtnControlsEl.style.display = 'block';
        }
    }

    private showSearchingIndicator() {
        this.resultsContainerEl.empty();
        const searchingEl = this.resultsContainerEl.createEl('div', { cls: 'searching-indicator' });
        searchingEl.textContent = t('searching');
    }

    private displaySearchError() {
        this.resultsContainerEl.empty();
        
        const errorEl = this.resultsContainerEl.createEl('div', { cls: 'search-error' });
        errorEl.textContent = t('searchError');
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
            this.resetClear();
        }
    }

    protected async openNote(addr: string) {
        await this.app.workspace.openLinkText(addr, '', true);
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
                    const startPos = editor.offsetToPos(index);
                    const endPos = editor.offsetToPos(index + keyword.length);
                    setTimeout(() => {
                        editor.setSelection(startPos, endPos);
                        const pos = editor.offsetToPos(index);
                        const betterPos = { line: pos.line - 5, ch: 0 };
                        editor.scrollIntoView({ from: betterPos, to: betterPos }, true);
                        //this.app.commands.executeCommandById("editor:open-search");
                    }, 100);
                }
            }
        }
    }

    protected async openResult(result:BaseSearchResult) {
        if (!result) return;
        if (result.etype === 'web' && result.addr) {
            window.open(result.addr, '_blank');
            return;
        } 
        if (result.idx && (result.etype === 'record' || result.etype === 'chat' || result.etype === 'file')) {
            new RemoteNoteViewerModal(this.app, this.plugin, result, this.keywordInputEl.value).open();
            return;
        }        
        if (result.etype === 'note' && result.addr) {
            let addr = null;
            if (result.isRemote) {
                let path = result.addr.split('/');
                let vault_name = path[0];
                let current_vault = this.plugin.app.vault.getName();
                if (current_vault === vault_name) {
                    addr = path.slice(1).join('/');
                } else {
                    new RemoteNoteViewerModal(this.app, this.plugin, result, this.keywordInputEl.value).open();
                    return;
                }
            } else {
                addr = result.addr;
            }
            if (addr) {
                await this.openNote(addr);
            }
        }
    }

    private createResultItem(
        parentEl: HTMLElement, 
        result: LocalSearchResult | BaseSearchResult, 
        isLocal: boolean = true,
        keywordArray?: string[],
        caseSensitive?: boolean
    ): void {
        const resultItemEl = parentEl.createEl('li', { cls: 'search-item' });

        resultItemEl.addEventListener('click', async () => {
            this.openResult(result);
        });

        const titleRowEl = resultItemEl.createEl('div', { cls: 'search-title-row' });
        const titleEl = titleRowEl.createEl('div', { cls: 'search-item-title' });
        titleEl.textContent = result.title;

        const timeEl = titleRowEl.createEl('div', { cls: 'search-item-time' });
        timeEl.textContent = result.createdTime;

        const infoRowEl = resultItemEl.createEl('div', { cls: 'search-info-row' });

        if (isLocal) {
            const localResult = result as LocalSearchResult;
            const pathEl = infoRowEl.createEl('div', { cls: 'search-item-path' });
            const filePath = localResult.file.path;
            const pathParts = filePath.split('/');
            const folderPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
            pathEl.textContent = folderPath ? folderPath : '/';
        } else {
            const remoteResult = result as BaseSearchResult;
            if (remoteResult.addr) {
                const pathEl = infoRowEl.createEl('div', { cls: 'search-item-path' });
                pathEl.textContent = remoteResult.addr;
            }
            
            if (remoteResult.etype) {
                const typeEl = infoRowEl.createEl('div', { cls: 'search-item-type' });
                typeEl.textContent = t(`${remoteResult.etype || ''}`.trim() as any);
            }
        }

        if (result.content) {
            const contentEl = resultItemEl.createEl('div', { cls: 'search-content' });
            
            if (isLocal) {
                contentEl.textContent = result.content;
                if (keywordArray && keywordArray.length > 0) {
                    highlightElement(titleEl, keywordArray, caseSensitive || false);
                    highlightElement(contentEl, keywordArray, caseSensitive || false);
                }
            } else {
                contentEl.textContent = result.content.substring(0, 200) + (result.content.length > 200 ? '...' : '');
                if (this.keywordInputEl.value) {
                    highlightElement(contentEl, this.keywordInputEl.value, caseSensitive || false);
                }
            }
        }

        resultItemEl.addClass('clickable');
    }

    private createResultsHeader(isLocal: boolean, resultsCount: number, searchKeyword?: string): HTMLElement {
        const headerEl = this.resultsContainerEl.createEl('div', { cls: 'results-header' });

        let searchTypeText = '';
        if (isLocal && searchKeyword) {
            if (searchKeyword.startsWith('tag:')) {
                searchTypeText = t('tagSearch') || 'Tag search';
            } else if (searchKeyword.startsWith('file:')) {
                searchTypeText = t('fileSearch') || 'File search';
            } else if (searchKeyword) {
                searchTypeText = t('keywordSearch') || 'Keyword search';
            }
        }

        const titleEl = headerEl.createEl('div', { cls: 'search-results-title' });
        titleEl.textContent = isLocal 
            ? (searchTypeText ? `${searchTypeText}` : t('searchResults'))
            : (t('remoteSearchResults') || 'Remote Search Results');

        if (resultsCount > 0) {
            const displayCount = resultsCount > 100 ? '100+' : resultsCount.toString();
            headerEl.createEl('span', { cls: 'results-count' }).textContent = t('total') + ': ' + displayCount;
        }

        return headerEl;
    }

    protected displayLocalResults(results: LocalSearchResult[]) {
        this.resultsContainerEl.empty();

        const keyword = this.keywordInputEl.value;
        this.createResultsHeader(true, results.length, keyword);

        if (results.length === 0) {
            this.resultsContainerEl.createEl('p').textContent = t('noResultsFound');
            return;
        }

        const resultListEl = this.resultsContainerEl.createEl('ul', { cls: 'search-results' });
        const displayResults = results.length > 100 ? results.slice(0, 100) : results;
        const caseSensitive = this.caseSensitiveChecked;
        
        const hasKeywordInput = !!keyword;
        let keywordArray: string[] = [];
        
        if (hasKeywordInput) {
            let searchValue = keyword;
            if (keyword.startsWith('tag:')) {
                searchValue = keyword.substring(4).trim();
                keywordArray = [searchValue];
            } else if (keyword.startsWith('file:')) {
                searchValue = keyword.substring(5).trim();
                keywordArray = [searchValue];
            } else {
                keywordArray = parseKeywords(searchValue);
            }
        }

        displayResults.forEach(result => {
            this.createResultItem(resultListEl, result, true, hasKeywordInput ? keywordArray : undefined, caseSensitive);
        });
    }

    protected displayRemoteResults(results: BaseSearchResult[]) {
        this.resultsContainerEl.empty();

        this.createResultsHeader(false, results.length);

        if (results.length === 0) {
            this.resultsContainerEl.createEl('p').textContent = t('noResultsFound');
            return;
        }

        const resultListEl = this.resultsContainerEl.createEl('ul', { cls: 'search-results' });
        const displayResults = results.length > 100 ? results.slice(0, 100) : results;
        const caseSensitive = this.caseSensitiveChecked;

        displayResults.forEach(result => {
            this.createResultItem(resultListEl, result, false, undefined, caseSensitive);
        });
    }
}

export const LOCAL_SEARCH_VIEW_TYPE = 'local-search-view';

export class LocalSearchView extends ItemView {
    plugin: any;
    app: App;

    constructor(leaf: WorkspaceLeaf, app: App, plugin: any) {
        super(leaf);
        this.plugin = plugin;
        this.app = app;
    }

    getViewType() {
        return LOCAL_SEARCH_VIEW_TYPE;
    }

    getDisplayText() {
        return t('localSearch') || 'Local Search';
    }

    getIcon() {
        return 'search-icon';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.style.padding = '0'; // later move to style.css
        const searchEl = container.createEl('div');
        new SearchUI(this.app, this.plugin, searchEl, true);
    }
}
