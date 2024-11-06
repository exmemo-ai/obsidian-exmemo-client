import { TFile, MarkdownView, normalizePath, requestUrl, RequestUrlResponse } from 'obsidian';
import { ConfirmModal } from 'src/utils';
import { t } from "src/lang/helpers"
import { Base64 } from 'js-base64';

const MD5 = require('crypto-js/md5');
const WordArray = require('crypto-js/lib-typedarrays');

export class Sync {
    app: any;
    settings: any;
    plugin: any;
    interrupt: boolean;
    interruptButton: any;
    localInfo: LocalInfo;

    constructor(plugin: any, app: any, settings: any) {
        this.plugin = plugin;
        this.app = app;
        this.localInfo = new LocalInfo(plugin, app);
        this.settings = settings;
        this.interrupt = false;
        this.interruptButton = {
            'text': t('interrupt'), 'callback': () => {
                console.warn('interrupt sync')
                this.interrupt = true;
            }
        };
    }


    async getBody(boundary: string, files: TFile[], additionalFields = {}) {
        let body = "";

        for (const [key, value] of Object.entries(additionalFields)) {
            body += `--${boundary}\r\n`;
            body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
            body += `${value}\r\n`;
        }

        for (const file of files) {
            body += `--${boundary}\r\n`;
            body += `Content-Disposition: form-data; name="files"; filename="${file.name}"\r\n`;
            body += `Content-Type: ${"application/octet-stream"}\r\n\r\n`;
            const fileContent = await this.app.vault.readBinary(file);
            const base64Content = Base64.fromUint8Array(new Uint8Array(fileContent));
            body += base64Content + "\r\n";

            body += `--${boundary}\r\n`;
            body += `Content-Disposition: form-data; name="filepaths"\r\n\r\n`;
            body += `${file.path}\r\n`;

            const md5 = this.localInfo.fileInfoList[file.path] ? this.localInfo.fileInfoList[file.path].md5 : '';
            body += `--${boundary}\r\n`;
            body += `Content-Disposition: form-data; name="filemd5s"\r\n\r\n`;
            body += `${md5}\r\n`;
        }

        body += `--${boundary}--\r\n`;

        return body;
    }

    async uploadFiles(uploadList: TFile[]) {
        const url = new URL(this.settings.url + '/api/entry/data/');
        const groupSize = 5;
        const groupCount = Math.ceil(uploadList.length / groupSize);
        let uploadedList: TFile[] = [];
        let ret = true;

        this.plugin.showNotice('sync',
            t('upload') + ': ' + uploadedList.length + '/' + uploadList.length,
            { 'button': this.interruptButton });
        for (let i = 0; i < groupCount; i++) {
            if (this.interrupt) {
                break;
            }
            const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
            const group = uploadList.slice(i * groupSize, (i + 1) * groupSize);
            const additionalFields = {
                'etype': 'note',
                'source': 'obsidian_plugin',
                'vault': this.app.vault.getName(),
                'rtype': 'upload',
                'user_name': this.settings.myUsername
            };
            const requestOptions = {
                url: url.toString(),
                method: 'POST',
                headers: {
                    'Authorization': 'Token ' + this.settings.myToken,
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body: await this.getBody(boundary, group, additionalFields),
            };
            try {
                const response = await requestUrl(requestOptions);
                if (response.status !== 200) {
                    throw response;
                }
                const data = await response.json;
                if (data.list) {
                    for (const file of group) {
                        if (data.list.includes(file.path)) {
                            uploadedList.push(file);
                        }
                    }
                }
                if (data.emb_status) {
                    if (data.emb_status == 'failed') {
                        this.plugin.showNotice('error', t('embeddingFailed'), { timeout: 3000 });
                    }
                }
                this.plugin.showNotice('sync',
                    t('upload') + ': ' + uploadedList.length + '/' + uploadList.length,
                    { 'button': this.interruptButton });
            } catch (err) {
                this.plugin.parseError(err);
                ret = false;
            }
        }
        return [ret, uploadedList];
    }

    wildcardToRegex(wildcard: string) {
        let regex = wildcard.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        regex = regex.replace(/\*/g, '.*');
        return new RegExp(regex);
    }

    async getLocalFiles(include_str: string, exclude_str: string) {
        const include_list = include_str.split(',');
        const exclude_list = exclude_str.split(',');
        const file_dict = await this.localInfo.fileInfoList;
        const fileList = [];
        for (const key in file_dict) {
            const file = file_dict[key];
            //if (file.path.contains('.md')) {
            if (true) {
                let include = false;
                if (include_list.length == 0) {
                    include = true;
                } else {
                    for (const includePath of include_list) {
                        if (file.path.startsWith(includePath)) {
                            include = true;
                            break;
                        }
                    }
                }
                if (!include) {
                    continue;
                }
                for (const excludePath of exclude_list) {
                    let regex = this.wildcardToRegex(excludePath);
                    if (excludePath == '') {
                        break;
                    }
                    if (regex.test(file.path)) {
                        include = false;
                        break;
                    }
                }
                if (!include) {
                    continue;
                }
                fileList.push({ 'path': file.path, 'mtime': file.mtime, 'md5': file.md5 });
            }
        }
        return fileList;
    }

    regular_rules(rule_str: string) {
        if (rule_str == '') {
            return rule_str;
        }
        const rule_list = rule_str.split(',');
        let ret_array = []
        for (const rule of rule_list) {
            let new_rule = normalizePath(rule);
            ret_array.push(new_rule);
        }
        let ret_string = ret_array.join(',');
        return ret_string
    }


    async check_server_update() {
        let ret = false;
        const url = new URL(this.settings.url + '/api/sync/');
        let params = new URLSearchParams();
        params.append('user_name', this.settings.myUsername);
        params.append('vault', this.app.vault.getName());
        params.append('rtype', 'check_update');
        params.append('last_sync_time', this.settings.lastSyncTime.toString());
        const requestOptions = {
            url: url.toString(),
            method: 'POST',
            headers: {
                'Authorization': 'Token ' + this.settings.myToken,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        };
        try {
            const response = await requestUrl(requestOptions);
            if (response.status !== 200) {
                throw response;
            }
            const data = await response.json;
            if (data.update == true) {
                ret = true;
            }
        } catch (err) {
            this.plugin.parseError(err, true);
            this.plugin.showNotice('sync', t('syncFailed'), { timeout: 3000 });
        }
        return ret;
    }

    async syncAll(auto_login: boolean = true) {
        await this.localInfo.update();
        if (this.settings.myToken == '') {
            await this.plugin.getMyToken();
        }
        if (this.settings.myToken == '') {
            return;
        }
        if (this.settings.lastSyncTime > this.settings.lastIndexTime) {
            if (await this.check_server_update() == false) {
                this.plugin.showNotice('temp', t('sync') + ": " + t('sync_no_file_change'), { timeout: 3000 });
                return;
            }
        }
        const include_str = this.regular_rules(this.settings.include);
        const exclude_str = this.regular_rules(this.settings.exclude);
        const fileList = await this.getLocalFiles(include_str, exclude_str);
        const url = new URL(this.settings.url + '/api/sync/');
        const params = new URLSearchParams();
        params.append('user_name', this.settings.myUsername);
        params.append('vault', this.app.vault.getName());
        params.append('rtype', 'compare');
        params.append('include', include_str);
        params.append('exclude', exclude_str);
        params.append('last_sync_time', this.settings.lastSyncTime.toString());
        params.append('files', JSON.stringify(fileList));
        const requestOptions = {
            url: url.toString(),
            method: 'POST',
            headers: {
                'Authorization': 'Token ' + this.settings.myToken,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        };
        try {
            const response = await requestUrl(requestOptions);
            if (response.status !== 200) {
                throw response;
            }
            const data = await response.json;
            this.interrupt = false;
            let showinfo = ""
            let upload_list = data.upload_list;
            let download_list = data.download_list;
            let download_success = true;
            if (upload_list && upload_list.length > 0) {
                showinfo += t('upload') + ': ' + upload_list.length + ' ' + t('files') + '\n';
            }
            if (download_list && download_list.length > 0) {
                showinfo += t('download') + ': ' + download_list.length + ' ' + t('files') + '\n';
            }
            if (data.remove_list && data.remove_list.length > 0) {
                showinfo += t('removeLocal') + ': ' + data.remove_list.length + ' ' + t('files') + '\n';
            }
            if (data.cloud_remove_list && data.cloud_remove_list.length > 0) {
                showinfo += t('removeServer') + ': ' + data.cloud_remove_list.length + ' ' + t('files') + '\n';
            }
            if (showinfo == "") {
                showinfo = t('nothingToDo');
                this.plugin.showNotice('temp', showinfo, { timeout: 3000 });
                console.warn('syncAll nothing to do')
                return;
            }
            this.plugin.showNotice('temp', showinfo, { timeout: 3000 });
            if (upload_list && upload_list.length > 0) {
                let updateFiles: TFile[] = [];
                for (const dic of upload_list) {
                    const file = this.app.vault.getAbstractFileByPath(dic['addr']);
                    if (file instanceof TFile) {
                        updateFiles.push(file);
                    }
                }
                await this.uploadFiles(updateFiles);
            }
            if (download_list && download_list.length > 0) {
                download_success = await this.downloadFiles(download_list)
            }
            if (data.remove_list && data.remove_list.length > 0) {
                await this.removeFiles(data.remove_list)
            }
            // wait 1 second to show
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.plugin.showNotice('sync', t('syncFinished'), { timeout: 3000 });
            await this.localInfo.update();
            // lastSyncTime only affects file only in cloud
            // if file only in cloud, and lastSyncTime is new, remove cloud file
            // if download not success, maybe accidentally remove cloud file
            if (download_success && false == this.interrupt) {
                this.settings.lastSyncTime = new Date().getTime() + 5000; // 5 sec delay
                this.plugin.saveSettings();
            }
        } catch (err) {
            this.plugin.parseError(err, auto_login == false);
            if (err.status === 401) {
                if (auto_login) {
                    await this.syncAll(false);
                    return;
                }
            }
            this.plugin.showNotice('sync', t('syncFailed'), { timeout: 3000 });
        }
    }

    async removeFiles(filelist: []) {
        let info = t('delete_files');
        info += "\n"
        for (const dic of filelist) {
            info += '\n' + dic['addr'];
        }
        const userConfirmed = await new Promise((resolve) => {
            new ConfirmModal(this.app, info, resolve).open();
        });

        if (userConfirmed) {
            for (const dic of filelist) {
                if (this.interrupt) {
                    break;
                }
                try {
                    this.app.vault.trash(this.app.vault.getAbstractFileByPath(dic['addr']));
                } catch (error) {
                    console.error(error);
                }
            }
        }
    }

    async downloadFiles(filelist: []) {
        let count = 0
        let ret = true;
        for (const dic of filelist) {
            if (this.interrupt) {
                break;
            }
            ret = await this.downloadFile(dic['addr'], dic['idx']);
            if (!ret) {
                this.plugin.showNotice('temp', t('downloadFailed'), { timeout: 3000 });
                break;
            }
            count += 1;
            if (count % 5 == 0) {
                this.plugin.showNotice('sync',
                    t('download') + ': ' + count + '/' + filelist.length,
                    { 'button': this.interruptButton });
            }
        }
        this.plugin.showNotice('sync',
            t('download') + ': ' + count + '/' + filelist.length,
            { 'button': this.interruptButton });
        return ret;
    }

    async downloadFile(filename: string, idx: string) {
        let ret = true;
        const url = new URL(this.settings.url + '/api/entry/data/' + idx + '/' + 'download/');
        const requestOptions = {
            url: url.toString(),
            method: 'GET',
            headers: {
                'Authorization': 'Token ' + this.settings.myToken,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };
        try {
            const response: RequestUrlResponse = await requestUrl(requestOptions);
            if (response.status !== 200) {
                throw response;
            }
            const arrayBuffer = await response.arrayBuffer;
            const dirname = filename.substring(0, filename.lastIndexOf('/'));
            if (!await this.app.vault.adapter.exists(dirname)) {
                await this.app.vault.adapter.mkdir(dirname, { recursive: true });
            }

            if (arrayBuffer instanceof ArrayBuffer) {
                await this.app.vault.adapter.writeBinary(filename, arrayBuffer);
            }
        } catch (err) {
            this.plugin.parseError(err);
            ret = false;
        }
        return ret;
    }

    async syncCurrentMd(plugin: any) {
        if (this.settings.myToken == '') {
            await this.plugin.getMyToken();
        }
        if (this.settings.myToken == '') {
            return;
        }
        this.interrupt = false;
        const file: TFile = this.app.workspace.getActiveViewOfType(MarkdownView).file;
        let [ret, list] = await this.uploadFiles([file]);
        this.plugin.hideNotice('sync')
        if (ret) {
            if (Array.isArray(list) && list.length > 0) {
                this.plugin.showNotice('temp', t('uploadSuccess'), { timeout: 3000 });
            } else {
                this.plugin.showNotice('temp', t('uploadFinished'), { timeout: 3000 });
            }
        }
    }
}

export class LocalInfo {
    plugin: any;
    app: any;
    fileInfoList: any;
    jsonPath: string;

    constructor(plugin: any, app: any) {
        this.plugin = plugin;
        this.app = app;
        this.fileInfoList = {};
        this.jsonPath = `${this.plugin.manifest.dir}/file_info.json`;
        this.load();
    }


    async update() {
        const vault = this.app.vault;
        const files = vault.getFiles();
        if (files.length == 0) {
            console.warn('no vault files, wait for next update')
            return false;
        }
        this.plugin.showNotice('temp', 'ExMemo' + t('updateIndex'));
        let count = 0;
        for (const file of files) {
            const mtime = file.stat.mtime;
            if (file.path in this.fileInfoList) {
                if (this.fileInfoList[file.path].mtime == mtime) {
                    continue;
                }
            }

            const data = await vault.readBinary(file);
            const wordArray = WordArray.create(data);
            const md5Hash = MD5(wordArray).toString();

            this.fileInfoList[file.path] = {
                path: file.path,
                md5: md5Hash,
                mtime: mtime
            };
            count += 1;
        }
        for (const key in this.fileInfoList) {
            if (!files.find((file: TFile) => file.path == key)) {
                delete this.fileInfoList[key];
                count += 1;
            }
        }
        this.plugin.hideNotice('temp')
        if (count > 0) {
            await this.save();
            return true;
        }
        return false;
    }

    async save() {
        const fileInfoStr = JSON.stringify(this.fileInfoList, null, 2);
        //fs.writeFileSync(this.jsonPath, fileInfoStr);
        await this.app.vault.adapter.write(this.jsonPath, fileInfoStr);
        this.plugin.settings.lastIndexTime = new Date().getTime();
        this.plugin.saveSettings();
    }

    async load() {
        if (await this.app.vault.adapter.exists(this.jsonPath)) {
            const fileInfoStr = await this.app.vault.adapter.read(this.jsonPath);
            this.fileInfoList = JSON.parse(fileInfoStr);
        }
        await this.update();
    }
}
