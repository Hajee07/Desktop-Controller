import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSyntax, validateSyntax, quoteSpss } from '../src/spss/syntax.js';

const installed = ['DESCRIPTIVES', 'COMPUTE', 'VALUE LABELS', 'SPLIT FILE', 'GRAPH', 'T-TEST', 'BOOTSTRAP', 'CORRELATIONS'];

test('SPSS syntax lexer preserves decimals, quoted periods, doubled quotes and comments', () => {
  const text = "/* heading */ COMPUTE x=0.5.\nVALUE LABELS x 1 'Student''s answer. More'.\n* end comment.";
  assert.equal(splitSyntax(text).length, 2);
  assert.equal(validateSyntax(text, installed).commands[0].name, 'COMPUTE');
  assert.equal(quoteSpss("D:\\research\\student's.sav"), "'D:/research/student''s.sav'");
});

test('SPSS filesystem and programming escape commands are refused', () => {
  for (const syntax of [
    "HOST COMMAND=['whoami'].", "BEGIN PROGRAM Python3.\nprint(1)\nEND PROGRAM.",
    "DESCRIPTIVES x /SAVE.", "COMPUTE x=!macro.",
    "GRAPH /TEMPLATE='C:/outside.sgt' /HISTOGRAM=x.",
    "DESCRIPTIVES x.\nINSERT FILE='C:/outside.sps'."
  ]) assert.throws(() => validateSyntax(syntax, installed), /RESTRICTED|NOT_ALLOWED/);
  assert.throws(() => validateSyntax("VALUE LABELS x 1 'unterminated", installed), /INCOMPLETE/);
});

test('SPSS gateways require native group procedures while bootstrap may wrap another analysis', () => {
  assert.throws(() => validateSyntax('COMPUTE x=1.', installed, 'tests'), /GROUP_REQUIRED/);
  assert.throws(() => validateSyntax('DESCRIPTIVES x.', installed, 'tests'), /GROUP_MISMATCH/);
  assert.equal(validateSyntax('BOOTSTRAP /CRITERIA NSAMPLES=100.\nCORRELATIONS /VARIABLES=x y.', installed, 'bootstrap').commands.length, 2);
  assert.equal(validateSyntax('SPLIT FILE BY grp.', installed).commands[0].name, 'SPLIT FILE');
});
