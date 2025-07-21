import { App, Modal, requestUrl, RequestUrlResponse } from 'obsidian';
import { t } from "src/lang/helpers"

export class ConfirmModal extends Modal {
    result: boolean | null = null;
    resolvePromise: (value: boolean) => void;
    info: string;

    constructor(app: App, info: string, resolve: (value: boolean) => void) {
        super(app);
        this.resolvePromise = resolve;
        this.info = info;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: t('are_you_sure') });
        contentEl.createEl("p", { text: this.info, cls: "info-paragraph" });

        const buttonContainer = contentEl.createDiv({ cls: "confirm-modal-buttons" });
        const yesButton = buttonContainer.createEl("button", { text: t('yes'), cls: "yes-button" });
        yesButton.onclick = () => {
            this.result = true;
            this.resolvePromise(true);
            this.close();
        };

        const noButton = buttonContainer.createEl("button", { text: t('no'), cls: "no-button" });
        noButton.onclick = () => {
            this.result = false;
            this.resolvePromise(false);
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (this.resolvePromise) {
            this.resolvePromise(false); // default to false if modal is closed without action
        }
    }
}

async function ensureToken(plugin: any): Promise<boolean> {
    if (plugin.settings.myToken !== '') {
        return true;
    }
    
    if (plugin.settings.url === '' || plugin.settings.myUsername === '' || plugin.settings.myPassword === '') {
        plugin.showNotice('temp', t('login_info_missing'), { timeout: 3000 });
        return false;
    }
    plugin.showNotice('auth', t('login'));
    await new Promise(resolve => setTimeout(resolve, 3000));
    const url = new URL(plugin.settings.url + '/api/auth/login/');
    const requestOptions = {
        url: url.toString(),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: plugin.settings.myUsername,
            password: plugin.settings.myPassword
        })
    };
    
    try {
        const response: RequestUrlResponse = await requestUrl(requestOptions);
        if (response.status === 200) {
            const data = await response.json;
            plugin.settings.myToken = data.token;
            plugin.saveSettings();
            plugin.hideNotice('auth');
            return true;
        }
    } catch (error) {
        console.error(error);
    }
    
    plugin.hideNotice('auth');
    plugin.showNotice('temp', t('loginFailed'), { timeout: 3000 });
    return false;
}

export async function requestWithToken(plugin: any, requestOptions: any, autoLogin: boolean = true, notice: boolean = true): Promise<any> {
    if (!await ensureToken(plugin)) {
        return null;
    }

    try {
        const response = await requestUrl(requestOptions);
        if (response.status !== 200) {
            throw response;
        }
        return response;
    } catch (err) {
        if (err.status === 401) {
            plugin.settings.myToken = '';
            plugin.saveSettings();
            if (autoLogin) {
                if (await ensureToken(plugin)) {
                    requestOptions.headers = requestOptions.headers || {};
                    requestOptions.headers['Authorization'] = 'Token ' + plugin.settings.myToken;
                    return await requestUrl(requestOptions);
                }
            } else {
                let showinfo = t('loginExpired') + ': ' + err.status;
                plugin.showNotice('error', showinfo, { timeout: 3000 });
            }
        } else {
            console.error(err);
            let isConnectFailed = err.message && (err.message.includes('ERR_CONNECTION_REFUSED') || err.message.includes('ECONNREFUSED') || err.message.includes('net::ERR_'));
            let showinfo = isConnectFailed ? t('connectFailed') : t('connectFailed') + ': ' + err.status;
            if (notice) {
                plugin.showNotice('error', showinfo, { timeout: 3000 });
            }
        }
        throw err;
    }
}
