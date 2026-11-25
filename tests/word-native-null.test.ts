import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('native Word adapter handles optional COM nulls and rejects missing required objects', {skip: process.platform !== 'win32'}, () => {
 const output=execFileSync('dotnet',['run','--project','tests/native/WordNullRegression/WordNullRegression.csproj','--configuration','Release','--no-launch-profile'],{encoding:'utf8',windowsHide:true,timeout:120000});
 assert.match(output,/Native Word null regression: 16 passed/);
});
