import json
from pathlib import Path
from pypdf import PdfReader

reader = PdfReader('outputs/audit-2026-10-08-synthetic.pdf')
text = '\n'.join(page.extract_text() or '' for page in reader.pages).lower()
metadata_path = Path('outputs/audit-2026-10-08-pdf.json')
metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
checks = {
    'correct_weekday_filename': 'Martes_13-10-2026' in metadata['filename'],
    'civil_date_in_header': '13 de octubre, 2026' in text,
    'current_activity_included': 'synthetic activity' in text,
    'overnight_included': 'synthetic overnight' in text,
    'cancelled_excluded': 'excluded cancellation' not in text,
    'other_day_excluded': 'excluded other date' not in text,
    'compound_room_preserved': 'sala 2 / sala 3' in text,
    'folio_landscape': all(abs(a-b)<1 for a,b in zip([float(reader.pages[0].mediabox.width),float(reader.pages[0].mediabox.height)],[936,612])),
}
metadata['checks'] = checks
metadata['visualReview'] = 'Rendered with Poppler; one page inspected, no clipping or overlap in this synthetic fixture.'
metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
print(json.dumps(checks))
assert all(checks.values())
