import { createPhotoEntryPage, createOnlineStatus, isPickerCancel, PhotoEntryPageModel } from '../pages/entry/photo/index';

test('quick photo entry requests camera-only media', () => {
  const chooseMedia = jest.fn(({ success }: { sourceType: string[]; success: (result: { tempFiles: never[] }) => void }) => success({ tempFiles: [] }));
  (globalThis as { wx?: unknown }).wx = { chooseMedia };
  const page = createPhotoEntryPage(new PhotoEntryPageModel({ parseDraft: jest.fn() }));

  page.choosePhoto.call({ setData: jest.fn() });

  expect(chooseMedia).toHaveBeenCalledWith(expect.objectContaining({ sourceType: ['camera'] }));
  expect(chooseMedia.mock.calls[0][0].sourceType).not.toContain('album');
});

test('album entry requests album-only media', async () => {
  const chooseMedia = jest.fn(({ success }: { sourceType: string[]; success: (result: { tempFiles: Array<{ tempFilePath: string; fileType: string }> }) => void }) => success({
    tempFiles: [{ tempFilePath: '/tmp/album.jpg', fileType: 'jpg' }],
  }));
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  (globalThis as { wx?: unknown }).wx = {
    chooseMedia,
    getFileSystemManager: () => ({ readFile: ({ success }: { success: (result: { data: ArrayBuffer }) => void }) => success({ data: new Uint8Array([0xff, 0xd8, 0xff]).buffer }) }),
  };
  const page = createPhotoEntryPage(new PhotoEntryPageModel({ parseDraft }));

  await page.chooseAlbum.call({ setData: jest.fn() });

  expect(chooseMedia).toHaveBeenCalledWith(expect.objectContaining({ sourceType: ['album'], mediaType: ['image'] }));
  expect(parseDraft).toHaveBeenCalledTimes(1);
});

test('chat image entry requests an image from WeChat messages', async () => {
  const chooseMessageFile = jest.fn(({ type, success }: { type: string; success: (result: { tempFiles: Array<{ path: string; name: string; type: string }> }) => void }) => success({
    tempFiles: [{ path: '/tmp/chat.png', name: 'chat.png', type: 'image' }],
  }));
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  (globalThis as { wx?: unknown }).wx = {
    chooseMessageFile,
    getFileSystemManager: () => ({ readFile: ({ success }: { success: (result: { data: ArrayBuffer }) => void }) => success({ data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer }) }),
  };
  const page = createPhotoEntryPage(new PhotoEntryPageModel({ parseDraft }));

  await page.chooseChatImage.call({ setData: jest.fn() });

  expect(chooseMessageFile).toHaveBeenCalledWith(expect.objectContaining({ count: 1, type: 'image' }));
  expect(parseDraft).toHaveBeenCalledTimes(1);
});

test('camera, album, and chat image successes share the photo analysis chain', async () => {
  const chooseMedia = jest.fn(({ sourceType, success }: { sourceType: string[]; success: (result: { tempFiles: Array<{ tempFilePath: string; fileType: string }> }) => void }) => success({
    tempFiles: [{ tempFilePath: sourceType[0] === 'camera' ? '/tmp/camera.jpg' : '/tmp/album.jpg', fileType: 'jpg' }],
  }));
  const chooseMessageFile = jest.fn(({ success }: { success: (result: { tempFiles: Array<{ path: string; name: string; type: string }> }) => void }) => success({
    tempFiles: [{ path: '/tmp/chat.jpg', name: 'chat.jpg', type: 'image' }],
  }));
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  (globalThis as { wx?: unknown }).wx = {
    chooseMedia,
    chooseMessageFile,
    getFileSystemManager: () => ({ readFile: ({ success }: { success: (result: { data: ArrayBuffer }) => void }) => success({ data: new Uint8Array([0xff, 0xd8, 0xff]).buffer }) }),
  };
  const page = createPhotoEntryPage(new PhotoEntryPageModel({ parseDraft }));
  const context = { setData: jest.fn() };

  await page.choosePhoto.call(context);
  await page.chooseAlbum.call(context);
  await page.chooseChatImage.call(context);

  expect(parseDraft).toHaveBeenCalledTimes(3);
  expect(parseDraft.mock.calls.map(([path]) => path)).toEqual(['/tmp/camera.jpg', '/tmp/album.jpg', '/tmp/chat.jpg']);
});

test.each([
  ['error object from chooseMedia', { errMsg: 'chooseMedia:fail cancel' }],
  ['Error from chooseMedia', new Error('chooseMedia:fail cancelled')],
  ['errMsg on an Error object', Object.assign(new Error('chooseMedia:fail failed'), { errMsg: 'chooseMedia:fail cancel' })],
  ['Chinese message from chooseMessageFile', { errMsg: 'chooseMessageFile:fail 用户取消选择' }],
  ['string error', 'chooseMedia:fail cancel'],
])('recognizes picker cancellation: %s', (_label, error) => {
  expect(isPickerCancel(error)).toBe(true);
});

test('picker cancellation preserves the existing draft and does not analyze', async () => {
  const parseDraft = jest.fn();
  const model = new PhotoEntryPageModel({ parseDraft });
  const existing = {
    file: { path: '/tmp/existing.jpg', name: 'existing.jpg', size: 3, contentType: 'image/jpeg' },
    draft: { amountMinor: 1250, direction: 'expense' as const, merchant: 'Existing' },
    amount: '12.50',
    error: '',
  };
  model.state.file = existing.file;
  model.state.draft = existing.draft;
  model.state.amount = existing.amount;
  const chooseMedia = jest.fn(({ fail }: { fail: (error: unknown) => void }) => fail({ errMsg: 'chooseMedia:fail cancel' }));
  const chooseMessageFile = jest.fn(({ fail }: { fail: (error: unknown) => void }) => fail(new Error('chooseMessageFile:fail cancelled')));
  (globalThis as { wx?: unknown }).wx = { chooseMedia, chooseMessageFile };
  const page = createPhotoEntryPage(model);
  const context = { setData: jest.fn() };

  await page.choosePhoto.call(context);
  await page.chooseAlbum.call(context);
  await page.chooseChatImage.call(context);

  expect(model.state).toEqual(expect.objectContaining(existing));
  expect(parseDraft).not.toHaveBeenCalled();
});

test('image read failure preserves the selected file so analysis can be retried', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  let shouldFailRead = true;
  (globalThis as { wx?: unknown }).wx = {
    chooseMedia: jest.fn(({ success }: { success: (result: { tempFiles: Array<{ tempFilePath: string; fileType: string }> }) => void }) => success({
      tempFiles: [{ tempFilePath: '/tmp/album.jpg', fileType: 'jpg' }],
    })),
    getFileSystemManager: () => ({ readFile: ({ success, fail }: { success: (result: { data: ArrayBuffer }) => void; fail: (error: Error) => void }) => {
      if (shouldFailRead) fail(new Error('read failed'));
      else success({ data: new Uint8Array([0xff, 0xd8, 0xff]).buffer });
    } }),
  };
  const model = new PhotoEntryPageModel({ parseDraft });
  const page = createPhotoEntryPage(model);
  await page.chooseAlbum.call({ setData: jest.fn() });

  expect(model.state.file).toEqual(expect.objectContaining({ path: '/tmp/album.jpg', name: 'album.jpg' }));
  expect(model.state.error).toContain('read failed');
  shouldFailRead = false;
  await expect(model.retry()).resolves.toBe(true);
  expect(parseDraft).toHaveBeenCalledTimes(1);
});

test('bill entry requests a WeChat file and maps the AI amount to editable NZD text', async () => {
  const chooseMessageFile = jest.fn(({ success }: { success: (result: { tempFiles: Array<{ path: string; name: string; size: number; type: string }> }) => void }) => success({
    tempFiles: [{ path: '/tmp/power.pdf', name: 'power.pdf', size: 2048, type: 'pdf' }],
  }));
  const pdfBytes = new TextEncoder().encode('%PDF-1.7');
  (globalThis as { wx?: unknown }).wx = { chooseMessageFile, getFileSystemManager: () => ({ readFile: ({ success }: { success: (result: { data: ArrayBuffer }) => void }) => success({ data: pdfBytes.buffer }) }) };
  const model = new PhotoEntryPageModel({ previewDocument: jest.fn().mockResolvedValue({ amountMinor: 16820, direction: 'expense', merchant: 'Mercury Energy' }) });
  const page = createPhotoEntryPage(model);
  const context = { setData: jest.fn() };

  page.onLoad.call(context, { source: 'bill' });
  await page.chooseBillFile.call(context);

  expect(chooseMessageFile).toHaveBeenCalledTimes(1);
  expect(model.state).toEqual(expect.objectContaining({ source: 'bill', amount: '168.20' }));
  expect(model.state.draft).toEqual(expect.objectContaining({ merchant: 'Mercury Energy' }));
});

test('bill entry preserves the selected file when local file reading fails', async () => {
  const chooseMessageFile = jest.fn(({ success }: { success: (result: { tempFiles: Array<{ path: string; name: string; size: number; type: string }> }) => void }) => success({
    tempFiles: [{ path: '/tmp/power.pdf', name: 'power.pdf', size: 2048, type: 'pdf' }],
  }));
  (globalThis as { wx?: unknown }).wx = {
    chooseMessageFile,
    getFileSystemManager: () => ({ readFile: ({ fail }: { fail: (error: Error) => void }) => fail(new Error('read failed')) }),
  };
  const model = new PhotoEntryPageModel({ previewDocument: jest.fn() });
  const page = createPhotoEntryPage(model);

  await page.chooseBillFile.call({ setData: jest.fn() });

  expect(model.state.originalPreserved).toBe(true);
  expect(model.state.file).toEqual(expect.objectContaining({ name: 'power.pdf' }));
  expect(model.state.error).toContain('read failed');
}, 1000);

test('analysis exposes a loading state until the AI result is mapped to the form', async () => {
  let resolveDraft!: (value: { amountMinor: number; direction: 'expense' }) => void;
  const draft = new Promise<{ amountMinor: number; direction: 'expense' }>((resolve) => { resolveDraft = resolve; });
  const model = new PhotoEntryPageModel({ previewDocument: jest.fn().mockReturnValue(draft) });

  const pending = model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' });
  expect(model.state.loading).toBe(true);
  expect(model.state.draft).toBeNull();
  resolveDraft({ amountMinor: 1890, direction: 'expense' });
  await expect(pending).resolves.toBe(true);
  expect(model.state).toEqual(expect.objectContaining({ loading: false, amount: '18.90' }));
});

test('AI failure keeps the original selected file', async () => {
  const model = new PhotoEntryPageModel({ parseDraft: jest.fn().mockRejectedValue(new Error('AI unavailable')) });

  await expect(model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' })).resolves.toBe(false);

  expect(model.state.originalPreserved).toBe(true);
  expect(model.state.file).toEqual({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' });
});

test('photo analysis does not confirm until the user presses confirm', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense', occurredAt: '2026-08-30' });
  const createTransaction = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new PhotoEntryPageModel({ parseDraft, createTransaction });

  await expect(model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' })).resolves.toBe(true);
  expect(createTransaction).not.toHaveBeenCalled();

  await expect(model.confirm()).resolves.toBe(true);
  expect(createTransaction).toHaveBeenCalledWith(expect.not.objectContaining({ accountId: expect.anything() }));
});

test('photo draft can be edited before confirmation', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const createTransaction = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new PhotoEntryPageModel({ parseDraft, createTransaction });

  await model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg', fileHash: 'receipt-hash' });
  model.updateDraft({ amountMinor: 2000, note: '补充备注' });
  await model.confirm();

  expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 2000, note: '补充备注' }));
});

test('confirms staged photos with edited fields and no accountId', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const stageImport = jest.fn().mockResolvedValue({ draftId: 'draft-1', reused: false });
  const confirmDraft = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new PhotoEntryPageModel({ parseDraft, stageImport, confirmDraft });

  await model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg', fileHash: 'receipt-hash' });
  model.updateDraft({ amountMinor: 2000, note: '改过的备注' });
  await expect(model.confirm()).resolves.toBe(true);

  expect(stageImport).toHaveBeenCalledWith(expect.objectContaining({
    draft: expect.objectContaining({ amountMinor: 1890 }),
  }));
  expect(confirmDraft).toHaveBeenCalledWith('draft-1', expect.objectContaining({
    amountMinor: 2000, note: '改过的备注',
  }));
  expect(confirmDraft).toHaveBeenCalledWith('draft-1', expect.not.objectContaining({ accountId: expect.anything() }));
});

test('offers retry after AI failure without losing the selected file', async () => {
  const parseDraft = jest.fn()
    .mockRejectedValueOnce(new Error('AI unavailable'))
    .mockResolvedValueOnce({ amountMinor: 1890, direction: 'expense' });
  const model = new PhotoEntryPageModel({ parseDraft });
  const file = { path: '/tmp/receipt.jpg', name: 'receipt.jpg' };

  await expect(model.analyze(file)).resolves.toBe(false);
  await expect(model.retry()).resolves.toBe(true);

  expect(model.state.file).toEqual(file);
  expect(model.state.originalPreserved).toBe(true);
});

test('does not use a reused batch id as a draft id', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const stageImport = jest.fn().mockResolvedValue({ batch: { id: 'batch-1' }, reused: true });
  const confirmDraft = jest.fn();
  const createTransaction = jest.fn();
  const uploadAttachment = jest.fn();
  const model = new PhotoEntryPageModel({ parseDraft, stageImport, confirmDraft, createTransaction, uploadAttachment });

  await expect(model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg', fileHash: 'receipt-hash' })).resolves.toBe(true);
  await expect(model.confirm()).resolves.toBe(false);

  expect(model.state.draftId).toBe('');
  expect(model.state.error).toContain('已存在');
  expect(confirmDraft).not.toHaveBeenCalled();
  expect(createTransaction).not.toHaveBeenCalled();
  expect(uploadAttachment).not.toHaveBeenCalled();
});

test('maps an AI category name to an active category id before confirmation', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense', categoryHint: '餐饮' });
  const stageImport = jest.fn().mockResolvedValue({ draftId: 'draft-1', reused: false });
  const confirmDraft = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new PhotoEntryPageModel({
    parseDraft,
    stageImport,
    confirmDraft,
    fetchCategories: jest.fn().mockResolvedValue([
      { id: 'c-1', name: '餐饮', direction: 'expense', active: true },
      { id: 'c-2', name: '餐饮', direction: 'expense', active: false },
    ]),
  });

  await model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg', fileHash: 'receipt-hash' });
  expect(model.state.visibleCategories.map((category) => category.id)).toEqual(['c-1']);
  await expect(model.confirm()).resolves.toBe(true);

  expect(stageImport).toHaveBeenCalledWith(expect.objectContaining({
    draft: expect.objectContaining({ categoryId: 'c-1' }),
  }));
  expect(confirmDraft).toHaveBeenCalledWith('draft-1', expect.objectContaining({ categoryId: 'c-1' }));
});

test('sends empty merchant and note when the user clears them', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense', merchant: 'Market', note: '午餐' });
  const stageImport = jest.fn().mockResolvedValue({ draftId: 'draft-1', reused: false });
  const confirmDraft = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new PhotoEntryPageModel({ parseDraft, stageImport, confirmDraft });

  await model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg', fileHash: 'receipt-hash' });
  model.updateDraft({ merchant: '', note: '' });
  await expect(model.confirm()).resolves.toBe(true);

  expect(confirmDraft).toHaveBeenCalledWith('draft-1', expect.objectContaining({ merchant: '', note: '' }));
});

test('staged receipt hashing uses file bytes instead of the temporary path', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const stageImport = jest.fn().mockResolvedValue({ draftId: 'draft-1', reused: false });
  const model = new PhotoEntryPageModel({ parseDraft, stageImport, confirmDraft: jest.fn() });
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

  await model.analyze({ path: '/tmp/first.jpg', name: 'receipt.jpg', contentType: 'image/jpeg', bytes });
  await model.analyze({ path: '/tmp/second.jpg', name: 'receipt.jpg', contentType: 'image/jpeg', bytes });

  expect(stageImport.mock.calls[0][0].fileHash).toBe(stageImport.mock.calls[1][0].fileHash);
});

test('direct bill flow rejects oversized and spoofed files before AI analysis', async () => {
  const previewDocument = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const model = new PhotoEntryPageModel({ previewDocument });
  const oversizedBytes = new Uint8Array(20 * 1024 * 1024 + 1);
  oversizedBytes.set(new TextEncoder().encode('%PDF-'));

  await expect(model.analyze({ path: '/tmp/large.pdf', name: 'large.pdf', size: 0, contentType: 'application/pdf', bytes: oversizedBytes })).resolves.toBe(false);
  expect(model.state.error).toContain('20 MB');
  await expect(model.analyze({ path: '/tmp/spoof.pdf', name: 'spoof.pdf', size: 10, contentType: 'application/pdf', bytes: new Uint8Array([0xff, 0xd8, 0xff]) })).resolves.toBe(false);
  expect(model.state.error).toContain('文件类型');
  expect(previewDocument).not.toHaveBeenCalled();
});

test('offline image selection preserves the file and draft without API calls, then retries online', async () => {
  const imageBytes = new Uint8Array([0xff, 0xd8, 0xff]);
  const chooseMedia = jest.fn(({ success }: { success: (result: { tempFiles: Array<{ tempFilePath: string; fileType: string }> }) => void }) => success({
    tempFiles: [{ tempFilePath: '/tmp/offline.jpg', fileType: 'image' }],
  }));
  let online = false;
  const analyzePhoto = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const stageImport = jest.fn().mockResolvedValue({ draftId: 'draft-offline', reused: false });
  const uploadAttachment = jest.fn().mockResolvedValue({ id: 'attachment-offline' });
  const confirmDraft = jest.fn();
  (globalThis as { wx?: unknown }).wx = {
    chooseMedia,
    getFileSystemManager: () => ({ readFile: ({ success }: { success: (result: { data: ArrayBuffer }) => void }) => success({ data: imageBytes.buffer }) }),
  };
  const model = new PhotoEntryPageModel({ analyzePhoto, stageImport, uploadAttachment, confirmDraft }, () => online);
  model.state.draft = { amountMinor: 1250, direction: 'expense', merchant: 'Existing' };
  const page = createPhotoEntryPage(model);
  const context = { setData: jest.fn() };

  await page.chooseAlbum.call(context);

  expect(model.state.file).toEqual(expect.objectContaining({ path: '/tmp/offline.jpg' }));
  expect(model.state.draft).toEqual(expect.objectContaining({ merchant: 'Existing' }));
  expect(model.state.error).toContain('需要联网');
  expect(analyzePhoto).not.toHaveBeenCalled();
  expect(stageImport).not.toHaveBeenCalled();
  expect(uploadAttachment).not.toHaveBeenCalled();

  online = true;
  await page.retry.call(context);

  expect(analyzePhoto).toHaveBeenCalledTimes(1);
  expect(stageImport).toHaveBeenCalledTimes(1);
  expect(uploadAttachment).toHaveBeenCalledTimes(1);
});

test('retries a failed original upload before confirming a reused staged draft', async () => {
  const analyzePhoto = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const stageImport = jest.fn().mockResolvedValue({ draftId: 'draft-upload', reused: true });
  const uploadAttachment = jest.fn()
    .mockRejectedValueOnce(new Error('upload failed'))
    .mockResolvedValueOnce({ id: 'attachment-upload' });
  const confirmDraft = jest.fn().mockResolvedValue({ id: 'tx-upload' });
  const model = new PhotoEntryPageModel({ analyzePhoto, stageImport, uploadAttachment, confirmDraft });
  const file = { path: '/tmp/upload.jpg', name: 'upload.jpg', contentType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff]) };

  await expect(model.analyze(file)).resolves.toBe(false);
  expect(stageImport).toHaveBeenCalledTimes(1);
  expect(uploadAttachment).toHaveBeenCalledTimes(1);
  await expect(model.retry()).resolves.toBe(true);
  await expect(model.confirm()).resolves.toBe(true);

  expect(stageImport).toHaveBeenCalledTimes(1);
  expect(uploadAttachment).toHaveBeenCalledTimes(2);
  expect(confirmDraft).toHaveBeenCalledTimes(1);
  expect(uploadAttachment.mock.invocationCallOrder[1]).toBeLessThan(confirmDraft.mock.invocationCallOrder[0]);
});

test('retry rereads a selected descriptor without bytes before analysis', async () => {
  const imageBytes = new Uint8Array([0xff, 0xd8, 0xff]);
  const readFile = jest.fn().mockResolvedValue(imageBytes);
  const analyzePhoto = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const stageImport = jest.fn().mockResolvedValue({ draftId: 'draft-reread', reused: false });
  const model = new PhotoEntryPageModel({ analyzePhoto, stageImport, confirmDraft: jest.fn(), uploadAttachment: jest.fn().mockResolvedValue({}) }, () => true, readFile);
  model.state.file = { path: '/tmp/reread.jpg', name: 'reread.jpg', contentType: 'image/jpeg' };
  model.state.originalPreserved = true;
  model.state.error = 'read failed';

  await expect(model.retry()).resolves.toBe(true);

  expect(readFile).toHaveBeenCalledWith('/tmp/reread.jpg');
  expect(analyzePhoto).toHaveBeenCalledTimes(1);
  expect(stageImport).toHaveBeenCalledTimes(1);
});

test('retry reopens the same picker after a real picker failure before a file exists', async () => {
  let attempts = 0;
  const chooseMedia = jest.fn(({ sourceType, success, fail }: { sourceType: string[]; success: (result: { tempFiles: Array<{ tempFilePath: string; fileType: string }> }) => void; fail: (error: unknown) => void }) => {
    attempts += 1;
    if (attempts === 1) fail(new Error('camera unavailable'));
    else success({ tempFiles: [{ tempFilePath: '/tmp/retry.jpg', fileType: 'image' }] });
  });
  const analyzePhoto = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  (globalThis as { wx?: unknown }).wx = {
    chooseMedia,
    getFileSystemManager: () => ({ readFile: ({ success }: { success: (result: { data: ArrayBuffer }) => void }) => success({ data: new Uint8Array([0xff, 0xd8, 0xff]).buffer }) }),
  };
  const model = new PhotoEntryPageModel({ analyzePhoto });
  const page = createPhotoEntryPage(model);
  const context = { setData: jest.fn() };

  await page.choosePhoto.call(context);
  expect(model.state.file).toBeNull();
  await page.retry.call(context);

  expect(chooseMedia).toHaveBeenCalledTimes(2);
  expect((chooseMedia.mock.calls[1][0] as { sourceType: string[] }).sourceType).toEqual(['camera']);
  expect(analyzePhoto).toHaveBeenCalledTimes(1);
});

test.each([
  ['PNG', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
  ['JPEG', new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg'],
])('normalizes %s MIME from bytes when picker metadata and path are opaque', async (_label, bytes, contentType) => {
  const chooseMedia = jest.fn(({ success }: { success: (result: { tempFiles: Array<{ tempFilePath: string; fileType: string }> }) => void }) => success({
    tempFiles: [{ tempFilePath: 'wxfile://opaque', fileType: 'image' }],
  }));
  const analyzePhoto = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  (globalThis as { wx?: unknown }).wx = {
    chooseMedia,
    getFileSystemManager: () => ({ readFile: ({ success }: { success: (result: { data: ArrayBuffer }) => void }) => success({ data: bytes.buffer }) }),
  };
  const model = new PhotoEntryPageModel({ analyzePhoto });
  const page = createPhotoEntryPage(model);

  await page.chooseAlbum.call({ setData: jest.fn() });

  expect(analyzePhoto).toHaveBeenCalledWith(expect.objectContaining({ contentType }));
  expect(model.state.file?.contentType).toBe(contentType);
});

test('rejects an opaque image whose bytes have no supported signature', async () => {
  const analyzePhoto = jest.fn();
  const chooseMedia = jest.fn(({ success }: { success: (result: { tempFiles: Array<{ tempFilePath: string; fileType: string }> }) => void }) => success({
    tempFiles: [{ tempFilePath: 'wxfile://opaque', fileType: 'image' }],
  }));
  (globalThis as { wx?: unknown }).wx = {
    chooseMedia,
    getFileSystemManager: () => ({ readFile: ({ success }: { success: (result: { data: ArrayBuffer }) => void }) => success({ data: new Uint8Array([1, 2, 3]).buffer }) }),
  };
  const model = new PhotoEntryPageModel({ analyzePhoto });
  const page = createPhotoEntryPage(model);

  await page.chooseAlbum.call({ setData: jest.fn() });

  expect(model.state.error).toContain('文件类型');
  expect(model.state.file).toEqual(expect.objectContaining({ path: 'wxfile://opaque' }));
  expect(analyzePhoto).not.toHaveBeenCalled();
});

test('runtime network status stays blocked until async Wi-Fi confirmation, then retry analyzes once', async () => {
  let networkOptions!: { success: (result: { networkType?: string }) => void; fail?: () => void };
  const getNetworkType = jest.fn((options: typeof networkOptions) => { networkOptions = options; });
  const chooseMedia = jest.fn(({ success }: { success: (result: { tempFiles: Array<{ tempFilePath: string; fileType: string }> }) => void }) => success({
    tempFiles: [{ tempFilePath: '/tmp/pending-network.jpg', fileType: 'image' }],
  }));
  const analyzePhoto = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const stageImport = jest.fn().mockResolvedValue({ draftId: 'draft-network', reused: false });
  const uploadAttachment = jest.fn().mockResolvedValue({ id: 'attachment-network' });
  (globalThis as { wx?: unknown }).wx = {
    getNetworkType,
    chooseMedia,
    getFileSystemManager: () => ({ readFile: ({ success }: { success: (result: { data: ArrayBuffer }) => void }) => success({ data: new Uint8Array([0xff, 0xd8, 0xff]).buffer }) }),
  };
  const isOnline = createOnlineStatus();
  const model = new PhotoEntryPageModel({ analyzePhoto, stageImport, uploadAttachment, confirmDraft: jest.fn() }, isOnline);
  const page = createPhotoEntryPage(model);
  const context = { setData: jest.fn() };

  expect(isOnline()).toBe(false);
  await page.chooseAlbum.call(context);
  expect(analyzePhoto).not.toHaveBeenCalled();
  expect(stageImport).not.toHaveBeenCalled();
  expect(uploadAttachment).not.toHaveBeenCalled();
  expect(model.state.file).toEqual(expect.objectContaining({ path: '/tmp/pending-network.jpg' }));

  networkOptions.success({ networkType: 'wifi' });
  await page.retry.call(context);
  expect(analyzePhoto).toHaveBeenCalledTimes(1);
  expect(stageImport).toHaveBeenCalledTimes(1);
  expect(uploadAttachment).toHaveBeenCalledTimes(1);
});

test('network query failure remains safely blocked', () => {
  let networkOptions!: { success: (result: { networkType?: string }) => void; fail?: () => void };
  (globalThis as { wx?: unknown }).wx = {
    getNetworkType: (options: typeof networkOptions) => { networkOptions = options; },
  };
  const isOnline = createOnlineStatus();

  expect(isOnline()).toBe(false);
  networkOptions.fail?.();
  expect(isOnline()).toBe(false);
});

test('retry rereads and re-detects MIME for an opaque PNG after the first read fails', async () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chooseMedia = jest.fn(({ success }: { success: (result: { tempFiles: Array<{ tempFilePath: string; fileType: string }> }) => void }) => success({
    tempFiles: [{ tempFilePath: 'wxfile://opaque-png', fileType: 'image' }],
  }));
  const analyzePhoto = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const readFile = jest.fn().mockResolvedValue(pngBytes);
  (globalThis as { wx?: unknown }).wx = {
    chooseMedia,
    getFileSystemManager: () => ({ readFile: ({ fail }: { fail: (error: Error) => void }) => fail(new Error('first read failed')) }),
  };
  const model = new PhotoEntryPageModel({ analyzePhoto }, () => true, readFile);
  const page = createPhotoEntryPage(model);
  const context = { setData: jest.fn() };

  await page.chooseAlbum.call(context);
  expect(model.state.error).toContain('first read failed');
  await page.retry.call(context);

  expect(readFile).toHaveBeenCalledWith('wxfile://opaque-png');
  expect(model.state.file?.contentType).toBe('image/png');
  expect(analyzePhoto).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'image/png' }));
});
