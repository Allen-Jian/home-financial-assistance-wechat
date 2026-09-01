"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhotoEntryPageModel = void 0;
exports.isPickerCancel = isPickerCancel;
exports.chooseImage = chooseImage;
exports.createPhotoEntryPage = createPhotoEntryPage;
const client_1 = require("../../../src/api/client");
const app_1 = require("../../../app");
const money_1 = require("../../../src/domain/money");
const themed_page_1 = require("../../../src/shared/themed-page");
function contentTypeFor(file) {
    if (file.contentType)
        return file.contentType;
    return /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg';
}
function isPickerCancel(error) {
    const messages = [];
    if (typeof error === 'string')
        messages.push(error);
    if (error instanceof Error)
        messages.push(error.message);
    if (error && typeof error === 'object') {
        const details = error;
        messages.push(details.errMsg, details.message);
    }
    return messages.some((message) => typeof message === 'string' && (/cancel(?:led|ed)?/i.test(message) || /取消/.test(message)));
}
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
function signatureMatches(file, contentType) {
    const bytes = file.bytes;
    if (!bytes)
        return true;
    if (contentType === 'application/pdf')
        return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
    if (contentType === 'image/jpeg')
        return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (contentType === 'image/png')
        return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
    return false;
}
function hashFor(file) {
    if (file.fileHash)
        return file.fileHash;
    if (!file.bytes)
        return undefined;
    let hash = 2166136261;
    for (const byte of file.bytes)
        hash = Math.imul(hash ^ byte, 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
}
class PhotoEntryPageModel {
    constructor(api) {
        this.api = api;
        this.state = {
            source: 'photo', file: null, draft: null, amount: '', needsCategoryReview: false, draftId: '', originalPreserved: false,
            uploaded: false, loading: false, confirmed: false, error: '', categories: [], visibleCategories: [], categoryId: '', categoryName: '', stagedExisting: false,
        };
        this.editedFields = new Set();
    }
    setSource(source) { this.state.source = source === 'bill' ? 'bill' : 'photo'; }
    preserveFileError(file, error) {
        this.state.file = file;
        this.state.originalPreserved = true;
        this.state.loading = false;
        this.state.error = error instanceof Error ? error.message : '读取文件失败，请重新选择';
    }
    async analyze(file) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this.state.file = file;
        this.state.originalPreserved = true;
        this.state.draft = null;
        this.state.amount = '';
        this.state.needsCategoryReview = false;
        this.state.draftId = '';
        this.state.uploaded = false;
        this.state.confirmed = false;
        this.state.categoryId = '';
        this.state.categoryName = '';
        this.state.stagedExisting = false;
        this.state.error = '';
        this.editedFields.clear();
        this.state.loading = true;
        try {
            const contentType = contentTypeFor(file);
            if (Math.max((_a = file.size) !== null && _a !== void 0 ? _a : 0, (_c = (_b = file.bytes) === null || _b === void 0 ? void 0 : _b.byteLength) !== null && _c !== void 0 ? _c : 0) > MAX_IMPORT_BYTES)
                throw new Error('文件不能超过 20 MB');
            if (!['image/jpeg', 'image/png', 'application/pdf'].includes(contentType))
                throw new Error('文件类型不受支持');
            if (!signatureMatches(file, contentType))
                throw new Error('文件类型与内容签名不匹配');
            const fileHash = hashFor(file);
            if (this.api.stageImport && !fileHash)
                throw new Error('无法读取文件内容，请重新选择');
            const draft = this.api.analyzePhoto
                ? await this.api.analyzePhoto({ filePath: file.path, fileName: file.name, contentType })
                : this.api.previewDocument
                    ? await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType })
                    : this.api.parseDraft
                        ? await this.api.parseDraft(file.path)
                        : (() => { throw new Error('AI 分析暂不可用'); })();
            this.state.draft = draft;
            this.state.amount = (draft.amountMinor / 100).toFixed(2);
            this.state.needsCategoryReview = ((_f = (_e = (_d = draft.fieldConfidence) === null || _d === void 0 ? void 0 : _d.category) !== null && _e !== void 0 ? _e : draft.confidence) !== null && _f !== void 0 ? _f : 1) < 0.8;
            if (this.api.fetchCategories) {
                const categories = await this.api.fetchCategories();
                this.state.categories = categories.filter((category) => category.active !== false);
                this.refreshVisibleCategories();
                const matched = this.state.categories.find((category) => category.direction === draft.direction && category.name === draft.categoryHint);
                if (matched) {
                    this.state.categoryId = matched.id;
                    this.state.categoryName = matched.name;
                    this.state.draft = { ...draft, categoryId: matched.id };
                }
            }
            if (this.api.stageImport && this.api.confirmDraft) {
                const staged = await this.api.stageImport({ fileHash, sourceType: contentType === 'application/pdf' ? 'pdf' : 'manual-photo', draft: (_g = this.state.draft) !== null && _g !== void 0 ? _g : draft });
                this.state.draftId = (_k = (_h = staged.draftId) !== null && _h !== void 0 ? _h : (_j = staged.draft) === null || _j === void 0 ? void 0 : _j.id) !== null && _k !== void 0 ? _k : '';
                if (staged.reused && !this.state.draftId) {
                    this.state.stagedExisting = true;
                    this.state.error = '该小票已存在，请稍后处理';
                }
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
        var _a, _b;
        if (this.state.draft) {
            this.state.draft = { ...this.state.draft, ...patch };
            Object.keys(patch).forEach((field) => this.editedFields.add(field));
            if (patch.categoryId !== undefined)
                this.state.categoryId = patch.categoryId;
            if (patch.direction !== undefined) {
                this.refreshVisibleCategories();
                if (!this.state.visibleCategories.some((category) => category.id === this.state.categoryId)) {
                    this.state.categoryId = '';
                    this.state.categoryName = '';
                }
            }
            if (patch.categoryHint !== undefined) {
                const matched = this.state.categories.find((category) => { var _a; return category.direction === ((_a = this.state.draft) === null || _a === void 0 ? void 0 : _a.direction) && category.name === patch.categoryHint; });
                this.state.categoryId = (_a = matched === null || matched === void 0 ? void 0 : matched.id) !== null && _a !== void 0 ? _a : '';
                this.state.categoryName = (_b = matched === null || matched === void 0 ? void 0 : matched.name) !== null && _b !== void 0 ? _b : '';
            }
        }
    }
    refreshVisibleCategories() {
        var _a;
        const direction = (_a = this.state.draft) === null || _a === void 0 ? void 0 : _a.direction;
        this.state.visibleCategories = this.state.categories.filter((category) => category.direction === direction);
    }
    updateAmount(value) {
        this.state.amount = value;
        try {
            this.updateDraft({ amountMinor: (0, money_1.parseNzdMinor)(value) });
        }
        catch { /* keep incomplete user input until save */ }
    }
    setCategoryByIndex(index) {
        const category = this.state.categories[index];
        if (category) {
            this.state.categoryId = category.id;
            this.state.categoryName = category.name;
            this.updateDraft({ categoryId: category.id });
        }
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
        if (this.state.stagedExisting) {
            this.state.error = '该小票已存在，请稍后处理';
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
                const payload = this.confirmationPayload(draft);
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
        var _a, _b;
        const payload = { direction: draft.direction, amountMinor: draft.amountMinor };
        if (draft.occurredAt)
            payload.occurredAt = draft.occurredAt;
        const categoryId = this.state.categoryId;
        if (categoryId)
            payload.categoryId = categoryId;
        if (this.editedFields.has('merchant') || draft.merchant)
            payload.merchant = (_a = draft.merchant) !== null && _a !== void 0 ? _a : '';
        if (this.editedFields.has('note') || draft.note)
            payload.note = (_b = draft.note) !== null && _b !== void 0 ? _b : '';
        return payload;
    }
}
exports.PhotoEntryPageModel = PhotoEntryPageModel;
function readFileBytes(path) {
    return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
        filePath: path,
        success: (result) => resolve(new Uint8Array(result.data)),
        fail: reject,
    }));
}
class SelectedFileError extends Error {
    constructor(file, cause) {
        super(cause instanceof Error ? cause.message : '读取文件失败，请重新选择');
        this.file = file;
        this.name = 'SelectedFileError';
    }
}
function toImageFile(file) {
    var _a, _b, _c, _d, _e;
    const path = (_b = (_a = file.tempFilePath) !== null && _a !== void 0 ? _a : file.path) !== null && _b !== void 0 ? _b : '';
    const name = (_d = (_c = file.name) !== null && _c !== void 0 ? _c : path.split('/').pop()) !== null && _d !== void 0 ? _d : 'receipt.jpg';
    const rawType = (_e = file.fileType) !== null && _e !== void 0 ? _e : file.type;
    const contentType = rawType === 'png' || /\.png$/i.test(name)
        ? 'image/png'
        : 'image/jpeg';
    return { path, name, size: file.size, contentType };
}
function chooseImage(source) {
    return new Promise((resolve, reject) => {
        const success = async (result) => {
            var _a;
            const selected = toImageFile((_a = result.tempFiles[0]) !== null && _a !== void 0 ? _a : {});
            if (!selected.path) {
                reject(new Error('未选择图片'));
                return;
            }
            try {
                selected.bytes = await readFileBytes(selected.path);
                resolve(selected);
            }
            catch (error) {
                reject(new SelectedFileError(selected, error));
            }
        };
        const fail = (error) => reject(error);
        if (source === 'chat-image') {
            wx.chooseMessageFile({ count: 1, type: 'image', success, fail });
        }
        else {
            wx.chooseMedia({
                count: 1,
                mediaType: ['image'],
                sourceType: [source],
                success,
                fail,
            });
        }
    });
}
async function selectImage(model, context, source) {
    try {
        const selected = await chooseImage(source);
        const pending = model.analyze(selected);
        context.setData(model.state);
        await pending;
    }
    catch (error) {
        if (!isPickerCancel(error)) {
            if (error instanceof SelectedFileError)
                model.preserveFileError(error.file, error);
            else
                model.state.error = error instanceof Error ? error.message : '图片选择失败，请重试';
        }
    }
    context.setData(model.state);
}
function createPhotoEntryPage(model) {
    return {
        data: model.state,
        onLoad(options = {}) { model.setSource(options.source); this.setData(model.state); },
        chooseImage(source) { return selectImage(model, this, source); },
        choosePhoto() { return selectImage(model, this, 'camera'); },
        chooseAlbum() { return selectImage(model, this, 'album'); },
        chooseChatImage() { return selectImage(model, this, 'chat-image'); },
        chooseBillFile() {
            return new Promise((resolve) => wx.chooseMessageFile({
                count: 1, type: 'all',
                success: async (result) => {
                    var _a, _b, _c;
                    const file = result.tempFiles[0];
                    if (file) {
                        const name = (_a = file.name) !== null && _a !== void 0 ? _a : 'bill.pdf';
                        const contentType = /\.pdf$/i.test(name) || file.type === 'pdf' ? 'application/pdf' : /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
                        const path = (_c = (_b = file.tempFilePath) !== null && _b !== void 0 ? _b : file.path) !== null && _c !== void 0 ? _c : '';
                        const selected = { path, name, size: file.size, contentType };
                        try {
                            const pending = model.analyze({ ...selected, bytes: await readFileBytes(path) });
                            this.setData(model.state);
                            await pending;
                        }
                        catch (error) {
                            model.preserveFileError(selected, error);
                        }
                    }
                    this.setData(model.state);
                    resolve();
                },
                fail: () => { this.setData(model.state); resolve(); },
            }));
        },
        async retry() { await model.retry(); this.setData(model.state); },
        openManual() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
        close() { wx.navigateBack({ delta: 1 }); },
        onAmountInput(event) { var _a, _b; model.updateAmount((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        onDraftInput(event) {
            var _a, _b, _c;
            const field = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.field;
            const value = (_c = event.detail) === null || _c === void 0 ? void 0 : _c.value;
            if (field && value !== undefined)
                model.updateDraft({ [field]: field === 'amountMinor' ? Number(value) : value });
            this.setData(model.state);
        },
        onCategoryChange(event) { var _a, _b; model.setCategoryByIndex(Number((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : -1)); this.setData(model.state); },
        onCategoryTap(event) {
            var _a, _b, _c;
            const id = (_c = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : '';
            const category = model.state.visibleCategories.find((item) => item.id === id);
            if (category)
                model.updateDraft({ categoryId: category.id, categoryHint: category.name });
            this.setData(model.state);
        },
        onDirectionChange(event) {
            var _a, _b;
            const value = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.value;
            if (value === 'income' || value === 'expense')
                model.updateDraft({ direction: value });
            this.setData(model.state);
        },
        onDateChange(event) { var _a, _b; model.updateDraft({ occurredAt: (_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : '' }); this.setData(model.state); },
        async confirm() { await model.confirm(); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page((0, themed_page_1.withThemePage)(createPhotoEntryPage(new PhotoEntryPageModel(runtime.api)), runtime.theme));
}
