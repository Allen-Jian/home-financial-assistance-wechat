"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportPageModel = exports.MAX_IMPORT_BYTES = void 0;
exports.createImportPage = createImportPage;
const app_1 = require("../../app");
exports.MAX_IMPORT_BYTES = 20 * 1024 * 1024;
function toPickedFile(file, fallbackType) {
    var _a, _b, _c, _d, _e, _f, _g;
    const path = (_b = (_a = file.tempFilePath) !== null && _a !== void 0 ? _a : file.path) !== null && _b !== void 0 ? _b : '';
    const rawType = (_d = (_c = file.fileType) !== null && _c !== void 0 ? _c : file.type) !== null && _d !== void 0 ? _d : fallbackType;
    const contentType = rawType === 'image' ? 'image/jpeg' : rawType === 'pdf' ? 'application/pdf' : rawType === 'csv' ? 'text/csv' : rawType;
    return { path, name: (_f = (_e = file.name) !== null && _e !== void 0 ? _e : path.split('/').pop()) !== null && _f !== void 0 ? _f : 'import', size: (_g = file.size) !== null && _g !== void 0 ? _g : 0, contentType };
}
function createImportPicker() {
    return {
        chooseMedia: () => new Promise((resolve, reject) => wx.chooseMedia({
            count: 1, mediaType: ['image'], sourceType: ['camera'],
            success: (result) => { var _a; return resolve(toPickedFile((_a = result.tempFiles[0]) !== null && _a !== void 0 ? _a : {}, 'image/jpeg')); },
            fail: reject,
        })),
        chooseAlbum: () => new Promise((resolve, reject) => wx.chooseMedia({
            count: 1, mediaType: ['image'], sourceType: ['album'],
            success: (result) => { var _a; return resolve(toPickedFile((_a = result.tempFiles[0]) !== null && _a !== void 0 ? _a : {}, 'image/jpeg')); },
            fail: reject,
        })),
        chooseMessageFile: () => new Promise((resolve, reject) => wx.chooseMessageFile({
            count: 1, type: 'all',
            success: (result) => { var _a; return resolve(toPickedFile((_a = result.tempFiles[0]) !== null && _a !== void 0 ? _a : {}, 'application/octet-stream')); },
            fail: reject,
        })),
        readFile: (path) => new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
            filePath: path, success: (result) => resolve(result.data), fail: reject,
        })),
    };
}
function asBytes(content) {
    if (typeof content !== 'string')
        return content;
    return new TextEncoder().encode(content);
}
function asText(content) {
    return typeof content === 'string' ? content : new TextDecoder().decode(content);
}
function signatureMatches(file, content) {
    const bytes = asBytes(content);
    if (file.contentType === 'application/pdf')
        return asText(content).startsWith('%PDF-');
    if (file.contentType === 'image/jpeg')
        return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (file.contentType === 'image/png')
        return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
    return true;
}
function simpleHash(content) {
    let hash = 2166136261;
    for (const byte of asBytes(content))
        hash = Math.imul(hash ^ byte, 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
}
class ImportPageModel {
    constructor(picker, api, hashFile = simpleHash) {
        this.picker = picker;
        this.api = api;
        this.hashFile = hashFile;
        this.state = {
            file: null, sourceType: null, preview: null, rows: [], stageResult: null, uploaded: false,
            originalPreserved: false, loading: false, error: '', textInput: '',
        };
        this.content = null;
        this.staged = new Map();
    }
    choosePhoto() { return this.select(this.picker.chooseMedia(), 'manual-photo'); }
    chooseAlbum() { return this.select(this.picker.chooseAlbum(), 'manual-photo'); }
    async chooseFile() {
        try {
            const file = await this.picker.chooseMessageFile();
            const type = file.contentType === 'application/pdf' ? 'pdf' : file.contentType === 'text/csv' ? 'anz-csv' : file.contentType.startsWith('image/') ? 'manual-photo' : null;
            return type ? this.select(Promise.resolve(file), type) : this.reject('文件类型不受支持');
        }
        catch (error) {
            return this.reject(error instanceof Error ? error.message : '文件选择失败');
        }
    }
    chooseCsv() { return this.select(this.picker.chooseMessageFile(), 'anz-csv'); }
    async parseText(input) {
        const value = input.trim();
        if (!value)
            return this.reject('请输入一笔账目描述');
        this.state.loading = true;
        this.state.error = '';
        try {
            this.state.preview = await this.api.parseDraft(value);
            this.state.file = null;
            this.state.sourceType = 'text';
            this.state.textInput = value;
            this.state.rows = [];
            this.state.stageResult = null;
            this.state.uploaded = false;
            this.state.originalPreserved = true;
            this.content = value;
            return true;
        }
        catch (error) {
            this.state.originalPreserved = true;
            this.state.error = error instanceof Error ? error.message : 'AI 解析失败，请手工录入';
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
    async stage() {
        var _a, _b;
        const file = this.state.file;
        if (!this.content || !this.state.sourceType)
            return this.reject('请先选择文件或输入账目描述');
        this.state.loading = true;
        this.state.error = '';
        try {
            const fileHash = await this.hashFile(this.content);
            const previous = this.staged.get(fileHash);
            if (previous) {
                this.state.stageResult = previous;
                return true;
            }
            const result = this.state.sourceType === 'anz-csv'
                ? await this.api.stageAnzCsv({ fileHash, csv: asText(this.content) })
                : await this.api.stageImport({ fileHash, sourceType: this.state.sourceType, draft: (_a = this.state.preview) !== null && _a !== void 0 ? _a : undefined });
            this.state.stageResult = result;
            this.staged.set(fileHash, result);
            if (!result.reused && file) {
                await this.api.uploadAttachment({ filePath: file.path, draftId: (_b = result.draftId) !== null && _b !== void 0 ? _b : result.batchId, originalName: file.name, contentType: file.contentType });
                this.state.uploaded = true;
            }
            return true;
        }
        catch (error) {
            this.state.originalPreserved = true;
            this.state.error = error instanceof Error ? error.message : '文件处理失败，请重试';
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
    async select(filePromise, sourceType) {
        var _a, _b;
        this.state.loading = true;
        this.state.error = '';
        try {
            const file = await filePromise;
            if (file.size > exports.MAX_IMPORT_BYTES)
                return this.reject('文件不能超过 20 MB');
            const content = (_b = (_a = file.bytes) !== null && _a !== void 0 ? _a : file.text) !== null && _b !== void 0 ? _b : await this.picker.readFile(file.path);
            if (content instanceof ArrayBuffer)
                this.content = new Uint8Array(content);
            else
                this.content = content;
            if (!signatureMatches(file, this.content))
                return this.reject('文件类型与内容签名不匹配');
            this.state.file = file;
            this.state.sourceType = sourceType;
            this.state.preview = null;
            this.state.rows = [];
            this.state.stageResult = null;
            this.state.uploaded = false;
            this.state.originalPreserved = true;
            this.state.textInput = '';
            if (sourceType === 'anz-csv')
                this.state.rows = await this.api.previewAnzCsv(asText(this.content));
            else
                this.state.preview = await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType: file.contentType });
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '文件处理失败，请重试';
            this.state.originalPreserved = true;
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
    reject(message) { this.state.error = message; this.state.loading = false; return false; }
}
exports.ImportPageModel = ImportPageModel;
function createImportPage(model) {
    return {
        data: model.state,
        async choosePhoto() { await model.choosePhoto(); this.setData(model.state); },
        async chooseAlbum() { await model.chooseAlbum(); this.setData(model.state); },
        async chooseFile() { await model.chooseFile(); this.setData(model.state); },
        async chooseCsv() { await model.chooseCsv(); this.setData(model.state); },
        async parseText(event) { var _a, _b; await model.parseText((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        async stage() { await model.stage(); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createImportPage(new ImportPageModel(createImportPicker(), runtime.api)));
}
