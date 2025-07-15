import { App, ItemView, WorkspaceLeaf, TFolder, Menu, Modal, setIcon } from 'obsidian';
import { t } from "src/lang/helpers";
import { searchLocalData, LocalSearchResult } from './search_local_data';
import { searchRemoteData } from './search_remote_data';
import { highlightElement } from './search_result_highlight';
import { BaseSearchResult, parseSearchInput, openNote } from './search_data';
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
            this.executeSearch();
        });
        
        this.searchBtnControlsEl = searchRowEl.createEl('button', {
            cls: 'search-button',
            attr: { title: t('search') }
        });
        setIcon(this.searchBtnControlsEl, 'search1-icon');
        this.searchBtnControlsEl.addEventListener('click', async () => {
            await this.executeSearch();
        });

        const advancedToggleEl = searchRowEl.createEl('button', {
            cls: 'advanced-toggle',
            attr: { title: t('advancedSearch') || 'Advanced search' }
        });
        setIcon(advancedToggleEl, 'down-icon');

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

        this.folderSelectEl.addEventListener('change', () => {
            this.executeSearch();
        });

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
            this.executeSearch();
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

        this.dateStartEl.addEventListener('change', () => {
            this.executeSearch();
        });

        this.dateEndEl.addEventListener('change', () => {
            this.executeSearch();
        });

        // add search method
        const searchMethodContainer = this.advancedSearchEl.createEl('div', { cls: 'search-method-container' });
        const searchMethodLabel = searchMethodContainer.createEl('label', { cls: 'search-label' });
        searchMethodLabel.textContent = t('searchMethod') + ":";

        this.searchMethodSelectEl = searchMethodContainer.createEl('select', { cls: 'search-method-select' });
        
        const searchMethods = [
            { value: 'keywordOnly', key: 'keywordOnly' },
            { value: 'fileSearch', key: 'fileSearch' },
            { value: 'tagSearch', key: 'tagSearch' },
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
            this.executeSearch();
        });

        this.advancedSearchVisible = !!this.plugin.settings.advancedSearchVisible;
        this.advancedSearchEl.style.display = this.advancedSearchVisible ? 'block' : 'none';
        setIcon(advancedToggleEl, this.advancedSearchVisible ? 'up-icon' : 'down-icon');

        advancedToggleEl.addEventListener('click', () => {
            this.advancedSearchVisible = !this.advancedSearchVisible;
            this.advancedSearchEl.style.display = this.advancedSearchVisible ? 'block' : 'none';
            setIcon(advancedToggleEl, this.advancedSearchVisible ? 'up-icon' : 'down-icon');

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
            if (options.length >= 5) {
                const embeddingOption = options[4] as HTMLOptionElement;
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
            this.displayUsageTips();
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
                //console.log('Remote search results:', results);
                this.displayResults(results);
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
                searchMethod,
                this.plugin.settings.searchExclude
            );
            this.displayResults(results);
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

    private displayUsageTips() {
        const usageTipsEl = this.resultsContainerEl.createEl('div', { cls: 'search-usage-tips' });
        
        const titleEl = usageTipsEl.createEl('h3', { cls: 'usage-tips-title' });
        titleEl.textContent = t('searchUsageTitle');
        
        const tipsListEl = usageTipsEl.createEl('ul', { cls: 'usage-tips-list' });
        
        const tips = t('searchUsageTips') as string;
        const tipItems = tips.split('<br>');
        tipItems.forEach(tip => {
            const tipEl = tipsListEl.createEl('li', { cls: 'usage-tip-item' });
            tipEl.innerHTML = tip.trim();
        }); 
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

    protected async openResult(result:BaseSearchResult) {
        if (!result) return;
        if (result.etype === 'web' && result.addr) {
            window.open(result.addr, '_blank');
            return;
        } 
        if (result.idx && (result.etype === 'record' || result.etype === 'chat' || result.etype === 'file')) {
            const searchMethod = this.searchMethodSelectEl ? this.searchMethodSelectEl.value : 'keywordOnly';
            new RemoteNoteViewerModal(this.app, this.plugin, result, this.keywordInputEl.value, searchMethod).open();
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
                    const searchMethod = this.searchMethodSelectEl ? this.searchMethodSelectEl.value : 'keywordOnly';
                    new RemoteNoteViewerModal(this.app, this.plugin, result, this.keywordInputEl.value, searchMethod).open();
                    return;
                }
            } else {
                addr = result.addr;
            }
            if (addr) {
                if (this.plugin.settings.searchOpenInModal) {
                    const searchMethod = this.searchMethodSelectEl ? this.searchMethodSelectEl.value : 'keywordOnly';
                    new RemoteNoteViewerModal(this.app, this.plugin, result, this.keywordInputEl.value, searchMethod).open();
                } else {
                    const searchMethod = this.searchMethodSelectEl ? this.searchMethodSelectEl.value : 'keywordOnly';
                    await openNote(this.app, addr, this.keywordInputEl.value, this.caseSensitiveChecked, searchMethod);
                }
            }
        }
    }

    private createResultItem(
        parentEl: HTMLElement, 
        result: LocalSearchResult | BaseSearchResult, 
        searchType: 'tag' | 'file' | 'keyword',
        keywordArray: string[],
        caseSensitive: boolean
    ): void {
        const resultItemEl = parentEl.createEl('li', { cls: 'search-item' });

        resultItemEl.addEventListener('click', async () => {
            this.openResult(result);
        });

        const titleRowEl = resultItemEl.createEl('div', { cls: 'search-title-row' });
        const titleEl = titleRowEl.createEl('div', { cls: 'search-item-title' });
        titleEl.textContent = result.title;
        if (keywordArray && keywordArray.length > 0) 
            highlightElement(titleEl, keywordArray, true, caseSensitive || false);

        const timeEl = titleRowEl.createEl('div', { cls: 'search-item-time' });
        timeEl.textContent = result.createdTime;

        const infoRowEl = resultItemEl.createEl('div', { cls: 'search-info-row' });

        if (!this.isRemoteSearch) {
            const localResult = result as LocalSearchResult;
            const pathEl = infoRowEl.createEl('div', { cls: 'search-item-path' });
            const filePath = localResult.file.path;
            //const pathParts = filePath.split('/');
            //const folderPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
            const folderPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
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

        if (result.content && searchType === 'keyword') {
            const contentEl = resultItemEl.createEl('div', { cls: 'search-content' });            
            if (!this.isRemoteSearch) {
                contentEl.textContent = result.content;
            } else {
                contentEl.textContent = result.content.substring(0, 200) + (result.content.length > 200 ? '...' : '');
            }
            if (keywordArray && keywordArray.length > 0) {
                highlightElement(contentEl, keywordArray, false, caseSensitive || false);
            }
        }

        resultItemEl.addClass('clickable');
    }

    private createResultsHeader(results?: BaseSearchResult[]): HTMLElement {
        const headerEl = this.resultsContainerEl.createEl('div', { cls: 'results-header' });
        const resultsCount = results ? results.length : 0;
        const searchKeyword = this.keywordInputEl.value.trim();
        let searchTypeText = '';

        if (!this.isRemoteSearch && searchKeyword) {
            const searchMethod = this.searchMethodSelectEl ? this.searchMethodSelectEl.value : 'keywordOnly';
            const parsedInput = parseSearchInput(searchKeyword, searchMethod);
            const searchType = parsedInput.searchType;
            
            if (searchType === 'tag') {
                searchTypeText = t('tagSearch');
            } else if (searchType === 'file') {
                searchTypeText = t('fileSearch');
            } else if (searchType === 'keyword') {
                searchTypeText = t('keywordSearch');
            }
        }

        const titleEl = headerEl.createEl('div', { cls: 'search-results-title' });
        titleEl.textContent = !this.isRemoteSearch 
            ? (searchTypeText ? `${searchTypeText}` : t('searchResults'))
            : (t('remoteSearchResults') || 'Remote Search Results');

        if (resultsCount > 0) {
            const rightSection = headerEl.createEl('div', { cls: 'results-header-right' });
            const displayCount = resultsCount > 100 ? '100+' : resultsCount.toString();
            rightSection.createEl('span', { cls: 'results-count' }).textContent = t('total') + ': ' + displayCount;
            
            if (!this.isRemoteSearch && results && results.length > 0) {
                const menuButton = rightSection.createEl('button', { 
                    cls: 'results-menu-button',
                    attr: { title: t('searchResultMenu') }
                });
                menuButton.textContent = '⋯';
                menuButton.addEventListener('click', (event) => {
                    this.triggerSearchResultsMenu(results as LocalSearchResult[], event);
                });
            }
        }

        return headerEl;
    }

    protected displayResults(results: BaseSearchResult[]) {
        this.resultsContainerEl.empty();

        const keyword = this.keywordInputEl.value.trim();
        
        this.createResultsHeader(results);

        if (results.length === 0) {
            this.resultsContainerEl.createEl('p').textContent = t('noResultsFound');
            return;
        }

        const resultListEl = this.resultsContainerEl.createEl('ul', { cls: 'search-results' });
        const showResults = results.length > 100 ? results.slice(0, 100) : results;
        const caseSensitive = this.caseSensitiveChecked;
        
        let keywordArray: string[] = [];
        let searchType: 'tag' | 'file' | 'keyword' = 'keyword';
        
        if (!!keyword) {
            const searchMethod = this.searchMethodSelectEl ? this.searchMethodSelectEl.value : 'keywordOnly';
            const parsedInput = parseSearchInput(keyword, searchMethod);
            keywordArray = parsedInput.keywordArray;
            searchType = parsedInput.searchType;
        }

        showResults.forEach(result => {
            this.createResultItem(resultListEl, result, searchType, keywordArray, caseSensitive);
        });
    }

    private triggerSearchResultsMenu(results: LocalSearchResult[], event: MouseEvent) {
        const menu = new Menu();
        const vChildren = {
            children: results.map(result => ({
                file: result.file
            }))
        };
        
        let searchQuery = this.keywordInputEl.value;
        const searchMethod = this.searchMethodSelectEl ? this.searchMethodSelectEl.value : 'keywordOnly';
        
        if (searchMethod === 'fileSearch' && !searchQuery.startsWith('file:')) {
            searchQuery = 'file:' + searchQuery;
        } else if (searchMethod === 'tagSearch' && !searchQuery.startsWith('tag:')) {
            searchQuery = 'tag:' + searchQuery;
        }
        
        const leafData = {
            dom: {
                vChildren: vChildren
            },
            searchQuery: {
                query: searchQuery
            },
            view: { // for my plugin
                searchResults: results,
                searchQuery: searchQuery
            },
            getQuery: () => {
                return searchQuery;
            }
        };

        this.app.workspace.trigger('search:results-menu' as any, menu, leafData);        
        menu.showAtMouseEvent(event);
    }
}

export const LEFT_SEARCH_VIEW_TYPE = 'left-search-view';

export class LeftSearchView extends ItemView {
    plugin: any;
    app: App;

    constructor(leaf: WorkspaceLeaf, app: App, plugin: any) {
        super(leaf);
        this.plugin = plugin;
        this.app = app;
    }

    getViewType() {
        return LEFT_SEARCH_VIEW_TYPE;
    }

    getDisplayText() {
        return t('localSearch') || 'Local Search';
    }

    getIcon() {
        return 'search2-icon';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.style.padding = '0'; // later move to style.css
        const searchEl = container.createEl('div');
        new SearchUI(this.app, this.plugin, searchEl, true);
    }
}

export class SearchModal extends Modal {
    plugin: any;
    app: App;
    searchUI: SearchUI;

    constructor(app: App, plugin: any) {
        super(app);
        this.plugin = plugin;
        this.app = app;
    }

    onOpen() {
        const { contentEl } = this;
        
        const modalEl = contentEl.parentElement?.parentElement;
        if (modalEl && modalEl.className.contains('modal')) {
            modalEl.addClass('local-search-modal');
            
            const modalTitleEl = modalEl.querySelector('.modal-title');
            const modalCloseEl = modalEl.querySelector('.modal-close-button');
            if (modalTitleEl) modalTitleEl.remove();
            if (modalCloseEl) modalCloseEl.remove();
        }

        this.searchUI = new SearchUI(this.app, this.plugin, contentEl, true);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

