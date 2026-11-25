"""Run fixed procedures in a separate IBM SPSS Statistics backend session."""
import json
import re
import sys

import spss


def quoted_path(value):
    if any(ord(char) < 32 for char in value):
        raise ValueError('SPSS_INVALID_PATH')
    return "'" + value.replace('\\', '/').replace("'", "''") + "'"


def submit(command):
    spss.Submit(command)
    if spss.GetLastErrorLevel() >= 3:
        raise RuntimeError('SPSS_COMMAND_FAILED: ' + spss.GetLastErrorMessage())


def run(request):
    submit('GET FILE=' + quoted_path(request['source']) + '.')
    count = spss.GetVariableCount()
    if request['action'] == 'inspect':
        offset = request['offset']
        stop = min(count, offset + request['limit'])
        variables = [
            {'name': spss.GetVariableName(i), 'label': spss.GetVariableLabel(i)[:256],
             'type': 'numeric' if spss.GetVariableType(i) == 0 else 'string'}
            for i in range(offset, stop)
        ]
        return {'caseCount': spss.GetCaseCount(), 'variableCount': count, 'variables': variables,
                'nextOffset': stop if stop < count else None}

    names = request['variables']
    dictionary = {spss.GetVariableName(i).lower(): spss.GetVariableType(i) for i in range(count)}
    procedure = request['procedure']
    dependent = request.get('dependent')
    for name in names + ([dependent] if dependent else []):
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}', name) or name.lower() not in dictionary:
            raise ValueError('SPSS_VARIABLE_NOT_AVAILABLE: ' + name)
        if procedure != 'frequencies' and dictionary[name.lower()] != 0:
            raise ValueError('SPSS_NUMERIC_VARIABLE_REQUIRED: ' + name)
    variables = ' '.join(names)
    if procedure == 'descriptives':
        command = 'DESCRIPTIVES VARIABLES=' + variables + ' /STATISTICS=MEAN STDDEV MIN MAX.'
    elif procedure == 'frequencies':
        command = 'FREQUENCIES VARIABLES=' + variables + '.'
    elif procedure == 'correlation':
        command = 'CORRELATIONS /VARIABLES=' + variables + ' /PRINT=TWOTAIL /MISSING=PAIRWISE.'
    elif procedure == 'reliability':
        command = 'RELIABILITY /VARIABLES=' + variables + " /SCALE('Scale')=ALL /MODEL=ALPHA."
    elif procedure == 'regression':
        command = ('REGRESSION /MISSING LISTWISE /STATISTICS COEFF R ANOVA CI(95)'
                   ' /DEPENDENT ' + dependent + ' /METHOD=ENTER ' + variables + '.')
    else:
        raise ValueError('SPSS_UNSUPPORTED_PROCEDURE')

    submit('OMS /DESTINATION FORMAT=SPV OUTFILE=' + quoted_path(request['destination']) + ' VIEWER=NO.')
    submit(command)
    warning = spss.GetLastErrorMessage() if spss.GetLastErrorLevel() else None
    submit('OMSEND.')
    return {'caseCount': spss.GetCaseCount(), 'warning': warning}


if __name__ == '__main__':
    try:
        spss.StartSPSS()
        try:
            result = run(json.loads(sys.argv[1]))
        finally:
            spss.StopSPSS()
        print('MCP_SPSS_RESULT:' + json.dumps(result))
    except Exception as error:
        print('MCP_SPSS_RESULT:' + json.dumps({'error': str(error)[:600]}))
        sys.exit(1)
