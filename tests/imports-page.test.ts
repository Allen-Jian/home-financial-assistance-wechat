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
