"""Generate the ignored browser configuration from CROW_MAPS_KEY."""
import json
import os
from pathlib import Path

key = os.environ.get('CROW_MAPS_KEY', '').strip()
if not key or key == 'YOUR_GOOGLE_MAPS_BROWSER_KEY':
    raise SystemExit('Set CROW_MAPS_KEY to your restricted Google Maps browser key.')
config = Path(__file__).resolve().parents[1] / 'dist' / 'config.js'
config.write_text('window.CROW_MAPS_KEY = ' + json.dumps(key) + ';\n')
print('Configured ' + str(config) + ' (ignored by Git).')
