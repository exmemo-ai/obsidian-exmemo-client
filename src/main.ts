import { Editor, MarkdownView, Plugin, requestUrl, RequestUrlResponse } from 'obsidian';
import { DEFAULT_SETTINGS, ExMemoSettings, ExMemoSettingTab } from 'src/settings';
import { Sync } from 'src/sync';
import { SearchModal } from 'src/search';
import { ExMemoNotice } from 'src/notice';
import { t } from "src/lang/helpers"

export default class ExMemoPlugin extends Plugin {
	settings: ExMemoSettings;
	notice: ExMemoNotice;
	sync: Sync;
	syncIntervalId: number = 0;

	async onload() {
		await this.loadSettings();
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