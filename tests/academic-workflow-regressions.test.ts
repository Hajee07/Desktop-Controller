import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { defaultConfig } from '../src/config/index.js';
import { createContext } from '../src/server/context.js';
import { AuthorizedPaths } from '../src/security/paths.js';
import { checkedFile } from '../src/academic/common.js';
import { extractionTools, extractDocument, renderPdfPage } from '../src/academic/extraction/index.js';
import { discoveryTools } from '../src/academic/discovery/index.js';
import { orchestrationTools } from '../src/academic/orchestration/index.js';
import { reasoningTools } from '../src/academic/reasoning/index.js';
import { documentTools } from '../src/academic/documents/index.js';
import { ToolMediaResult } from '../src/server/media.js';
import type { CallContext } from '../src/server/types.js';

const sourceSentence = 'Voltage equals current times resistance.';
const answerText = 'The lecture states that voltage equals current times resistance. Voltage therefore depends on both the current and the resistance.';
const call: CallContext = { signal: new AbortController().signal, async confirm() { throw new Error('This fixture uses no GUI, destructive command, or external action.'); } };

async function pdfBuffer(draw: (pdf: PDFKit.PDFDocument) => void): Promise<Buffer> {
  const pdf = new PDFDocument({ size: 'LETTER', margin: 52 });
  const parts: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => { pdf.on('data', part => parts.push(part)); pdf.on('end', () => resolve(Buffer.concat(parts))); pdf.on('error', reject); });
  draw(pdf); pdf.end(); return completed;
}

test('real scanned evidence stays canonical through OCR, indexing, reasoning, required deliverables and final acceptance', { skip: process.platform !== 'win32' }, async t => {
  const base = path.resolve('test-results'); await fs.mkdir(base, { recursive: true });
  const project = await fs.mkdtemp(path.join(base, 'academic-workflow-regression-'));
  const workspace = path.join(project, 'workspace'); await fs.mkdir(workspace);
  const sourceFolder = path.join(workspace, 'Source_Files'), working = path.join(workspace, 'Working_Files'), finals = path.join(workspace, 'Final');
  for (const folder of [sourceFolder, working, finals]) await fs.mkdir(folder);
  const ctx = await createContext(defaultConfig(project), project);
  // Fixed production OCR script lives in the real server installation; all task inputs/state remain isolated fixtures.
  ctx.projectDir = process.cwd();
  t.after(async () => { await ctx.shutdown(); assert.equal(path.dirname(await fs.realpath(project)), base); await fs.rm(project, { recursive: true, force: true }); });
  const tools = [...extractionTools(ctx), ...discoveryTools(ctx), ...orchestrationTools(ctx), ...reasoningTools(ctx), ...documentTools(ctx)];
  const run = async (name: string, input: Record<string, unknown>) => { const tool = tools.find(item => item.name === name); assert.ok(tool, name); return await tool.execute(tool.schema.parse(input), call) as any; };
  const currentRevision = async (taskId: string) => (await run('academic_task_get', { taskId })).revision as number;

  const rasterSource = path.join(working, 'raster-source.pdf');
  await fs.writeFile(rasterSource, await pdfBuffer(pdf => { pdf.font('Helvetica-Bold').fontSize(26).text('LECTURE NOTE', 52, 72); pdf.font('Helvetica').fontSize(23).text(sourceSentence, 52, 140); }));
  const raster = await renderPdfPage(ctx, rasterSource, 1, 1400, call);
  const scan = path.join(sourceFolder, 'scanned-lecture.pdf');
  await fs.writeFile(scan, await pdfBuffer(pdf => pdf.image(raster.png, 0, 0, { width: 612, height: 792 })));
  const original = await checkedFile(ctx, scan, call.signal);
  const unrecognized = await extractDocument(ctx, scan, call);
  assert.ok(!unrecognized.segments.some(segment => /voltage/i.test(segment.text)), 'The source must truly be an image-only PDF, not embedded text.');

  // Indexing before OCR catches the former same-binary-hash skip that stranded newly recognized evidence.
  const firstIndex = await run('academic_index_build', { roots: [scan], dryRun: false }); assert.equal(firstIndex.errors.length, 0);
  assert.equal((await run('academic_search', { query: 'voltage resistance', mode: 'fulltext' })).results.length, 0);
  const ocr = await run('academic_pdf_ocr', { path: scan, page: 1, imagePath: path.join(working, 'recognized-page.png'), language: 'en-US', width: 1400, dryRun: false });
  assert.match(ocr.text, /Voltage equals current times resistance/i);
  assert.match(ocr.sourceId, /^src_[a-f0-9]{24}$/); assert.match(ocr.segmentId, /^seg_[a-f0-9]{16}$/);
  assert.equal(ocr.sourceSha256, original.sha256); assert.equal(ocr.location.page, 1);
  const canonical = await extractDocument(ctx, scan, call);
  const recognized = canonical.segments.find(segment => segment.id === ocr.segmentId)!;
  assert.ok(recognized, 'OCR must become canonical extractable evidence.'); assert.equal(recognized.kind, 'ocr'); assert.equal(canonical.sourceId, ocr.sourceId);
  const reindexed = await run('academic_index_build', { roots: [scan], dryRun: false }); assert.equal(reindexed.errors.length, 0); assert.equal(reindexed.indexed, 1, 'Same PDF bytes with new OCR evidence require a new index entry.');
  const search = await run('academic_search', { query: 'voltage resistance', mode: 'fulltext' });
  const hit = search.results.find((item: any) => item.sourceId === ocr.sourceId && item.segmentId === ocr.segmentId);
  assert.ok(hit, 'Full-text retrieval must return the same public OCR citation IDs.'); assert.equal(hit.location.page, 1);
  const resolved = await run('academic_source_resolve', { sourceId: hit.sourceId, segmentId: hit.segmentId }); assert.equal(resolved.segment.id, ocr.segmentId);

  const created = await run('academic_task_create', { description: 'Explain the voltage relationship using the scanned lecture.', instructions: '1. Explain the voltage relationship. [5 marks]\nDeliver answer.docx and answer.pdf.', inputFiles: [scan], requiresCitations: true });
  const taskId = created.task.id;
  const requirements = {
    questions: [{ id: 'q1', text: 'Explain the voltage relationship.', marks: 5, commandWord: 'explain', depthGuidance: 'Explain the relationship using the supplied scanned lecture.' }],
    formatting: ['Provide the actual committed explanation in both DOCX and PDF.'], deliverables: ['answer.docx', 'answer.pdf'], requirementsReviewed: true
  };
  const plan = async (description: string) => run('academic_task_plan', { taskId, expectedRevision: await currentRevision(taskId), ...requirements, steps: [
    { id: 'reason', description: 'Prepare and commit one grounded explanation.', kind: 'analysis' },
    { id: 'write', description, kind: 'generation', dependencies: ['reason'], effect: 'local_files' }
  ] });
  await plan('Generate the first deliverable attempt.');
  await run('academic_task_step_start', { taskId, expectedRevision: await currentRevision(taskId), stepId: 'reason' });
  const prepared = await run('academic_reasoning_prepare', { taskId, expectedRevision: await currentRevision(taskId), stepId: 'reason', sourcePaths: [scan] });
  const shown = prepared.packet.sources.find((item: any) => item.sourceId === hit.sourceId);
  assert.ok(shown?.segments.some((item: any) => item.id === hit.segmentId), 'Reasoning must expose the exact OCR segment that search resolved.');
  const quote = shown.segments.find((item: any) => item.id === hit.segmentId).text.replace(/\s+/g, ' ').trim();
  const groundedResult = { answers: [{ questionId: 'q1', answerPlan: ['State the scanned relationship and explain the dependence.'], explanation: answerText, classification: 'theoretical', citations: [{ sourceId: hit.sourceId, segmentId: hit.segmentId, quotedText: quote.slice(0, 300) }] }], verificationNotes: ['This scripted host fixture tests provenance mechanics; it is not an autonomous AI completion or independent scientific review.'] };

  // Both current authorization and source bytes must be checked when OCR content is reconstructed from storage.
  const authorized = ctx.paths; ctx.paths = new AuthorizedPaths([working, finals], [ctx.config.stateDir]);
  try {
    assert.equal((await run('academic_search', { query: 'voltage', mode: 'fulltext' })).results.length, 0);
    await assert.rejects(run('academic_source_resolve', { sourceId: hit.sourceId, segmentId: hit.segmentId }), /authorized|revoked|stale|DENIED/i);
    await assert.rejects(run('academic_reasoning_get', { requestId: prepared.packet.requestId }), /authorized|revoked|stale|DENIED/i);
    await assert.rejects(run('academic_reasoning_commit', { requestId: prepared.packet.requestId, expectedRevision: await currentRevision(taskId), result: groundedResult }), /authorized|revoked|stale|changed|DENIED/i);
  } finally { ctx.paths = authorized; }
  await fs.appendFile(scan, '\n% Synthetic source-change regression\n');
  try {
    assert.equal((await run('academic_search', { query: 'voltage', mode: 'fulltext' })).results.length, 0);
    await assert.rejects(run('academic_source_resolve', { sourceId: hit.sourceId, segmentId: hit.segmentId }), /changed|stale/i);
    await assert.rejects(run('academic_reasoning_get', { requestId: prepared.packet.requestId }), /changed|stale/i);
    await assert.rejects(run('academic_reasoning_commit', { requestId: prepared.packet.requestId, expectedRevision: await currentRevision(taskId), result: groundedResult }), /changed|stale/i);
  } finally { await fs.writeFile(scan, original.buffer); }
  // Revocation purges derived OCR: reauthorization must not silently resurrect its former evidence.
  const restored = await extractDocument(ctx, scan, call); assert.notEqual(restored.sourceId, ocr.sourceId);
  const restoredOcr = await run('academic_pdf_ocr', { path: scan, page: 1, imagePath: path.join(working, 'recognized-after-authorization.png'), language: 'en-US', width: 1400, dryRun: false });
  await run('academic_index_build', { roots: [scan], dryRun: false });
  const restoredSearch = await run('academic_search', { query: 'voltage resistance', mode: 'fulltext' });
  assert.ok(restoredSearch.results.some((item: any) => item.sourceId === restoredOcr.sourceId && item.segmentId === restoredOcr.segmentId));
  const committedPrepared = await run('academic_reasoning_prepare', { taskId, expectedRevision: await currentRevision(taskId), stepId: 'reason', sourcePaths: [scan] });
  const committedSource = committedPrepared.packet.sources.find((item: any) => item.sourceId === restoredOcr.sourceId);
  const committedSegment = committedSource?.segments.find((item: any) => item.id === restoredOcr.segmentId); assert.ok(committedSegment);
  const committed = await run('academic_reasoning_commit', { requestId: committedPrepared.packet.requestId, expectedRevision: await currentRevision(taskId), result: {
    ...groundedResult, answers: [{ ...groundedResult.answers[0], citations: [{ sourceId: restoredOcr.sourceId, segmentId: restoredOcr.segmentId, quotedText: committedSegment.text.replace(/\s+/g, ' ').trim().slice(0, 300) }] }]
  } }); assert.equal(committed.provenanceVerified, true);
  assert.equal((await run('academic_reasoning_get', { requestId: committedPrepared.packet.requestId })).status, 'committed', 'A current valid OCR-cited answer must remain readable.');
  await run('academic_task_checkpoint', { taskId, expectedRevision: await currentRevision(taskId), stepId: 'reason', status: 'completed', summary: 'Committed the exact source-grounded fixture answer.' });

  const checkpoint = async (paths: string[]) => {
    await run('academic_task_step_start', { taskId, expectedRevision: await currentRevision(taskId), stepId: 'write' });
    await run('academic_task_checkpoint', { taskId, expectedRevision: await currentRevision(taskId), stepId: 'write', status: 'completed', summary: 'Checkpoint the actual generated fixture files.', artifacts: paths.map(file => ({ path: file, role: 'final' })) });
  };
  const reviews = async () => { for (const category of ['technical_accuracy', 'layout_review']) await run('academic_task_host_review', { taskId, expectedRevision: await currentRevision(taskId), category, status: 'passed', details: 'Explicit scripted fixture review of the current source/output bytes; host-reported and never treated as machine-proven scientific or visual correctness.' }); };
  const verifyBlocked = async () => { await reviews(); const result = await run('academic_task_verify', { taskId, expectedRevision: await currentRevision(taskId) }); assert.equal(result.readyToFinalize, false); await assert.rejects(run('academic_task_finalize', { taskId, expectedRevision: result.revision }), /block|verification/i); return result; };

  const wrongFormat = path.join(finals, 'answer.txt'); await fs.writeFile(wrongFormat, answerText); await checkpoint([wrongFormat]);
  const formatsBlocked = await verifyBlocked(); assert.match(formatsBlocked.verification.blocking.join(' '), /deliverable|format|docx|pdf|answer/i);
  assert.ok(formatsBlocked.verification.checks.some((check: any) => check.category === 'answer_artifact_coverage' && check.status === 'failed'));
  await plan('Generate DOCX, then verify the missing PDF is blocked.');
  const docx = path.join(finals, 'answer.docx'); await run('academic_document_compose', { path: docx, title: 'Voltage explanation', sections: [{ heading: 'Question 1', questionId: 'q1', paragraphs: [{ text: answerText }] }], references: [{ title: 'Scanned lecture', locator: 'page 1' }], dryRun: false });
  await checkpoint([docx]); const missingPdf = await verifyBlocked(); assert.match(missingPdf.verification.blocking.join(' '), /pdf|deliverable|format/i);
  assert.ok(missingPdf.verification.checks.some((check: any) => check.category === 'answer_artifact_coverage' && check.status === 'failed'));

  await plan('Reject a PDF that omits the committed answer even when all file formats exist.');
  const incompletePdf = path.join(finals, 'answer.pdf'); await run('academic_pdf_generate', { path: incompletePdf, title: 'Incomplete fixture report', sections: [{ heading: 'Question 1', paragraphs: [{ text: 'This generic paragraph never includes the committed explanation.' }] }], dryRun: false });
  await checkpoint([docx, incompletePdf]); const missingAnswer = await verifyBlocked(); assert.match(missingAnswer.verification.blocking.join(' '), /answer|content|coverage|q1/i);
  assert.ok(missingAnswer.verification.checks.some((check: any) => check.category === 'answer_artifact_coverage' && check.status === 'failed'));

  await plan('Generate a corrected new PDF and verify both real deliverables.');
  const corrected = path.join(finals, 'Corrected'); await fs.mkdir(corrected); const pdf = path.join(corrected, 'answer.pdf');
  await run('academic_pdf_generate', { path: pdf, title: 'Voltage explanation', sections: [{ heading: 'Question 1', paragraphs: [{ text: answerText }, { text: 'Source: scanned lecture, page 1.' }] }], dryRun: false });
  await checkpoint([docx, pdf]);
  for (const file of [docx, pdf]) { const quality = await run('academic_document_quality', { path: file, requiredText: ['voltage', 'resistance'], taskId }); assert.equal(quality.machineChecksPassed, true); }
  const page = await run('academic_document_page_view', { path: pdf, page: 1, width: 600 }); assert.ok(page instanceof ToolMediaResult); assert.equal(page.images[0].mimeType, 'image/png');
  await reviews(); const verified = await run('academic_task_verify', { taskId, expectedRevision: await currentRevision(taskId) }); assert.equal(verified.readyToFinalize, true, JSON.stringify(verified.verification));

  // A newly recognized version of the same PDF must invalidate citations even though its binary hash is unchanged.
  const updatedOcr = await run('academic_pdf_ocr', { path: scan, page: 1, imagePath: path.join(working, 'recognized-page-revised.png'), language: 'en-US', width: 1200, dryRun: false });
  assert.equal(updatedOcr.sourceSha256, original.sha256); assert.notEqual(updatedOcr.sourceId, restoredOcr.sourceId);
  await assert.rejects(run('academic_reasoning_get', { requestId: committedPrepared.packet.requestId }), /changed|stale|source/i);
  await assert.rejects(run('academic_task_finalize', { taskId, expectedRevision: verified.revision }), /citation|source|evidence|changed|verification|fresh/i);
  const staleCitations = await run('academic_task_verify', { taskId, expectedRevision: await currentRevision(taskId) }); assert.equal(staleCitations.readyToFinalize, false);
  assert.ok(staleCitations.verification.checks.some((check: any) => check.category === 'committed_citation_freshness' && check.status === 'failed'));
  await run('academic_index_build', { roots: [scan], dryRun: false });
  await assert.rejects(run('academic_reasoning_prepare', { taskId, expectedRevision: await currentRevision(taskId), sourcePaths: [scan] }), /source|changed|authorized/i);
  await run('academic_task_resume', { taskId, expectedRevision: await currentRevision(taskId), refreshSources: true });
  await plan('Revalidate the unchanged correct files against explicitly refreshed OCR evidence.');
  await run('academic_task_step_start', { taskId, expectedRevision: await currentRevision(taskId), stepId: 'reason' });
  const revised = await run('academic_reasoning_prepare', { taskId, expectedRevision: await currentRevision(taskId), stepId: 'reason', sourcePaths: [scan] });
  const revisedSource = revised.packet.sources.find((item: any) => item.sourceId === updatedOcr.sourceId);
  const revisedSegment = revisedSource?.segments.find((item: any) => item.id === updatedOcr.segmentId); assert.ok(revisedSegment);
  await run('academic_reasoning_commit', { requestId: revised.packet.requestId, expectedRevision: await currentRevision(taskId), result: {
    ...groundedResult, answers: [{ ...groundedResult.answers[0], citations: [{ sourceId: updatedOcr.sourceId, segmentId: updatedOcr.segmentId, quotedText: revisedSegment.text.replace(/\s+/g, ' ').trim().slice(0, 300) }] }]
  } });
  await run('academic_task_checkpoint', { taskId, expectedRevision: await currentRevision(taskId), stepId: 'reason', status: 'completed', summary: 'Recommitted the same explanation after explicit OCR-source refresh.' });
  await checkpoint([docx, pdf]);
  for (const file of [docx, pdf]) await run('academic_document_quality', { path: file, requiredText: ['voltage', 'resistance'], taskId });
  await reviews(); const currentVerification = await run('academic_task_verify', { taskId, expectedRevision: await currentRevision(taskId) }); assert.equal(currentVerification.readyToFinalize, true, JSON.stringify(currentVerification.verification));
  const final = await run('academic_task_finalize', { taskId, expectedRevision: currentVerification.revision }); assert.equal(final.status, 'completed'); assert.deepEqual(new Set(final.files.map((file: any) => path.extname(file.path))), new Set(['.docx', '.pdf']));
  assert.equal((await checkedFile(ctx, scan, call.signal)).sha256, original.sha256); assert.equal((await run('academic_reasoning_get', { requestId: revised.packet.requestId })).status, 'committed');
});
