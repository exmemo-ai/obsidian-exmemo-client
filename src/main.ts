import { Editor, MarkdownView, Plugin, WorkspaceLeaf, Menu } from 'obsidian';
import { DEFAULT_SETTINGS, ExMemoSettings, ExMemoSettingTab } from 'src/settings';
import { Sync } from 'src/sync';
import { SearchModal } from 'src/search/search_ui';
import { ExMemoNotice } from 'src/notice';
import { t } from "src/lang/helpers"
import { LeftSearchView, LEFT_SEARCH_VIEW_TYPE } from 'src/search/search_ui';
import { registerCustomIcons } from 'src/custom_icons';

export default class ExMemoPlugin extends Plugin {
	settings: ExMemoSettings;
	notice: ExMemoNotice;
	sync: Sync;
	syncIntervalId: number = 0;

	async onload() {
		await this.loadSettings();
		registerCustomIcons();
		this.notice = new ExMemoNotice();
		this.sync = new Sync(this, this.app, this.settings);

		//this.debugSearchLeaf(); // for debug

		this.addCommand({
			id: 'search_local',
			name: t('search'),
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new SearchModal(this.app, this).open();
			}
		});		
        this.addCommand({
            id: 'search_local_sidebar',
            name: t('search') + ' (' + t('sidebar') + ')',
            callback: () => {
                const leaves = this.app.workspace.getLeavesOfType(LEFT_SEARCH_VIEW_TYPE);
                if (leaves.length > 0) {
                    this.app.workspace.revealLeaf(leaves[0]);
                    return;
                }
				const leaf = this.app.workspace.getLeftLeaf(false);
				if (leaf) {
					leaf.setViewState({
						type: LEFT_SEARCH_VIEW_TYPE,
						active: true
					});
					this.app.workspace.revealLeaf(leaf);
				}
            }
        });
        this.registerView(
            LEFT_SEARCH_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new LeftSearchView(leaf, this.app, this)
        );
		this.addCommand({
			id: 'upload',
			name: t('syncCurrentFile'),
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.sync.syncCurrentMd(this);
			}
		});
		this.addCommand({
			id: 'sync',
			name: t('syncAllFiles'),
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.sync.syncAll();
			}
		});

		this.addSettingTab(new ExMemoSettingTab(this.app, this));

		this.resetSyncInterval();
	}

	showNotice(id: string, str: string, opts: any = {}) {
		this.notice.showInfo(id, str, opts)
	}

	hideNotice(id: string) {
		this.notice.hide(id);
	}

	onunload() {
		if (this.syncIntervalId !== 0) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = 0;
		}
        this.app.workspace.getLeavesOfType(LEFT_SEARCH_VIEW_TYPE).forEach(leaf => leaf.detach());
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	resetSyncInterval() {
		let interval = this.settings.syncInterval;
		if (this.syncIntervalId !== 0) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = 0;
		}
		if (interval > 0) {
			this.syncIntervalId = window.setInterval(() => {this.sync.syncAll();},
					interval * 60 * 1000);
		}
	}

    // 添加调试方法
    private debugSearchLeaf() {
        this.registerEvent(
            this.app.workspace.on('search:results-menu' as any, (menu: Menu, leaf: any) => {
                console.log('=== Search Leaf Debug Info ===');
                console.log('Search leaf structure:', leaf);
                console.log('Leaf keys:', Object.keys(leaf));
                
                if (leaf.dom) {
                    console.log('DOM structure:', leaf.dom);
                    if (leaf.dom.vChildren) {
                        console.log('vChildren:', leaf.dom.vChildren);
                    }
                }
                
                if (leaf.view) {
                    console.log('View structure:', leaf.view);
                    console.log('View keys:', Object.keys(leaf.view));
                }
                
                if (leaf.searchQuery) {
                    console.log('Search query:', leaf.searchQuery);
                }
                
                // 检查是否有 getQuery 方法
                if (typeof leaf.getQuery === 'function') {
                    console.log('getQuery() result:', leaf.getQuery());
                }
                
                console.log('=== End Debug Info ===');
            })
        );
    }
}