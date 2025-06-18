import { Editor, MarkdownView, Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, ExMemoSettings, ExMemoSettingTab } from 'src/settings';
import { Sync } from 'src/sync';
import { SearchModal } from 'src/search';
import { LocalSearchModal } from 'src/search_local';
import { ExMemoNotice } from 'src/notice';
import { t } from "src/lang/helpers"
import { LocalSearchView, LOCAL_SEARCH_VIEW_TYPE } from 'src/search_local_view';
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

		this.addCommand({
			id: 'search',
			name: t('search'),
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new SearchModal(this.app, this).open();
			}
		});
		this.addCommand({
			id: 'search_local',
			name: t('localSearch'),
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new LocalSearchModal(this.app, this).open();
			}
		});
        this.addCommand({
            id: 'search_local_sidebar',
            name: t('localSearch') + ' (侧栏)', // later adjust
            callback: () => {
                const leaves = this.app.workspace.getLeavesOfType(LOCAL_SEARCH_VIEW_TYPE);
                if (leaves.length > 0) {
                    this.app.workspace.revealLeaf(leaves[0]);
                    return;
                }
				const leaf = this.app.workspace.getLeftLeaf(false);
				if (leaf) {
					leaf.setViewState({
						type: LOCAL_SEARCH_VIEW_TYPE,
						active: true
					});
					this.app.workspace.revealLeaf(leaf);
				}
            }
        });
        this.registerView(
            LOCAL_SEARCH_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new LocalSearchView(leaf, this.app, this)
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
        this.app.workspace.getLeavesOfType(LOCAL_SEARCH_VIEW_TYPE).forEach(leaf => leaf.detach());
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
}