import fs from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { AppContext } from '../server/types.js';
import { discoverInstallation, SpssConnection } from './connection.js';
import { procedureGroups } from './syntax.js';

export async function extensions(ctx: AppContext) {
  const installation = await discoverInstallation(ctx);
  const roots = [path.join(installation.directory, 'extensions'), path.join(installation.directory, 'syntax_xml'),
    path.join(process.env.LOCALAPPDATA ?? '', 'IBM', 'SPSS', 'Statistics', '27', 'extensions')];
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
  const result: { name: string; language: string; version: string | null; definition: string }[] = [];
  for (const root of roots) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.slice(0, 2000)) {
      if (!entry.isFile() || !entry.name.endsWith('.xml')) continue;
      const filename = path.join(root, entry.name);
      const stat = await fs.lstat(filename);
      if (stat.isSymbolicLink() || stat.size > 1_000_000) continue;
      const document = parser.parse(await fs.readFile(filename, 'utf8'));
      const command = document.Command;
      if (command?.['@_Name'] && command['@_Language'] && command['@_Language'] !== 'Syntax') {
        result.push({ name: command['@_Name'], language: command['@_Language'], version: command['@_Version'] ?? null, definition: filename });
      }
    }
  }
  const nativeRoot = path.join(installation.directory, 'ext', 'lib');
  for (const entry of await fs.readdir(nativeRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const definition = path.join(nativeRoot, entry.name, 'extension.xml');
    const info = await fs.lstat(definition).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink() || info.size > 1_000_000) continue;
    const document = parser.parse(await fs.readFile(definition, 'utf8'));
    const details = document.Extension?.ExtensionDetails;
    if (details?.['@_label']) result.push({ name: details['@_label'], version: details['@_version'] ?? null, language: 'native', definition });
  }
  return result;
}

const licenseNames: Record<string, string> = {
  BASE: 'IBM SPSS Statistics Base', PRO_STATS: 'IBM SPSS Regression', ADVANCED_STATS: 'IBM SPSS Advanced Statistics',
  TRENDS: 'IBM SPSS Forecasting', TREEVIEW: 'IBM SPSS Decision Trees', NEURAL_NETWORK: 'IBM SPSS Neural Networks',
  BOOTSTRAPPING: 'IBM SPSS Bootstrapping', COMPLEX_SAMPLE: 'IBM SPSS Complex Samples', MISSING_VALUES: 'IBM SPSS Missing Values',
  MARKET_RESEARCH: 'IBM SPSS Categories', CUSTOM_TABLES: 'IBM SPSS Custom Tables', CYTEL: 'IBM SPSS Exact Tests',
  CONJOINT: 'IBM SPSS Conjoint', VALIDATEDATA: 'IBM SPSS Data Preparation', RFM: 'IBM SPSS Direct Marketing'
};

export async function capabilities(ctx: AppContext, connection: SpssConnection, session: string, signal: AbortSignal) {
  const installation = await discoverInstallation(ctx);
  const directory = await fs.mkdtemp(path.join(ctx.config.stateDir, 'spss-license-'));
  let license;
  try { license = await connection.call(session, { operation: 'license', directory }, signal); }
  finally {
    await fs.unlink(path.join(directory, 'output.spv')).catch(() => {});
    await fs.unlink(path.join(directory, 'output.xml')).catch(() => {});
    await fs.rmdir(directory).catch(() => {});
  }
  const table = license.output.items.find((item: any) => item.subType === 'License');
  if (!table) throw new Error('SPSS_LICENSE_QUERY_FAILED: no license table was returned');
  const categoryNames: string[] = table.cells.filter((cell: any) => cell.kind === 'category' && cell.coordinates?.length === 1 && cell.coordinates[0].axis === 'row').map((cell: any) => cell.text);
  const names = { ...licenseNames };
  for (const name of categoryNames) {
    if (!Object.values(names).includes(name)) names[name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')] = name;
  }
  const moduleList = Object.entries(names).map(([id, name]) => {
    const expiration = table.cells.find((cell: any) => cell.kind === 'cell' && cell.date && cell.coordinates?.some((coordinate: any) => coordinate.text === name))?.date ?? null;
    const expired = expiration !== null && new Date(expiration).getTime() < Date.now();
    return {
      id, name, status: categoryNames.includes(name) && !expired ? 'AVAILABLE' : 'LICENSE_REQUIRED', expiration,
      evidence: 'Native SHOW LICENSE output and reported expiration date', requiredLicense: name
    };
  });
  const procedures = Object.entries(procedureGroups).map(([name, group]) => ({
    name, requiredModule: group.module, requiredLicense: licenseNames[group.module], integrationMethod: 'SPSS 27 syntax / Python bridge',
    commands: group.commands.filter(command => installation.commands.includes(command)),
    status: moduleList.find(module => module.id === group.module)?.status === 'AVAILABLE' ? 'AVAILABLE_WITH_LIMITATIONS' : 'LICENSE_REQUIRED',
    limitations: 'Installed definitions and license are detected. Individual syntax and data assumptions are verified at execution. Filesystem subcommands use dedicated file tools.'
  }));
  const rRoots = [path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'R'), path.join(installation.directory, 'R')];
  const rInstallations: string[] = [];
  for (const root of rRoots) {
    for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const executable = path.join(root, entry.name, 'bin', 'R.exe');
      if ((await fs.stat(executable).catch(() => null))?.isFile()) rInstallations.push(executable);
    }
  }
  return { version: installation.version, modules: moduleList, procedures,
    python: { status: 'AVAILABLE_WITH_LIMITATIONS', integrationMethod: 'bundled Python 3.8', limitations: 'Numerical expressions and native dataset APIs. Arbitrary Python programs require a separate reviewed execution integration.' },
    r: { status: rInstallations.length ? 'NOT_SUPPORTED' : 'DEPENDENCY_MISSING', runtimeCandidates: rInstallations,
      evidence: 'Checked standard local R and SPSS R installation directories. A live SPSS R execution bridge has not been verified.' },
    extensions: await extensions(ctx) };
}
