import { App, Modal } from 'obsidian';
import { SearchUI } from './search_ui';

export class LocalSearchModal extends Modal {
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
