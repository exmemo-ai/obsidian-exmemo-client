import { ItemView, WorkspaceLeaf, App } from 'obsidian';
import { t } from "src/lang/helpers";
import { SearchUI } from './search_ui';

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
        console.log('LocalSearchView onOpen', container);
        const searchEl = container.createEl('div');
        searchEl.addClass('local-search-content-wrapper');
        new SearchUI(this.app, this.plugin, searchEl, false);
    }
}
