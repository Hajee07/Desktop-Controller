"""Fixed JSON-line bridge to IBM's bundled SpssClient. Never evaluates input as code."""
import json
import sys
import os
import SpssClient

document = None
document_path = None
SpssClient.StartClient()

def objects():
    items = document.GetOutputItems()
    result = []
    for index in range(min(items.Size(), 1000)):
        item = items.GetItemAt(index)
        result.append({'index': index, 'type': str(item.GetTypeString()),
                       'description': str(item.GetDescription())[:500],
                       'treeLevel': item.GetTreeLevel(), 'current': bool(item.IsCurrentItem()),
                       'selected': bool(item.IsSelected()), 'visible': bool(item.IsVisible())})
    return result

try:
    for line in sys.stdin:
        try:
            request = json.loads(line)
            op = request.get('operation')
            if op == 'status':
                outputs = SpssClient.GetOutputDocuments()
                result = {'version': SpssClient.GetSPSSVersion(),
                          'modules': {name: bool(SpssClient.IsOptionAvailable(getattr(SpssClient.LicenseOption, name)))
                                      for name in ('BASE', 'PRO_STATS', 'ADVANCED_STATS')},
                          'completeLicenseRegistry': 'Use spss_get_capabilities for the native SHOW LICENSE registry',
                          'outputDocuments': [{'path': outputs.GetItemAt(i).GetDocumentPath(),
                                               'title': outputs.GetItemAt(i).GetOutputUI().GetTitleText()}
                                              for i in range(min(outputs.Size(), 100))],
                          'dataDocumentCount': SpssClient.GetDataDocuments().Size(),
                          'syntaxDocumentCount': SpssClient.GetSyntaxDocuments().Size()}
            elif op == 'open':
                candidate = request['path']
                if not isinstance(candidate, str) or not candidate.lower().endswith('.spv'):
                    raise ValueError('SPSS_OUTPUT_PATH_INVALID')
                outputs = SpssClient.GetOutputDocuments()
                document = next((outputs.GetItemAt(i) for i in range(outputs.Size())
                                 if os.path.normcase(outputs.GetItemAt(i).GetDocumentPath()) == os.path.normcase(candidate)), None)
                if document is None:
                    document = SpssClient.OpenOutputDoc(candidate)
                document.GetOutputUI().SetVisible(True)
                document_path = candidate
                result = {'path': document_path, 'title': document.GetOutputUI().GetTitleText(),
                          'objects': objects()}
            elif op == 'list':
                if document is None: raise ValueError('SPSS_OUTPUT_NOT_OPEN')
                result = {'path': document_path, 'title': document.GetOutputUI().GetTitleText(),
                          'objects': objects()}
            elif op == 'select':
                if document is None: raise ValueError('SPSS_OUTPUT_NOT_OPEN')
                index = request['index']
                items = document.GetOutputItems()
                if not isinstance(index, int) or index < 0 or index >= items.Size():
                    raise ValueError('SPSS_OUTPUT_INDEX_INVALID')
                item = items.GetItemAt(index)
                item.SetSelected(True)
                item.SetCurrentItem()
                document.GetOutputUI().SetVisible(True)
                result = {'path': document_path, 'index': index,
                          'description': str(item.GetDescription()), 'type': str(item.GetTypeString()),
                          'current': bool(item.IsCurrentItem()), 'selected': bool(item.IsSelected()),
                          'viewerTitle': document.GetOutputUI().GetTitleText()}
            elif op == 'values':
                if document is None: raise ValueError('SPSS_OUTPUT_NOT_OPEN')
                index = request['index']
                items = document.GetOutputItems()
                if not isinstance(index, int) or index < 0 or index >= items.Size():
                    raise ValueError('SPSS_OUTPUT_INDEX_INVALID')
                item = items.GetItemAt(index)
                if item.GetType() != SpssClient.OutputItemType.PIVOT:
                    raise ValueError('SPSS_OUTPUT_VALUES_REQUIRE_TABLE')
                table = item.GetSpecificType()
                cells = table.DataCellArray()
                row_start = request.get('rowOffset', 0)
                column_start = request.get('columnOffset', 0)
                row_end = min(cells.GetNumRows(), row_start + request.get('maxRows', 50))
                column_end = min(cells.GetNumColumns(), column_start + request.get('maxColumns', 50))
                data = [[str(cells.GetValueAt(row, column)) for column in range(column_start, column_end)]
                        for row in range(row_start, row_end)]
                result = {'index': index, 'description': str(item.GetDescription()), 'rows': data,
                          'rowCount': cells.GetNumRows(), 'columnCount': cells.GetNumColumns(),
                          'rowOffset': row_start, 'columnOffset': column_start,
                          'values': [value for row in data for value in row],
                          'truncated': row_end < cells.GetNumRows() or column_end < cells.GetNumColumns()}
            elif op == 'export':
                if document is None: raise ValueError('SPSS_OUTPUT_NOT_OPEN')
                formats = {'pdf': SpssClient.DocExportFormat.SpssFormatPdf,
                           'doc': SpssClient.DocExportFormat.SpssFormatDoc,
                           'xlsx': SpssClient.DocExportFormat.SpssFormatXlsx,
                           'text': SpssClient.DocExportFormat.SpssFormatText}
                document.ExportDocument(SpssClient.SpssExportSubset.SpssAll, request['path'], formats[request['format']])
                result = {'exported': request['path']}
            elif op == 'chart':
                if document is None: raise ValueError('SPSS_OUTPUT_NOT_OPEN')
                item = document.GetOutputItems().GetItemAt(request['index'])
                if item.GetType() != SpssClient.OutputItemType.CHART: raise ValueError('SPSS_CHART_ITEM_REQUIRED')
                item.ExportToImage(request['path'], SpssClient.ChartExportFormat.png)
                result = {'exported': request['path'], 'description': str(item.GetDescription())}
            elif op == 'close':
                if document is None: raise ValueError('SPSS_OUTPUT_NOT_OPEN')
                if document.IsModified(): raise ValueError('SPSS_UNSAVED_OUTPUT: save or close this document manually')
                document.CloseDocument()
                document = None
                document_path = None
                result = {'closed': True}
            else: raise ValueError('SPSS_OPERATION_INVALID')
            print(json.dumps({'ok': True, 'result': result}), flush=True)
        except Exception as error:
            print(json.dumps({'ok': False, 'error': str(error)[:500]}), flush=True)
finally:
    SpssClient.StopClient()
