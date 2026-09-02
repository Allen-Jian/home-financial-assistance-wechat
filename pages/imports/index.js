"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportPageModel = exports.MAX_IMPORT_BYTES = void 0;
exports.createImportPage = createImportPage;
const app_1 = require("../../app");
const money_1 = require("../../src/domain/money");
const themed_page_1 = require("../../src/shared/themed-page");
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
            mode: 'bill', view: 'upload', file: null, sourceType: null, preview: null, previewAmountDisplay: '', rows: [], stageResult: null, uploaded: false,
            originalPreserved: false, loading: false, error: '', textInput: '', matched: [], duplicates: [], missing: [], selectedMissingCount: 0, confirmedMissingCount: 0,
        };
        this.content = null;
        this.staged = new Map();
        this.uploadCompleted = new Set();
        this.stageInFlight = new Map();
        this.selectionRevision = 0;
        this.confirmMissingInFlight = null;
    }
    setMode(mode) {
        this.state.mode = mode === 'statement' ? 'statement' : 'bill';
        this.state.view = 'upload';
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
    toggleMissing(sourceFingerprint) {
        this.state.missing = this.state.missing.map((row) => row.sourceFingerprint === sourceFingerprint ? { ...row, selected: !row.selected } : row);
        this.state.selectedMissingCount = this.state.missing.filter((row) => row.selected).length;
    }
    confirmSelectedMissing() {
        if (this.confirmMissingInFlight)
            return Promise.resolve(false);
        const selected = this.state.missing.filter((row) => row.selected).map((row) => ({ ...row, candidates: [...row.candidates] }));
        if (!selected.length)
            return Promise.resolve(this.reject('请先选择需要补录的账目'));
        if (!this.content || !this.api.confirmDraft)
            return Promise.resolve(this.reject('补录接口暂不可用'));
        const content = typeof this.content === 'string' ? this.content : new Uint8Array(this.content);
        const selectedFingerprints = new Set(selected.map((row) => row.sourceFingerprint));
        const revision = this.selectionRevision;
        this.state.loading = true;
        this.state.error = '';
        const pending = this.confirmMissing(selected, content, selectedFingerprints, revision);
        this.confirmMissingInFlight = pending;
        pending.then(() => {
            if (this.confirmMissingInFlight === pending)
                this.confirmMissingInFlight = null;
        }, () => {
            if (this.confirmMissingInFlight === pending)
                this.confirmMissingInFlight = null;
        });
        return pending;
    }
    async confirmMissing(selected, content, selectedFingerprints, revision) {
        var _a, _b;
        try {
            const baseHash = await this.hashFile(content);
            for (const row of selected) {
                const result = await this.api.stageImport({
                    fileHash: `${baseHash}:${row.sourceFingerprint}`,
                    sourceType: 'anz-csv',
                    draft: { amountMinor: row.amountMinor, direction: row.direction, occurredAt: row.date, merchant: row.merchant, sourceFingerprint: row.sourceFingerprint },
                });
                const draftId = (_b = (_a = result.draft) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : result.draftId;
                if (!draftId)
                    throw new Error('未能生成待确认草稿');
                await this.api.confirmDraft(draftId, {});
            }
            if (revision !== this.selectionRevision)
                return true;
            this.state.confirmedMissingCount = selected.length;
            this.state.missing = this.state.missing.filter((row) => !selectedFingerprints.has(row.sourceFingerprint));
            this.state.selectedMissingCount = this.state.missing.filter((row) => row.selected).length;
            return true;
        }
        catch (error) {
            if (revision === this.selectionRevision)
                this.state.error = error instanceof Error ? error.message : '补录失败，请稍后重试';
            return false;
        }
        finally {
            if (revision === this.selectionRevision)
                this.state.loading = false;
        }
    }
    async resolveDuplicate(sourceFingerprint, action) {
        var _a, _b;
        const row = this.state.duplicates.find((item) => item.sourceFingerprint === sourceFingerprint);
        if (!row)
            return false;
        if (action === 'later') {
            row.resolution = 'later';
            return true;
        }
        if (!this.content || !this.api.confirmDraft)
            return this.reject('补录接口暂不可用');
        try {
            const baseHash = await this.hashFile(this.content);
            const result = await this.api.stageImport({ fileHash: `${baseHash}:${row.sourceFingerprint}:keep`, sourceType: 'anz-csv', draft: row });
            const draftId = (_b = (_a = result.draft) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : result.draftId;
            if (!draftId)
                throw new Error('未能生成待确认草稿');
            await this.api.confirmDraft(draftId, { allowDuplicate: true });
            row.resolution = 'keep-both';
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '重复项处理失败';
            return false;
        }
    }
    async parseText(input) {
        const value = input.trim();
        if (!value)
            return this.reject('请输入一笔账目描述');
        const revision = ++this.selectionRevision;
        this.state.loading = true;
        this.state.error = '';
        try {
            const preview = await this.api.parseDraft(value);
            if (revision !== this.selectionRevision)
                return false;
            this.state.preview = preview;
            this.state.previewAmountDisplay = (0, money_1.formatNzdMinor)(this.state.preview.amountMinor);
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
        const snapshot = this.createStageSnapshot();
        if (!snapshot)
            return this.reject('请先选择文件或输入账目描述');
        this.state.loading = true;
        this.state.error = '';
        const fileHash = await this.hashFile(snapshot.content);
        const key = this.stageKey(snapshot.revision, fileHash);
        const existing = this.stageInFlight.get(key);
        if (existing)
            return existing;
        const pending = this.runStage(snapshot, fileHash, key);
        this.stageInFlight.set(key, pending);
        try {
            return await pending;
        }
        finally {
            if (this.stageInFlight.get(key) === pending)
                this.stageInFlight.delete(key);
        }
    }
    async runStage(snapshot, fileHash, key) {
        var _a;
        try {
            const previous = this.staged.get(key);
            const result = previous !== null && previous !== void 0 ? previous : (snapshot.sourceType === 'anz-csv'
                ? await this.api.stageAnzCsv({ fileHash, csv: asText(snapshot.content) })
                : await this.api.stageImport({ fileHash, sourceType: snapshot.sourceType, draft: (_a = snapshot.preview) !== null && _a !== void 0 ? _a : undefined }));
            this.staged.set(key, result);
            if (this.isCurrent(snapshot)) {
                this.state.stageResult = result;
                this.state.uploaded = this.uploadCompleted.has(key);
            }
            await this.completeOriginalUpload(snapshot, key, result);
            return true;
        }
        catch (error) {
            if (this.isCurrent(snapshot)) {
                this.state.originalPreserved = true;
                this.state.error = error instanceof Error ? error.message : '文件处理失败，请重试';
            }
            return false;
        }
        finally {
            if (this.isCurrent(snapshot))
                this.state.loading = false;
        }
    }
    async completeOriginalUpload(snapshot, key, result) {
        var _a, _b;
        const file = snapshot.file;
        const draftId = (_b = (_a = result.draft) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : result.draftId;
        if (snapshot.sourceType === 'anz-csv' || !file || !this.api.uploadAttachment || !draftId)
            return;
        if (this.uploadCompleted.has(key)) {
            if (this.isCurrent(snapshot))
                this.state.uploaded = true;
            return;
        }
        await this.api.uploadAttachment({ filePath: file.path, draftId, originalName: file.name, contentType: file.contentType });
        this.uploadCompleted.add(key);
        if (this.isCurrent(snapshot))
            this.state.uploaded = true;
    }
    async select(filePromise, sourceType) {
        var _a, _b, _c;
        this.state.loading = true;
        this.state.view = this.state.mode === 'statement' ? 'analyzing' : 'preview';
        this.state.error = '';
        try {
            const file = await filePromise;
            const revision = ++this.selectionRevision;
            if (file.size > exports.MAX_IMPORT_BYTES)
                return this.reject('文件不能超过 20 MB');
            const content = (_b = (_a = file.bytes) !== null && _a !== void 0 ? _a : file.text) !== null && _b !== void 0 ? _b : await this.picker.readFile(file.path);
            const selectedContent = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
            if (!signatureMatches(file, selectedContent))
                return this.reject('文件类型与内容签名不匹配');
            if (revision !== this.selectionRevision)
                return false;
            this.content = selectedContent;
            this.state.file = file;
            this.state.sourceType = sourceType;
            this.state.preview = null;
            this.state.previewAmountDisplay = '';
            this.state.rows = [];
            this.state.stageResult = null;
            this.state.uploaded = false;
            this.state.originalPreserved = true;
            this.state.textInput = '';
            if (sourceType === 'anz-csv')
                this.state.rows = await this.api.previewAnzCsv(asText(selectedContent));
            else {
                const preview = await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType: file.contentType });
                if (revision !== this.selectionRevision)
                    return false;
                this.state.preview = preview;
                this.state.previewAmountDisplay = (0, money_1.formatNzdMinor)(this.state.preview.amountMinor);
            }
            if (this.state.mode === 'statement') {
                if (!this.state.rows.length && this.state.preview) {
                    this.state.rows = [{
                            date: (_c = this.state.preview.occurredAt) !== null && _c !== void 0 ? _c : new Date().toISOString().slice(0, 10),
                            amountMinor: this.state.preview.amountMinor,
                            direction: this.state.preview.direction,
                            merchant: this.state.preview.merchant,
                            sourceFingerprint: `${file.name}:0`,
                        }];
                }
                await this.analyzeStatement();
                this.state.view = 'results';
            }
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
    createStageSnapshot() {
        if (!this.content || !this.state.sourceType)
            return null;
        return {
            content: typeof this.content === 'string' ? this.content : new Uint8Array(this.content),
            file: this.state.file ? { ...this.state.file, ...(this.state.file.bytes ? { bytes: new Uint8Array(this.state.file.bytes) } : {}) } : null,
            sourceType: this.state.sourceType,
            preview: this.state.preview ? { ...this.state.preview } : null,
            revision: this.selectionRevision,
        };
    }
    stageKey(revision, fileHash) { return `${revision}:${fileHash}`; }
    isCurrent(snapshot) { return snapshot.revision === this.selectionRevision; }
    async analyzeStatement() {
        const classified = await Promise.all(this.state.rows.map(async (row) => {
            const candidates = this.api.previewDuplicates ? await this.api.previewDuplicates({
                id: row.sourceFingerprint,
                amountMinor: row.amountMinor,
                direction: row.direction,
                occurredAt: /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? `${row.date}T00:00:00.000Z` : row.date,
                merchant: row.merchant,
                sourceFingerprint: row.sourceFingerprint,
            }) : [];
            const item = { ...row, amountDisplay: `${row.direction === 'expense' ? '−' : '+'} ${(0, money_1.formatNzdMinor)(row.amountMinor)}`, selected: candidates.length === 0, candidates };
            return { row: item, kind: candidates.some((candidate) => candidate.score >= 95) ? 'matched' : candidates.length ? 'duplicate' : 'missing' };
        }));
        this.state.matched = classified.filter((item) => item.kind === 'matched').map((item) => item.row);
        this.state.duplicates = classified.filter((item) => item.kind === 'duplicate').map((item) => item.row);
        this.state.missing = classified.filter((item) => item.kind === 'missing').map((item) => item.row);
        this.state.selectedMissingCount = this.state.missing.length;
    }
}
exports.ImportPageModel = ImportPageModel;
function createImportPage(model) {
    return {
        data: model.state,
        onLoad(options = {}) { model.setMode(options.mode); this.setData(model.state); },
        async choosePhoto() { const pending = model.choosePhoto(); this.setData(model.state); await pending; this.setData(model.state); },
        async chooseAlbum() { const pending = model.chooseAlbum(); this.setData(model.state); await pending; this.setData(model.state); },
        async chooseFile() { const pending = model.chooseFile(); this.setData(model.state); await pending; this.setData(model.state); },
        async chooseCsv() { const pending = model.chooseCsv(); this.setData(model.state); await pending; this.setData(model.state); },
        async parseText(event) { var _a, _b; await model.parseText((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        async stage() { await model.stage(); this.setData(model.state); },
        toggleMissing(event) { var _a, _b, _c; model.toggleMissing((_c = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : ''); this.setData(model.state); },
        confirmSelectedMissing() {
            const pending = model.confirmSelectedMissing();
            this.setData(model.state);
            return pending.then(() => { this.setData(model.state); });
        },
        async resolveDuplicate(event) {
            var _a, _b, _c, _d, _e;
            const action = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.action;
            if (action === 'later' || action === 'keep-both')
                await model.resolveDuplicate((_e = (_d = (_c = event.currentTarget) === null || _c === void 0 ? void 0 : _c.dataset) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : '', action);
            this.setData(model.state);
        },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page((0, themed_page_1.withThemePage)(createImportPage(new ImportPageModel(createImportPicker(), runtime.api)), runtime.theme));
}
