"""JSON-line protocol for one owned SPSS 27 backend. Compatible with Python 3.8."""
import ast
import contextlib
import io
import json
import math
import os
import sys
import uuid
import xml.etree.ElementTree as ET

import spss

PROTOCOL = sys.stdout
MAXIMUM_OUTPUT = 64 * 1024 * 1024
state = {'datasets': {}, 'active': None, 'revision': 0, 'history': [], 'unicode': True}
root = sys.argv[1]
state_file = os.path.join(root, 'state.json')


def quote(value):
    return "'" + value.replace('\\', '/').replace("'", "''") + "'"


def submit(syntax):
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
        spss.Submit(syntax)
    level = spss.GetLastErrorLevel()
    message = spss.GetLastErrorMessage() if level else None
    if level >= 3:
        raise ValueError('SPSS_COMMAND_ERROR: ' + str(message)[:1000])
    return {'errorLevel': level, 'message': message}


def persist():
    temporary = state_file + '.tmp'
    with open(temporary, 'w', encoding='utf-8') as target:
        json.dump(state, target, allow_nan=False)
    os.replace(temporary, state_file)


def checkpoint():
    if state['active']:
        filename = uuid.uuid4().hex + '.sav'
        submit('EXECUTE.\nSAVE OUTFILE=' + quote(os.path.join(root, filename)) + ' /COMPRESSED.')
        state['datasets'][state['active']]['checkpoint'] = filename
    state['revision'] += 1
    persist()


def activate(name):
    if name not in state['datasets']:
        raise ValueError('SPSS_DATASET_NOT_FOUND')
    submit('DATASET ACTIVATE ' + name + '.')
    state['active'] = name


def metadata(offset=0, limit=100):
    if not state['active']:
        raise ValueError('SPSS_NO_ACTIVE_DATASET')
    count = spss.GetVariableCount()
    variables = []
    for index in range(offset, min(count, offset + limit)):
        variables.append({'index': index, 'name': spss.GetVariableName(index),
                          'label': spss.GetVariableLabel(index), 'type': spss.GetVariableType(index),
                          'format': spss.GetVariableFormat(index),
                          'measurement': spss.GetVariableMeasurementLevel(index),
                          'role': spss.GetVariableRole(index), 'missingValues': spss.GetVarMissingValues(index),
                          'attributes': {key: spss.GetVarAttributes(index, key) for key in spss.GetVarAttributeNames(index)}})
    spss.StartDataStep()
    try:
        dataset = spss.Dataset()
        for variable in variables:
            labels = dataset.varlist[variable['index']].valueLabels.data
            variable['valueLabels'] = list(labels.items())[:100]
            variable['valueLabelsTruncated'] = len(labels) > 100
    finally:
        spss.EndDataStep()
    return {'dataset': state['active'], 'caseCount': spss.GetCaseCount(), 'variableCount': count,
            'variables': variables, 'nextOffset': offset + limit if offset + limit < count else None,
            'revision': state['revision'], 'weightVariable': spss.GetWeightVar(),
            'splitVariables': spss.GetSplitVariableNames(), 'multipleResponseSets': spss.GetMultiResponseSetNames()}


def local_tag(element):
    return element.tag.split('}')[-1]


def read_output(filename, offset=0, limit=20):
    if os.path.getsize(filename) > MAXIMUM_OUTPUT:
        raise ValueError('SPSS_OUTPUT_LIMIT')
    document = ET.parse(filename)
    items = []
    for element in document.iter():
        tag = local_tag(element)
        if tag in ('pivotTable', 'chart', 'textBlock'):
            items.append(element)
    result = []
    for index in range(offset, min(len(items), offset + limit)):
        element = items[index]
        parents = {child: parent for parent in element.iter() for child in parent}
        cells = []
        for child in element.iter():
            if local_tag(child) in ('cell', 'category', 'dimension', 'footnote', 'text', 'line'):
                text = child.attrib.get('text') or child.attrib.get('label') or (child.text or '').strip()
                labels = []
                parent = parents.get(child)
                while parent is not None and parent is not element:
                    if local_tag(parent) in ('dimension', 'category', 'group'):
                        labels.append(dict(parent.attrib))
                    parent = parents.get(parent)
                cells.append({'kind': local_tag(child), **child.attrib, 'text': text[:2000], 'coordinates': list(reversed(labels))})
                if len(cells) >= 2000:
                    break
        result.append({'index': index, 'kind': local_tag(element), **element.attrib,
                       'cells': cells, 'truncated': len(cells) >= 2000})
    return {'items': result, 'totalItems': len(items),
            'nextOffset': offset + limit if offset + limit < len(items) else None}


def capture(syntax, directory, formats=None):
    spv = os.path.join(directory, 'output.spv')
    xml = os.path.join(directory, 'output.xml')
    submit('OMS /DESTINATION FORMAT=SPV OUTFILE=' + quote(spv) + " VIEWER=NO /TAG='MCP_SPV'.")
    submit('OMS /DESTINATION FORMAT=OXML OUTFILE=' + quote(xml) + " IMAGES=NO VIEWER=NO /TAG='MCP_XML'.")
    tags = ['MCP_SPV', 'MCP_XML']
    for index, output_format in enumerate(formats or []):
        tag = 'MCP_EXPORT' + str(index)
        submit('OMS /DESTINATION FORMAT=' + output_format.upper() + ' OUTFILE=' + quote(os.path.join(directory, 'output.' + output_format)) + " VIEWER=NO /TAG='" + tag + "'.")
        tags.append(tag)
    failure = None
    try:
        warning = submit(syntax)
        if state['active']:
            submit('EXECUTE.')
            submit('DISPLAY NAMES.')
    except Exception as error:
        failure = error
    finally:
        submit('OMSEND TAG=[' + ' '.join(quote(tag) for tag in tags) + '].')
    if failure:
        messages = []
        if os.path.exists(xml) and os.path.getsize(xml) < MAXIMUM_OUTPUT:
            try:
                messages = [(element.text or '').strip() for element in ET.parse(xml).iter()
                            if local_tag(element) == 'line' and (element.text or '').strip()]
            except ET.ParseError:
                pass
        raise ValueError('SPSS_COMMAND_ERROR: ' + str(failure) + ' ' + ' '.join(messages)[-1200:])
    return {'warning': warning, 'output': read_output(xml)}


def python_expression(expression):
    tree = ast.parse(expression, mode='eval')
    allowed = (ast.Expression, ast.Constant, ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare,
               ast.Name, ast.Load, ast.Call, ast.List, ast.Tuple, ast.Add, ast.Sub,
               ast.Mult, ast.Div, ast.Mod, ast.USub, ast.UAdd, ast.And, ast.Or, ast.Not,
               ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.IfExp)
    functions = {'abs': abs, 'sum': sum, 'min': min, 'max': max, 'round': round,
                 'sqrt': math.sqrt, 'log': math.log, 'exp': math.exp,
                 'case_count': spss.GetCaseCount, 'variable_count': spss.GetVariableCount}
    if len(list(ast.walk(tree))) > 500:
        raise ValueError('PYTHON_EXPRESSION_TOO_LARGE')
    for node in ast.walk(tree):
        if not isinstance(node, allowed):
            raise ValueError('PYTHON_EXPRESSION_UNSUPPORTED: ' + type(node).__name__)
        if isinstance(node, ast.Name) and node.id not in functions:
            raise ValueError('PYTHON_NAME_NOT_ALLOWED')
        if isinstance(node, ast.Call) and (not isinstance(node.func, ast.Name) or node.func.id not in functions):
            raise ValueError('PYTHON_CALL_NOT_ALLOWED')
        if isinstance(node, ast.Constant) and (not isinstance(node.value, (float, int, bool, type(None))) or isinstance(node.value, int) and abs(node.value) > 1e100):
            raise ValueError('PYTHON_CONSTANT_NOT_ALLOWED')
        if isinstance(node, (ast.List, ast.Tuple)) and any(not isinstance(part, ast.Constant) for part in node.elts):
            raise ValueError('PYTHON_NESTED_CONTAINERS_NOT_ALLOWED')
        if isinstance(node, ast.Call) and node.func.id in ('min', 'max') and len(node.args) > 1 and any(isinstance(part, (ast.List, ast.Tuple)) for part in node.args):
            raise ValueError('PYTHON_CONTAINER_ARGUMENT_NOT_ALLOWED')
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mult, ast.Add, ast.Sub, ast.Div, ast.Mod)) and any(isinstance(part, (ast.List, ast.Tuple)) for part in (node.left, node.right)):
            raise ValueError('PYTHON_CONTAINER_ARITHMETIC_NOT_ALLOWED')
    return eval(compile(tree, '<MCP numerical expression>', 'eval'), {'__builtins__': {}}, functions)


def dispatch(request):
    operation = request['operation']
    if operation == 'status':
        return {'pid': os.getpid(), 'backendReady': spss.IsBackendReady(), **state}
    if operation == 'environment':
        return {'pythonVersion': sys.version.split()[0], 'pluginVersion': spss.GetDefaultPlugInVersion(),
                'backendReady': spss.IsBackendReady(), 'spssVersion': spss.version.version}
    if operation == 'output':
        return read_output(request['path'], request.get('offset', 0), request.get('limit', 20))
    if operation == 'history':
        return {'history': state['history'][-request.get('limit', 50):]}
    if operation == 'metadata':
        if request.get('dataset'):
            activate(request['dataset'])
        return metadata(request.get('offset', 0), request.get('limit', 100))
    if operation == 'preview':
        if request.get('dataset'):
            activate(request['dataset'])
        indexes = list(range(min(spss.GetVariableCount(), 100)))
        cursor = spss.Cursor(indexes)
        try:
            offset = request.get('offset', 0)
            for _ in range(offset):
                if cursor.fetchone() is None:
                    break
            rows = []
            for _ in range(request.get('limit', 20)):
                row = cursor.fetchone()
                if row is None:
                    break
                rows.append(row)
            return {'dataset': state['active'], 'rows': rows, 'offset': offset,
                    'columns': [spss.GetVariableName(i) for i in indexes], 'columnsTruncated': spss.GetVariableCount() > 100}
        finally:
            cursor.close()
    if operation == 'python':
        result = python_expression(request['expression'])
        if callable(result):
            raise ValueError('PYTHON_RESULT_MUST_BE_A_VALUE')
        return {'result': result, 'pythonVersion': sys.version.split()[0]}
    if operation == 'create':
        name = request['dataset']
        if name in state['datasets']:
            raise ValueError('SPSS_DATASET_NAME_EXISTS')
        spss.StartDataStep()
        try:
            dataset = spss.Dataset(name=None)
            for variable in request['variables']:
                dataset.varlist.append(variable['name'], variable['width'])
            for row in request['rows']:
                dataset.cases.append(row)
            generated_name = dataset.name
        finally:
            spss.EndDataStep()
        submit('DATASET ACTIVATE ' + generated_name + '.')
        submit('DATASET NAME ' + name + '.')
        state['datasets'][name] = {'source': None}
        state['active'] = name
        checkpoint()
        return metadata()
    if operation in ('copy', 'rename'):
        activate(request['dataset'])
        name = request['name']
        if name in state['datasets']:
            raise ValueError('SPSS_DATASET_NAME_EXISTS')
        submit(('DATASET COPY ' if operation == 'copy' else 'DATASET NAME ') + name + '.')
        state['datasets'][name] = dict(state['datasets'][request['dataset']])
        if operation == 'rename':
            del state['datasets'][request['dataset']]
        state['active'] = name
        activate(name)
        checkpoint()
        return metadata()
    if operation == 'close':
        name = request['dataset']
        if name not in state['datasets']:
            raise ValueError('SPSS_DATASET_NOT_FOUND')
        submit('DATASET CLOSE ' + name + '.')
        del state['datasets'][name]
        state['active'] = next(iter(state['datasets']), None)
        if state['active']:
            activate(state['active'])
        persist()
        return {'closed': name, 'active': state['active']}
    if operation == 'open':
        name = request['dataset']
        if name in state['datasets']:
            raise ValueError('SPSS_DATASET_NAME_EXISTS')
        submit(request['syntax'])
        submit('DATASET NAME ' + name + '.')
        state['datasets'][name] = {'source': request.get('source')}
        state['active'] = name
        checkpoint()
        return metadata()
    if operation == 'activate':
        activate(request['dataset'])
        persist()
        return metadata()
    if operation == 'save':
        activate(request['dataset'])
        capture(request['syntax'], os.path.dirname(request['destination']))
        return {'saved': request['destination'], 'dataset': state['active']}
    if operation == 'execute':
        if request.get('expectedRevision') != state['revision']:
            raise ValueError('SPSS_STALE_REVISION: inspect session before editing')
        if request.get('dataset'):
            activate(request['dataset'])
        prior = None
        if state['active']:
            prior = state['datasets'][state['active']].get('checkpoint')
        try:
            result = capture(request['syntax'], request['directory'], request.get('formats'))
            if state['active']:
                checkpoint()
            entry = {'id': request['executionId'], 'status': 'COMPLETED', 'revision': state['revision']}
            state['history'].append(entry)
            state['history'] = state['history'][-500:]
            persist()
            return {**result, **entry}
        except Exception:
            if prior:
                name = state['active']
                submit('GET FILE=' + quote(os.path.join(root, prior)) + '.')
                submit('DATASET NAME ' + name + ' WINDOW=HIDDEN.')
            state['history'].append({'id': request['executionId'], 'status': 'FAILED'})
            persist()
            raise
    if operation == 'license':
        return capture('SHOW LICENSE.', request['directory'])
    if operation == 'stop':
        return {'stopped': True}
    raise ValueError('SPSS_OPERATION_NOT_SUPPORTED')


def normalize(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {str(key): normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize(item) for item in value]
    return value


try:
    spss.StartSPSS()
    if os.path.exists(state_file):
        with open(state_file, encoding='utf-8') as source:
            state = json.load(source)
        active = state['active']
        for name, info in state['datasets'].items():
            filename = os.path.join(root, info['checkpoint'])
            if os.path.dirname(os.path.realpath(filename)) != os.path.realpath(root):
                raise ValueError('SPSS_UNSAFE_CHECKPOINT')
            submit('GET FILE=' + quote(filename) + '.')
            submit('DATASET NAME ' + name + '.')
        if active:
            activate(active)
    else:
        persist()
    for line in sys.stdin:
        request = json.loads(line)
        try:
            result = dispatch(request)
            response = {'id': request['id'], 'ok': True, 'result': normalize(result)}
        except Exception as error:
            response = {'id': request['id'], 'ok': False, 'error': str(error)[:1500]}
        PROTOCOL.write('MCP_SPSS:' + json.dumps(response, allow_nan=False) + '\n')
        PROTOCOL.flush()
        if request['operation'] == 'stop':
            break
finally:
    spss.StopSPSS()
