import { createImportPage, ImportPageModel, MAX_IMPORT_BYTES, type PickedImportFile } from '../pages/imports/index';

const image: PickedImportFile = { path: '/tmp/receipt.jpg', name: 'receipt.jpg', size: 1024, contentType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) };
const pdf: PickedImportFile = { path: '/tmp/power.pdf', name: 'power.pdf', size: 2048, contentType: 'application/pdf', bytes: new TextEncoder().encode('%PDF-1.7') };
const csv: PickedImportFile = { path: '/tmp/anz.csv', name: 'anz.csv', size: 512, contentType: 'text/csv', text: 'Date,Amount,Description\n15/08/2026,-12.50,Market' };

function makeModel(files: PickedImportFile[] = [image], hashFile: (content: Uint8Array | string) => string = () => 'hash-1') {
  const picker = {
    chooseMedia: jest.fn().mockResolvedValue(files[0]),
    chooseAlbum: jest.fn().mockResolvedValue(files[0]),
    chooseMessageFile: jest.fn().mockResolvedValue(files[0]),
    readFile: jest.fn().mockImplementation(async (file: PickedImportFile) => file.bytes ?? file.text ?? ''),
  };
  const api = {
    parseDraft: jest.fn().mockResolvedValue({ amountMinor: 1250, direction: 'expense', merchant: 'Market', confidence: 0.94 }),
    previewDocument: jest.fn().mockResolvedValue({ amountMinor: 1250, direction: 'expense', merchant: 'Market', confidence: 0.94 }),
    previewAnzCsv: jest.fn().mockResolvedValue([{ date: '2026-08-15', amountMinor: 1250, direction: 'expense', merchant: 'Market', sourceFingerprint: 'row-1' }]),
    stageImport: jest.fn().mockResolvedValue({ batchId: 'batch-1', draftCount: 1, reused: false, draftId: 'draft-1' }),
    stageAnzCsv: jest.fn().mockResolvedValue({ batchId: 'batch-1', draftCount: 1, reused: false, draftId: 'draft-1' }),
    uploadAttachment: jest.fn().mockResolvedValue({ id: 'attachment-1' }),
    previewDuplicates: jest.fn().mockResolvedValue([]),
    confirmDraft: jest.fn().mockResolvedValue({ id: 'tx-1' }),
  };
  return { model: new ImportPageModel(picker, api, hashFile), picker, api };
}

test('statement mode shows analysis then groups matched, duplicate, and missing rows', async () => {
  const { model, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewAnzCsv.mockResolvedValueOnce([
    { date: '2026-08-15', amountMinor: 1250, direction: 'expense', merchant: 'Matched', sourceFingerprint: 'row-1' },
    { date: '2026-08-16', amountMinor: 2500, direction: 'expense', merchant: 'Duplicate', sourceFingerprint: 'row-2' },
    { date: '2026-08-17', amountMinor: 3500, direction: 'expense', merchant: 'Missing', sourceFingerprint: 'row-3' },
  ]);
  api.previewDuplicates
    .mockResolvedValueOnce([{ incomingId: 'row-1', existingId: 'tx-1', score: 100, reasons: ['same-source'] }])
    .mockResolvedValueOnce([{ incomingId: 'row-2', existingId: 'tx-2', score: 85, reasons: ['date-near'] }])
    .mockResolvedValueOnce([]);

  const pending = model.chooseCsv();
  await Promise.resolve();
  expect(model.state.view).toBe('analyzing');
  await expect(pending).resolves.toBe(true);

  expect(model.state.view).toBe('results');
  expect(model.state.matched.map((row) => row.sourceFingerprint)).toEqual(['row-1']);
  expect(model.state.duplicates.map((row) => row.sourceFingerprint)).toEqual(['row-2']);
  expect(model.state.missing).toEqual([expect.objectContaining({ sourceFingerprint: 'row-3', selected: true })]);
  expect(model.state.selectedMissingCount).toBe(1);
});

test('statement confirmation creates and confirms only selected missing drafts', async () => {
  const { model, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewAnzCsv.mockResolvedValueOnce([
    { date: '2026-08-17', amountMinor: 3500, direction: 'expense', merchant: 'First', sourceFingerprint: 'row-1' },
    { date: '2026-08-18', amountMinor: 4500, direction: 'expense', merchant: 'Second', sourceFingerprint: 'row-2' },
  ]);
  api.previewDuplicates.mockResolvedValue([]);
  api.stageImport
    .mockResolvedValueOnce({ draft: { id: 'draft-1' }, reused: false })
    .mockResolvedValueOnce({ draft: { id: 'draft-2' }, reused: false });
  await model.chooseCsv();
  model.toggleMissing('row-2');

  await expect(model.confirmSelectedMissing()).resolves.toBe(true);

  expect(api.stageImport).toHaveBeenCalledTimes(1);
  expect(api.stageImport).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ merchant: 'First' }) }));
  expect(api.confirmDraft).toHaveBeenCalledWith('draft-1', {});
});

test('supports image, PDF, and CSV selection in one workbench', async () => {
  const { model, picker } = makeModel([image]);
  await expect(model.choosePhoto()).resolves.toBe(true);
  expect(model.state.sourceType).toBe('manual-photo');
  picker.chooseMessageFile.mockResolvedValueOnce(pdf);
  await expect(model.chooseFile()).resolves.toBe(true);
  expect(model.state.sourceType).toBe('pdf');
  picker.chooseMessageFile.mockResolvedValueOnce(csv);
  await expect(model.chooseCsv()).resolves.toBe(true);
  expect(model.state.sourceType).toBe('anz-csv');
});

test('album selection is distinct from camera and WeChat file selection', async () => {
  const { model, picker } = makeModel([image]);
  await expect(model.chooseAlbum()).resolves.toBe(true);
  expect(picker.chooseAlbum).toHaveBeenCalledTimes(1);
  expect(model.state.sourceType).toBe('manual-photo');
});

test('rejects files over 20 MB or with a mismatched signature', async () => {
  const { model, picker, api } = makeModel([image]);
  picker.chooseMessageFile.mockResolvedValueOnce({ ...image, size: MAX_IMPORT_BYTES + 1 });
  await expect(model.chooseFile()).resolves.toBe(false);
  expect(model.state.error).toContain('20 MB');
  picker.chooseMessageFile.mockResolvedValueOnce({ ...image, contentType: 'application/pdf' });
  await expect(model.chooseFile()).resolves.toBe(false);
  expect(model.state.error).toContain('文件类型');
  expect(api.previewDocument).not.toHaveBeenCalled();
});

test('preserves the original file when AI preview fails', async () => {
  const { model, api } = makeModel([image]);
  api.previewDocument.mockRejectedValueOnce(new Error('AI unavailable'));
  await expect(model.choosePhoto()).resolves.toBe(false);
  expect(model.state.file).toEqual(image);
  expect(model.state.originalPreserved).toBe(true);
  expect(model.state.error).toContain('AI unavailable');
});

test('uses the file hash for idempotent staging and uploads only after staging', async () => {
  const { model, api } = makeModel([image]);
  await model.choosePhoto();
  await expect(model.stage()).resolves.toBe(true);
  await expect(model.stage()).resolves.toBe(true);
  expect(api.stageImport).toHaveBeenCalledTimes(1);
  expect(api.uploadAttachment).toHaveBeenCalledTimes(1);
  expect(api.uploadAttachment.mock.invocationCallOrder[0]).toBeGreaterThan(api.stageImport.mock.invocationCallOrder[0]);
});

test('uses the nested draft id when staging a photo import', async () => {
  const { model, api } = makeModel([image]);
  api.stageImport.mockResolvedValueOnce({ batch: { id: 'batch-1' }, draft: { id: 'draft-1' }, reused: false });

  await model.choosePhoto();
  await expect(model.stage()).resolves.toBe(true);

  expect(api.uploadAttachment).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'draft-1' }));
});

test('stages nested CSV batches without uploading a batch as a draft attachment', async () => {
  const { model, api } = makeModel([csv]);
  api.stageAnzCsv.mockResolvedValueOnce({ batch: { id: 'batch-csv' }, drafts: [{ id: 'draft-csv' }], reused: false });

  await model.chooseCsv();
  await expect(model.stage()).resolves.toBe(true);

  expect(api.stageAnzCsv).toHaveBeenCalledTimes(1);
  expect(api.uploadAttachment).not.toHaveBeenCalled();
});

test('caches a staged draft separately and retries an original upload after failure', async () => {
  const { model, api } = makeModel([image]);
  api.uploadAttachment
    .mockRejectedValueOnce(new Error('first upload failed'))
    .mockResolvedValueOnce({ id: 'attachment-retry' });

  await model.choosePhoto();
  await expect(model.stage()).resolves.toBe(false);
  expect(model.state.error).toContain('first upload failed');
  expect(model.state.stageResult).toEqual(expect.objectContaining({ draftId: 'draft-1' }));
  expect(model.state.uploaded).toBe(false);

  await expect(model.stage()).resolves.toBe(true);
  expect(api.stageImport).toHaveBeenCalledTimes(1);
  expect(api.uploadAttachment).toHaveBeenCalledTimes(2);
  expect(model.state.uploaded).toBe(true);
  expect(model.state.error).toBe('');
});

test('uploads a retained original for a reused staged draft until completion is known', async () => {
  const { model, api } = makeModel([image]);
  api.stageImport.mockResolvedValue({ draftId: 'draft-reused', reused: true });
  api.uploadAttachment
    .mockRejectedValueOnce(new Error('reused upload failed'))
    .mockResolvedValueOnce({ id: 'attachment-reused' });

  await model.choosePhoto();
  await expect(model.stage()).resolves.toBe(false);
  await expect(model.stage()).resolves.toBe(true);

  expect(api.stageImport).toHaveBeenCalledTimes(1);
  expect(api.uploadAttachment).toHaveBeenCalledTimes(2);
  expect(model.state.uploaded).toBe(true);
});

test('deduplicates concurrent stage and upload for one selection', async () => {
  const { model, api } = makeModel([image]);
  let resolveStage!: (result: { draftId: string; reused: boolean }) => void;
  api.stageImport.mockImplementationOnce(() => new Promise((resolve) => { resolveStage = resolve; }));

  await model.choosePhoto();
  const first = model.stage();
  const second = model.stage();
  await Promise.resolve();
  expect(api.stageImport).toHaveBeenCalledTimes(1);

  resolveStage({ draftId: 'draft-deduped', reused: false });
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  expect(api.uploadAttachment).toHaveBeenCalledTimes(1);
});

test('an old stage uploads its immutable file and cannot replace a newer selection', async () => {
  const oldFile = { ...image, path: '/tmp/old.jpg', name: 'old.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) };
  const newFile = { ...image, path: '/tmp/new.jpg', name: 'new.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe1]) };
  const hash = (content: Uint8Array | string) => content instanceof Uint8Array && content[3] === 0xe0 ? 'old-hash' : 'new-hash';
  const { model, picker, api } = makeModel([oldFile], hash);
  picker.chooseAlbum.mockResolvedValueOnce(newFile);
  let resolveStage!: (result: { draftId: string; reused: boolean }) => void;
  api.stageImport.mockImplementationOnce(() => new Promise((resolve) => { resolveStage = resolve; }));

  await model.choosePhoto();
  const oldStage = model.stage();
  await model.chooseAlbum();
  expect(model.state.file?.path).toBe('/tmp/new.jpg');

  resolveStage({ draftId: 'draft-old', reused: false });
  await expect(oldStage).resolves.toBe(true);

  expect(api.stageImport).toHaveBeenCalledWith(expect.objectContaining({ fileHash: 'old-hash' }));
  expect(api.uploadAttachment).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/tmp/old.jpg', draftId: 'draft-old' }));
  expect(model.state.file?.path).toBe('/tmp/new.jpg');
  expect(model.state.stageResult).toBeNull();
  expect(model.state.uploaded).toBe(false);
});

test('statement confirmation is single-flight, snapshots rows, and renders loading immediately', async () => {
  const { model, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewAnzCsv.mockResolvedValueOnce([
    { date: '2026-08-17', amountMinor: 3500, direction: 'expense', merchant: 'First', sourceFingerprint: 'row-1' },
    { date: '2026-08-18', amountMinor: 4500, direction: 'expense', merchant: 'Second', sourceFingerprint: 'row-2' },
  ]);
  api.previewDuplicates.mockResolvedValue([]);
  api.stageImport
    .mockResolvedValueOnce({ draftId: 'draft-1', reused: false })
    .mockResolvedValueOnce({ draftId: 'draft-2', reused: false });
  let resolveFirstConfirm!: (result: { id: string }) => void;
  api.confirmDraft.mockImplementationOnce(() => new Promise((resolve) => { resolveFirstConfirm = resolve; }));
  await model.chooseCsv();

  const page = createImportPage(model);
  const setData = jest.fn();
  const first = page.confirmSelectedMissing.call({ setData });
  expect(model.state.loading).toBe(true);
  expect(setData).toHaveBeenCalledWith(expect.objectContaining({ loading: true }));
  const second = model.confirmSelectedMissing();
  await expect(second).resolves.toBe(false);

  model.state.missing = [];
  resolveFirstConfirm({ id: 'tx-1' });
  await expect(first).resolves.toBeUndefined();

  expect(api.stageImport).toHaveBeenCalledTimes(2);
  expect(api.confirmDraft).toHaveBeenCalledTimes(2);
  expect(api.confirmDraft).toHaveBeenNthCalledWith(1, 'draft-1', {});
  expect(api.confirmDraft).toHaveBeenNthCalledWith(2, 'draft-2', {});
  expect(model.state.loading).toBe(false);
});

test('a stale image read failure cannot overwrite a newer selection or its loading state', async () => {
  const oldFile: PickedImportFile = { path: '/tmp/old.jpg', name: 'old.jpg', size: 1024, contentType: 'image/jpeg' };
  const newFile: PickedImportFile = { ...image, path: '/tmp/new.jpg', name: 'new.jpg' };
  const { model, picker, api } = makeModel([oldFile]);
  let resolveOldFile!: (file: PickedImportFile) => void;
  let rejectOldRead!: (error: Error) => void;
  let resolveNewPreview!: (preview: { amountMinor: number; direction: 'expense'; merchant: string; confidence: number }) => void;
  picker.chooseMedia
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOldFile = resolve; }))
    .mockResolvedValueOnce(newFile);
  picker.readFile.mockImplementation((path: string) => path === oldFile.path
    ? new Promise((_, reject) => { rejectOldRead = reject; })
    : Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff, 0xe1])));
  api.previewDocument.mockImplementationOnce(() => new Promise((resolve) => { resolveNewPreview = resolve; }));

  const oldSelection = model.choosePhoto();
  resolveOldFile(oldFile);
  await Promise.resolve();
  await Promise.resolve();
  const newSelection = model.choosePhoto();
  await Promise.resolve();
  expect(model.state.loading).toBe(true);
  rejectOldRead(new Error('stale read failed'));
  await expect(oldSelection).resolves.toBe(false);
  expect(model.state.error).toBe('');
  expect(model.state.loading).toBe(true);

  resolveNewPreview({ amountMinor: 1250, direction: 'expense', merchant: 'New', confidence: 0.9 });
  await expect(newSelection).resolves.toBe(true);
  expect(model.state.file?.path).toBe(newFile.path);
  expect(model.state.error).toBe('');
  expect(model.state.loading).toBe(false);
});

test('a stale CSV preview and statement classification cannot replace a newer CSV result', async () => {
  const oldCsv: PickedImportFile = { ...csv, path: '/tmp/old.csv', name: 'old.csv', text: 'old-csv' };
  const newCsv: PickedImportFile = { ...csv, path: '/tmp/new.csv', name: 'new.csv', text: 'new-csv' };
  const { model, picker, api } = makeModel([oldCsv]);
  model.setMode('statement');
  let resolveOldFile!: (file: PickedImportFile) => void;
  let resolveNewFile!: (file: PickedImportFile) => void;
  let resolveOldRows!: (rows: Array<{ date: string; amountMinor: number; direction: 'expense'; merchant: string; sourceFingerprint: string }>) => void;
  picker.chooseMessageFile
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOldFile = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveNewFile = resolve; }));
  api.previewAnzCsv.mockImplementation((value: string) => value === oldCsv.text
    ? new Promise((resolve) => { resolveOldRows = resolve; })
    : Promise.resolve([{ date: '2026-08-20', amountMinor: 2200, direction: 'expense' as const, merchant: 'New', sourceFingerprint: 'new-row' }]));
  api.previewDuplicates.mockResolvedValue([]);

  const oldSelection = model.chooseCsv();
  resolveOldFile(oldCsv);
  await Promise.resolve();
  const newSelection = model.chooseCsv();
  resolveNewFile(newCsv);
  await expect(newSelection).resolves.toBe(true);
  expect(model.state.rows).toEqual([expect.objectContaining({ sourceFingerprint: 'new-row' })]);
  expect(model.state.missing).toEqual([expect.objectContaining({ sourceFingerprint: 'new-row' })]);

  resolveOldRows([{ date: '2026-08-19', amountMinor: 1100, direction: 'expense', merchant: 'Old', sourceFingerprint: 'old-row' }]);
  await expect(oldSelection).resolves.toBe(false);
  expect(model.state.rows).toEqual([expect.objectContaining({ sourceFingerprint: 'new-row' })]);
  expect(model.state.missing).toEqual([expect.objectContaining({ sourceFingerprint: 'new-row' })]);
  expect(model.state.file?.path).toBe(newCsv.path);
});

test('a stale parse rejection cannot overwrite a newer file selection', async () => {
  const { model, picker, api } = makeModel([image]);
  let rejectParse!: (error: Error) => void;
  api.parseDraft.mockImplementationOnce(() => new Promise((_, reject) => { rejectParse = reject; }));

  const parsing = model.parseText('旧文本');
  await Promise.resolve();
  const selection = model.choosePhoto();
  await expect(selection).resolves.toBe(true);
  rejectParse(new Error('stale parse failed'));
  await expect(parsing).resolves.toBe(false);

  expect(model.state.file?.path).toBe(image.path);
  expect(model.state.sourceType).toBe('manual-photo');
  expect(model.state.error).toBe('');
  expect(model.state.loading).toBe(false);
});

test('reselecting the same hash during stage shares one stage and upload', async () => {
  const oldFile = { ...image, path: '/tmp/old-same.jpg', name: 'old-same.jpg' };
  const currentFile = { ...image, path: '/tmp/current-same.jpg', name: 'current-same.jpg' };
  const { model, picker, api } = makeModel([oldFile]);
  picker.chooseAlbum.mockResolvedValueOnce(currentFile);
  let resolveStage!: (result: { draftId: string; reused: boolean }) => void;
  api.stageImport.mockImplementationOnce(() => new Promise((resolve) => { resolveStage = resolve; }));

  await model.choosePhoto();
  const oldStage = model.stage();
  await Promise.resolve();
  await model.chooseAlbum();
  const currentStage = model.stage();
  await Promise.resolve();

  expect(api.stageImport).toHaveBeenCalledTimes(1);
  resolveStage({ draftId: 'draft-same-hash', reused: false });
  await expect(Promise.all([oldStage, currentStage])).resolves.toEqual([true, true]);
  expect(api.uploadAttachment).toHaveBeenCalledTimes(1);
  expect(api.uploadAttachment).toHaveBeenCalledWith(expect.objectContaining({ filePath: oldFile.path, draftId: 'draft-same-hash' }));
  expect(model.state.file?.path).toBe(currentFile.path);
  expect(model.state.stageResult).toEqual(expect.objectContaining({ draftId: 'draft-same-hash' }));
  expect(model.state.uploaded).toBe(true);
});

test('reselecting a completed hash reuses stage and upload completion', async () => {
  const { model, picker, api } = makeModel([image]);
  picker.chooseAlbum.mockResolvedValueOnce({ ...image, path: '/tmp/reselected.jpg', name: 'reselected.jpg' });

  await model.choosePhoto();
  await expect(model.stage()).resolves.toBe(true);
  await model.chooseAlbum();
  await expect(model.stage()).resolves.toBe(true);

  expect(api.stageImport).toHaveBeenCalledTimes(1);
  expect(api.uploadAttachment).toHaveBeenCalledTimes(1);
  expect(model.state.file?.path).toBe('/tmp/reselected.jpg');
  expect(model.state.uploaded).toBe(true);
});

test('duplicate keep-both is single-flight per row and renders loading immediately', async () => {
  const { model, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewAnzCsv.mockResolvedValueOnce([
    { date: '2026-08-17', amountMinor: 3500, direction: 'expense', merchant: 'First', sourceFingerprint: 'row-1' },
    { date: '2026-08-18', amountMinor: 4500, direction: 'expense', merchant: 'Second', sourceFingerprint: 'row-2' },
  ]);
  api.previewDuplicates.mockResolvedValue([{ incomingId: 'row-1', existingId: 'tx-1', score: 85, reasons: ['date-near'] }]);
  await model.chooseCsv();

  const stageResolvers: Array<(result: { draftId: string; reused: boolean }) => void> = [];
  api.stageImport.mockImplementation(() => new Promise((resolve) => { stageResolvers.push(resolve); }));
  const confirmResolvers: Array<(result: { id: string }) => void> = [];
  api.confirmDraft.mockImplementation(() => new Promise((resolve) => { confirmResolvers.push(resolve); }));
  const page = createImportPage(model);
  const setData = jest.fn();

  const first = page.resolveDuplicate.call({ setData }, { currentTarget: { dataset: { id: 'row-1', action: 'keep-both' } } });
  expect(model.state.loading).toBe(true);
  expect(setData).toHaveBeenCalledWith(expect.objectContaining({ loading: true }));
  await expect(model.resolveDuplicate('row-1', 'keep-both')).resolves.toBe(false);
  const other = model.resolveDuplicate('row-2', 'keep-both');
  await Promise.resolve();
  expect(api.stageImport).toHaveBeenCalledTimes(2);

  stageResolvers[0]({ draftId: 'draft-1', reused: false });
  stageResolvers[1]({ draftId: 'draft-2', reused: false });
  await Promise.resolve();
  expect(api.confirmDraft).toHaveBeenCalledTimes(2);
  expect(api.confirmDraft).toHaveBeenNthCalledWith(1, 'draft-1', { allowDuplicate: true });
  expect(api.confirmDraft).toHaveBeenNthCalledWith(2, 'draft-2', { allowDuplicate: true });
  confirmResolvers[0]({ id: 'tx-1' });
  confirmResolvers[1]({ id: 'tx-2' });
  await expect(Promise.all([first, other])).resolves.toEqual([undefined, true]);
  expect(model.state.duplicates).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceFingerprint: 'row-1', resolution: 'keep-both' }),
    expect.objectContaining({ sourceFingerprint: 'row-2', resolution: 'keep-both' }),
  ]));
  expect(model.state.loading).toBe(false);
});

test('an old duplicate flight cannot keep current revision loading after its successor completes', async () => {
  const { model, picker, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewDuplicates.mockResolvedValue([{ incomingId: 'row-1', existingId: 'tx-1', score: 85, reasons: ['date-near'] }]);
  await model.chooseCsv();
  const stageResolvers: Array<{ resolve: (result: { draftId: string; reused: boolean }) => void; reject: (error: Error) => void }> = [];
  api.stageImport.mockImplementation(() => new Promise((resolve, reject) => { stageResolvers.push({ resolve, reject }); }));
  const confirmResolvers: Array<(result: { id: string }) => void> = [];
  api.confirmDraft.mockImplementation(() => new Promise((resolve) => { confirmResolvers.push(resolve); }));

  const oldFlight = model.resolveDuplicate('row-1', 'keep-both');
  await Promise.resolve();
  picker.chooseMessageFile.mockResolvedValueOnce({ ...csv, path: '/tmp/new-statement.csv', name: 'new-statement.csv' });
  await model.chooseCsv();
  const currentFlight = model.resolveDuplicate('row-1', 'keep-both');
  await Promise.resolve();
  expect(stageResolvers).toHaveLength(2);

  stageResolvers[1].resolve({ draftId: 'draft-current', reused: false });
  await Promise.resolve();
  confirmResolvers[0]({ id: 'tx-current' });
  await expect(currentFlight).resolves.toBe(true);
  expect(model.state.loading).toBe(false);
  expect(model.state.error).toBe('');

  stageResolvers[0].reject(new Error('old duplicate failed late'));
  await expect(oldFlight).resolves.toBe(false);
  expect(model.state.loading).toBe(false);
  expect(model.state.error).toBe('');
});

test('current duplicate flights keep loading true until the last row completes', async () => {
  const { model, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewAnzCsv.mockResolvedValueOnce([
    { date: '2026-08-17', amountMinor: 3500, direction: 'expense', merchant: 'First', sourceFingerprint: 'row-1' },
    { date: '2026-08-18', amountMinor: 4500, direction: 'expense', merchant: 'Second', sourceFingerprint: 'row-2' },
  ]);
  api.previewDuplicates.mockResolvedValue([{ incomingId: 'row-1', existingId: 'tx-1', score: 85, reasons: ['date-near'] }]);
  await model.chooseCsv();
  const stageResolvers: Array<(result: { draftId: string; reused: boolean }) => void> = [];
  api.stageImport.mockImplementation(() => new Promise((resolve) => { stageResolvers.push(resolve); }));
  const confirmResolvers: Array<(result: { id: string }) => void> = [];
  api.confirmDraft.mockImplementation(() => new Promise((resolve) => { confirmResolvers.push(resolve); }));

  const first = model.resolveDuplicate('row-1', 'keep-both');
  const second = model.resolveDuplicate('row-2', 'keep-both');
  await Promise.resolve();
  stageResolvers[0]({ draftId: 'draft-1', reused: false });
  stageResolvers[1]({ draftId: 'draft-2', reused: false });
  await Promise.resolve();
  confirmResolvers[0]({ id: 'tx-1' });
  await expect(first).resolves.toBe(true);
  expect(model.state.loading).toBe(true);
  confirmResolvers[1]({ id: 'tx-2' });
  await expect(second).resolves.toBe(true);
  expect(model.state.loading).toBe(false);
});

test('a new statement selection clears the prior confirmed missing count', async () => {
  const { model, picker, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewDuplicates.mockResolvedValue([]);
  await model.chooseCsv();
  model.state.confirmedMissingCount = 3;
  picker.chooseMessageFile.mockResolvedValueOnce({ ...csv, path: '/tmp/new-count.csv', name: 'new-count.csv' });

  const pending = model.chooseCsv();
  await Promise.resolve();
  await Promise.resolve();
  expect(model.state.confirmedMissingCount).toBe(0);
  await expect(pending).resolves.toBe(true);
  expect(model.state.confirmedMissingCount).toBe(0);
});

test('failed duplicate keep-both can be retried after its guard is released', async () => {
  const { model, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewAnzCsv.mockResolvedValueOnce([{ date: '2026-08-17', amountMinor: 3500, direction: 'expense', merchant: 'First', sourceFingerprint: 'row-1' }]);
  api.previewDuplicates.mockResolvedValue([{ incomingId: 'row-1', existingId: 'tx-1', score: 85, reasons: ['date-near'] }]);
  await model.chooseCsv();
  api.stageImport
    .mockRejectedValueOnce(new Error('keep-both stage failed'))
    .mockResolvedValueOnce({ draftId: 'draft-retry', reused: false });

  await expect(model.resolveDuplicate('row-1', 'keep-both')).resolves.toBe(false);
  expect(model.state.error).toContain('keep-both stage failed');
  await expect(model.resolveDuplicate('row-1', 'keep-both')).resolves.toBe(true);

  expect(api.stageImport).toHaveBeenCalledTimes(2);
  expect(api.confirmDraft).toHaveBeenCalledTimes(1);
  expect(model.state.duplicates).toEqual([expect.objectContaining({ sourceFingerprint: 'row-1', resolution: 'keep-both' })]);
});

test('a new descriptor replaces old binding before read and remains retryable after read failure', async () => {
  const oldFile = { ...image, path: '/tmp/old-bound.jpg', name: 'old-bound.jpg' };
  const newFile: PickedImportFile = { path: '/tmp/new-bound.jpg', name: 'new-bound.jpg', size: 1024, contentType: 'image/jpeg' };
  const hash = (content: Uint8Array | string) => content instanceof Uint8Array && content[3] === 0xe0 ? 'old-bound-hash' : 'new-bound-hash';
  const { model, picker, api } = makeModel([oldFile], hash);
  api.stageImport.mockResolvedValueOnce({ draftId: 'draft-old-bound', reused: false }).mockResolvedValueOnce({ draftId: 'draft-new-bound', reused: false });
  picker.chooseAlbum.mockResolvedValueOnce(newFile).mockResolvedValueOnce(newFile);
  let rejectRead!: (error: Error) => void;
  picker.readFile
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectRead = reject; }))
    .mockResolvedValueOnce(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]));

  await model.choosePhoto();
  await expect(model.stage()).resolves.toBe(true);
  expect(model.state.stageResult).toEqual(expect.objectContaining({ draftId: 'draft-old-bound' }));
  const newSelection = model.chooseAlbum();
  await Promise.resolve();
  await Promise.resolve();

  expect(model.state.file).toEqual(newFile);
  expect((model as unknown as { content?: unknown }).content).toBeNull();
  expect(model.state.stageResult).toBeNull();
  expect(model.state.uploaded).toBe(false);
  expect(model.state.preview).toBeNull();
  expect(model.state.rows).toEqual([]);
  expect(model.state.missing).toEqual([]);
  await expect(model.stage()).resolves.toBe(false);
  expect(api.uploadAttachment).toHaveBeenCalledTimes(1);
  expect(api.stageImport).toHaveBeenCalledTimes(1);

  rejectRead(new Error('new read failed'));
  await expect(newSelection).resolves.toBe(false);
  expect(model.state.file).toEqual(newFile);
  expect(model.state.error).toContain('new read failed');

  const retry = model.chooseAlbum();
  await expect(retry).resolves.toBe(true);
  await expect(model.stage()).resolves.toBe(true);
  expect(api.stageImport).toHaveBeenCalledTimes(2);
  expect(api.uploadAttachment).toHaveBeenLastCalledWith(expect.objectContaining({ filePath: newFile.path, draftId: 'draft-new-bound' }));
  expect(model.state.uploaded).toBe(true);
});

test('a cancelled statement picker preserves the accepted selection state and revision', async () => {
  const { model, picker, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewDuplicates.mockResolvedValue([]);
  await model.chooseCsv();
  await model.stage();
  model.state.confirmedMissingCount = 2;
  const stateBefore = JSON.parse(JSON.stringify(model.state));
  const revisionBefore = (model as unknown as { selectionRevision: number }).selectionRevision;
  let cancelPicker!: (error: unknown) => void;
  picker.chooseMessageFile.mockImplementationOnce(() => new Promise((_, reject) => { cancelPicker = reject; }));

  const pending = model.chooseCsv();
  expect(model.state).toEqual(stateBefore);
  expect((model as unknown as { selectionRevision: number }).selectionRevision).toBe(revisionBefore);
  cancelPicker({ errMsg: 'chooseMessageFile:fail cancel' });

  await expect(pending).resolves.toBe(false);
  expect(model.state).toEqual(stateBefore);
  expect((model as unknown as { selectionRevision: number }).selectionRevision).toBe(revisionBefore);
});

test('a cancelled picker does not disturb pending keep-both and does not allow a completed retry', async () => {
  const { model, picker, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewDuplicates.mockResolvedValue([{ incomingId: 'row-1', existingId: 'tx-1', score: 85, reasons: ['date-near'] }]);
  await model.chooseCsv();
  let resolveStage!: (result: { draftId: string; reused: boolean }) => void;
  api.stageImport.mockImplementationOnce(() => new Promise((resolve) => { resolveStage = resolve; }));
  let resolveConfirm!: (result: { id: string }) => void;
  api.confirmDraft.mockImplementationOnce(() => new Promise((resolve) => { resolveConfirm = resolve; }));

  const keepBoth = model.resolveDuplicate('row-1', 'keep-both');
  await Promise.resolve();
  expect(api.stageImport).toHaveBeenCalledTimes(1);
  const revisionBefore = (model as unknown as { selectionRevision: number }).selectionRevision;
  const errorBefore = model.state.error;
  let cancelPicker!: (error: unknown) => void;
  picker.chooseAlbum.mockImplementationOnce(() => new Promise((_, reject) => { cancelPicker = reject; }));

  const cancelled = model.chooseAlbum();
  expect((model as unknown as { selectionRevision: number }).selectionRevision).toBe(revisionBefore);
  cancelPicker({ errMsg: 'chooseMedia:fail cancel' });
  await expect(cancelled).resolves.toBe(false);
  expect(model.state.error).toBe(errorBefore);
  expect(model.state.loading).toBe(true);

  resolveStage({ draftId: 'draft-keep-both', reused: false });
  await Promise.resolve();
  expect(api.confirmDraft).toHaveBeenCalledTimes(1);
  resolveConfirm({ id: 'tx-keep-both' });
  await expect(keepBoth).resolves.toBe(true);
  expect(model.state.loading).toBe(false);
  expect(model.state.duplicates).toEqual([expect.objectContaining({ sourceFingerprint: 'row-1', resolution: 'keep-both' })]);

  await expect(model.resolveDuplicate('row-1', 'keep-both')).resolves.toBe(false);
  expect(api.stageImport).toHaveBeenCalledTimes(1);
  expect(api.confirmDraft).toHaveBeenCalledTimes(1);
});

test('only the latest overlapping picker attempt can accept a new selection', async () => {
  const { model, picker } = makeModel([image]);
  await model.choosePhoto();
  const stateBefore = JSON.parse(JSON.stringify(model.state));
  const revisionBefore = (model as unknown as { selectionRevision: number }).selectionRevision;
  let resolveOld!: (file: PickedImportFile) => void;
  let rejectLatest!: (error: unknown) => void;
  picker.chooseMessageFile
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectLatest = reject; }));

  const oldAttempt = model.chooseCsv();
  const latestAttempt = model.chooseCsv();
  expect((model as unknown as { selectionRevision: number }).selectionRevision).toBe(revisionBefore);
  rejectLatest({ errMsg: 'chooseMessageFile:fail cancel' });
  await expect(latestAttempt).resolves.toBe(false);
  resolveOld(csv);
  await expect(oldAttempt).resolves.toBe(false);
  expect(model.state.file).toEqual(image);
  expect(model.state.sourceType).toBe('manual-photo');
  expect(model.state.view).toBe('preview');
  expect(model.state.loading).toBe(false);
  expect(model.state.error).toBe('');
  expect((model as unknown as { selectionRevision: number }).selectionRevision).toBe(revisionBefore);
});

test('a successful picker descriptor replaces the visible binding before its read starts', async () => {
  const { model, picker } = makeModel([image]);
  await model.choosePhoto();
  const newFile: PickedImportFile = { path: '/tmp/accepted-before-read.jpg', name: 'accepted-before-read.jpg', size: 1024, contentType: 'image/jpeg' };
  let resolveRead!: (content: Uint8Array) => void;
  picker.chooseAlbum.mockResolvedValueOnce(newFile);
  picker.readFile.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));

  const pending = model.chooseAlbum();
  await Promise.resolve();
  expect(model.state.file).toEqual(newFile);
  expect((model as unknown as { content?: unknown }).content).toBeNull();
  expect(model.state.stageResult).toBeNull();
  expect(model.state.uploaded).toBe(false);

  await Promise.resolve();
  resolveRead(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]));
  await expect(pending).resolves.toBe(true);
});

test('a completed keep-both resolution is terminal for later and repeated keep-both clicks', async () => {
  const { model, api } = makeModel([csv]);
  model.setMode('statement');
  api.previewDuplicates.mockResolvedValue([{ incomingId: 'row-1', existingId: 'tx-1', score: 85, reasons: ['date-near'] }]);
  await model.chooseCsv();
  api.stageImport.mockResolvedValueOnce({ draftId: 'draft-terminal', reused: false });
  api.confirmDraft.mockResolvedValueOnce({ id: 'tx-terminal' });

  await expect(model.resolveDuplicate('row-1', 'keep-both')).resolves.toBe(true);
  expect(model.state.duplicates).toEqual([expect.objectContaining({ sourceFingerprint: 'row-1', resolution: 'keep-both' })]);
  expect(api.stageImport).toHaveBeenCalledTimes(1);
  expect(api.confirmDraft).toHaveBeenCalledTimes(1);

  await expect(model.resolveDuplicate('row-1', 'later')).resolves.toBe(false);
  await expect(model.resolveDuplicate('row-1', 'keep-both')).resolves.toBe(false);
  expect(model.state.duplicates).toEqual([expect.objectContaining({ sourceFingerprint: 'row-1', resolution: 'keep-both' })]);
  expect(api.stageImport).toHaveBeenCalledTimes(1);
  expect(api.confirmDraft).toHaveBeenCalledTimes(1);
});

test('picker page renders the accepted descriptor before deferred read and renders final state after completion', async () => {
  const { model, picker, api } = makeModel([image]);
  await model.choosePhoto();
  await model.stage();
  const newFile: PickedImportFile = { path: '/tmp/page-accepted-before-read.jpg', name: 'page-accepted-before-read.jpg', size: 1024, contentType: 'image/jpeg' };
  let resolveRead!: (content: Uint8Array) => void;
  picker.chooseAlbum.mockResolvedValueOnce(newFile);
  picker.readFile.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
  const snapshots: Array<{ file?: PickedImportFile | null; loading?: boolean; stageResult?: unknown; preview?: unknown }> = [];
  const setData = jest.fn((data: unknown) => { snapshots.push(JSON.parse(JSON.stringify(data)) as typeof snapshots[number]); });
  const page = createImportPage(model);

  const pending = page.chooseAlbum.call({ setData });
  await Promise.resolve();
  expect(snapshots.some((snapshot) => snapshot.file?.path === newFile.path && snapshot.loading === true && snapshot.stageResult === null && snapshot.preview === null)).toBe(true);

  await Promise.resolve();
  resolveRead(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]));
  await pending;
  expect(snapshots.at(-1)).toEqual(expect.objectContaining({ file: newFile, loading: false, stageResult: null }));
  expect(api.previewDocument).toHaveBeenCalledTimes(2);
});
