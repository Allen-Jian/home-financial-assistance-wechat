"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhotoEntryPageModel = void 0;
exports.createPhotoEntryPage = createPhotoEntryPage;
const client_1 = require("../../../src/api/client");
const app_1 = require("../../../app");
function contentTypeFor(file) {
    if (file.contentType)
        return file.contentType;
    return /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg';
}
function hashFor(file) {
    if (file.fileHash)
        return file.fileHash;
    let hash = 2166136261;
    for (const byte of file.path + '\u0000' + file.name)
        hash = Math.imul(hash ^ byte.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
}
class PhotoEntryPageModel {
    constructor(api) {
        this.api = api;
        this.state = {
            file: null, draft: null, draftId: '', originalPreserved: false,
            uploaded: false, loading: false, confirmed: false, error: '',
        };
    }
    async analyze(file) {
        var _a, _b, _c, _d, _e, _f;
        this.state.file = file;
        this.state.originalPreserved = true;
        this.state.draft = null;
        this.state.draftId = '';
        this.state.uploaded = false;
        this.state.confirmed = false;
        this.state.error = '';
        this.state.loading = true;
        try {
            const contentType = contentTypeFor(file);
            const draft = this.api.analyzePhoto
                ? await this.api.analyzePhoto({ filePath: file.path, fileName: file.name, contentType })
                : this.api.previewDocument
                    ? await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType })
                    : this.api.parseDraft
                        ? await this.api.parseDraft(file.path)
                        : (() => { throw new Error('AI 分析暂不可用'); })();
            this.state.draft = draft;
            if (this.api.stageImport && this.api.confirmDraft) {
                const staged = await this.api.stageImport({ fileHash: hashFor(file), sourceType: 'manual-photo', draft });
                this.state.draftId = (_f = (_d = (_c = (_a = staged.draftId) !== null && _a !== void 0 ? _a : (_b = staged.draft) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : staged.batchId) !== null && _d !== void 0 ? _d : (_e = staged.batch) === null || _e === void 0 ? void 0 : _e.id) !== null && _f !== void 0 ? _f : '';
                if (!staged.reused && this.api.uploadAttachment && this.state.draftId) {
                    await this.api.uploadAttachment({ filePath: file.path, draftId: this.state.draftId, originalName: file.name, contentType });
                    this.state.uploaded = true;
                }
            }
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : 'AI 分析失败，请改为手工录入';
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
    updateDraft(patch) {
        if (this.state.draft)
            this.state.draft = { ...this.state.draft, ...patch };
    }
    async retry() {
        if (!this.state.file)
            return false;
        return this.analyze(this.state.file);
    }
    async confirm() {
        const draft = this.state.draft;
        if (!draft) {
            this.state.error = '请先分析小票';
            return false;
        }
        if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor <= 0) {
            this.state.error = '草稿金额无效';
            return false;
        }
        this.state.loading = true;
        this.state.error = '';
        try {
            if (this.state.draftId && this.api.confirmDraft) {
                await this.api.confirmDraft(this.state.draftId, this.confirmationPayload(draft));
            }
            else if (this.api.createTransaction) {
                const payload = { direction: draft.direction, amountMinor: draft.amountMinor };
                if (draft.occurredAt)
                    payload.occurredAt = draft.occurredAt;
                if (draft.categoryHint)
                    payload.categoryId = draft.categoryHint;
                if (draft.merchant)
                    payload.merchant = draft.merchant;
                if (draft.note)
                    payload.note = draft.note;
                await this.api.createTransaction(payload);
            }
            else {
                throw new Error('确认接口暂不可用');
            }
            this.state.confirmed = true;
            return true;
        }
        catch (error) {
            if (error instanceof client_1.ApiError && error.statusCode === 409)
                this.state.error = '发现可能重复，请稍后处理';
            else
                this.state.error = error instanceof Error ? error.message : '确认入账失败，请稍后重试';
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
    confirmationPayload(draft) {
        const payload = { direction: draft.direction, amountMinor: draft.amountMinor };
        if (draft.occurredAt)
            payload.occurredAt = draft.occurredAt;
        if (draft.categoryHint)
            payload.categoryId = draft.categoryHint;
        if (draft.merchant)
            payload.merchant = draft.merchant;
        if (draft.note)
            payload.note = draft.note;
        return payload;
    }
}
exports.PhotoEntryPageModel = PhotoEntryPageModel;
function createPhotoEntryPage(model) {
    return {
        data: model.state,
        choosePhoto() {
            wx.chooseMedia({
                count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
                success: async (result) => {
                    var _a, _b, _c;
                    const file = result.tempFiles[0];
                    if (file)
                        await model.analyze({ path: (_b = (_a = file.tempFilePath) !== null && _a !== void 0 ? _a : file.path) !== null && _b !== void 0 ? _b : '', name: (_c = file.name) !== null && _c !== void 0 ? _c : 'receipt.jpg', size: file.size, contentType: file.fileType === 'png' ? 'image/png' : 'image/jpeg' });
                    this.setData(model.state);
                },
                fail: () => this.setData(model.state),
            });
        },
        async retry() { await model.retry(); this.setData(model.state); },
        openManual() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
        onDraftInput(event) {
            var _a, _b, _c;
            const field = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.field;
            const value = (_c = event.detail) === null || _c === void 0 ? void 0 : _c.value;
            if (field && value !== undefined)
                model.updateDraft({ [field]: field === 'amountMinor' ? Number(value) : value });
            this.setData(model.state);
        },
        async confirm() { await model.confirm(); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createPhotoEntryPage(new PhotoEntryPageModel(runtime.api)));
}
