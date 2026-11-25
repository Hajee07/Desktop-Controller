"""Fixed page operations using existing pypdf; no network, GUI, credentials or AI."""
import base64,json,sys,contextlib
from pypdf import PdfReader,PdfWriter
request=json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
if request['action'] not in ('merge','split'):raise ValueError('Unsupported PDF operation')
with contextlib.ExitStack() as stack:
    readers=[PdfReader(stack.enter_context(open(p,'rb')),strict=True) for p in request['sources']]
    if any(r.is_encrypted for r in readers):raise ValueError('Encrypted PDFs are unsupported')
    count=sum(len(r.pages) for r in readers)
    if count>500:raise ValueError('PDF page operation limit is 500 pages')
    writer=PdfWriter()
    for reader in readers:
        pages=range(len(reader.pages)) if request['action']=='merge' else [n-1 for n in request['pages']]
        for n in pages:
            if n<0 or n>=len(reader.pages):raise ValueError('Page outside PDF')
            page=reader.pages[n]
            # Never carry active document actions into a generated review artifact.
            if '/AA' in page:del page['/AA']
            writer.add_page(page)
    with open(request['output'],'xb') as target:writer.write(target)
    with open(request['output'],'rb') as verify:
        generated=PdfReader(verify,strict=True)
        if len(generated.pages)!=len(writer.pages):raise ValueError('Generated PDF page count mismatch')
    print(json.dumps({'pages':len(writer.pages),'verifiedPageCount':True,'activeDocumentActionsCopied':False}))
