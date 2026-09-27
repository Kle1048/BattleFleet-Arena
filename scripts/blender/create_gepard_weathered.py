"""Opt-in weathering build; run in Blender after checking bridge availability."""
from pathlib import Path
ENABLE_WEATHERING=True
source=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\scripts\blender\create_gepard_asset.py')
exec(compile(source.read_text(encoding='utf-8'),str(source),'exec'))
