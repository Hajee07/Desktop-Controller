// Native procedure and transformation commands that do not perform arbitrary I/O.
export const procedureGroups: Record<string, { module: string; commands: string[] }> = {
  descriptive: { module: 'BASE', commands: ['FREQUENCIES', 'DESCRIPTIVES', 'EXAMINE', 'CROSSTABS', 'MEANS', 'SUMMARIZE', 'RATIO'] },
  tests: { module: 'BASE', commands: ['T-TEST', 'ONEWAY', 'NPAR TESTS', 'NPTESTS', 'CROSSTABS'] },
  correlation: { module: 'BASE', commands: ['CORRELATIONS', 'NONPAR CORR', 'PARTIAL CORR'] },
  regression: { module: 'PRO_STATS', commands: ['REGRESSION', 'LOGISTIC REGRESSION', 'NOMREG', 'PLUM', 'NLR', 'CNLR', 'WLS', '2SLS'] },
  anova: { module: 'ADVANCED_STATS', commands: ['ONEWAY', 'UNIANOVA', 'GLM', 'MANOVA', 'GENLIN', 'GENLINMIXED', 'MIXED', 'VARCOMP'] },
  factor: { module: 'BASE', commands: ['FACTOR', 'RELIABILITY'] },
  cluster: { module: 'BASE', commands: ['CLUSTER', 'QUICK CLUSTER', 'TWOSTEP CLUSTER', 'DISCRIMINANT', 'PROXIMITIES', 'KNN'] },
  survival: { module: 'ADVANCED_STATS', commands: ['KM', 'COXREG', 'SURVIVAL', 'LOGLINEAR', 'GENLOG', 'HILOGLINEAR'] },
  forecasting: { module: 'TRENDS', commands: ['ACF', 'PACF', 'ARIMA', 'EXSMOOTH', 'TSMODEL', 'TSPLOT', 'SPECTRA', 'SEASON', 'DATE'] },
  decision_tree: { module: 'TREEVIEW', commands: ['TREE'] },
  neural_network: { module: 'NEURAL_NETWORK', commands: ['MLP', 'RBF'] },
  bootstrap: { module: 'BOOTSTRAPPING', commands: ['BOOTSTRAP'] },
  power: { module: 'BASE', commands: ['POWER MEANS ONESAMPLE', 'POWER MEANS INDEPENDENT', 'POWER MEANS RELATED', 'POWER ONEWAY ANOVA', 'POWER PROPORTIONS ONESAMPLE', 'POWER PROPORTIONS INDEPENDENT', 'POWER PROPORTIONS RELATED', 'POWER PEARSON ONESAMPLE', 'POWER SPEARMAN ONESAMPLE', 'POWER PARTIALCORR'] },
  complex_samples: { module: 'COMPLEX_SAMPLE', commands: ['CSDESCRIPTIVES', 'CSTABULATE', 'CSGLM', 'CSLOGISTIC', 'CSORDINAL', 'CSCOXREG'] },
  missing_values: { module: 'MISSING_VALUES', commands: ['MVA', 'MULTIPLE IMPUTATION', 'MI ANALYZE'] },
  categories: { module: 'MARKET_RESEARCH', commands: ['CATPCA', 'CATREG', 'CORRESPONDENCE', 'OVERALS', 'HOMALS', 'ANACOR', 'ALSCALE', 'PREFSCAL', 'PROXSCAL'] },
  tables: { module: 'CUSTOM_TABLES', commands: ['CTABLES'] },
  chart: { module: 'BASE', commands: ['GRAPH', 'PPLOT', 'ROC', 'ROC ANALYSIS', 'CASEPLOT'] }
};
const transforms = ['COMPUTE', 'RECODE', 'AUTORECODE', 'COUNT', 'RANK', 'IF', 'DO IF', 'ELSE IF', 'ELSE', 'END IF', 'DO REPEAT', 'END REPEAT', 'EXECUTE', 'SORT CASES', 'SELECT IF', 'FILTER', 'WEIGHT', 'SPLIT FILE', 'MATCH FILES', 'ADD FILES', 'AGGREGATE', 'VARSTOCASES', 'CASESTOVARS', 'FLIP', 'RENAME VARIABLES', 'DELETE VARIABLES', 'STRING', 'NUMERIC', 'ALTER TYPE', 'FORMATS', 'VARIABLE LABELS', 'VALUE LABELS', 'ADD VALUE LABELS', 'VARIABLE LEVEL', 'VARIABLE ROLE', 'VARIABLE ATTRIBUTE', 'DATAFILE ATTRIBUTE', 'MISSING VALUES', 'MRSETS', 'SAMPLE', 'VECTOR', 'LOOP', 'END LOOP', 'BREAK', 'LEAVE', 'TEMPORARY'];
const safe = new Set([...transforms, ...Object.values(procedureGroups).flatMap(group => group.commands)]);

export function splitSyntax(syntax: string): string[] {
  if (syntax.length > 100000 || /[\x00-\x08\x0b\x0c]/.test(syntax)) throw new Error('SPSS_SYNTAX_LIMIT');
  const commands: string[] = [];
  let current = '', quote = '', comment = false;
  for (let index = 0; index < syntax.length; index++) {
    const value = syntax[index], next = syntax[index + 1];
    if (comment) { if (value === '*' && next === '/') { comment = false; index++; } continue; }
    if (quote) {
      current += value;
      if (value === quote) { if (next === quote) { current += next; index++; } else quote = ''; }
      continue;
    }
    if (value === '/' && next === '*') { comment = true; index++; continue; }
    if (value === '"' || value === "'") { quote = value; current += value; continue; }
    if (value === '!') throw new Error('SPSS_MACROS_NOT_ALLOWED');
    if (value === '.' && (!next || /\s/.test(next))) {
      if (current.trim() && !current.trim().startsWith('*')) commands.push(current.trim() + '.');
      current = '';
    } else current += value;
  }
  if (quote || comment || current.trim()) throw new Error('SPSS_SYNTAX_INCOMPLETE: complete commands must end with a period');
  if (!commands.length || commands.length > 200) throw new Error('SPSS_COMMAND_COUNT_LIMIT');
  return commands;
}

export function validateSyntax(syntax: string, installed: string[], group?: string) {
  const definitions = [...safe].sort((a, b) => b.length - a.length);
  const parsed = splitSyntax(syntax).map(command => {
    const upper = command.toUpperCase();
    const name = definitions.find(candidate => upper.startsWith(candidate) && /[\s/.]/.test(upper[candidate.length] ?? '.'));
    if (!name) throw new Error('SPSS_COMMAND_RESTRICTED: use dedicated file tools or a supported native procedure');
    const unquoted = command.slice(name.length).replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, '');
    const references = name === 'AGGREGATE' ? unquoted.replace(/\/OUTFILE\s*=\s*\*(?=\s|\/|\.)/gi, '') : unquoted;
    if (/\b(?:FILE|OUTFILE|INFILE|PLAN|MODELFILE|MATRIX|SAVE|EXPORT|XMLWORKSPACE|DATASET|CONNECT|PASSWORD|WRITE|READ|TEMPLATE|VIZTEMPLATE|ORIGIN)\b/i.test(references)) throw new Error('SPSS_EXTERNAL_REFERENCE_RESTRICTED: use dedicated import/export tools');
    if (/['"][^'"\r\n]*(?:[A-Za-z]:[\\/]|\\\\|https?:\/\/)/i.test(command)) throw new Error('SPSS_EXTERNAL_PATH_RESTRICTED');
    if (!installed.includes(name)) throw new Error(`SPSS_COMMAND_NOT_INSTALLED: ${name}`);
    if (group && group !== 'bootstrap' && !procedureGroups[group]?.commands.includes(name) && !transforms.includes(name)) throw new Error(`SPSS_PROCEDURE_GROUP_MISMATCH: ${name}`);
    return { name, syntax: command };
  });
  if (group && !parsed.some(command => procedureGroups[group]?.commands.includes(command.name))) throw new Error('SPSS_PROCEDURE_GROUP_REQUIRED');
  return { commands: parsed, syntax: parsed.map(command => command.syntax).join('\n'), validation: 'policy and installed command definitions; native errors are returned during execution' };
}

export function quoteSpss(value: string) { return "'" + value.replace(/\\/g, '/').replace(/'/g, "''") + "'"; }
