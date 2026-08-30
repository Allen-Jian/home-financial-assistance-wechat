import type { DocumentDraft } from '../src/api/contracts';
import type { ImportApiPort, ImportPickerPort, PickedImportFile } from '../pages/imports';
import { ImportPageModel } from '../pages/imports';

function picker(): ImportPickerPort {
  const file: PickedImportFile = { path: '/tmp/receipt.jpg', name: 'receipt.jpg', size: 3, contentType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff]) };
  return { chooseMedia: async () => file, chooseAlbum: async () => file, chooseMessageFile: async () => file, readFile: async () => file.bytes! };
}

test('natural-language input becomes the same staged draft as a document preview', async () => {
  const preview: DocumentDraft = { amountMinor: 1890, direction: 'expense', merchant: 'Market', categoryHint: '食品', fieldConfidence: { amountMinor: 0.99 } };
  const api: ImportApiPort & { parseDraft: (input: string) => Promise<DocumentDraft> } = {
    parseDraft: jest.fn().mockResolvedValue(preview),
    previewDocument: jest.fn(), previewAnzCsv: jest.fn(), stageImport: jest.fn().mockResolvedValue({ batchId: 'b-1', draftCount: 1, reused: false, draftId: 'd-1' }),
    stageAnzCsv: jest.fn(), uploadAttachment: jest.fn().mockResolvedValue(undefined),
  };
  const model = new ImportPageModel(picker(), api);
  expect(await model.parseText('昨天超市花了18.90')).toBe(true);
  expect(model.state.preview).toEqual(preview);
  expect(api.parseDraft).toHaveBeenCalledWith('昨天超市花了18.90');
});
