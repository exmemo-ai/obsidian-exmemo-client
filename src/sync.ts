import { TFile, MarkdownView, normalizePath, RequestUrlResponse, Modal, Setting } from 'obsidian';
import { ConfirmModal, requestWithToken } from 'src/utils';
import { t } from "src/lang/helpers"

const MD5 = require('crypto-js/md5');
const WordArray = require('crypto-js/lib-typedarrays');

export interface FileInfo {
    path: string;
    md5: string;
    mtime: number;
    lastSyncTime?: number;
}

export class ConflictModal extends Modal {
    result: string = '';
    onSubmit: (result: string) => void;
    conflictFiles: any[];
    
    constructor(app: any, conflictFiles: any[], onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.conflictFiles = conflictFiles;
    }

    onOpen() {
        const {contentEl} = this;
        
        contentEl.createEl('h2', {text: t('conflictDetected')});
        contentEl.createEl('p', {text: t('conflictMessage')});
        
        const fileList = contentEl.createEl('ul');
        this.conflictFiles.forEach(file => {
            fileList.createEl('li', {text: file.addr});
        });
        
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('upload'))
                .setCta()
                .onClick(() => {
                    this.result = 'upload';
                    this.close();
                }))
            .addButton(button => button
                .setButtonText(t('download'))
                .setCta()
                .onClick(() => {
                    this.result = 'download';
                    this.close();
                }))
            .addButton(button => button
                .setButtonText(t('skip'))
                .setCta()
                .onClick(() => {
                    this.result = 'skip';
                    this.close();
                }));
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
        this.onSubmit(this.result);
    }
}

export class Sync {
    app: any;
    settings: any;
    plugin: any;
    interrupt: boolean;
    interruptButton: any;
    localInfo: LocalInfo;
    currentConflictModal: ConflictModal | null = null;
    currentConfirmModal: ConfirmModal | null = null;
    isSyncing: boolean = false;

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

    async formDataToArrayBuffer(formData: FormData, boundary: string) {
        let chunks: any[] = [];
        const formDataArray: [string, FormDataEntryValue][] = [];
        formData.forEach((value: FormDataEntryValue, key: string) => {
            formDataArray.push([key, value]);
        });

        for (const [name, value] of formDataArray) {
            chunks.push(new TextEncoder().encode(`--${boundary}\r\n`));
            if (value instanceof File) {
                chunks.push(new TextEncoder().encode(`Content-Disposition: form-data; name="${name}"; filename="${value.name}"\r\n`));
                chunks.push(new TextEncoder().encode(`Content-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`));
                chunks.push(new Uint8Array(await value.arrayBuffer()));
                chunks.push(new TextEncoder().encode("\r\n"));
            } else {
                chunks.push(new TextEncoder().encode(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
                chunks.push(new TextEncoder().encode(`${value}\r\n`));
            }
        }
        chunks.push(new TextEncoder().encode(`--${boundary}--\r\n`));
        return new Blob(chunks).arrayBuffer();
    }

    async checkServerAsyncSupport(): Promise<boolean> {
        try {
            const url = `${this.settings.url}/api/tasks/async_support/`;
            const response = await requestWithToken(this.plugin, {
                url: url,
                method: 'GET',
                headers: {
                    'Authorization': 'Token ' + this.settings.myToken
                }
            });
            
            const data = await response.json;
            return data.async_supported === true;
        } catch (err) {
            console.error('Failed to check async support:', err);
            return false;
        } 
    }

    async uploadFiles(uploadList: TFile[]): Promise<[boolean, TFile[]]> {
        const url = new URL(this.settings.url + '/api/entry/data/');
        const MAX_SYNC_SIZE = 20 * 1024 * 1024; // 20MB
        let uploadedList: TFile[] = [];
        let ret = true;

        let totalSize = 0;
        const fileSizes: Map<TFile, number> = new Map();
        for (const file of uploadList) {
            const stat = await this.app.vault.adapter.stat(file.path);
            const size = stat?.size || 0;
            fileSizes.set(file, size);
            totalSize += size;
        }

        console.log('uploadFiles', uploadList.length, 'files, total size:', this.formatSize(totalSize));

        let useAsync = totalSize > MAX_SYNC_SIZE || uploadList.length > 100;
        
        if (useAsync) {
            const serverSupportsAsync = await this.checkServerAsyncSupport();
            if (!serverSupportsAsync) {
                console.log('Server does not support async upload, falling back to sync mode');
                this.plugin.showNotice('temp', t('serverNotSupportAsync'), { timeout: 3000 });
                useAsync = false;
            }
        }
        
        //const useAsync = true; // for test, later...
        this.updateProgressNotice(0, uploadList.length, useAsync ? t('asyncMode') : t('syncMode'));

        if (useAsync) {
            // asynchronous upload: all files at once
            return await this.uploadFilesAsync(uploadList, fileSizes, url);
        } else {
            // const groups = this.groupFilesBySize(uploadList, fileSizes, MAX_SYNC_SIZE);
            const groups = this.groupFilesByCount(uploadList, 5);
            
            for (let i = 0; i < groups.length; i++) {
                if (this.interrupt) {
                    break;
                }
                
                const group = groups[i];
                // console.log(`Uploading group ${i + 1}/${groups.length}`, 'this.interrupt', this.interrupt, 'group', group);
                const [groupSuccess, groupResult] = await this.uploadFileGroup(group, url, false);
                if (groupSuccess && Array.isArray(groupResult)) {
                    uploadedList.push(...groupResult);
                } else {
                    ret = false;
                }
                this.updateProgressNotice(uploadedList.length, uploadList.length, t('syncMode'));
            }
        }
        
        return [ret, uploadedList];
    }

    private groupFilesBySize(files: TFile[], fileSizes: Map<TFile, number>, maxSize: number): TFile[][] {
        const groups: TFile[][] = [];
        let currentGroup: TFile[] = [];
        let currentSize = 0;

        const sortedFiles = [...files].sort((a, b) => {
            const sizeA = fileSizes.get(a) || 0;
            const sizeB = fileSizes.get(b) || 0;
            return sizeA - sizeB;
        });

        for (const file of sortedFiles) {
            const fileSize = fileSizes.get(file) || 0;
            
            if (fileSize > maxSize) {
                if (currentGroup.length > 0) {
                    groups.push(currentGroup);
                    currentGroup = [];
                    currentSize = 0;
                }
                groups.push([file]);
                continue;
            }

            if (currentSize + fileSize > maxSize && currentGroup.length > 0) {
                groups.push(currentGroup);
                currentGroup = [file];
                currentSize = fileSize;
            } else {
                currentGroup.push(file);
                currentSize += fileSize;
            }
        }

        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }

        return groups;
    }

    private groupFilesByCount(files: TFile[], filesPerGroup: number = 5): TFile[][] {
        const groups: TFile[][] = [];
        
        for (let i = 0; i < files.length; i += filesPerGroup) {
            const group = files.slice(i, i + filesPerGroup);
            groups.push(group);
        }

        return groups;
    }

    private async uploadFilesAsync(uploadList: TFile[], fileSizes: Map<TFile, number>, url: URL): Promise<[boolean, TFile[]]> {
        const [success, result] = await this.uploadFileGroup(uploadList, url, true);
        
        if (success) {
            if (typeof result === 'string') {
                return await this.pollUploadProgress(result, uploadList);
            } else if (Array.isArray(result)) {
                console.log(t('serverNotSupportAsync'));
                this.updateProgressNotice(uploadList.length, uploadList.length, t('syncMode'));
                return [true, result];
            }
        }
        
        return [false, []];
    }

    private async uploadFileGroup(group: TFile[], url: URL, isAsync: boolean): Promise<[boolean, TFile[] | string]> {
        const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
        const body = new FormData();
        
        body.append('etype', 'note');
        body.append('source', 'obsidian_plugin');
        body.append('vault', this.app.vault.getName());
        body.append('rtype', 'upload');
        body.append('user_name', this.settings.myUsername);
        body.append('is_async', isAsync ? 'true' : 'false');
        
        for (let file of group) {
            const fileContent = await this.app.vault.readBinary(file);
            const blob = new Blob([fileContent]);
            body.append('files', blob, file.name);
            body.append('filepaths', file.path);
            if (this.localInfo.fileInfoList[file.path]) {
                body.append('filemd5s', this.localInfo.fileInfoList[file.path].md5);
            }
        }

        const requestOptions = {
            url: url.toString(),
            method: 'POST',
            headers: {
                'Authorization': 'Token ' + this.settings.myToken,
                "Content-Type": `multipart/form-data; boundary=${boundary}`
            },
            body: await this.formDataToArrayBuffer(body, boundary)
        };

        try {
            const response = await requestWithToken(this.plugin, requestOptions);
            const data = await response.json;
            
            if (isAsync && data.task_id) {
                return [true, data.task_id as string];
            }
            
            const uploadedFiles: TFile[] = [];
            //console.log('upload file return', data) // for test
            if (data.list) {
                for (const file of group) {
                    if (data.list.some((result: any) => result === file.path)) {
                        uploadedFiles.push(file);
                    }
                }
            }
            
            if (data.emb_status && data.emb_status === 'failed') {
                this.plugin.showNotice('error', t('embeddingFailed'), { timeout: 3000 });
            }
            
            return [true, uploadedFiles];
        } catch (err) {
            console.error('Upload group failed:', err);
            return [false, []];
        }
    }

    private async pollUploadProgress(taskId: string, originalFiles: TFile[]): Promise<[boolean, TFile[]]> {
        const maxAttempts = 60; // 5分钟超时 (60 * 5秒)
        let attempts = 0;
        let currentTaskId = taskId;

        console.log(t('pollingTaskStatus') + ', taskId:', currentTaskId);
        while (attempts < maxAttempts) {
            if (this.interrupt) {
                await this.terminateTask(currentTaskId);
                this.plugin.showNotice('sync', t('upload') + ': ' + t('interrupted'), { timeout: 2000 });
                break;
            }

            try {
                const progressUrl = `${this.settings.url}/api/tasks/running_tasks/`;
                const response = await requestWithToken(this.plugin, {
                    url: progressUrl,
                    method: 'GET',
                    headers: {
                        'Authorization': 'Token ' + this.settings.myToken
                    }
                });

                const data = await response.json;
                
                const runningTasks = data.results || [];
                const currentTask = runningTasks.find((task: any) => task.task_id === currentTaskId);
                
                if (!currentTask) {
                    this.updateProgressNotice(originalFiles.length, originalFiles.length, t('asyncMode'));
                    return [true, originalFiles];
                }

                const progress = currentTask.progress || {};
                const current = progress.current || 0;
                const status = currentTask.status || 'RUNNING';

                console.log('tasks', data.results, currentTask, currentTaskId, "status", status);

                if (status === 'SUCCESS' || status === 'COMPLETED') {
                    this.updateProgressNotice(originalFiles.length, originalFiles.length, t('asyncMode'));
                    return [true, originalFiles];
                } else if (status === 'FAILURE' || status === 'FAILED') {
                    this.plugin.showNotice('error', `${t('uploadFailedWithError')}: ${currentTask.error || t('unknownError')}`, { timeout: 5000 });
                    return [false, []];
                } else {
                    this.updateProgressNotice(current, originalFiles.length, t('asyncMode'));
                }

                await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒间隔
                attempts++;
            } catch (err) {
                console.error('Progress polling failed:', err);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        this.plugin.showNotice('error', t('uploadTimeout'), { timeout: 5000 });
        return [false, []];
    }

    private formatSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    wildcardToRegex(wildcard: string) {
        let regex = wildcard.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        regex = regex.replace(/\*/g, '.*');
        return new RegExp(regex);
    }

    async getLocalFiles(include_str: string, exclude_str: string) {
        const include_list = include_str.split(',');
        const exclude_list = exclude_str.split(',');
        const file_dict = this.localInfo.fileInfoList;
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
                fileList.push({ 'path': file.path, 'mtime': file.mtime, 'md5': file.md5, 'lastSyncTime': file.lastSyncTime || 0});
            }
        }
        return fileList;
    }

    regularRules(rule_str: string) {
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

    async checkServerUpdate() {
        const url = new URL(this.settings.url + '/api/sync/');
        const params = new URLSearchParams();
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
            const response = await requestWithToken(this.plugin, requestOptions);
            const data = await response.json;
            return data.update === true;
        } catch (err) {
            return false;
        }
    }

    async syncAll() {
        if (this.isSyncing) {
            this.plugin.showNotice('temp', t('syncInProgress'), { timeout: 3000 });
            return;
        }

        try {
            this.isSyncing = true;
            this.interrupt = false;
            
            await this.localInfo.update();

            if (this.settings.lastSyncTime > this.settings.lastIndexTime) {
                if (!await this.checkServerUpdate()) {
                    this.plugin.showNotice('temp', t('sync') + ": " + t('sync_no_file_change'), { timeout: 3000 });
                    return;
                }
            }

            const include_str = this.regularRules(this.settings.include);
            const exclude_str = this.regularRules(this.settings.exclude);
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

            const response = await requestWithToken(this.plugin, requestOptions, true);
            const data = await response.json;
            
            let showinfo = ""
            let upload_list = data.upload_list || [];
            let download_list = data.download_list || [];
            let conflict_list = data.conflict_list || [];
            let opt_success = true;
            
            if (upload_list.length > 0) {
                showinfo += t('upload') + ': ' + upload_list.length + ' ' + t('files') + '\n';
            }
            if (download_list.length > 0) {
                showinfo += t('download') + ': ' + download_list.length + ' ' + t('files') + '\n';
            }
            if (data.remove_list && data.remove_list.length > 0) {
                showinfo += t('removeLocal') + ': ' + data.remove_list.length + ' ' + t('files') + '\n';
            }
            if (data.cloud_remove_list && data.cloud_remove_list.length > 0) {
                showinfo += t('removeServer') + ': ' + data.cloud_remove_list.length + ' ' + t('files') + '\n';
            }
            if (conflict_list.length > 0) {
                showinfo += t('conflicts') + ': ' + conflict_list.length + ' ' + t('files') + '\n';
            }
            
            if (showinfo == "") {
                showinfo = t('nothingToDo');
                this.plugin.showNotice('temp', showinfo, { timeout: 3000 });
                console.warn('syncAll nothing to do')
                return;
            }
            this.plugin.showNotice('temp', showinfo, { timeout: 3000 });
            if (upload_list.length > 0) {
                let updateFiles: TFile[] = [];
                for (const dic of upload_list) {
                    const file = this.app.vault.getAbstractFileByPath(dic['addr']);
                    if (file instanceof TFile) {
                        updateFiles.push(file);
                    } else {
                        console.log("can't found" + dic['addr']);
                    }
                }
                await this.uploadFiles(updateFiles);
            }
            
            if (download_list.length > 0) {
                opt_success = await this.downloadFiles(download_list);
            }
            
            if (data.remove_list && data.remove_list.length > 0) {
                await this.removeFiles(data.remove_list);
            }
            
            if (conflict_list.length > 0 && !this.interrupt) {
                const conflict_result = await this.showConflict(conflict_list);
                opt_success = opt_success && conflict_result.success;
                this.finishSync(opt_success, upload_list, download_list, conflict_list, conflict_result.result);
            } else {
                this.finishSync(opt_success, upload_list, download_list);
            }
        } catch (err) {
            this.plugin.showNotice('sync', t('syncFailed') + ': ' + err.status, { timeout: 3000 });
        } finally {
            this.isSyncing = false;
        }
    }

    showConflict(conflict_list: []): Promise<{result: string, success: boolean}> {
        return new Promise<{result: string, success: boolean}>((resolve) => {
            if (this.currentConflictModal) {
                this.currentConflictModal.close();
                this.currentConflictModal = null;
            }
                        
            const conflictModal = new ConflictModal(this.app, conflict_list, async (result) => {
                let opt_success = true;
                if (result === 'upload') {
                    let updateFiles: TFile[] = [];
                    for (const dic of conflict_list) {
                        const file = this.app.vault.getAbstractFileByPath(dic['addr']);
                        if (file instanceof TFile) {
                            updateFiles.push(file);
                        }
                    }
                    if (updateFiles.length > 0) {
                        const [uploadSuccess, uploadedFiles] = await this.uploadFiles(updateFiles);
                        opt_success = uploadSuccess;
                    }
                } else if (result === 'download') {
                    const downloadResult = await this.downloadFiles(conflict_list);
                    opt_success = downloadResult;
                }
                
                this.currentConflictModal = null;
                resolve({result, success: opt_success});
            });
            
            this.currentConflictModal = conflictModal;
            conflictModal.open();
        });
    }

    
    async finishSync(opt_success: boolean, upload_list: any[], download_list: any[], conflict_list?: any[], conflict_result?: string) {
        // wait 1 second to show
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.plugin.showNotice('sync', t('syncFinished'), { timeout: 3000 });
        await this.localInfo.update();
        
        // lastSyncTime only affects file only in cloud
        // if file only in cloud, and lastSyncTime is new, remove cloud file
        // if download not success, maybe accidentally remove cloud file
        if (opt_success && false == this.interrupt) {
            const newSyncTime = new Date().getTime() + 5000; // 5 sec delay
            this.settings.lastSyncTime = newSyncTime;
            this.plugin.saveSettings();            
            const syncedPaths: string[] = [];
            
            upload_list.forEach(item => {
                if (item.addr && !syncedPaths.includes(item.addr)) {
                    syncedPaths.push(item.addr);
                }
            });
            
            download_list.forEach(item => {
                if (item.addr && !syncedPaths.includes(item.addr)) {
                    syncedPaths.push(item.addr);
                }
            });
            
            if (conflict_list && conflict_result && conflict_result !== 'skip') {
                conflict_list.forEach(item => {
                    if (item.addr && !syncedPaths.includes(item.addr)) {
                        syncedPaths.push(item.addr);
                    }
                });
            }
            
            if (syncedPaths.length > 0) {
                this.localInfo.updateFilesSyncTime(syncedPaths, newSyncTime);
            }
        }
    }

    async removeFiles(filelist: []) {
        let info = t('delete_files');
        info += "\n";
        for (const dic of filelist) {
            info += '\n' + dic['addr'];
        }

        if (this.currentConfirmModal) {
            this.currentConfirmModal.close();
            this.currentConfirmModal = null;
        }

        const confirmModal = new ConfirmModal(this.app, info, (userConfirmed) => {
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
            this.currentConfirmModal = null;
        });

        this.currentConfirmModal = confirmModal;
        confirmModal.open();
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
            const response: RequestUrlResponse = await requestWithToken(this.plugin, requestOptions);
            const arrayBuffer = await response.arrayBuffer;
            const dirname = filename.substring(0, filename.lastIndexOf('/'));
            if (!await this.app.vault.adapter.exists(dirname)) {
                await this.app.vault.adapter.mkdir(dirname, { recursive: true });
            }

            if (arrayBuffer instanceof ArrayBuffer) {
                await this.app.vault.adapter.writeBinary(filename, arrayBuffer);
            }
        } catch (err) {
            ret = false;
        }
        return ret;
    }

    async syncCurrentMd(plugin: any) {
        if (this.isSyncing) {
            this.plugin.showNotice('temp', t('syncInProgress'), { timeout: 3000 });
            return;
        }

        try {
            this.isSyncing = true;
            this.interrupt = false;
            
            const file: TFile = this.app.workspace.getActiveViewOfType(MarkdownView).file;
            let [ret, list] = await this.uploadFiles([file]);
            this.plugin.hideNotice('sync')
            if (ret) {
                if (Array.isArray(list) && list.length > 0) {
                    this.plugin.showNotice('temp', t('uploadSuccess'), { timeout: 3000 });
                    const newSyncTime = new Date().getTime() + 5000; // 5 sec delay
                    this.localInfo.updateFilesSyncTime([file.path], newSyncTime);
                } else {
                    this.plugin.showNotice('temp', t('uploadFinished'), { timeout: 3000 });
                }
            }
        } finally {
            this.isSyncing = false;
        }
    }

    private async terminateTask(taskId: string): Promise<boolean> {
        try {
            const terminateUrl = `${this.settings.url}/api/tasks/${taskId}/terminate/`;
            const response = await requestWithToken(this.plugin, {
                url: terminateUrl,
                method: 'POST',
                headers: {
                    'Authorization': 'Token ' + this.settings.myToken
                }
            });
            
            const result = await response.json;
            return result.code === 0;
        } catch (err) {
            console.error('Failed to terminate task:', err);
            return false;
        }
    }

    private updateProgressNotice(current: number, total: number, mode: string): void {
        this.plugin.showNotice('sync',
            t('upload') + `: ${current}/${total} ${mode}`,
            { 'button': this.interruptButton });
    }
}

export class LocalInfo {
    plugin: any;
    app: any;
    fileInfoList: Record<string, FileInfo>;
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
            const defaultLastSyncTime = this.plugin.settings.lastSyncTime || 0;
            
            if (this.fileInfoList[file.path]) {
                this.fileInfoList[file.path].md5 = md5Hash;
                this.fileInfoList[file.path].mtime = mtime;                
                if (!this.fileInfoList[file.path].lastSyncTime) {
                    this.fileInfoList[file.path].lastSyncTime = defaultLastSyncTime;
                }
            } else {
                this.fileInfoList[file.path] = {
                    path: file.path,
                    md5: md5Hash,
                    mtime: mtime,
                    lastSyncTime: defaultLastSyncTime
                };
            }

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

    updateFilesSyncTime(filePaths: string[], lastSyncTime?: number): void {
        const ltime = lastSyncTime || new Date().getTime();
        for (const path of filePaths) {
            if (this.fileInfoList[path]) {
                this.fileInfoList[path].lastSyncTime = ltime;
            }
        }
        this.save();
    }
}
