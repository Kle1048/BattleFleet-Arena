"""Check requested plan-view changes without changing the accepted sheer line."""
import ast,json
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=root/'assets/blender/gepard'
def stations(path):
    tree=ast.parse(path.read_text(encoding='utf-8'))
    return next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign)
                and any(isinstance(t,ast.Name) and t.id=='stations' for t in n.targets))
old=stations(out/'backup/topview-v1/create_gepard_asset.py')
new=stations(root/'scripts/blender/create_gepard_asset.py')
def interp(rows,z,index):
    for a,b in zip(rows,rows[1:]):
        if a[0]<=z<=b[0]:return a[index]+(b[index]-a[index])*(z-a[0])/(b[0]-a[0])
    raise ValueError(z)
max_sheer_error=max(abs(interp(old,z/10,2)-interp(new,z/10,2)) for z in range(-288,289))
assert max_sheer_error<1e-8,max_sheer_error
bow={str(z):{'old_half_beam':interp(old,z,1),'new_half_beam':interp(new,z,1)} for z in (18,22,25,27,28.8)}
assert all(p['new_half_beam']>p['old_half_beam'] for p in bow.values())
bounds=json.loads((out/'component-bounds.json').read_text())
assert not any(n.startswith('GEPARD_bridge_roof') for n in bounds),'Overhanging bridge cap remains'
assert any(n=='GEPARD_bridge' or n.startswith('GEPARD_bridge.') for n in bounds),'Bridge housing must remain closed'
stats=json.loads((out/'geometry-stats.json').read_text());assert stats['assembled_triangles']<=10000
report={'passed':True,'maximum_sheer_height_change_m':max_sheer_error,'bow_half_beams_m':bow,
        'overhanging_roof_removed':True,'assembled_triangles':stats['assembled_triangles']}
(out/'topview-revision-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
