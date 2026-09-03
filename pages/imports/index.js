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
function isPickerCancellation(error) {
    if (!error || typeof error !== 'object')
        return typeof error === 'string' && /cancel|取消/i.test(error);
    const candidate = error;
    return [candidate.errMsg, candidate.message].some((value) => typeof value === 'string' && /cancel|取消/i.test(value));
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
        this.pickerAttempt = 0;
        this.confirmMissingInFlight = null;
        this.duplicateInFlight = new Map();
    }
    setMode(mode) {
        this.state.mode = mode === 'statement' ? 'statement' : 'bill';
        this.state.view = 'upload';
    }
    choosePhoto(onAccepted) {
        return this.startPickerSelection('manual-photo', () => this.picker.chooseMedia(), onAccepted);
    }
    chooseAlbum(onAccepted) {
        return this.startPickerSelection('manual-photo', () => this.picker.chooseAlbum(), onAccepted);
    }
    async chooseFile(onAccepted) {
        const attempt = this.beginPickerAttempt();
        try {
            const file = await this.picker.chooseMessageFile();
            if (!this.isCurrentPickerAttempt(attempt))
                return false;
            const type = file.contentType === 'application/pdf' ? 'pdf' : file.contentType === 'text/csv' ? 'anz-csv' : file.contentType.startsWith('image/') ? 'manual-photo' : null;
            if (!type)
                return this.handlePickerFailure(new Error('文件类型不受支持'), attempt);
            const revision = this.beginSelection();
            this.activateFileDescriptor(file, type, revision);
            onAccepted === null || onAccepted === void 0 ? void 0 : onAccepted();
            return this.select(Promise.resolve(file), type, revision, true);
        }
        catch (error) {
            return this.handlePickerFailure(error, attempt);
        }
    }
    chooseCsv(onAccepted) {
        return this.startPickerSelection('anz-csv', () => this.picker.chooseMessageFile(), onAccepted);
    }
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
        const row = this.state.duplicates.find((item) => item.sourceFingerprint === sourceFingerprint);
        if (!row)
            return false;
        if (row.resolution === 'keep-both')
            return false;
        if (action === 'later') {
            row.resolution = 'later';
            return true;
        }
        if (!this.content || !this.api.confirmDraft)
            return this.reject('补录接口暂不可用');
        const revision = this.selectionRevision;
        const key = `${revision}:${sourceFingerprint}`;
        if (this.duplicateInFlight.has(key))
            return false;
        const snapshot = {
            row: { ...row, candidates: [...row.candidates] },
            content: typeof this.content === 'string' ? this.content : new Uint8Array(this.content),
            revision,
        };
        this.state.loading = true;
        this.state.error = '';
        const pending = this.confirmDuplicate(snapshot);
        this.duplicateInFlight.set(key, pending);
        pending.then(() => {
            if (this.duplicateInFlight.get(key) === pending)
                this.duplicateInFlight.delete(key);
            if (this.isCurrent(revision) && !this.hasDuplicateFlightForRevision(revision))
                this.state.loading = false;
        }, () => {
            if (this.duplicateInFlight.get(key) === pending)
                this.duplicateInFlight.delete(key);
            if (this.isCurrent(revision) && !this.hasDuplicateFlightForRevision(revision))
                this.state.loading = false;
        });
        return pending;
    }
    async confirmDuplicate(snapshot) {
        var _a, _b;
        try {
            const baseHash = await this.hashFile(snapshot.content);
            const result = await this.api.stageImport({ fileHash: `${baseHash}:${snapshot.row.sourceFingerprint}:keep`, sourceType: 'anz-csv', draft: snapshot.row });
            const draftId = (_b = (_a = result.draft) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : result.draftId;
            if (!draftId)
                throw new Error('未能生成待确认草稿');
            await this.api.confirmDraft(draftId, { allowDuplicate: true });
            if (this.isCurrent(snapshot.revision)) {
                const currentRow = this.state.duplicates.find((item) => item.sourceFingerprint === snapshot.row.sourceFingerprint);
                if (currentRow)
                    currentRow.resolution = 'keep-both';
            }
            return true;
        }
        catch (error) {
            if (this.isCurrent(snapshot.revision))
                this.state.error = error instanceof Error ? error.message : '重复项处理失败';
            return false;
        }
    }
    async parseText(input) {
        const revision = this.beginSelection();
        const value = input.trim();
        if (!value)
            return this.reject('请输入一笔账目描述', revision);
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
            if (this.isCurrent(revision)) {
                this.state.originalPreserved = true;
                this.state.error = error instanceof Error ? error.message : 'AI 解析失败，请手工录入';
            }
            return false;
        }
        finally {
            if (this.isCurrent(revision))
                this.state.loading = false;
        }
    }
    async stage() {
        var _a;
        const snapshot = this.createStageSnapshot();
        if (!snapshot)
            return this.state.file ? false : this.reject('请先选择文件或输入账目描述');
        this.state.loading = true;
        this.state.error = '';
        const fileHash = await this.hashFile(snapshot.content);
        const key = this.stageKey(fileHash);
        const existing = this.stageInFlight.get(key);
        const pending = existing !== null && existing !== void 0 ? existing : this.runStage(snapshot, fileHash, key);
        if (!existing)
            this.stageInFlight.set(key, pending);
        try {
            const outcome = await pending;
            if (this.isCurrentSnapshot(snapshot)) {
                if (outcome.result)
                    this.state.stageResult = outcome.result;
                if (outcome.ok && outcome.result) {
                    this.state.uploaded = this.uploadCompleted.has(key);
                    this.state.error = '';
                }
                else {
                    this.state.originalPreserved = true;
                    this.state.error = (_a = outcome.error) !== null && _a !== void 0 ? _a : '文件处理失败，请重试';
                }
                this.state.loading = false;
            }
            return outcome.ok;
        }
        finally {
            if (this.stageInFlight.get(key) === pending)
                this.stageInFlight.delete(key);
        }
    }
    async runStage(snapshot, fileHash, key) {
        var _a;
        let result;
        try {
            const previous = this.staged.get(key);
            result = previous !== null && previous !== void 0 ? previous : (snapshot.sourceType === 'anz-csv'
                ? await this.api.stageAnzCsv({ fileHash, csv: asText(snapshot.content) })
                : await this.api.stageImport({ fileHash, sourceType: snapshot.sourceType, draft: (_a = snapshot.preview) !== null && _a !== void 0 ? _a : undefined }));
            this.staged.set(key, result);
            await this.completeOriginalUpload(snapshot, key, result);
            return { ok: true, result };
        }
        catch (error) {
            return { ok: false, result, error: error instanceof Error ? error.message : '文件处理失败，请重试' };
        }
    }
    async completeOriginalUpload(snapshot, key, result) {
        var _a, _b;
        const file = snapshot.file;
        const draftId = (_b = (_a = result.draft) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : result.draftId;
        if (snapshot.sourceType === 'anz-csv' || !file || !this.api.uploadAttachment || !draftId)
            return;
        if (this.uploadCompleted.has(key))
            return;
        await this.api.uploadAttachment({ filePath: file.path, draftId, originalName: file.name, contentType: file.contentType });
        this.uploadCompleted.add(key);
    }
    async select(filePromise, sourceType, revision, descriptorActivated = false) {
        var _a, _b, _c;
        try {
            const file = await filePromise;
            if (!this.isCurrent(revision))
                return false;
            if (!descriptorActivated)
                this.activateFileDescriptor(file, sourceType, revision);
            if (file.size > exports.MAX_IMPORT_BYTES)
                return this.reject('文件不能超过 20 MB');
            const content = (_b = (_a = file.bytes) !== null && _a !== void 0 ? _a : file.text) !== null && _b !== void 0 ? _b : await this.picker.readFile(file.path);
            if (!this.isCurrent(revision))
                return false;
            const selectedContent = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
            if (!signatureMatches(file, selectedContent))
                return this.reject('文件类型与内容签名不匹配', revision);
            if (!this.isCurrent(revision))
                return false;
            this.content = selectedContent;
            let rows = [];
            let preview = null;
            if (sourceType === 'anz-csv') {
                rows = await this.api.previewAnzCsv(asText(selectedContent));
                if (!this.isCurrent(revision))
                    return false;
            }
            else {
                preview = await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType: file.contentType });
                if (!this.isCurrent(revision))
                    return false;
            }
            const mode = this.state.mode;
            if (mode === 'statement') {
                if (!rows.length && preview) {
                    rows = [{
                            date: (_c = preview.occurredAt) !== null && _c !== void 0 ? _c : new Date().toISOString().slice(0, 10),
                            amountMinor: preview.amountMinor,
                            direction: preview.direction,
                            merchant: preview.merchant,
                            sourceFingerprint: `${file.name}:0`,
                        }];
                }
                const classified = await this.analyzeStatement(rows, revision);
                if (!classified || !this.isCurrent(revision))
                    return false;
                this.state.rows = rows;
                this.state.preview = preview;
                this.state.previewAmountDisplay = preview ? (0, money_1.formatNzdMinor)(preview.amountMinor) : '';
                this.state.matched = classified.matched;
                this.state.duplicates = classified.duplicates;
                this.state.missing = classified.missing;
                this.state.selectedMissingCount = classified.missing.length;
                this.state.view = 'results';
            }
            else {
                if (!this.isCurrent(revision))
                    return false;
                this.state.rows = rows;
                this.state.preview = preview;
                this.state.previewAmountDisplay = preview ? (0, money_1.formatNzdMinor)(preview.amountMinor) : '';
            }
            return true;
        }
        catch (error) {
            if (this.isCurrent(revision)) {
                this.state.error = error instanceof Error ? error.message : '文件处理失败，请重试';
                this.state.originalPreserved = true;
            }
            return false;
        }
        finally {
            if (this.isCurrent(revision))
                this.state.loading = false;
        }
    }
    reject(message, revision) {
        if (revision === undefined || this.isCurrent(revision)) {
            this.state.error = message;
            this.state.loading = false;
        }
        return false;
    }
    beginSelection() {
        this.selectionRevision += 1;
        this.state.loading = true;
        this.state.view = this.state.mode === 'statement' ? 'analyzing' : 'preview';
        this.state.error = '';
        return this.selectionRevision;
    }
    beginPickerAttempt() {
        this.pickerAttempt += 1;
        return this.pickerAttempt;
    }
    startPickerSelection(sourceType, pick, onAccepted) {
        const attempt = this.beginPickerAttempt();
        try {
            return this.acceptPickerResult(pick(), sourceType, attempt, onAccepted);
        }
        catch (error) {
            return Promise.resolve(this.handlePickerFailure(error, attempt));
        }
    }
    async acceptPickerResult(filePromise, sourceType, attempt, onAccepted) {
        try {
            const file = await filePromise;
            if (!this.isCurrentPickerAttempt(attempt))
                return false;
            const revision = this.beginSelection();
            this.activateFileDescriptor(file, sourceType, revision);
            onAccepted === null || onAccepted === void 0 ? void 0 : onAccepted();
            return this.select(Promise.resolve(file), sourceType, revision, true);
        }
        catch (error) {
            return this.handlePickerFailure(error, attempt);
        }
    }
    handlePickerFailure(error, attempt) {
        if (!this.isCurrentPickerAttempt(attempt) || isPickerCancellation(error))
            return false;
        this.state.error = error instanceof Error ? error.message : '文件选择失败';
        return false;
    }
    activateFileDescriptor(file, sourceType, revision) {
        if (!this.isCurrent(revision))
            return;
        this.content = null;
        this.state.file = file;
        this.state.sourceType = sourceType;
        this.state.preview = null;
        this.state.previewAmountDisplay = '';
        this.state.rows = [];
        this.state.stageResult = null;
        this.state.uploaded = false;
        this.state.originalPreserved = true;
        this.state.textInput = '';
        this.state.matched = [];
        this.state.duplicates = [];
        this.state.missing = [];
        this.state.selectedMissingCount = 0;
        this.state.confirmedMissingCount = 0;
    }
    isCurrent(revision) { return revision === this.selectionRevision; }
    isCurrentPickerAttempt(attempt) { return attempt === this.pickerAttempt; }
    hasDuplicateFlightForRevision(revision) {
        const prefix = `${revision}:`;
        return [...this.duplicateInFlight.keys()].some((key) => key.startsWith(prefix));
    }
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
    stageKey(fileHash) { return fileHash; }
    isCurrentSnapshot(snapshot) { return this.isCurrent(snapshot.revision); }
    async analyzeStatement(rows, revision) {
        const classified = await Promise.all(rows.map(async (row) => {
            const candidates = this.api.previewDuplicates ? await this.api.previewDuplicates({
                id: row.sourceFingerprint,
                amountMinor: row.amountMinor,
                direction: row.direction,
                occurredAt: /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? `${row.date}T00:00:00.000Z` : row.date,
                merchant: row.merchant,
                sourceFingerprint: row.sourceFingerprint,
            }) : [];
            if (!this.isCurrent(revision))
                return null;
            const item = { ...row, amountDisplay: `${row.direction === 'expense' ? '−' : '+'} ${(0, money_1.formatNzdMinor)(row.amountMinor)}`, selected: candidates.length === 0, candidates };
            return { row: item, kind: candidates.some((candidate) => candidate.score >= 95) ? 'matched' : candidates.length ? 'duplicate' : 'missing' };
        }));
        if (!this.isCurrent(revision) || classified.some((item) => !item))
            return null;
        const complete = classified;
        return {
            matched: complete.filter((item) => item.kind === 'matched').map((item) => item.row),
            duplicates: complete.filter((item) => item.kind === 'duplicate').map((item) => item.row),
            missing: complete.filter((item) => item.kind === 'missing').map((item) => item.row),
        };
    }
}
exports.ImportPageModel = ImportPageModel;
function createImportPage(model) {
    return {
        data: model.state,
        onLoad(options = {}) { model.setMode(options.mode); this.setData(model.state); },
        async choosePhoto() {
            const errorBefore = model.state.error;
            let accepted = false;
            const result = await model.choosePhoto(() => { accepted = true; this.setData(model.state); });
            if (accepted || model.state.error !== errorBefore)
                this.setData(model.state);
            return result;
        },
        async chooseAlbum() {
            const errorBefore = model.state.error;
            let accepted = false;
            const result = await model.chooseAlbum(() => { accepted = true; this.setData(model.state); });
            if (accepted || model.state.error !== errorBefore)
                this.setData(model.state);
            return result;
        },
        async chooseFile() {
            const errorBefore = model.state.error;
            let accepted = false;
            const result = await model.chooseFile(() => { accepted = true; this.setData(model.state); });
            if (accepted || model.state.error !== errorBefore)
                this.setData(model.state);
            return result;
        },
        async chooseCsv() {
            const errorBefore = model.state.error;
            let accepted = false;
            const result = await model.chooseCsv(() => { accepted = true; this.setData(model.state); });
            if (accepted || model.state.error !== errorBefore)
                this.setData(model.state);
            return result;
        },
        async parseText(event) { var _a, _b; await model.parseText((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        async stage() { await model.stage(); this.setData(model.state); },
        toggleMissing(event) { var _a, _b, _c; model.toggleMissing((_c = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : ''); this.setData(model.state); },
        confirmSelectedMissing() {
            const pending = model.confirmSelectedMissing();
            this.setData(model.state);
            return pending.then(() => { this.setData(model.state); });
        },
        resolveDuplicate(event) {
            var _a, _b, _c, _d, _e;
            const action = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.action;
            if (action !== 'later' && action !== 'keep-both')
                return;
            const pending = model.resolveDuplicate((_e = (_d = (_c = event.currentTarget) === null || _c === void 0 ? void 0 : _c.dataset) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : '', action);
            this.setData(model.state);
            return pending.then(() => { this.setData(model.state); });
        },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page((0, themed_page_1.withThemePage)(createImportPage(new ImportPageModel(createImportPicker(), runtime.api)), runtime.theme));
}
