import { ImportPageModel, MAX_IMPORT_BYTES, type PickedImportFile } from '../pages/imports/index';

const image: PickedImportFile = { path: '/tmp/receipt.jpg', name: 'receipt.jpg', size: 1024, contentType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) };
const pdf: PickedImportFile = { path: '/tmp/power.pdf', name: 'power.pdf', size: 2048, contentType: 'application/pdf', bytes: new TextEncoder().encode('%PDF-1.7') };
const csv: PickedImportFile = { path: '/tmp/anz.csv', name: 'anz.csv', size: 512, contentType: 'text/csv', text: 'Date,Amount,Description\n15/08/2026,-12.50,Market' };

function makeModel(files: PickedImportFile[] = [image]) {
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
  };
  return { model: new ImportPageModel(picker, api, () => 'hash-1'), picker, api };
}

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
