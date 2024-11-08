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

	async getMyToken() {
		if (this.settings.url === '' || this.settings.myUsername === '' || this.settings.myPassword === '') {
			this.showNotice('temp', t('login_info_missing'), { timeout: 3000 });
			return false
		}
		this.showNotice('auth', t('login'));
		await new Promise(resolve => setTimeout(resolve, 3000));
		const url = new URL(this.settings.url + '/api/auth/login/');
		const requestOptions = {
			url: url.toString(),
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				username: this.settings.myUsername,
				password: this.settings.myPassword
			})
		};
		try {
			const response: RequestUrlResponse = await requestUrl(requestOptions);
			if (response.status === 200) {
				const data = await response.json;
				this.settings.myToken = data.token;
				this.saveSettings();
				this.hideNotice('auth');
				return true
			}
		} catch (error) {
			console.error(error);
		}
		this.hideNotice('auth');
		this.showNotice('temp', t('loginFailed'), { timeout: 3000 });
		return false
	}

	parseError(err: any, show_notice: boolean = true) {
		if (err.status === 401) {
			this.settings.myToken = '';
			this.saveSettings();
			if (show_notice) {
				let showinfo = t('loginExpired') + ': ' + err.status;
				this.showNotice('error', showinfo, { timeout: 3000 });
			}
		} else {
			console.error(err);
			if (show_notice) {
				let showinfo = t('syncFailed') + ': ' + err.status;
				this.showNotice('error', showinfo, { timeout: 3000 });
			}
		}
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